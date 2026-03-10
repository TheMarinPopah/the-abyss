window.addEventListener('DOMContentLoaded', () => {

    // --- Safety Check ---
    if (typeof THREE === 'undefined') {
        alert("ERROR: Three.js library did not load.");
        return;
    }

    // Game State
    const state = {
        isPlaying: false,
        distance: 0,
        mazeSize: 15,
        cellSize: 4,
        wallHeight: 3,
        moveSpeed: 6,
        turnSpeed: 0.03,
        keys: { forward: false, backward: false, left: false, right: false }
    };

    // Three.js variables
    let scene, camera, renderer, clock;
    let player = { x: 1.5 * 4, z: 1.5 * 4, angle: 0 };
    let maze = [];
    let walls = [];
    let playerLight;

    // Multiplayer variables
    let peer = null;
    let connections = []; 
    let myConn = null; 
    let isHost = false;
    let otherPlayers = {}; 
    let myId = null;

    // DOM Elements
    const menuScreen = document.getElementById('menu-screen');
    const guideScreen = document.getElementById('guide-screen');
    const gameScreen = document.getElementById('game-screen');
    const winScreen = document.getElementById('win-screen');
    const startBtn = document.getElementById('start-btn');
    const hostBtn = document.getElementById('host-btn');
    const joinBtn = document.getElementById('join-btn');
    const guideBtn = document.getElementById('guide-btn');
    const backBtn = document.getElementById('back-btn');
    const restartBtn = document.getElementById('restart-btn');
    const distanceCounter = document.getElementById('distance-counter');
    const gameContainer = document.getElementById('game-container');
    const hostCodeDisplay = document.getElementById('host-code');
    const hostInfoDiv = document.getElementById('host-info');
    const joinInput = document.getElementById('join-code-input');

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

        // Seal edges
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
                    grid[y][x] = 1;
                }
            }
        }
        return grid;
    }

    // --- Multiplayer Logic ---

    function initNetworking(hosting) {
        // Check if PeerJS is loaded
        if (typeof Peer === 'undefined') {
            alert("Multiplayer failed to load. Please check your internet connection and refresh.");
            return;
        }

        peer = new Peer();
        
        peer.on('open', (id) => {
            myId = id;
            console.log('My ID:', id);

            if (hosting) {
                isHost = true;
                hostCodeDisplay.textContent = id;
                hostInfoDiv.style.display = 'block';
                // Pre-generate maze for host so it's ready instantly
                maze = generateMaze(state.mazeSize, state.mazeSize);
            }
        });

        peer.on('connection', (conn) => {
            setupConnection(conn);
        });

        peer.on('error', (err) => {
            console.error(err);
            alert('Multiplayer Error: ' + err.type);
        });
    }

    function setupConnection(conn) {
        conn.on('open', () => {
            console.log('Connected to: ' + conn.peer);
            
            if (isHost) {
                connections.push(conn);
                // Send the maze to the new player immediately
                conn.send({ type: 'maze', data: maze });
            } else {
                myConn = conn;
            }
            startGame(); // Start game once connected
        });

        conn.on('data', (data) => {
            handleData(data, conn.peer);
        });

        conn.on('close', () => {
            if (isHost) {
                connections = connections.filter(c => c.peer !== conn.peer);
                removeOtherPlayer(conn.peer);
            } else {
                alert("Host disconnected.");
                location.reload();
            }
        });
    }

    function handleData(data, senderId) {
        if (data.type === 'maze') {
            maze = data.data; // Load maze from host
        }
        else if (data.type === 'move') {
            updateOtherPlayer(senderId, data.x, data.z, data.angle);
            
            // If I am host, relay this position to everyone else
            if (isHost) {
                broadcastData({ type: 'move', id: senderId, x: data.x, z: data.z, angle: data.angle }, senderId);
            }
        }
    }

    function sendData(data) {
        if (myConn && myConn.open) myConn.send(data);
        else if (isHost) {
            // If host sends data, it broadcasts (handled in movePlayer usually)
        }
    }

    function broadcastData(data, excludeId = null) {
        connections.forEach(conn => {
            if (conn.open && conn.peer !== excludeId) {
                conn.send(data);
            }
        });
    }

    function updateOtherPlayer(id, x, z, angle) {
        if (id === myId) return; 

        if (!otherPlayers[id]) {
            const geo = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
            const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0.2 });
            const mesh = new THREE.Mesh(geo, mat);
            scene.add(mesh);
            otherPlayers[id] = { mesh, x, z, angle };
        }

        otherPlayers[id].mesh.position.set(x, 1, z);
        otherPlayers[id].mesh.rotation.y = angle;
    }

    function removeOtherPlayer(id) {
        if (otherPlayers[id]) {
            scene.remove(otherPlayers[id].mesh);
            delete otherPlayers[id];
        }
    }

    // --- Three.js Setup ---

    function initThree() {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x000000);
        scene.fog = new THREE.Fog(0x000000, 1, 20);
        
        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.y = 1.5;
        
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        gameContainer.appendChild(renderer.domElement);
        
        clock = new THREE.Clock();
        
        const ambientLight = new THREE.AmbientLight(0x222222, 0.2); 
        scene.add(ambientLight);
        
        playerLight = new THREE.PointLight(0xffffff, 1.5, 15); 
        playerLight.castShadow = true;
        scene.add(playerLight);
        
        createFloor();
        
        // If maze doesn't exist (Single Player), generate it.
        if (maze.length === 0) {
            maze = generateMaze(state.mazeSize, state.mazeSize);
        }
        
        createWalls();
        createDustParticles();
        
        // Reset player position
        player.x = 1.5 * state.cellSize;
        player.z = 1.5 * state.cellSize;
        player.angle = 0;
        
        updateCamera();
        animate();
    }

    function createFloor() {
        const floorGeo = new THREE.PlaneGeometry(200, 200);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.rotation.x = -Math.PI / 2;
        scene.add(floor);
        
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
                    const wallMat = new THREE.MeshStandardMaterial({ 
                        color: 0x111111,
                        emissive: 0xffffff,
                        emissiveIntensity: 0.05,
                        roughness: 0.8
                    });
                    
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(x * state.cellSize + state.cellSize/2, state.wallHeight/2, y * state.cellSize + state.cellSize/2);
                    scene.add(wall);
                    walls.push(wall);
                    
                    const edges = new THREE.EdgesGeometry(wallGeo);
                    const lineMat = new THREE.LineBasicMaterial({ 
                        color: 0xffffff,
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

    function movePlayer(delta) {
        if (!state.isPlaying) return;
        
        if (state.keys.left) player.angle += state.turnSpeed;
        if (state.keys.right) player.angle -= state.turnSpeed;
        
        let moveX = 0, moveZ = 0;
        
        if (state.keys.forward) { 
            moveX -= Math.sin(player.angle) * state.moveSpeed * delta; 
            moveZ -= Math.cos(player.angle) * state.moveSpeed * delta; 
        }
        if (state.keys.backward) { 
            moveX += Math.sin(player.angle) * state.moveSpeed * delta; 
            moveZ += Math.cos(player.angle) * state.moveSpeed * delta; 
        }
        
        if (!checkCollision(player.x + moveX, player.z)) player.x += moveX;
        if (!checkCollision(player.x, player.z + moveZ)) player.z += moveZ;
        
        if (moveX !== 0 || moveZ !== 0) {
            state.distance += Math.sqrt(moveX*moveX + moveZ*moveZ);
            distanceCounter.textContent = Math.floor(state.distance);
        }
        
        updateCamera();

        // Multiplayer: Send position
        if (isHost) {
            broadcastData({ type: 'move', id: myId, x: player.x, z: player.z, angle: player.angle });
        } else if (myConn && myConn.open) {
            sendData({ type: 'move', x: player.x, z: player.z, angle: player.angle });
        }
    }

    function animate() {
        if (!renderer) return;
        requestAnimationFrame(animate);
        
        let delta = clock.getDelta();
        if (delta > 0.1) delta = 0.1; 
        
        const time = performance.now() * 0.001;
        
        if (state.isPlaying) {
            movePlayer(delta);
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
    startBtn.addEventListener('click', () => {
        isHost = false; // Ensure we aren't in host mode
        startGame();
    });

    hostBtn.addEventListener('click', () => {
        initNetworking(true);
    });

    joinBtn.addEventListener('click', () => {
        const hostId = joinInput.value.trim();
        if (!hostId) {
            alert("Please enter a Host Code");
            return;
        }
        
        if (typeof Peer === 'undefined') {
            alert("Multiplayer failed to load.");
            return;
        }

        isHost = false;
        
        // Initialize Peer connection
        peer = new Peer();
        
        peer.on('open', (id) => {
            myId = id;
            console.log("Joiner Peer ID:", id);
            
            // Connect to host
            const conn = peer.connect(hostId);
            myConn = conn;
            setupConnection(conn);
        });
        
        peer.on('error', (err) => {
            alert("Could not connect to Host. Check the code. Error: " + err.type);
        });
    });

    guideBtn.addEventListener('click', () => showScreen('guide'));
    backBtn.addEventListener('click', () => showScreen('menu'));
    restartBtn.addEventListener('click', () => {
        // Reset multiplayer state on restart
        if(peer) peer.destroy();
        peer = null;
        isHost = false;
        connections = [];
        myConn = null;
        maze = []; // Clear maze to generate fresh one
        showScreen('menu');
    });

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
