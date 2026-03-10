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
    let playerMesh = null;

    // Multiplayer variables
    let peer = null;
    let connections = []; 
    let myConn = null; 
    let isHost = false;
    let otherPlayers = {}; 
    let myId = null;
    let isWaitingForMaze = false;

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

    // --- Generate 6-Digit Room Code ---
    function generateRoomCode() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    // --- Create Cute Character Mesh ---
    function createCharacterMesh(color = 0xffffff) {
        const group = new THREE.Group();
        
        // Body (rounded capsule-like shape)
        const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 8, 16);
        const bodyMat = new THREE.MeshToonMaterial({ 
            color: color,
            emissive: color,
            emissiveIntensity: 0.1
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.7;
        group.add(body);
        
        // Head (sphere)
        const headGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const headMat = new THREE.MeshToonMaterial({ 
            color: color,
            emissive: color,
            emissiveIntensity: 0.1
        });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.55;
        group.add(head);
        
        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.12, 1.6, 0.32);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.12, 1.6, 0.32);
        group.add(rightEye);
        
        // Eye highlights
        const highlightGeo = new THREE.SphereGeometry(0.03, 6, 6);
        const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        const leftHighlight = new THREE.Mesh(highlightGeo, highlightMat);
        leftHighlight.position.set(-0.1, 1.63, 0.38);
        group.add(leftHighlight);
        
        const rightHighlight = new THREE.Mesh(highlightGeo, highlightMat);
        rightHighlight.position.set(0.14, 1.63, 0.38);
        group.add(rightHighlight);
        
        // Arms (simple rounded shapes)
        const armGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 8);
        const armMat = new THREE.MeshToonMaterial({ 
            color: color,
            emissive: color,
            emissiveIntensity: 0.1
        });
        
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.5, 0.9, 0);
        leftArm.rotation.z = 0.3;
        group.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.5, 0.9, 0);
        rightArm.rotation.z = -0.3;
        group.add(rightArm);
        
        // Cheek blush (subtle)
        const blushGeo = new THREE.CircleGeometry(0.06, 8);
        const blushMat = new THREE.MeshBasicMaterial({ 
            color: 0xffaaaa, 
            transparent: true, 
            opacity: 0.4 
        });
        
        const leftBlush = new THREE.Mesh(blushGeo, blushMat);
        leftBlush.position.set(-0.25, 1.52, 0.35);
        leftBlush.lookAt(-0.25, 1.52, 1);
        group.add(leftBlush);
        
        const rightBlush = new THREE.Mesh(blushGeo, blushMat);
        rightBlush.position.set(0.25, 1.52, 0.35);
        rightBlush.lookAt(0.25, 1.52, 1);
        group.add(rightBlush);
        
        // Add a subtle glow
        const glowGeo = new THREE.SphereGeometry(0.8, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({ 
            color: color,
            transparent: true,
            opacity: 0.05
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.position.y = 1.1;
        group.add(glow);
        
        return group;
    }

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
        if (typeof Peer === 'undefined') {
            alert("Multiplayer failed to load. Please check your internet connection and refresh.");
            return;
        }

        // For hosting, generate a 6-digit code as peer ID
        if (hosting) {
            const roomCode = generateRoomCode();
            peer = new Peer(roomCode);
            isHost = true;
            
            peer.on('open', (id) => {
                myId = id;
                console.log('Hosting with code:', id);
                hostCodeDisplay.textContent = id;
                hostInfoDiv.style.display = 'block';
                // Pre-generate maze for host
                maze = generateMaze(state.mazeSize, state.mazeSize);
            });
            
            peer.on('error', (err) => {
                console.error(err);
                if (err.type === 'unavailable-id') {
                    // Code already taken, try another
                    hostCodeDisplay.textContent = "Try again...";
                    initNetworking(true);
                } else {
                    alert('Multiplayer Error: ' + err.type);
                }
            });
            
            peer.on('connection', (conn) => {
                setupConnection(conn);
            });
        }
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
            // FIX: Receive maze BEFORE starting game
            maze = data.data;
            mazeReceived = true;
            
            // Now we can start the game
            if (isWaitingForMaze) {
                isWaitingForMaze = false;
                startGame();
            }
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
            // Create cute character for other player (slightly different color)
            const mesh = createCharacterMesh(0xffeedd);
            scene.add(mesh);
            otherPlayers[id] = { mesh, x, z, angle };
        }

        otherPlayers[id].mesh.position.set(x, 0, z);
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
        
        // Slightly brighter ambient for character visibility
        const ambientLight = new THREE.AmbientLight(0x333333, 0.3); 
        scene.add(ambientLight);
        
        playerLight = new THREE.PointLight(0xffffff, 1.5, 15); 
        playerLight.castShadow = true;
        scene.add(playerLight);
        
        createFloor();
        
        // If maze doesn't exist (Single Player or Host), generate it
        if (maze.length === 0) {
            maze = generateMaze(state.mazeSize, state.mazeSize);
        }
        
        createWalls();
        createDustParticles();
        
        // Create player character mesh
        playerMesh = createCharacterMesh(0xffffff);
        scene.add(playerMesh);
        
        // Reset player position
        player.x = 1.5 * state.cellSize;
        player.z = 1.5 * state.cellSize;
        player.angle = 0;
        
        updateCamera();
        animate();
    }

    function createFloor() {
        const floorGeo = new THREE.PlaneGeometry(200, 200);
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9 });
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
        
        // Update player mesh position
        if (playerMesh) {
            playerMesh.position.set(player.x, 0, player.z);
            playerMesh.rotation.y = player.angle;
        }
    }

    function checkCollision(newX, newZ) {
        const margin = 0.4;
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
            
            // Animate player character (subtle bob)
            if (playerMesh) {
                playerMesh.position.y = Math.sin(time * 3) * 0.03;
            }
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
        isHost = false;
        mazeReceived = true; // Single player doesn't need to wait
        startGame();
    });

    hostBtn.addEventListener('click', () => {
        initNetworking(true);
    });

    joinBtn.addEventListener('click', () => {
        const hostCode = joinInput.value.trim();
        if (!hostCode) {
            alert("Please enter a 6-digit Host Code");
            return;
        }
        
        if (typeof Peer === 'undefined') {
            alert("Multiplayer failed to load.");
            return;
        }

        isHost = false;
        isWaitingForMaze = true;
        
        // Initialize Peer connection with a random ID (we're joining, not hosting)
        peer = new Peer();
        
        peer.on('open', (id) => {
            myId = id;
            console.log("Joining game with code:", hostCode);
            
            // Connect to host using the 6-digit code
            const conn = peer.connect(hostCode);
            myConn = conn;
            setupConnection(conn);
        });
        
        peer.on('error', (err) => {
            alert("Could not connect to Host. Check the code.\nError: " + err.type);
        });
    });

    guideBtn.addEventListener('click', () => showScreen('guide'));
    backBtn.addEventListener('click', () => showScreen('menu'));
    restartBtn.addEventListener('click', () => {
        if(peer) peer.destroy();
        peer = null;
        isHost = false;
        connections = [];
        myConn = null;
        maze = [];
        mazeReceived = false;
        isWaitingForMaze = false;
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
