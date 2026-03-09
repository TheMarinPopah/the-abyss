window.addEventListener('DOMContentLoaded', () => {

    // --- Safety Check ---
    if (typeof THREE === 'undefined') {
        alert("ERROR: Three.js library did not load.\n\nPlease check your internet connection.");
        return;
    }

    // Game State
    const state = {
        isPlaying: false,
        distance: 0,
        mazeSize: 15,
        cellSize: 4,
        wallHeight: 3,
        moveSpeed: 0.08,
        turnSpeed: 0.03,
        keys: { forward: false, backward: false, left: false, right: false }
    };

    // Three.js variables
    let scene, camera, renderer, clock;
    let player = { x: 1.5, z: 1.5, angle: 0 };
    let maze = [];
    let walls = [];
    let exitPosition = { x: 0, z: 0 };
    let playerLight;

    // DOM Elements
    const menuScreen = document.getElementById('menu-screen');
    const guideScreen = document.getElementById('guide-screen');
    const gameScreen = document.getElementById('game-screen');
    const winScreen = document.getElementById('win-screen');
    const startBtn = document.getElementById('start-btn');
    const guideBtn = document.getElementById('guide-btn');
    const backBtn = document.getElementById('back-btn');
    const restartBtn = document.getElementById('restart-btn');
    const distanceCounter = document.getElementById('distance-counter');
    const gameContainer = document.getElementById('game-container');

    // --- Maze Generation ---
    function generateMaze(width, height) {
        const grid = [];
        for (let y = 0; y < height; y++) {
            grid[y] = [];
            for (let x = 0; x < width; x++) grid[y][x] = 1;
        }
        
        function carve(x, y) {
            grid[y][x] = 0;
            const directions = [[0, -2], [0, 2], [-2, 0], [2, 0]].sort(() => Math.random() - 0.5);
            for (const [dx, dy] of directions) {
                const nx = x + dx, ny = y + dy;
                if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && grid[ny][nx] === 1) {
                    grid[y + dy/2][x + dx/2] = 0;
                    carve(nx, ny);
                }
            }
        }
        carve(1, 1);
        grid[height - 2][width - 2] = 0; // Exit
        return grid;
    }

    // --- Three.js Setup ---
    function initThree() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        scene.fog = new THREE.Fog(0x000000, 1, 20); // Fog starts close, ends far
        
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.y = 1.5;
        
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        gameContainer.appendChild(renderer.domElement);
        
        clock = new THREE.Clock();
        
        // Lights
        // Ambient light: Dim gray so things aren't pitch black, but very dark
        const ambientLight = new THREE.AmbientLight(0x222222, 0.2); 
        scene.add(ambientLight);
        
        // Player Light: Bright white, average range
        playerLight = new THREE.PointLight(0xffffff, 1.5, 15); 
        playerLight.castShadow = true;
        scene.add(playerLight);
        
        createFloor();
        maze = generateMaze(state.mazeSize, state.mazeSize);
        createWalls();
        createExit();
        createDustParticles();
        
        player.x = 1.5 * state.cellSize;
        player.z = 1.5 * state.cellSize;
        player.angle = 0;
        
        exitPosition.x = (state.mazeSize - 2) * state.cellSize + state.cellSize / 2;
        exitPosition.z = (state.mazeSize - 2) * state.cellSize + state.cellSize / 2;
        
        updateCamera();
        animate();
    }

    function createFloor() {
        // Floor
        const floorGeo = new THREE.PlaneGeometry(200, 200);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        
        // Ceiling
        const ceiling = floor.clone();
        ceiling.position.y = state.wallHeight;
        scene.add(ceiling);
    }

    function createWalls() {
        walls.forEach(w => scene.remove(w));
        walls = [];
        const wallGeo = new THREE.BoxGeometry(state.cellSize, state.wallHeight, state.cellSize);
        
        for (let y = 0; y < state.mazeSize; y++) {
            for (let x = 0; x < state.mazeSize; x++) {
                if (maze[y][x] === 1) {
                    // Wall Material: Dark base, but with a faint white glow (Emissive)
                    // This makes them "white in the dark" but dimly lit
                    const wallMat = new THREE.MeshStandardMaterial({ 
                        color: 0x111111,       // Very dark gray base
                        emissive: 0xffffff,    // White glow
                        emissiveIntensity: 0.05, // Faint glow so it's visible in blackness
                        roughness: 0.8
                    });
                    
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(x * state.cellSize + state.cellSize/2, state.wallHeight/2, y * state.cellSize + state.cellSize/2);
                    scene.add(wall);
                    walls.push(wall);
                    
                    // NEON WHITE WIREFRAME
                    // This creates the "Neon" look on the edges
                    const edges = new THREE.EdgesGeometry(wallGeo);
                    const lineMat = new THREE.LineBasicMaterial({ 
                        color: 0xffffff,     // Bright white lines
                        linewidth: 1,
                        transparent: true,
                        opacity: 0.8
                    });
                    const line = new THREE.LineSegments(edges, lineMat);
                    line.position.copy(wall.position);
                    scene.add(line);
                    walls.push(line);
                }
            }
        }
    }

    function createExit() {
        const exitGeo = new THREE.PlaneGeometry(state.cellSize * 0.8, state.wallHeight);
        const exitMat = new THREE.MeshBasicMaterial({ color: 0x2a5a2a, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const exit = new THREE.Mesh(exitGeo, exitMat);
        exit.position.set(exitPosition.x, state.wallHeight/2, exitPosition.z);
        scene.add(exit);
        
        const exitLight = new THREE.PointLight(0x2a5a2a, 1.0, 10); // Brighter exit light
        exitLight.position.copy(exit.position);
        scene.add(exitLight);
    }

    function createDustParticles() {
        const particleCount = 200;
        const positions = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            positions[i*3] = (Math.random() - 0.5) * state.mazeSize * state.cellSize;
            positions[i*3+1] = Math.random() * state.wallHeight;
            positions[i*3+2] = (Math.random() - 0.5) * state.mazeSize * state.cellSize;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const dustParticles = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x888888, size: 0.05, transparent: true, opacity: 0.3 }));
        scene.add(dustParticles);
    }

    function updateCamera() {
        camera.position.x = player.x;
        camera.position.z = player.z;
        camera.rotation.y = player.angle;
        playerLight.position.set(player.x, 2, player.z);
    }

    function checkCollision(newX, newZ) {
        const margin = 0.3;
        const gx = Math.floor(newX / state.cellSize);
        const gz = Math.floor(newZ / state.cellSize);
        
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const cx = gx + dx, cz = gz + dz;
                if (cx >= 0 && cx < state.mazeSize && cz >= 0 && cz < state.mazeSize && maze[cz][cx] === 1) {
                    const wMinX = cx * state.cellSize, wMaxX = wMinX + state.cellSize;
                    const wMinZ = cz * state.cellSize, wMaxZ = wMinZ + state.cellSize;
                    if (newX + margin > wMinX && newX - margin < wMaxX && newZ + margin > wMinZ && newZ - margin < wMaxZ) return true;
                }
            }
        }
        return false;
    }

    function checkWin() {
        const dx = player.x - exitPosition.x;
        const dz = player.z - exitPosition.z;
        if (Math.sqrt(dx*dx + dz*dz) < state.cellSize * 0.5) {
            showScreen('win');
            state.isPlaying = false;
        }
    }

    function movePlayer() {
        if (!state.isPlaying) return;
        
        if (state.keys.left) player.angle += state.turnSpeed;
        if (state.keys.right) player.angle -= state.turnSpeed;
        
        let moveX = 0, moveZ = 0;
        if (state.keys.forward) { moveX -= Math.sin(player.angle) * state.moveSpeed; moveZ -= Math.cos(player.angle) * state.moveSpeed; }
        if (state.keys.backward) { moveX += Math.sin(player.angle) * state.moveSpeed; moveZ += Math.cos(player.angle) * state.moveSpeed; }
        
        if (!checkCollision(player.x + moveX, player.z)) player.x += moveX;
        if (!checkCollision(player.x, player.z + moveZ)) player.z += moveZ;
        
        if (moveX !== 0 || moveZ !== 0) {
            state.distance += state.moveSpeed * 10;
            distanceCounter.textContent = Math.floor(state.distance);
        }
        
        updateCamera();
        checkWin();
    }

    function animate() {
        if (!renderer) return;
        requestAnimationFrame(animate);
        const time = clock.getElapsedTime();
        
        if (state.isPlaying) {
            movePlayer();
            // Flicker light for creepiness
            playerLight.intensity = 1.5 + Math.sin(time * 10) * 0.1 + Math.sin(time * 23) * 0.05;
        }
        renderer.render(scene, camera);
    }

    function showScreen(name) {
        menuScreen.classList.remove('active');
        guideScreen.classList.remove('active');
        gameScreen.classList.remove('active');
        winScreen.classList.remove('active');
        
        if (name === 'menu') menuScreen.classList.add('active');
        if (name === 'guide') guideScreen.classList.add('active');
        if (name === 'game') gameScreen.classList.add('active');
        if (name === 'win') winScreen.classList.add('active');
    }

    function startGame() {
        state.isPlaying = true;
        state.distance = 0;
        distanceCounter.textContent = '0';
        
        if (renderer) {
            gameContainer.removeChild(renderer.domElement);
            renderer.dispose();
        }
        
        showScreen('game');
        initThree();
    }

    // --- Event Listeners ---
    startBtn.addEventListener('click', startGame);
    guideBtn.addEventListener('click', () => showScreen('guide'));
    backBtn.addEventListener('click', () => showScreen('menu'));
    restartBtn.addEventListener('click', startGame);

    document.addEventListener('keydown', (e) => {
        if (!state.isPlaying) return;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') { state.keys.forward = true; e.preventDefault(); }
        if (e.code === 'KeyS' || e.code === 'ArrowDown') { state.keys.backward = true; e.preventDefault(); }
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') { state.keys.left = true; e.preventDefault(); }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') { state.keys.right = true; e.preventDefault(); }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') state.keys.forward = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') state.keys.backward = false;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') state.keys.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') state.keys.right = false;
    });

    window.addEventListener('resize', () => {
        if (camera && renderer) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
    });

    showScreen('menu');
});
