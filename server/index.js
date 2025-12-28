const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const TicTacToe = require('./games/TicTacToe');
const SnakeAndLadders = require('./games/SnakeAndLadders');
const Ludo = require('./games/Ludo');

app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Room Storage: { [roomId]: GameInstance }
const rooms = new Map();
// Voice Storage: { [roomId]: [socketId, ...] }
const voiceUsers = new Map();
// Socket to Room mapping
const socketRoomMap = new Map();

io.on("connection", (socket) => {
    // console.log(`User Connected: ${socket.id}`);

    // Ping/Pong for Latency Check
    socket.on("ping", (cb) => {
        if (typeof cb === "function") cb();
    });

    // Join a room with strict Create/Join logic
    socket.on("join_room", (data) => {
        let roomId, gameType, maxPlayers, action, isPublic, userName;

        if (typeof data === 'object') {
            roomId = data.room;
            gameType = data.gameType || 'tictactoe';
            maxPlayers = data.maxPlayers || 2;
            action = data.action || 'join'; // default to join for compatibility if missing
            isPublic = !!data.isPublic;
            userName = data.userName;
        } else {
            // Deprecated string-only support (treat as join)
            roomId = data;
            gameType = 'tictactoe'; // Guess
            action = 'join';
            isPublic = false;
        }

        // Validate Create/Join
        const roomExists = rooms.has(roomId);

        if (action === 'create') {
            if (roomExists) {
                socket.emit("error_message", "Room already exists! Try another ID.");
                return;
            }
        } else if (action === 'join') {
            if (!roomExists) {
                // If attempting to rejoin a session, maybe we can allow simple join? 
                // But user requested specific "Join checks existing".
                socket.emit("error_message", "Room does not exist!");
                return;
            }
        }

        socket.join(roomId);

        // Get or Create Game
        let game = rooms.get(roomId);
        if (!game) {
            if (gameType === 'snakeandladders') {
                if (typeof data !== 'object') maxPlayers = 4;
                game = new SnakeAndLadders(maxPlayers);
            } else if (gameType === 'ludo') {
                game = new Ludo(maxPlayers || 4);
            } else {
                game = new TicTacToe();
            }
            // Bind Metadata
            game.isPublic = isPublic;
            game.gameType = gameType; // Ensure type is stored
            game.roomId = roomId; // Store ID for list iteration

            rooms.set(roomId, game);
        }

        // Add Player
        const seatIndex = game.addPlayer(socket.id, userName);
        if (seatIndex !== -1) {
            socketRoomMap.set(socket.id, roomId);

            // Emit Role
            let role = '';
            // TTT uses X/O, SnL uses Index
            if (game instanceof TicTacToe) {
                role = seatIndex === 0 ? 'X' : 'O';
            } else {
                role = `P${seatIndex + 1}`;
            }

            socket.emit("player_role", { role, index: seatIndex, maxPlayers: game.maxPlayers || 2 });
            socket.to(roomId).emit("user_joined", { role, index: seatIndex });

            // Emit Full State
            io.to(roomId).emit("receive_message", game.getState());
        } else {
            socket.emit("room_full");
            // Also send state for spectating
            socket.emit("receive_message", game.getState());
        }
    });

    // List Public Rooms
    socket.on("get_public_rooms", ({ gameType } = {}) => {
        const publicRooms = [];
        for (const [id, game] of rooms.entries()) {
            if (game.isPublic && (!gameType || game.gameType === gameType)) {
                // Count active players
                const occupied = game.seats ? game.seats.filter(s => s !== null).length : 0;
                const max = game.maxPlayers || 2;
                if (occupied < max) {
                    publicRooms.push({
                        id,
                        players: occupied,
                        max,
                        gameType: game.gameType
                    });
                }
            }
        }
        socket.emit("public_rooms_list", publicRooms);
    });

    // Rematch Logic
    socket.on("request_rematch", (roomId) => {
        // Relay to others in room
        socket.to(roomId).emit("rematch_requested", { by: socket.id });
    });

    socket.on("respond_rematch", ({ room, accept }) => {
        if (accept) {
            const game = rooms.get(room);
            if (game) {
                const newState = game.reset();
                io.to(room).emit("receive_message", newState);
                io.to(room).emit("rematch_accepted"); // Notify to cleanup UI
            }
        } else {
            socket.to(room).emit("rematch_declined");
        }
    });

    // Reaction Logic
    socket.on("send_reaction", (data) => {
        // Broadcast reaction to EVERYONE in the room including sender
        io.to(data.room).emit("receive_reaction", data);
    });

    // Support "make_move" (New Protocol)
    socket.on("make_move", (data) => {
        const roomId = data.room;
        const game = rooms.get(roomId);
        if (game) {
            const result = game.handleMove(socket.id, data);
            if (result.valid) {
                io.to(roomId).emit("receive_message", result.state);
            } else {
                socket.emit("error_message", result.error);
                console.log(`Move Error in ${roomId}: ${result.error}`);
            }
        }
    });

    // Support "send_message" (Old Protocol - Bridge)
    socket.on("send_message", (data) => {
        socket.to(data.room).emit("receive_message", data);
    });

    socket.on("reset_game", (roomId) => {
        const game = rooms.get(roomId);
        if (game) {
            const newState = game.reset();
            io.to(roomId).emit("receive_message", newState);
        }
    });

    socket.on("leave_room", ({ room }) => {
        const game = rooms.get(room);
        if (game) {
            game.removePlayer(socket.id);
            socket.leave(room);
            socket.leave(room);
            socket.to(room).emit("opponent_left");
            io.to(room).emit("receive_message", game.getState());
            socketRoomMap.delete(socket.id);

            // Voice Cleanup
            let vUsers = voiceUsers.get(room) || [];
            if (vUsers.includes(socket.id)) {
                vUsers = vUsers.filter(id => id !== socket.id);
                voiceUsers.set(room, vUsers);
                // Notify others to remove peer
                vUsers.forEach(id => io.to(id).emit("user_left_voice", socket.id));
            }
        }
    });

    socket.on("disconnect", () => {
        const roomId = socketRoomMap.get(socket.id);
        if (roomId) {
            const game = rooms.get(roomId);
            if (game) {
                game.removePlayer(socket.id);
                // Notify others
                io.to(roomId).emit("receive_message", game.getState());
            }

            // Voice Cleanup
            let vUsers = voiceUsers.get(roomId) || [];
            if (vUsers.includes(socket.id)) {
                vUsers = vUsers.filter(id => id !== socket.id);
                voiceUsers.set(roomId, vUsers);
                vUsers.forEach(id => io.to(id).emit("user_left_voice", socket.id));
            }

            socketRoomMap.delete(socket.id);
        }
        // console.log("User Disconnected", socket.id);
    });

    // --- Voice Chat Signaling ---

    // --- PeerJS Signaling Support ---

    socket.on('voice_peer_join', ({ room, peerId }) => {
        // Store peerId
        let vUsers = voiceUsers.get(room) || [];
        // Check if existing socketId is there, update peerId
        const existingIdx = vUsers.findIndex(u => u.socketId === socket.id);
        if (existingIdx !== -1) {
            vUsers[existingIdx].peerId = peerId;
        } else {
            vUsers.push({ socketId: socket.id, peerId });
        }
        voiceUsers.set(room, vUsers);

        // Notify others
        socket.to(room).emit('user_joined_voice_peer', { peerId });

        // Send full list to joiner
        socket.emit('all_voice_peers', vUsers.filter(u => u.peerId));
    });

    socket.on('voice_peer_leave', ({ room, peerId }) => {
        let vUsers = voiceUsers.get(room) || [];
        vUsers = vUsers.filter(u => u.peerId !== peerId);
        voiceUsers.set(room, vUsers);
        socket.to(room).emit('user_left_voice_peer', { peerId });
    });

    socket.on("voice_status_update", ({ room, peerId, status }) => {
        if (room && peerId) {
            socket.to(room).emit("voice_status_update", { peerId, status });
        }
    });
});

app.get("/health", (req, res) => {
    res.status(200).send();
});

const startGC = require('./GC');

// Start Garbage Collection (Runs every 3 minutes)
startGC(rooms);

const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`SERVER RUNNING ON PORT ${PORT} (0.0.0.0)`);
});
