The issue you are describing (working locally but failing between different computers/networks) is almost always caused by **NAT Traversal** issues (Firewalls/Routers blocking the connection). PeerJS uses WebRTC, which sometimes needs specific "ICE Servers" to punch through routers.

I will update the configuration to use the most robust settings possible for cross-network play, including redundant STUN servers (to help establish the connection) and `serialization: 'json'` which is more stable for some networks.

### script.js
I have updated the `peerOptions` in both `initNetworking` (Host) and the Join logic (Player 2).

```javascript
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

    // Player Colors (Max 8 Players)
    const playerColors = [
        0xffffff, 0xff4444, 0x44ff44, 0x4444ff, 
        0xffff44, 0x44ffff, 0xff44ff, 0xff8844
    ];

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
    let myColorIndex = 0;

    // DOM Elements
    const menuScreen = document.getElementById('menu-screen');
    const guideScreen = document.getElementById('guide-screen');
    const gameScreen = document.getElementById('game-screen');
    const winScreen = document.getElementById('win-screen');
    const joinScreen = document.getElementById('join-screen');
    const hostScreen = document.getElementById('host-screen');
    const waitingScreen = document.getElementById('waiting-screen');

    // Buttons
    const startBtn = document.getElementById('start-btn');
    const hostBtn = document.getElementById('host-btn');
    const lobbyStartBtn = document.getElementById('lobby-start-btn');
    const joinMenuBtn = document.getElementById('join-menu-btn');
    const joinBtn = document.getElementById('join-btn');
    const guideBtn = document.getElementById('guide-btn');
    const backBtn = document.getElementById('back-btn');
    const backFromJoinBtn = document.getElementById('back-from-join-btn');
    const backFromWaitingBtn = document.getElementById('back-from-waiting-btn');
    const backFromLobbyBtn = document.getElementById('back-from-lobby-btn');
    const restartBtn = document.getElementById('restart-btn');
    
    // UI Elements
    const distanceCounter = document.getElementById('distance-counter');
    const gameContainer = document.getElementById('game-container');
    const lobbyCodeDisplay = document.getElementById('lobby-code-display');
    const joinInput = document.getElementById('join-code-input');
    const joinError = document.getElementById('join-error');

    // Slider Elements
    const sliderThumb = document.getElementById('slider-thumb');
    const labelSingle = document.getElementById('label-single');
    const labelMulti = document.getElementById('label-multi');
    const singleControls = document.getElementById('single-player-controls');
    const multiControls = document.getElementById('multiplayer-controls');
    
    let isMultiplayerMode = false;

    // --- Slider Logic ---
    function setMode(multi) {
        isMultiplayerMode = multi;
        if (multi) {
            sliderThumb.classList.add('right');
            labelMulti.classList.add('active');
            labelSingle.classList.remove('active');
            singleControls.classList.remove('active');
            multiControls.classList.add('active');
        } else {
            sliderThumb.classList.remove('right');
            labelSingle.classList.add('active');
            labelMulti.classList.remove('active');
            singleControls.classList.add('active');
            multiControls.classList.remove('active');
        }
    }

    labelSingle.addEventListener('click', () => setMode(false));
    labelMulti.addEventListener('click', () => setMode(true));
    sliderThumb.parentElement.addEventListener('click', (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        if (clickX < rect.width / 2) setMode(false);
        else setMode(true);
    });

    // --- Generate 6-Digit Room Code ---
    function generateRoomCode() {
        return String(Math.floor(100000 + Math.random() * 900000));
    }

    // --- Create Cute Character Mesh ---
    function createCharacterMesh(colorHex = 0xffffff) {
        const group = new THREE.Group();
        
        const bodyMat = new THREE.MeshToonMaterial({ 
            color: colorHex, emissive: colorHex, emissiveIntensity: 0.1
        });
        
        // Body
        const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.8, 8, 16);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.7;
        group.add(body);
        
        // Head
        const headGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.y = 1.55;
        group.add(head);
        
        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.12, 1.6, -0.32);
        group.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.12, 1.6, -0.32);
        group.add(rightEye);
        
        // Highlights
        const highlightGeo = new THREE.SphereGeometry(0.03, 6, 6);
        const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        const leftHighlight = new THREE.Mesh(highlightGeo, highlightMat);
        leftHighlight.position.set(-0.1, 1.63, -0.38);
        group.add(leftHighlight);
        
        const rightHighlight = new THREE.Mesh(highlightGeo, highlightMat);
        rightHighlight.position.set(0.14, 1.63, -0.38);
        group.add(rightHighlight);
        
        // Arms
        const armGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 8);
        const leftArm = new THREE.Mesh(armGeo, bodyMat);
        leftArm.position.set(-0.5, 0.9, 0);
        leftArm.rotation.z = 0.3;
        group.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeo, bodyMat);
        rightArm.position.set(0.5, 0.9, 0);
        rightArm.rotation.z = -0.3;
        group.add(rightArm);
        
        // Blush
        const blushGeo = new THREE.CircleGeometry(0.06, 8);
        const blushMat = new THREE.MeshBasicMaterial({ color: 0xffaaaa, transparent: true, opacity: 0.4 });
        
        const leftBlush = new THREE.Mesh(blushGeo, blushMat);
        leftBlush.position.set(-0.25, 1.52, -0.35);
        leftBlush.lookAt(-0.25, 1.52, -1);
        group.add(leftBlush);
        
        const rightBlush = new THREE.Mesh(blushGeo, blushMat);
        rightBlush.position.set(0.25, 1.52, -0.35);
        rightBlush.lookAt(0.25, 1.52, -1);
        group.add(rightBlush);
        
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
            alert("Multiplayer failed to load. Please check your internet connection.");
            return;
        }
        
        // FIX: Robust configuration for cross-network connections
        // Added serialization: 'json' for better network compatibility
        const peerOptions = {
            debug: 2, 
            secure: true,
            serialization: 'json',
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' }
                ]
            }
        };

        if (hosting) {
            const roomCode = generateRoomCode();
            peer = new Peer(roomCode, peerOptions);
            isHost = true;
            myColorIndex = 0; 
            
            peer.on('open', (id) => {
                myId = id;
                console.log('Hosting with code:', id);
                lobbyCodeDisplay.textContent = id;
                showScreen('host');
                maze = generateMaze(state.mazeSize, state.mazeSize);
            });
            
            peer.on('error', (err) => {
                console.error(err);
                if (err.type === 'unavailable-id') {
                    lobbyCodeDisplay.textContent = "RETRY...";
                    initNetworking(true);
                } else if (err.type === 'network') {
                    alert('Network Error: Could not reach the server. Check connection/firewall.');
                    showScreen('menu');
                } else {
                    alert('Multiplayer Error: ' + err.type);
                    showScreen('menu');
                }
            });
            
            peer.on('connection', (conn) => {
                if (connections.length >= 7) {
                    console.log("Player rejected: Server full.");
                    conn.on('open', () => {
                        conn.send({ type: 'error', msg: 'Server is full (8/8 players).' });
                        setTimeout(() => conn.close(), 500);
                    });
                    return;
                }
                setupConnection(conn);
            });
        }
    }

    function setupConnection(conn) {
        conn.on('open', () => {
            console.log('Connected to: ' + conn.peer);
            
            if (isHost) {
                connections.push(conn);
                
                const colorIndex = connections.length;
                
                const currentPlayers = {};
                currentPlayers[myId] = { x: player.x, z: player.z, angle: player.angle, colorIndex: 0 };
                for (let id in otherPlayers) {
                    currentPlayers[id] = otherPlayers[id];
                }

                conn.send({ 
                    type: 'init', 
                    data: maze, 
                    yourId: myId,
                    yourColorIndex: colorIndex,
                    players: currentPlayers
                });

                broadcastData({ 
                    type: 'new-player', 
                    id: conn.peer, 
                    colorIndex: colorIndex 
                }, conn.peer);

            } else {
                myConn = conn;
                showScreen('waiting');
            }
        });

        conn.on('data', (data) => {
            handleData(data, conn.peer);
        });

        conn.on('close', () => {
            if (isHost) {
                connections = connections.filter(c => c.peer !== conn.peer);
                removeOtherPlayer(conn.peer);
                broadcastData({ type: 'player-left', id: conn.peer });
            } else {
                alert("Host disconnected.");
                location.reload();
            }
        });
        
        conn.on('error', (err) => {
            console.error("Connection error:", err);
            if (!isHost) {
                joinError.textContent = "Connection failed (Firewall/Network issue).";
                joinError.style.display = 'block';
                showScreen('join');
            }
        });
    }

    function handleData(data, senderId) {
        if (data.type === 'init') {
            maze = data.data;
            myColorIndex = data.yourColorIndex;
            
            for (let id in data.players) {
                let p = data.players[id];
                updateOtherPlayer(id, p.x, p.z, p.angle, p.colorIndex);
            }
        }
        else if (data.type === 'new-player') {
            if (!otherPlayers[senderId]) {
                otherPlayers[senderId] = { colorIndex: data.colorIndex };
            }
        }
        else if (data.type === 'player-left') {
            removeOtherPlayer(data.id);
        }
        else if (data.type === 'start') {
            startGame();
        }
        else if (data.type === 'move') {
            updateOtherPlayer(data.id, data.x, data.z, data.angle, data.colorIndex);
            
            if (isHost) {
                broadcastData(data, senderId);
            }
        }
        else if (data.type === 'error') {
            alert(data.msg);
            if(peer) peer.destroy();
            showScreen('menu');
        }
    }

    function sendData(data) {
        data.colorIndex = myColorIndex;
        if (myConn && myConn.open) myConn.send(data);
    }

    function broadcastData(data, excludeId = null) {
        connections.forEach(conn => {
            if (conn.open && conn.peer !== excludeId) {
                conn.send(data);
            }
        });
    }

    function updateOtherPlayer(id, x, z, angle, colorIndex) {
        if (id === myId) return; 

        if (!otherPlayers[id]) {
            const cIdx = (colorIndex !== undefined) ? colorIndex : 1;
            const colorHex = playerColors[cIdx] || playerColors[1];
            
            const mesh = createCharacterMesh(colorHex);
            scene.add(mesh);
            otherPlayers[id] = { mesh, x, z, angle, colorIndex: cIdx };
        }

        otherPlayers[id].mesh.position.set(x, 0, z);
        otherPlayers[id].mesh.rotation.y = angle;
        otherPlayers[id].x = x;
        otherPlayers[id].z = z;
        otherPlayers[id].angle = angle;
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
        
        const ambientLight = new THREE.AmbientLight(0x333333, 0.3); 
        scene.add(ambientLight);
        
        playerLight = new THREE.PointLight(0xffffff, 1.5, 15); 
        playerLight.castShadow = true;
        scene.add(playerLight);
        
        createFloor();
        
        if (maze.length === 0) {
            maze = generateMaze(state.mazeSize, state.mazeSize);
        }
        
        createWalls();
        createDustParticles();
        
        playerMesh = createCharacterMesh(playerColors[myColorIndex]);
        scene.add(playerMesh);
        
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
                        color: 0x111111, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.8
                    });
                    
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(x * state.cellSize + state.cellSize/2, state.wallHeight/2, y * state.cellSize + state.cellSize/2);
                    scene.add(wall);
                    walls.push(wall);
                    
                    const edges = new THREE.EdgesGeometry(wallGeo);
                    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
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

        if (isHost) {
            broadcastData({ type: 'move', id: myId, x: player.x, z: player.z, angle: player.angle, colorIndex: myColorIndex });
        } else if (myConn && myConn.open) {
            sendData({ type: 'move', id: myId, x: player.x, z: player.z, angle: player.angle });
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
            if (playerMesh) playerMesh.position.y = Math.sin(time * 3) * 0.03;
        }
        renderer.render(scene, camera);
    }

    function showScreen(name) {
        menuScreen.classList.remove('active');
        guideScreen.classList.remove('active');
        gameScreen.classList.remove('active');
        winScreen.classList.remove('active');
        joinScreen.classList.remove('active');
        hostScreen.classList.remove('active');
        waitingScreen.classList.remove('active');
        
        if (name === 'menu') menuScreen.classList.add('active');
        if (name === 'guide') guideScreen.classList.add('active');
        if (name === 'game') gameScreen.classList.add('active');
        if (name === 'win') winScreen.classList.add('active');
        if (name === 'join') joinScreen.classList.add('active');
        if (name === 'host') hostScreen.classList.add('active');
        if (name === 'waiting') waitingScreen.classList.add('active');
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
        myColorIndex = 0;
        maze = []; 
        startGame();
    });

    hostBtn.addEventListener('click', () => {
        initNetworking(true);
    });

    lobbyStartBtn.addEventListener('click', () => {
        startGame();
        broadcastData({ type: 'start' });
    });

    joinMenuBtn.addEventListener('click', () => {
        joinError.style.display = 'none';
        showScreen('join');
    });

    joinBtn.addEventListener('click', () => {
        const hostCode = joinInput.value.trim();
        if (!hostCode) {
            joinError.textContent = "PLEASE ENTER A CODE";
            joinError.style.display = 'block';
            return;
        }
        
        if (typeof Peer === 'undefined') {
            alert("Multiplayer failed to load.");
            return;
        }

        isHost = false;
        joinError.style.display = 'none';
        
        const peerOptions = {
            debug: 2,
            secure: true,
            serialization: 'json',
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        };
        
        peer = new Peer(peerOptions);
        
        peer.on('open', (id) => {
            myId = id;
            const conn = peer.connect(hostCode); 
            myConn = conn;
            
            conn.on('error', (err) => {
                joinError.textContent = "Connection failed.";
                joinError.style.display = 'block';
                showScreen('join');
            });
            
            setupConnection(conn);
        });
        
        peer.on('error', (err) => {
            if (err.type === 'peer-unavailable') {
                joinError.textContent = "INVALID CODE";
            } else if (err.type === 'network') {
                joinError.textContent = "NETWORK ERROR (Check Firewall)";
            } else {
                joinError.textContent = "ERROR: " + err.type;
            }
            joinError.style.display = 'block';
            showScreen('join');
        });
    });
    
    guideBtn.addEventListener('click', () => showScreen('guide'));
    backBtn.addEventListener('click', () => showScreen('menu'));
    backFromJoinBtn.addEventListener('click', () => showScreen('menu'));
    
    backFromLobbyBtn.addEventListener('click', () => {
        if(peer) peer.destroy();
        peer = null;
        isHost = false;
        showScreen('menu');
    });

    backFromWaitingBtn.addEventListener('click', () => {
        if(peer) peer.destroy();
        peer = null;
        myConn = null;
        showScreen('menu');
    });
    
    restartBtn.addEventListener('click', () => {
        if(peer) peer.destroy();
        peer = null;
        isHost = false;
        connections = [];
        myConn = null;
        maze = [];
        otherPlayers = {};
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
```
