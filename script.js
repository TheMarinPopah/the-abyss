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
        keys: { forward: false, backward: false, left: false, right: false, shift: false, lookBehind: false },
        stamina: 30,
        maxStamina: 30,
        staminaRefillTime: 10,
        staminaDrainTime: 5, 
        sprintMultiplier: 1.5
    };

    const playerColors = [ 0xF4D03F, 0xE74C3C, 0x2ECC71, 0x3498DB, 0xE67E22, 0x9B59B6, 0x1ABC9C, 0xE91E63 ];

    let scene, camera, renderer, clock;
    let player = { x: 1.5 * 4, z: 1.5 * 4, angle: 0 };
    let maze = [];
    let walls = [];
    let playerLight;
    let playerMesh = null;
    let staminaBarUI = null;

    // Multiplayer
    let peer = null; let connections = []; let myConn = null; let isHost = false;
    let otherPlayers = {}; let myId = null; let myColorIndex = 0;

    // DOM
    const menuScreen = document.getElementById('menu-screen'); const guideScreen = document.getElementById('guide-screen'); const gameScreen = document.getElementById('game-screen'); const winScreen = document.getElementById('win-screen');
    const joinScreen = document.getElementById('join-screen'); const hostScreen = document.getElementById('host-screen'); const waitingScreen = document.getElementById('waiting-screen');
    const startBtn = document.getElementById('start-btn'); const hostBtn = document.getElementById('host-btn'); const lobbyStartBtn = document.getElementById('lobby-start-btn');
    const joinMenuBtn = document.getElementById('join-menu-btn'); const joinBtn = document.getElementById('join-btn'); const guideBtn = document.getElementById('guide-btn');
    const backBtn = document.getElementById('back-btn'); const backFromJoinBtn = document.getElementById('back-from-join-btn'); const backFromWaitingBtn = document.getElementById('back-from-waiting-btn');
    const backFromLobbyBtn = document.getElementById('back-from-lobby-btn'); const restartBtn = document.getElementById('restart-btn');
    const distanceCounter = document.getElementById('distance-counter'); const gameContainer = document.getElementById('game-container');
    const lobbyCodeDisplay = document.getElementById('lobby-code-display'); const joinInput = document.getElementById('join-code-input'); const joinError = document.getElementById('join-error');
    const sliderThumb = document.getElementById('slider-thumb'); const labelSingle = document.getElementById('label-single');
    const labelMulti = document.getElementById('label-multi'); const singleControls = document.getElementById('single-player-controls');
    const multiControls = document.getElementById('multiplayer-controls');
    let isMultiplayerMode = false;

    // Slider Logic
    function setMode(multi) { isMultiplayerMode = multi; if (multi) { sliderThumb.classList.add('right'); labelMulti.classList.add('active'); labelSingle.classList.remove('active'); singleControls.classList.remove('active'); multiControls.classList.add('active'); } else { sliderThumb.classList.remove('right'); labelSingle.classList.add('active'); labelMulti.classList.remove('active'); singleControls.classList.add('active'); multiControls.classList.remove('active'); } }
    labelSingle.addEventListener('click', () => setMode(false)); labelMulti.addEventListener('click', () => setMode(true));
    sliderThumb.parentElement.addEventListener('click', (e) => { const rect = e.currentTarget.getBoundingClientRect(); const clickX = e.clientX - rect.left; if (clickX < rect.width / 2) setMode(false); else setMode(true); });

    // Helpers
    function generateRoomCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
    function createNoiseTexture(baseColor, noiseAmount, size = 64) { const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; const ctx = canvas.getContext('2d'); ctx.fillStyle = baseColor; ctx.fillRect(0, 0, size, size); const imageData = ctx.getImageData(0, 0, size, size); for (let i = 0; i < imageData.data.length; i += 4) { const noise = (Math.random() - 0.5) * noiseAmount; imageData.data[i] += noise; imageData.data[i+1] += noise; imageData.data[i+2] += noise; } ctx.putImageData(imageData, 0, 0); const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; return texture; }

    // --- Create Hazmat Character Mesh ---
    function createCharacterMesh(colorHex = 0xF4D03F) {
        const group = new THREE.Group();
        const suitMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.7 });
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.1, metalness: 0.8 });
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

        // Body
        const torsoGeo = new THREE.BoxGeometry(0.6, 0.8, 0.35);
        const torso = new THREE.Mesh(torsoGeo, suitMat); torso.position.y = 1.0; group.add(torso);

        // Symbol (Chest)
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(32, 32, 20, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(32, 32, 5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(32, 32, 10, 25, 0, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.ellipse(32, 32, 10, 25, Math.PI/3, 0, Math.PI * 2); ctx.stroke();
        const symbolTexture = new THREE.CanvasTexture(canvas);
        const symbolMatText = new THREE.MeshBasicMaterial({ map: symbolTexture, transparent: true });
        const symbol = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), symbolMatText); 
        symbol.position.set(0, 1.1, -0.18);
        group.add(symbol);

        // Legs & Boots
        const legGeo = new THREE.CapsuleGeometry(0.15, 0.5, 4, 8);
        const leftLeg = new THREE.Mesh(legGeo, suitMat); leftLeg.position.set(-0.15, 0.4, 0); group.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, suitMat); rightLeg.position.set(0.15, 0.4, 0); group.add(rightLeg);
        const bootGeo = new THREE.BoxGeometry(0.18, 0.15, 0.25);
        const leftBoot = new THREE.Mesh(bootGeo, blackMat); leftBoot.position.set(-0.15, 0.07, 0.03); group.add(leftBoot);
        const rightBoot = new THREE.Mesh(bootGeo, blackMat); rightBoot.position.set(0.15, 0.07, 0.03); group.add(rightBoot);

        // Head
        const helmetGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const helmet = new THREE.Mesh(helmetGeo, suitMat); helmet.position.y = 1.65; helmet.scale.set(1, 1.1, 1); group.add(helmet);

        // Visor (Face)
        const visorGeo = new THREE.SphereGeometry(0.25, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const visor = new THREE.Mesh(visorGeo, visorMat); 
        visor.position.set(0, 1.65, -0.05); 
        visor.rotation.x = -Math.PI / 2; visor.scale.set(0.8, 1, 1); 
        group.add(visor);

        // Arms & Gloves
        const armGeo = new THREE.CapsuleGeometry(0.1, 0.4, 4, 8);
        const leftArm = new THREE.Mesh(armGeo, suitMat); leftArm.position.set(-0.4, 1.0, 0); leftArm.rotation.z = 0.2; group.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, suitMat); rightArm.position.set(0.4, 1.0, 0); rightArm.rotation.z = -0.2; group.add(rightArm);
        const gloveGeo = new THREE.SphereGeometry(0.1, 8, 8);
        const leftGlove = new THREE.Mesh(gloveGeo, blackMat); leftGlove.position.set(-0.45, 0.7, 0); group.add(leftGlove);
        const rightGlove = new THREE.Mesh(gloveGeo, blackMat); rightGlove.position.set(0.45, 0.7, 0); group.add(rightGlove);

        // Tank (Back)
        const tankGeo = new THREE.CapsuleGeometry(0.15, 0.3, 4, 8);
        const tank = new THREE.Mesh(tankGeo, suitMat); 
        tank.position.set(0, 1.1, 0.25); 
        group.add(tank);

        return group;
    }

    // Maze
    function generateMaze(width, height) { const grid = []; for (let y = 0; y < height; y++) { grid[y] = []; for (let x = 0; x < width; x++) grid[y][x] = 1; } function carve(x, y) { grid[y][x] = 0; const directions = [[0, -2], [0, 2], [-2, 0], [2, 0]].sort(() => Math.random() - 0.5); for (const [dx, dy] of directions) { const nx = x + dx, ny = y + dy; if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && grid[ny][nx] === 1) { grid[y + dy/2][x + dx/2] = 0; carve(nx, ny); } } } carve(1, 1); for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) { if (y === 0 || y === height - 1 || x === 0 || x === width - 1) grid[y][x] = 1; } } return grid; }

    // Multiplayer
    function initNetworking(hosting) { 
        if (typeof Peer === 'undefined') { alert("Multiplayer failed to load."); return; } 
        
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

        if (hosting) { 
            const roomCode = generateRoomCode(); 
            peer = new Peer(roomCode, peerOptions); 
            isHost = true; 
            myColorIndex = 0; 
            
            peer.on('open', (id) => { 
                myId = id; 
                lobbyCodeDisplay.textContent = id; 
                showScreen('host'); 
                maze = generateMaze(state.mazeSize, state.mazeSize); 
            }); 
            
            peer.on('error', (err) => { 
                console.error(err); 
                let errMsg = "Connection Error: " + err.type;
                if (err.type === 'network' || err.type === 'server-error') {
                    errMsg = "NETWORK BLOCKED: Your network (School/Work) is blocking the game connection.\nTry using a Mobile Hotspot.";
                } else if (err.type === 'unavailable-id') {
                    lobbyCodeDisplay.textContent = "RETRY...";
                    initNetworking(true);
                    return;
                }
                alert(errMsg); 
                showScreen('menu'); 
            }); 
            
            peer.on('connection', (conn) => { 
                if (connections.length >= 7) return; 
                setupConnection(conn); 
            }); 
        } 
    }

    function setupConnection(conn) { conn.on('open', () => { if (isHost) { connections.push(conn); const colorIndex = connections.length; const currentPlayers = {}; currentPlayers[myId] = { x: player.x, z: player.z, angle: player.angle, colorIndex: 0 }; for (let id in otherPlayers) currentPlayers[id] = otherPlayers[id]; conn.send({ type: 'init', data: maze, yourColorIndex: colorIndex, players: currentPlayers }); broadcastData({ type: 'new-player', id: conn.peer, colorIndex: colorIndex }, conn.peer); } else { myConn = conn; showScreen('waiting'); } }); conn.on('data', (data) => handleData(data, conn.peer)); conn.on('close', () => { if (isHost) { connections = connections.filter(c => c.peer !== conn.peer); removeOtherPlayer(conn.peer); } else { alert("Host disconnected."); location.reload(); } }); conn.on('error', (err) => { if (!isHost) { joinError.textContent = "Connection failed (Firewall/Network)."; joinError.style.display = 'block'; showScreen('join'); } }); }
    function handleData(data, senderId) { if (data.type === 'init') { maze = data.data; myColorIndex = data.yourColorIndex; for (let id in data.players) updateOtherPlayer(id, data.players[id].x, data.players[id].z, data.players[id].angle, data.players[id].colorIndex); } else if (data.type === 'new-player') { if (!otherPlayers[senderId]) otherPlayers[senderId] = { colorIndex: data.colorIndex }; } else if (data.type === 'player-left') { removeOtherPlayer(data.id); } else if (data.type === 'start') { startGame(); } else if (data.type === 'move') { updateOtherPlayer(data.id, data.x, data.z, data.angle, data.colorIndex); if (isHost) broadcastData(data, senderId); } else if (data.type === 'error') { alert(data.msg); if(peer) peer.destroy(); showScreen('menu'); } }
    function sendData(data) { data.colorIndex = myColorIndex; if (myConn && myConn.open) myConn.send(data); }
    function broadcastData(data, excludeId = null) { connections.forEach(conn => { if (conn.open && conn.peer !== excludeId) conn.send(data); }); }
    function updateOtherPlayer(id, x, z, angle, colorIndex) { if (id === myId) return; if (!otherPlayers[id]) { const cIdx = (colorIndex !== undefined) ? colorIndex : 1; const mesh = createCharacterMesh(playerColors[cIdx] || playerColors[1]); scene.add(mesh); otherPlayers[id] = { mesh, x, z, angle, colorIndex: cIdx }; } otherPlayers[id].mesh.position.set(x, 0, z); otherPlayers[id].mesh.rotation.y = angle; otherPlayers[id].x = x; otherPlayers[id].z = z; otherPlayers[id].angle = angle; }
    function removeOtherPlayer(id) { if (otherPlayers[id]) { scene.remove(otherPlayers[id].mesh); delete otherPlayers[id]; } }

    // Three.js
    function initThree() { scene = new THREE.Scene(); scene.background = new THREE.Color(0x807040); scene.fog = new THREE.Fog(0x807040, 1, 25); camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100); camera.position.y = 1.5; renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); gameContainer.appendChild(renderer.domElement); clock = new THREE.Clock(); const ambientLight = new THREE.AmbientLight(0x908060, 0.6); scene.add(ambientLight); playerLight = new THREE.PointLight(0xffffff, 0.8, 20); playerLight.castShadow = true; scene.add(playerLight); createFloor(); if (maze.length === 0) maze = generateMaze(state.mazeSize, state.mazeSize); createWalls(); playerMesh = createCharacterMesh(playerColors[myColorIndex]); scene.add(playerMesh); player.x = 1.5 * state.cellSize; player.z = 1.5 * state.cellSize; player.angle = 0; staminaBarUI = document.getElementById('stamina-bar'); state.stamina = state.maxStamina; updateCamera(); animate(); }
    function createFloor() { const carpetTexture = createNoiseTexture('#6B5344', 30, 128); carpetTexture.repeat.set(20, 20); const floorMat = new THREE.MeshStandardMaterial({ map: carpetTexture, roughness: 0.9 }); const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat); floor.rotation.x = -Math.PI / 2; scene.add(floor); const ceilTexture = createNoiseTexture('#E0D8C0', 10, 128); ceilTexture.repeat.set(20, 20); const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: ceilTexture, side: THREE.BackSide })); ceiling.rotation.x = Math.PI / 2; ceiling.position.y = state.wallHeight; scene.add(ceiling); }
    function createWalls() { walls.forEach(w => scene.remove(w)); walls = []; const wallTexture = createNoiseTexture('#C8B870', 15, 64); const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.8 }); for (let y = 0; y < state.mazeSize; y++) { for (let x = 0; x < state.mazeSize; x++) { if (maze[y][x] === 1) { const wall = new THREE.Mesh(new THREE.BoxGeometry(state.cellSize, state.wallHeight, state.cellSize), wallMat); wall.position.set(x * state.cellSize + state.cellSize/2, state.wallHeight/2, y * state.cellSize + state.cellSize/2); scene.add(wall); walls.push(wall); } } } }
    
    function updateCamera() {
        if (state.keys.lookBehind) {
            // LOOK BEHIND MODE
            const dist = 3.5; 
            const targetX = player.x - Math.sin(player.angle) * dist;
            const targetZ = player.z - Math.cos(player.angle) * dist;
            
            camera.position.set(targetX, 1.8, targetZ);
            camera.lookAt(new THREE.Vector3(player.x, 1.0, player.z)); 
            
            if(playerMesh) playerMesh.visible = true;
        } else {
            // FIRST PERSON MODE
            camera.position.set(player.x, 1.5, player.z);
            
            // FIX: Reset rotation on all axes (X, Y, Z) to prevent slanting
            camera.rotation.set(0, player.angle, 0);
            
            if(playerMesh) playerMesh.visible = false;
        }
        
        playerLight.position.set(player.x, 2, player.z);
        
        if (playerMesh) { 
            playerMesh.position.set(player.x, 0, player.z); 
            playerMesh.rotation.y = player.angle; 
        }
    }

    function checkCollision(newX, newZ) { const margin = 0.4; const gx = Math.floor(newX / state.cellSize); const gz = Math.floor(newZ / state.cellSize); for (let dz = -1; dz <= 1; dz++) { for (let dx = -1; dx <= 1; dx++) { const cx = gx + dx, cz = gz + dz; if (cx >= 0 && cx < state.mazeSize && cz >= 0 && cz < state.mazeSize && maze[cz][cx] === 1) { const wMinX = cx * state.cellSize, wMaxX = wMinX + state.cellSize; const wMinZ = cz * state.cellSize, wMaxZ = wMinZ + state.cellSize; if (newX + margin > wMinX && newX - margin < wMaxX && newZ + margin > wMinZ && newZ - margin < wMaxZ) return true; } } } return false; }

    function movePlayer(delta) {
        if (!state.isPlaying) return;
        
        if (state.keys.left) player.angle += state.turnSpeed;
        if (state.keys.right) player.angle -= state.turnSpeed;
        
        let currentSpeed = state.moveSpeed;
        const regenRate = state.maxStamina / state.staminaRefillTime;
        const drainRate = state.maxStamina / state.staminaDrainTime; 

        if (state.keys.shift && state.stamina > 0 && state.keys.forward) {
            currentSpeed *= state.sprintMultiplier;
            state.stamina -= drainRate * delta; 
            if (state.stamina < 0) state.stamina = 0;
        } else if (!state.keys.forward && !state.keys.backward) {
            state.stamina += regenRate * delta;
            if (state.stamina > state.maxStamina) state.stamina = state.maxStamina;
        }

        if (staminaBarUI) { const percent = (state.stamina / state.maxStamina) * 100; staminaBarUI.style.width = percent + '%'; }

        let moveX = 0, moveZ = 0;
        if (state.keys.forward) { moveX -= Math.sin(player.angle) * currentSpeed * delta; moveZ -= Math.cos(player.angle) * currentSpeed * delta; }
        if (state.keys.backward) { moveX += Math.sin(player.angle) * currentSpeed * delta; moveZ += Math.cos(player.angle) * currentSpeed * delta; }
        
        if (!checkCollision(player.x + moveX, player.z)) player.x += moveX;
        if (!checkCollision(player.x, player.z + moveZ)) player.z += moveZ;
        
        if (moveX !== 0 || moveZ !== 0) { state.distance += Math.sqrt(moveX*moveX + moveZ*moveZ); distanceCounter.textContent = Math.floor(state.distance); }
        
        updateCamera(); 

        if (isHost) { broadcastData({ type: 'move', id: myId, x: player.x, z: player.z, angle: player.angle, colorIndex: myColorIndex }); } else if (myConn && myConn.open) { sendData({ type: 'move', id: myId, x: player.x, z: player.z, angle: player.angle }); }
    }

    function animate() { if (!renderer) return; requestAnimationFrame(animate); let delta = clock.getDelta(); if (delta > 0.1) delta = 0.1; const time = performance.now() * 0.001; if (state.isPlaying) { movePlayer(delta); playerLight.intensity = 0.8 + Math.sin(time * 10) * 0.1; if (playerMesh) playerMesh.position.y = Math.sin(time * 3) * 0.03; } renderer.render(scene, camera); }
    function showScreen(name) { menuScreen.classList.remove('active'); guideScreen.classList.remove('active'); gameScreen.classList.remove('active'); winScreen.classList.remove('active'); joinScreen.classList.remove('active'); hostScreen.classList.remove('active'); waitingScreen.classList.remove('active'); if (name === 'menu') menuScreen.classList.add('active'); if (name === 'guide') guideScreen.classList.add('active'); if (name === 'game') gameScreen.classList.add('active'); if (name === 'win') winScreen.classList.add('active'); if (name === 'join') joinScreen.classList.add('active'); if (name === 'host') hostScreen.classList.add('active'); if (name === 'waiting') waitingScreen.classList.add('active'); }
    function startGame() { state.isPlaying = true; state.distance = 0; distanceCounter.textContent = '0'; if (renderer) { gameContainer.removeChild(renderer.domElement); renderer.dispose(); } showScreen('game'); initThree(); }

    // Events
    startBtn.addEventListener('click', () => { isHost = false; myColorIndex = 0; maze = []; startGame(); });
    hostBtn.addEventListener('click', () => { initNetworking(true); });
    lobbyStartBtn.addEventListener('click', () => { startGame(); broadcastData({ type: 'start' }); });
    joinMenuBtn.addEventListener('click', () => { joinError.style.display = 'none'; showScreen('join'); });
    
    joinBtn.addEventListener('click', () => { 
        const hostCode = joinInput.value.trim();
        if (!hostCode) { joinError.textContent = "PLEASE ENTER A CODE"; joinError.style.display = 'block'; return; } 
        if (typeof Peer === 'undefined') { alert("Multiplayer failed to load."); return; } 
        isHost = false; joinError.style.display = 'none'; 
        
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
            conn.on('error', () => { 
                joinError.textContent = "CONNECTION FAILED"; 
                joinError.style.display = 'block'; 
                showScreen('join'); 
            }); 
            setupConnection(conn); 
        }); 
        
        peer.on('error', (err) => { 
            let errMsg = "ERROR: " + err.type;
            if (err.type === 'peer-unavailable') {
                errMsg = "INVALID CODE";
            } else if (err.type === 'network' || err.type === 'server-error') {
                errMsg = "NETWORK BLOCKED: Your network is blocking game connections.\nTry using a Mobile Hotspot.";
            }
            joinError.textContent = errMsg; 
            joinError.style.display = 'block'; 
            showScreen('join'); 
        }); 
    });
    
    guideBtn.addEventListener('click', () => showScreen('guide')); backBtn.addEventListener('click', () => showScreen('menu')); backFromJoinBtn.addEventListener('click', () => showScreen('menu'));
    backFromLobbyBtn.addEventListener('click', () => { if(peer) peer.destroy(); peer = null; isHost = false; showScreen('menu'); });
    backFromWaitingBtn.addEventListener('click', () => { if(peer) peer.destroy(); peer = null; myConn = null; showScreen('menu'); });
    restartBtn.addEventListener('click', () => { if(peer) peer.destroy(); peer = null; isHost = false; connections = []; myConn = null; maze = []; otherPlayers = {}; showScreen('menu'); });

    document.addEventListener('keydown', (e) => {
        if (!state.isPlaying) return;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') { state.keys.forward = true; e.preventDefault(); }
        if (e.code === 'KeyS' || e.code === 'ArrowDown') { state.keys.backward = true; e.preventDefault(); }
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') { state.keys.left = true; e.preventDefault(); }
        if (e.code === 'KeyD' || e.code === 'ArrowRight') { state.keys.right = true; e.preventDefault(); }
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { state.keys.shift = true; e.preventDefault(); }
        if (e.code === 'Space') { state.keys.lookBehind = true; e.preventDefault(); }
    });

    document.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'ArrowUp') state.keys.forward = false;
        if (e.code === 'KeyS' || e.code === 'ArrowDown') state.keys.backward = false;
        if (e.code === 'KeyA' || e.code === 'ArrowLeft') state.keys.left = false;
        if (e.code === 'KeyD' || e.code === 'ArrowRight') state.keys.right = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.keys.shift = false;
        if (e.code === 'Space') { state.keys.lookBehind = false; }
    });

    window.addEventListener('resize', () => { if (camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } });
    showScreen('menu');
});
