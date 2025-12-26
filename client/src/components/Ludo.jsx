import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Bot, Dice5, Trophy, RefreshCcw, Circle, Globe, PlusCircle, ArrowRightCircle } from 'lucide-react'

// Game Constants
const COLORS = {
    2: ['red', 'yellow'],      // Opposite corners
    3: ['red', 'green', 'yellow'], // Skip blue
    4: ['red', 'green', 'yellow', 'blue']
};

const COLOR_STYLES = {
    red: { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-500', ring: 'ring-red-500' },
    green: { bg: 'bg-green-500', border: 'border-green-500', text: 'text-green-500', ring: 'ring-green-500' },
    yellow: { bg: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-500', ring: 'ring-yellow-500' },
    blue: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-500', ring: 'ring-blue-500' }
};

// Imports
import socket from '../socket'
import PingDisplay from './PingDisplay'
import ConnectionStatus from './ConnectionStatus'

const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47]; // Star positions global indices
const HOME_ENTRY_POS = 50; // Last step on main path
const WINNING_POS = 56; // Final position (Home)

// Standard 15x15 Ludo Board Grid Coordinates
// Origin (0,0) top-left.
// Each arm is 6x3 grid.
// Helper to generate path coordinates
const MAIN_PATH_COORDS = [
    // Red's First 5 steps (Starting at 1,6 going right) -> Actually Red starts 1,6
    { x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 }, // 0-4
    { x: 6, y: 5 }, { x: 6, y: 4 }, { x: 6, y: 3 }, { x: 6, y: 2 }, { x: 6, y: 1 }, { x: 6, y: 0 }, // 5-10 (Up green arm)
    { x: 7, y: 0 }, { x: 8, y: 0 }, // 11-12 (Top turn)
    { x: 8, y: 1 }, { x: 8, y: 2 }, { x: 8, y: 3 }, { x: 8, y: 4 }, { x: 8, y: 5 }, // 13-17 (Down green arm)
    { x: 9, y: 6 }, { x: 10, y: 6 }, { x: 11, y: 6 }, { x: 12, y: 6 }, { x: 13, y: 6 }, { x: 14, y: 6 }, // 18-23 (Right yellow arm)
    { x: 14, y: 7 }, { x: 14, y: 8 }, // 24-25 (Right turn)
    { x: 13, y: 8 }, { x: 12, y: 8 }, { x: 11, y: 8 }, { x: 10, y: 8 }, { x: 9, y: 8 }, // 26-30 (Left yellow arm)
    { x: 8, y: 9 }, { x: 8, y: 10 }, { x: 8, y: 11 }, { x: 8, y: 12 }, { x: 8, y: 13 }, { x: 8, y: 14 }, // 31-36 (Down blue arm)
    { x: 7, y: 14 }, { x: 6, y: 14 }, // 37-38 (Bottom turn)
    { x: 6, y: 13 }, { x: 6, y: 12 }, { x: 6, y: 11 }, { x: 6, y: 10 }, { x: 6, y: 9 }, // 39-43 (Up blue arm)
    { x: 5, y: 8 }, { x: 4, y: 8 }, { x: 3, y: 8 }, { x: 2, y: 8 }, { x: 1, y: 8 }, { x: 0, y: 8 }, // 44-49 (Left red arm)
    { x: 0, y: 7 }, // 50 (End of cycle)
    // 51 is technically index 0 for next loop, but used for logic
    { x: 1, y: 6 } // 51 is basically index 0
];

const HOME_STRETCH_COORDS = {
    red: [{ x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 }],
    green: [{ x: 7, y: 1 }, { x: 7, y: 2 }, { x: 7, y: 3 }, { x: 7, y: 4 }, { x: 7, y: 5 }],
    yellow: [{ x: 13, y: 7 }, { x: 12, y: 7 }, { x: 11, y: 7 }, { x: 10, y: 7 }, { x: 9, y: 7 }],
    blue: [{ x: 7, y: 13 }, { x: 7, y: 12 }, { x: 7, y: 11 }, { x: 7, y: 10 }, { x: 7, y: 9 }]
};

function Ludo() {
    const [playerCount, setPlayerCount] = useState(2);
    const [gameMode, setGameMode] = useState('pve');
    const [players, setPlayers] = useState([]);
    const [turn, setTurn] = useState(0);
    const [dice, setDice] = useState(null);
    const [rolling, setRolling] = useState(false);
    const [winner, setWinner] = useState(null);
    const [gameState, setGameState] = useState('setup');
    const [log, setLog] = useState([]);
    const [selectedToken, setSelectedToken] = useState(null);

    // Online State
    const [room, setRoom] = useState("");
    const [isRoomJoined, setIsRoomJoined] = useState(false);
    const [onlineView, setOnlineView] = useState('menu'); // 'menu', 'create', 'join'
    const [myIndex, setMyIndex] = useState(null);
    const [serverMaxPlayers, setServerMaxPlayers] = useState(4);
    const [turnPhase, setTurnPhase] = useState('ROLL'); // 'ROLL' or 'MOVE'
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);

    // Persistence
    useEffect(() => {
        const savedGame = sessionStorage.getItem('ludo_game_state');
        if (savedGame) {
            try {
                const parsed = JSON.parse(savedGame);
                // Only restore if we have basic integrity and not setup mode (unless we want to restore setup but user probably wants 'playing' state)
                if (parsed.gameState === 'playing' || parsed.gameState === 'finished') {
                    setPlayerCount(parsed.playerCount);
                    setGameMode(parsed.gameMode);
                    setPlayers(parsed.players);
                    setTurn(parsed.turn);
                    setDice(parsed.dice);
                    setRolling(parsed.rolling);
                    setWinner(parsed.winner);
                    setGameState(parsed.gameState);
                    setLog(parsed.log);
                }
            } catch (e) {
                console.error("Failed to load Ludo state", e);
            }
        }
    }, []);

    useEffect(() => {
        if (gameState !== 'setup') {
            const stateToSave = {
                playerCount,
                gameMode,
                players,
                turn,
                dice,
                rolling,
                winner,
                gameState,
                log
            };
            sessionStorage.setItem('ludo_game_state', JSON.stringify(stateToSave));
        }
    }, [playerCount, gameMode, players, turn, dice, rolling, winner, gameState, log]);

    // Socket Handlers
    useEffect(() => {
        socket.on("connect", () => {
            // Reconnect logic handled manually or via joinRoom
            if (gameMode === 'online' && room && isRoomJoined) {
                socket.emit("join_room", { room, gameType: 'ludo', action: 'join' });
            }
        });

        socket.on("player_role", ({ index, maxPlayers }) => {
            setMyIndex(index);
            if (maxPlayers) setServerMaxPlayers(maxPlayers);
        });

        socket.on("room_full", () => {
            alert("Room is full!");
            setIsRoomJoined(false);
            setOnlineView('menu');
        });

        socket.on("receive_message", (data) => {
            if (data.players) {
                // Sync Players & Transform tokens from Server (Array of Numbers) to Client (Array of Objects)
                const transformedPlayers = data.players.map(p => ({
                    ...p,
                    tokens: p.tokens.map((pos, tid) => ({
                        id: tid,
                        pos: pos,
                        isFinished: pos >= 56 // Assumes 56 is winning pos
                    })),
                    finishedCount: p.finishedTokens || 0
                }));
                setPlayers(transformedPlayers);
            }
            if (data.currentTurn !== undefined) setTurn(data.currentTurn);
            if (data.diceValue !== undefined) setDice(data.diceValue);
            // If diceValue becomes present, rolling should stop
            if (data.diceValue) setRolling(false);

            if (data.turnPhase) setTurnPhase(data.turnPhase);

            if (data.gameType && gameState !== 'playing') {
                setGameState('playing');
                // Ensure player count matches server active players
                if (data.players) {
                    const activeCount = data.players.filter(p => p.isActive).length;
                    setPlayerCount(activeCount || 4);
                }
            }

            if (data.lastMove) {
                addLog(data.lastMove); // Server provides the log string
            }

            if (data.winner !== null && data.winner !== undefined) {
                // Winner might be index or object depending on server impl
                // My server Ludo.js sets winner = index (0-3)
                const winnerIdx = data.winner;
                // But wait, existing code expects object. checking Ludo.js: "this.winner = playerIndex" (integer)
                // But existing UI expects "winner.color"
                if (typeof winnerIdx === 'number') {
                    // Find player object
                    const wPlayer = data.players[winnerIdx] || { color: 'unknown' };
                    setWinner(wPlayer);
                } else {
                    setWinner(data.winner);
                }
                setGameState('finished');
            }
        });

        socket.on("error_message", (msg) => {
            alert(msg);
        });

        socket.on("rematch_requested", () => {
            setRematchRequestedBy('opponent');
        });

        socket.on("rematch_accepted", () => {
            setRematchRequestedBy(null);
            // Server should reset game state and emit receive_message with setup
        });

        socket.on("rematch_declined", () => {
            alert("Opponent declined rematch.");
            handleLeaveRoom();
        });

        return () => {
            socket.off("connect");
            socket.off("player_role");
            socket.off("room_full");
            socket.off("receive_message");
            socket.off("error_message");
            socket.off("rematch_requested");
            socket.off("rematch_accepted");
            socket.off("rematch_declined");
        }
    }, [socket, gameMode, gameState, room, isRoomJoined]);

    // Online Helpers
    const joinRoom = (roomIdInput, action = 'join', max = 4) => {
        const targetRoom = roomIdInput || room;
        if (!targetRoom) return;

        if (!socket.connected) socket.connect();

        socket.emit("join_room", {
            room: targetRoom,
            gameType: 'ludo',
            maxPlayers: max,
            action
        });
        setRoom(targetRoom);
        setGameMode('online');
        setIsRoomJoined(true);
        setServerMaxPlayers(max);
        if (action === 'create') {
            // Wait for server to confirm via receive_message
        }
    };

    const handleLeaveRoom = () => {
        socket.emit("leave_room", { room });
        setIsRoomJoined(false);
        setRoom("");
        setOnlineView('menu');
        setMyIndex(null);
        setGameState('setup');
        setGameMode('pve');
        setRematchRequestedBy(null);
    };

    const requestRematch = () => {
        socket.emit("request_rematch", room);
        setRematchRequestedBy('me');
    };

    const respondRematch = (accept) => {
        if (accept) {
            socket.emit("respond_rematch", { room, accept });
            setRematchRequestedBy(null);
        } else {
            socket.emit("respond_rematch", { room, accept });
            handleLeaveRoom();
        }
    };

    // Initialize Game
    const startGame = (count, mode) => {
        const activeColors = COLORS[count];
        const newPlayers = activeColors.map((color, i) => ({
            id: i,
            color: color,
            isAi: mode === 'pve' && i > 0,
            tokens: Array(4).fill(null).map((_, tid) => ({
                id: tid,
                pos: -1, // -1 = in base
                isFinished: false
            })),
            finishedCount: 0
        }));

        setPlayers(newPlayers);
        setPlayerCount(count);
        setGameMode(mode);
        setGameState('playing');
        setTurn(0);
        setDice(null);
        setWinner(null);
        setSelectedToken(null);
        setLog([`Game Started! ${newPlayers[0].color.toUpperCase()} goes first.`]);
    };

    const rollDice = () => {
        if (rolling || winner || gameState !== 'playing') return;

        // Online Check
        if (gameMode === 'online') {
            if (turn !== myIndex) return; // Not my turn
            if (turnPhase !== 'ROLL') return; // Wrong phase

            socket.emit("make_move", {
                room,
                action: 'roll'
            });
            return;
        }

        setRolling(true);
        setSelectedToken(null);
        // ... Local logic ...
        let count = 0;
        const interval = setInterval(() => {
            setDice(Math.floor(Math.random() * 6) + 1);
            count++;
            if (count > 10) {
                clearInterval(interval);
                finalizeRoll();
            }
        }, 60);
    };

    const finalizeRoll = () => {
        const value = Math.floor(Math.random() * 6) + 1;
        setDice(value);
        setRolling(false);

        const player = players[turn];
        addLog(`${player.color.toUpperCase()} rolled ${value}`);

        const validMoves = getValidMoves(player, value);

        if (validMoves.length === 0) {
            addLog(`No valid moves available`);
            setTimeout(() => {
                if (value !== 6) nextTurn();
                else {
                    // Rolled 6 but can't move - still next turn to avoid infinite loop
                    nextTurn();
                }
            }, 1000);
        } else if (player.isAi) {
            setTimeout(() => {
                const tokenId = selectBestMove(player, validMoves, value);
                moveToken(turn, tokenId, value);
            }, 1000);
        }
    };

    const getValidMoves = (player, roll) => {
        return player.tokens
            .map((t, idx) => ({ ...t, idx }))
            .filter(t => {
                if (t.isFinished) return false;
                if (t.pos === -1) return roll === 6; // Must roll 6 to start
                if (t.pos + roll > WINNING_POS) return false; // Would overshoot
                return true;
            })
            .map(t => t.idx);
    };

    const selectBestMove = (player, validMoves, roll) => {
        // AI Logic: Prioritize starting tokens, then advancement
        const inBase = validMoves.find(idx => player.tokens[idx].pos === -1);
        if (inBase !== undefined) return inBase;

        // Move furthest token
        let best = validMoves[0];
        validMoves.forEach(idx => {
            if (player.tokens[idx].pos > player.tokens[best].pos) {
                best = idx;
            }
        });
        return best;
    };

    const moveToken = (playerId, tokenId, roll) => {
        setPlayers(prev => {
            const updated = prev.map(p => ({
                ...p,
                tokens: p.tokens.map(t => ({ ...t }))
            }));

            const player = updated[playerId];
            const token = player.tokens[tokenId];

            let moveDesc = '';

            if (token.pos === -1) {
                token.pos = 0;
                moveDesc = 'started';
                addLog(`${player.color.toUpperCase()} token entered the board`);
            } else {
                token.pos += roll;
                moveDesc = `moved to ${token.pos}`;

                if (token.pos === WINNING_POS) {
                    token.isFinished = true;
                    player.finishedCount++;
                    addLog(`${player.color.toUpperCase()} token reached HOME!`);
                } else if (token.pos < HOME_ENTRY_POS) {
                    // Check for captures on main path
                    checkCapture(updated, playerId, token.pos);
                }
            }

            // Check win
            if (player.finishedCount === 4) {
                setWinner(player);
                setGameState('finished');
                addLog(`🎉 ${player.color.toUpperCase()} WINS!`);
            }

            return updated;
        });

        setSelectedToken(null);

        // Turn logic
        setTimeout(() => {
            if (roll !== 6 && !winner) {
                nextTurn();
            } else {
                setDice(null); // Allow another roll
            }
        }, 500);
    };

    const checkCapture = (allPlayers, currentPlayerId, position) => {
        const globalPos = getGlobalPosition(allPlayers[currentPlayerId].color, position);

        if (SAFE_SPOTS.includes(globalPos)) return; // Safe spot

        allPlayers.forEach((p, pId) => {
            if (pId !== currentPlayerId) {
                p.tokens.forEach(t => {
                    if (t.pos > -1 && !t.isFinished && t.pos < HOME_ENTRY_POS) {
                        const otherGlobalPos = getGlobalPosition(p.color, t.pos);
                        if (otherGlobalPos === globalPos) {
                            t.pos = -1; // Send back to base
                            addLog(`${allPlayers[currentPlayerId].color.toUpperCase()} captured ${p.color.toUpperCase()}!`);
                        }
                    }
                });
            }
        });
    };

    const getGlobalPosition = (color, relativePos) => {
        const offsets = { red: 0, green: 13, yellow: 26, blue: 39 };
        return (offsets[color] + relativePos) % 52;
    };

    const nextTurn = () => {
        setTurn(prev => (prev + 1) % players.length);
        setDice(null);
        setSelectedToken(null);
    };

    const addLog = (msg) => {
        setLog(prev => [msg, ...prev].slice(0, 8));
    };

    // AI auto-roll
    useEffect(() => {
        if (gameState === 'playing' && players[turn]?.isAi && !dice && !rolling && !winner) {
            const timer = setTimeout(rollDice, 1000);
            return () => clearTimeout(timer);
        }
    }, [turn, gameState, players, dice, rolling, winner]);

    const handleTokenClick = (playerId, tokenId) => {
        if (playerId !== turn || (!dice && gameMode !== 'online') || rolling || winner) return;
        if (players[turn].isAi && gameMode !== 'online') return;

        // Online Check
        if (gameMode === 'online') {
            if (playerId !== myIndex) return; // Can't move others
            if (turnPhase !== 'MOVE') return; // Must roll first

            // Server validates move legitimacy, we just emit intent
            socket.emit("make_move", {
                room,
                action: 'move',
                tokenIndex: tokenId
            });
            return;
        }

        const validMoves = getValidMoves(players[turn], dice);
        if (validMoves.includes(tokenId)) {
            moveToken(playerId, tokenId, dice);
        }
    };

    return (
        <div className="flex flex-col items-center w-full max-w-6xl mx-auto gap-6">
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-center space-y-4 relative w-full"
            >
                <div className="flex items-center justify-center gap-3">
                    <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-white drop-shadow-lg flex items-center justify-center gap-3">
                        <Circle className="text-yellow-400" /> LUDO
                    </h1>
                </div>
                {gameState === 'playing' && (
                    <button
                        onClick={() => {
                            if (gameMode === 'online') handleLeaveRoom();
                            else {
                                setGameState('setup');
                                setGameMode('pve');
                            }
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 bg-red-500/20 hover:bg-red-500/40 text-red-300 px-4 py-2 rounded-lg font-bold text-sm transition-all border border-red-500/20"
                    >
                        Exit Match
                    </button>
                )}
            </motion.div>

            {gameMode === 'online' && <ConnectionStatus />}

            {gameState === 'setup' ? (
                <div className="flex flex-col gap-6 bg-white/5 p-8 rounded-2xl border border-white/10 backdrop-blur-md max-w-md w-full">
                    {/* Online Selection UI */}
                    {onlineView === 'menu' && (
                        <>
                            <div className="space-y-3">
                                <label className="text-gray-300 font-bold uppercase text-sm block text-center">Players</label>
                                <div className="flex justify-center gap-3">
                                    {[2, 3, 4].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setPlayerCount(n)}
                                            className={`px-6 py-3 rounded-xl font-bold border-2 transition-all ${playerCount === n
                                                ? 'bg-white text-black border-white scale-110'
                                                : 'border-white/20 text-gray-400 hover:border-white/50 hover:text-white'
                                                }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-gray-300 font-bold uppercase text-sm block text-center">Mode</label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setGameMode('pve')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all border-2 ${gameMode === 'pve'
                                            ? 'bg-fuchsia-500 text-white border-fuchsia-500'
                                            : 'border-white/20 text-gray-400 hover:border-fuchsia-500/50'
                                            }`}
                                    >
                                        <Bot size={20} /> vs AI
                                    </button>
                                    <button
                                        onClick={() => setGameMode('pvp')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all border-2 ${gameMode === 'pvp'
                                            ? 'bg-cyan-500 text-white border-cyan-500'
                                            : 'border-white/20 text-gray-400 hover:border-cyan-500/50'
                                            }`}
                                    >
                                        <User size={20} /> Local
                                    </button>
                                </div>
                                <button
                                    onClick={() => setOnlineView('lobby')}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all border-2 ${gameMode === 'online'
                                        ? 'bg-green-500 text-white border-green-500'
                                        : 'border-white/20 text-green-400 hover:border-green-500/50'
                                        }`}
                                >
                                    <Globe size={20} /> Online Multiplayer
                                </button>
                            </div>

                            {gameMode !== 'online' && (
                                <button
                                    onClick={() => startGame(playerCount, gameMode)}
                                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-black text-lg rounded-xl hover:from-green-400 hover:to-emerald-400 transition-all shadow-lg shadow-green-500/50"
                                >
                                    START GAME
                                </button>
                            )}
                        </>
                    )}

                    {onlineView === 'lobby' && (
                        <div className="space-y-4">
                            <h3 className="text-xl font-bold text-center text-white">Online Lobby</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setOnlineView('create')}
                                    className="p-4 rounded-xl bg-white/5 border-2 border-white/20 hover:bg-white/10 hover:border-green-500 transition-all flex flex-col items-center gap-2"
                                >
                                    <PlusCircle size={32} className="text-green-400" />
                                    <span className="font-bold">Create Room</span>
                                </button>
                                <button
                                    onClick={() => setOnlineView('join')}
                                    className="p-4 rounded-xl bg-white/5 border-2 border-white/20 hover:bg-white/10 hover:blue-500 transition-all flex flex-col items-center gap-2"
                                >
                                    <ArrowRightCircle size={32} className="text-blue-400" />
                                    <span className="font-bold">Join Room</span>
                                </button>
                            </div>
                            <button onClick={() => { setOnlineView('menu'); setGameMode('pve'); }} className="w-full py-2 text-gray-400 hover:text-white">Back</button>
                        </div>
                    )}

                    {onlineView === 'create' && (
                        <div className="space-y-4">
                            <h3 className="text-xl font-bold text-center text-white">Create Room</h3>
                            <div>
                                <label className="block text-sm font-bold text-gray-400 mb-2">Max Players</label>
                                <div className="flex gap-2">
                                    {[2, 3, 4].map(n => (
                                        <button key={n} onClick={() => setServerMaxPlayers(n)} className={`flex-1 py-2 rounded-lg border ${serverMaxPlayers === n ? 'bg-green-500 border-green-500 text-white' : 'border-white/20 text-gray-400'}`}>{n}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Room ID"
                                    className="flex-1 bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-500"
                                    value={room}
                                    onChange={(e) => setRoom(e.target.value)}
                                />
                                <button onClick={() => joinRoom(room, 'create', serverMaxPlayers)} className="bg-green-500 text-white px-6 rounded-xl font-bold">Create</button>
                            </div>
                            <button onClick={() => setOnlineView('lobby')} className="w-full text-gray-400 hover:text-white">Back</button>
                        </div>
                    )}

                    {onlineView === 'join' && (
                        <div className="space-y-4">
                            <h3 className="text-xl font-bold text-center text-white">Join Room</h3>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="Enter Room ID"
                                    className="flex-1 bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
                                    value={room}
                                    onChange={(e) => setRoom(e.target.value)}
                                />
                                <button onClick={() => joinRoom(room, 'join')} className="bg-blue-500 text-white px-6 rounded-xl font-bold">Join</button>
                            </div>
                            <button onClick={() => setOnlineView('lobby')} className="w-full text-gray-400 hover:text-white">Back</button>
                        </div>
                    )}
                </div>
            ) : gameState === 'playing' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
                    {/* Board */}
                    <div className="lg:col-span-2 flex justify-center">
                        <div className="relative w-full max-w-[600px] aspect-square bg-white/5 rounded-2xl border-2 border-white/10 shadow-2xl p-3">
                            {/* Quadrants */}
                            <div className="absolute inset-0">
                                {/* Red Area - Top Left */}
                                <div className={`absolute top-[1%] left-[1%] w-[38%] h-[38%] rounded-3xl border-4 ${COLOR_STYLES.red.border}/30 ${COLOR_STYLES.red.bg}/10 flex items-center justify-center ${!players.find(p => p.color === 'red')?.isActive ? 'opacity-30' : ''}`}>
                                    <div className="grid grid-cols-2 gap-3 w-1/2 aspect-square">
                                        {players.find(p => p.color === 'red')?.tokens.map((t, i) => (
                                            t.pos === -1 && (
                                                <motion.button
                                                    key={i}
                                                    onClick={() => handleTokenClick(players.findIndex(p => p.color === 'red'), i)}
                                                    className={`${COLOR_STYLES.red.bg} w-full aspect-square rounded-full border-2 border-white/80 shadow-lg ${turn === players.findIndex(p => p.color === 'red') && dice === 6 && !players[turn].isAi
                                                        ? 'cursor-pointer ring-4 ring-white animate-pulse'
                                                        : ''
                                                        }`}
                                                    whileHover={{ scale: 1.1 }}
                                                />
                                            )
                                        ))}
                                    </div>
                                </div>

                                {/* Green Area - Top Right */}
                                <div className={`absolute top-[1%] right-[1%] w-[38%] h-[38%] rounded-3xl border-4 ${COLOR_STYLES.green.border}/30 ${COLOR_STYLES.green.bg}/10 flex items-center justify-center ${!players.find(p => p.color === 'green')?.isActive ? 'opacity-30' : ''}`}>
                                    <div className="grid grid-cols-2 gap-3 w-1/2 aspect-square">
                                        {players.find(p => p.color === 'green')?.tokens.map((t, i) => (
                                            t.pos === -1 && (
                                                <motion.button
                                                    key={i}
                                                    onClick={() => handleTokenClick(players.findIndex(p => p.color === 'green'), i)}
                                                    className={`${COLOR_STYLES.green.bg} w-full aspect-square rounded-full border-2 border-white/80 shadow-lg ${turn === players.findIndex(p => p.color === 'green') && dice === 6 && !players[turn].isAi
                                                        ? 'cursor-pointer ring-4 ring-white animate-pulse'
                                                        : ''
                                                        }`}
                                                    whileHover={{ scale: 1.1 }}
                                                />
                                            )
                                        ))}
                                    </div>
                                </div>

                                {/* Yellow Area - Bottom Right */}
                                <div className={`absolute bottom-[1%] right-[1%] w-[38%] h-[38%] rounded-3xl border-4 ${COLOR_STYLES.yellow.border}/30 ${COLOR_STYLES.yellow.bg}/10 flex items-center justify-center ${!players.find(p => p.color === 'yellow')?.isActive ? 'opacity-30' : ''}`}>
                                    <div className="grid grid-cols-2 gap-3 w-1/2 aspect-square">
                                        {players.find(p => p.color === 'yellow')?.tokens.map((t, i) => (
                                            t.pos === -1 && (
                                                <motion.button
                                                    key={i}
                                                    onClick={() => handleTokenClick(players.findIndex(p => p.color === 'yellow'), i)}
                                                    className={`${COLOR_STYLES.yellow.bg} w-full aspect-square rounded-full border-2 border-white/80 shadow-lg ${turn === players.findIndex(p => p.color === 'yellow') && dice === 6 && !players[turn].isAi
                                                        ? 'cursor-pointer ring-4 ring-white animate-pulse'
                                                        : ''
                                                        }`}
                                                    whileHover={{ scale: 1.1 }}
                                                />
                                            )
                                        ))}
                                    </div>
                                </div>

                                {/* Blue Area - Bottom Left */}
                                <div className={`absolute bottom-[1%] left-[1%] w-[38%] h-[38%] rounded-3xl border-4 ${COLOR_STYLES.blue.border}/30 ${COLOR_STYLES.blue.bg}/10 flex items-center justify-center ${!players.find(p => p.color === 'blue')?.isActive ? 'opacity-30' : ''}`}>
                                    <div className="grid grid-cols-2 gap-3 w-1/2 aspect-square">
                                        {players.find(p => p.color === 'blue')?.tokens.map((t, i) => (
                                            t.pos === -1 && (
                                                <motion.button
                                                    key={i}
                                                    onClick={() => handleTokenClick(players.findIndex(p => p.color === 'blue'), i)}
                                                    className={`${COLOR_STYLES.blue.bg} w-full aspect-square rounded-full border-2 border-white/80 shadow-lg ${turn === players.findIndex(p => p.color === 'blue') && dice === 6 && !players[turn].isAi
                                                        ? 'cursor-pointer ring-4 ring-white animate-pulse'
                                                        : ''
                                                        }`}
                                                    whileHover={{ scale: 1.1 }}
                                                />
                                            )
                                        ))}
                                    </div>
                                </div>

                                {/* Main Path Rendering */}
                                {MAIN_PATH_COORDS.map((coord, idx) => {
                                    if (idx > 50) return null; // Skip overflow
                                    const isSafe = SAFE_SPOTS.includes(idx);
                                    // Determine if this is a start spot for any color
                                    let startColor = null;
                                    if (idx === 0) startColor = 'red';
                                    if (idx === 13) startColor = 'green';
                                    if (idx === 26) startColor = 'yellow';
                                    if (idx === 39) startColor = 'blue';

                                    return (
                                        <div
                                            key={`path-${idx}`}
                                            className={`absolute w-[6.66%] h-[6.66%] border border-white/10 flex items-center justify-center
                                            ${startColor ? `${COLOR_STYLES[startColor].bg} text-white` : isSafe ? 'bg-white/10' : 'bg-transparent'}
                                        `}
                                            style={{ left: `${coord.x * 6.66}%`, top: `${coord.y * 6.66}%` }}
                                        >
                                            {isSafe && !startColor && <div className="text-[10px] opacity-50">★</div>}
                                            {startColor && <div className="text-[10px]">➜</div>}
                                        </div>
                                    );
                                })}

                                {/* Home Stretches Rendering */}
                                {Object.entries(HOME_STRETCH_COORDS).map(([color, coords]) => (
                                    coords.map((coord, idx) => (
                                        <div
                                            key={`home-${color}-${idx}`}
                                            className={`absolute w-[6.66%] h-[6.66%] border border-white/10 ${COLOR_STYLES[color].bg} opacity-20`}
                                            style={{ left: `${coord.x * 6.66}%`, top: `${coord.y * 6.66}%` }}
                                        />
                                    ))
                                ))}

                                {/* Center Home */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[20%] h-[20%] bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-full border-4 border-white/20 flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                    <Trophy className="text-yellow-400 drop-shadow-lg" size={32} />
                                </div>

                                {/* Active tokens mapping */}
                                {players.map((p, pIdx) =>
                                    p.tokens.map((t, tIdx) => {
                                        if (t.pos > -1 && !t.isFinished) {
                                            let x, y;

                                            // Calculate global position based on color offset
                                            let globalPos = t.pos;
                                            // Logic needs to handle offset relative to MAIN_PATH
                                            // But our `t.pos` is RELATIVE steps for that player.
                                            // We need to map relative steps to global grid.

                                            if (t.pos <= HOME_ENTRY_POS) {
                                                const offsets = { red: 0, green: 13, yellow: 26, blue: 39 };
                                                const globalIndex = (offsets[p.color] + t.pos) % 52;
                                                const coord = MAIN_PATH_COORDS[globalIndex];
                                                x = coord.x;
                                                y = coord.y;
                                            } else {
                                                // Home stretch
                                                const stretchIdx = t.pos - (HOME_ENTRY_POS + 1);
                                                if (stretchIdx < 5) { // 0-4
                                                    const coord = HOME_STRETCH_COORDS[p.color][stretchIdx];
                                                    x = coord.x;
                                                    y = coord.y;
                                                } else {
                                                    // Center Goal (roughly)
                                                    x = 7; y = 7;
                                                }
                                            }

                                            const leftVal = x * 6.66;
                                            const topVal = y * 6.66;

                                            const validMoves = getValidMoves(p, dice || 0);
                                            const isClickable = turn === pIdx && dice && validMoves.includes(tIdx) && !p.isAi;

                                            return (
                                                <motion.button
                                                    key={`${pIdx}-${tIdx}`}
                                                    layout
                                                    onClick={() => isClickable && handleTokenClick(pIdx, tIdx)}
                                                    className={`absolute ${COLOR_STYLES[p.color].bg} w-[5%] aspect-square rounded-full border-2 border-white shadow-xl z-20 flex items-center justify-center ${isClickable ? `cursor-pointer ring-4 ${COLOR_STYLES[p.color].ring} animate-bounce` : ''
                                                        }`}
                                                    style={{ left: `${leftVal + 0.8}%`, top: `${topVal + 0.8}%` }} // Center in 6.66% box
                                                    animate={{ left: `${leftVal + 0.8}%`, top: `${topVal + 0.8}%` }}
                                                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                                                    whileHover={isClickable ? { scale: 1.3 } : {}}
                                                />
                                            );
                                        }
                                        return null;
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col gap-4">
                        {/* Current Turn */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                            <h3 className="text-lg font-bold mb-3 text-gray-400 uppercase text-sm">Current Turn</h3>
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-6 h-6 rounded-full ${COLOR_STYLES[players[turn]?.color]?.bg}`} />
                                <span className={`text-2xl font-black capitalize ${COLOR_STYLES[players[turn]?.color]?.text}`}>
                                    {players[turn]?.color}
                                </span>
                                {players[turn]?.isAi && <Bot size={20} className="text-gray-400" />}
                            </div>

                            {/* Dice */}
                            <div className="flex flex-col items-center gap-2">
                                <motion.button
                                    whileHover={{ scale: players[turn]?.isAi || dice ? 1 : 1.05 }}
                                    whileTap={{ scale: players[turn]?.isAi || dice ? 1 : 0.95 }}
                                    onClick={rollDice}
                                    disabled={rolling || winner || players[turn]?.isAi || dice !== null || (gameMode === 'online' && turn !== myIndex)}
                                    className={`
                                        w-20 h-20 rounded-2xl border-2 flex items-center justify-center text-4xl font-black shadow-lg
                                        ${rolling ? 'animate-spin' : ''} transition-all
                                        ${players[turn]?.isAi || dice || (gameMode === 'online' && turn !== myIndex)
                                            ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed opacity-50'
                                            : 'bg-white text-black border-white hover:bg-gray-100 cursor-pointer'}
                                    `}
                                >
                                    {rolling ? <RefreshCcw /> : (dice || <Dice5 />)}
                                </motion.button>
                                <p className="text-xs text-gray-400 text-center">
                                    {dice ? 'Select a token' : players[turn]?.isAi ? 'AI thinking...' : (gameMode === 'online' && turn !== myIndex) ? `Waiting for ${players[turn]?.color}...` : 'Roll dice'}
                                </p>
                            </div>
                        </div>

                        {/* Player Status */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                            <h3 className="text-sm font-bold mb-3 text-gray-400 uppercase">Status</h3>
                            <div className="space-y-2">
                                {gameMode === 'online' && isRoomJoined && (
                                    <div className="mb-2 p-2 bg-blue-500/20 rounded-lg text-center border border-blue-500/30">
                                        <p className="text-blue-300 font-bold">Room: {room}</p>
                                        <PingDisplay />
                                        <p className="text-xs text-blue-200 mt-1">You are Player {myIndex !== null ? myIndex + 1 : "?"}</p>
                                        <button onClick={handleLeaveRoom} className="mt-2 text-xs bg-red-500/20 hover:bg-red-500/40 px-2 py-1 rounded text-red-300 transition-colors">Leave Room</button>
                                    </div>
                                )}
                                {players.map((p, i) => {
                                    if (p.isActive === false) return null; // Skip inactive
                                    return (
                                        <div key={i} className={`flex justify-between items-center p-2 rounded-lg ${turn === i ? 'bg-white/10' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full ${COLOR_STYLES[p.color].bg}`} />
                                                <span className={`capitalize font-bold text-sm ${COLOR_STYLES[p.color].text}`}>
                                                    {p.color} {myIndex === i && gameMode === 'online' ? '(You)' : ''}
                                                </span>
                                            </div>
                                            <span className="text-xs font-mono text-gray-400">{p.finishedCount || 0}/4</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Log */}
                        <div className="bg-black/40 border border-white/5 rounded-2xl p-3 max-h-[200px]">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 sticky top-0 bg-black/90">Log</h4>
                            <div className="space-y-1 text-xs font-mono">
                                {log.map((l, i) => (
                                    <div key={i} className="text-gray-300 opacity-80 text-xs">
                                        {l}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Win Modal */}
            <AnimatePresence>
                {winner && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className="text-center p-8 bg-[#1a1a1a] border-2 border-white/20 rounded-3xl shadow-2xl max-w-md"
                        >
                            <Trophy className="mx-auto text-yellow-400 mb-4" size={64} />
                            <h2 className={`text-5xl font-black mb-2 capitalize ${COLOR_STYLES[winner.color].text}`}>
                                {winner.color} Wins!
                            </h2>
                            <p className="text-gray-400 mb-6">Congratulations! 🎉</p>
                            {gameMode === 'online' ? (
                                <div className="flex flex-col gap-2 w-full">
                                    {rematchRequestedBy === 'opponent' ? (
                                        <button onClick={() => respondRematch(true)} className="px-6 py-3 bg-green-500 text-white font-bold rounded-xl hover:bg-green-400 shadow-lg shadow-green-500/20 animate-pulse">
                                            Accept Rematch
                                        </button>
                                    ) : rematchRequestedBy === 'me' ? (
                                        <button disabled className="px-6 py-3 bg-white/10 text-white/50 font-bold rounded-xl cursor-wait">
                                            Waiting for Opponent...
                                        </button>
                                    ) : (
                                        <button onClick={requestRematch} className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors">
                                            Request Rematch
                                        </button>
                                    )}
                                    <button onClick={handleLeaveRoom} className="px-6 py-2 text-sm text-gray-400 font-bold hover:text-white transition-colors">
                                        Back to Menu
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setGameState('setup')}
                                    className="px-8 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors"
                                >
                                    New Game
                                </button>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default Ludo;
