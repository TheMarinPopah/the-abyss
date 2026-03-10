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
    let player = { x: 1.5 * 4, z: 1.5 * 4, angle: 0 }; // Start pos
    let maze = [];
    let walls = [];
    let playerLight;

    // Multiplayer variables
    let peer = null;
    let connections = []; // Array to hold all connections (for host)
    let myConn = null; // Single connection to host (for client)
    let isHost = false;
    let otherPlayers = {}; // Map of id -> { mesh, x, z, angle }
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
        // Create a new Peer with a random ID
        peer = new Peer();
        
        peer.on('open', (id) => {
            myId = id;
            console.log('My ID:', id);

            if (hosting) {
                isHost = true;
                hostCodeDisplay.textContent = id;
                hostInfoDiv.style.display = 'block';
            } else {
                // If joining, we initiate connection in the join button handler
            }
        });

        peer.on('connection', (conn) => {
            // Host receives a connection
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
                // Send the maze to the new player
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
                // Host disconnected
                alert("Host disconnected.");
                location.reload();
            }
        });
    }

    function handleData(data, senderId) {
        if (data.type === 'maze') {
            maze = data.data; // Load the maze from host
        }
        else if (data.type === 'move') {
            updateOtherPlayer(senderId, data.x, data.z, data.angle);
            
            // If I am host, relay this position to everyone else
            if (isHost) {
                broadcastData({ type: 'move', id: senderId, x: data.x, z: data.z, angle: data.angle }, senderId);
            }
        }
        else if (data.type === 'host_maze') {
             // Specific case if
