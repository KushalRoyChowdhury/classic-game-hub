import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Bot, Dice5, Trophy, RefreshCcw, Globe, LogIn, MonitorPlay, Users, ArrowLeft, LogOut } from 'lucide-react'
import socket from '../socket'
import PingDisplay from './PingDisplay'
import ConnectionStatus from './ConnectionStatus'

// Game Constants
const BOARD_SIZE = 100;

// 5 Presets: Each has 10 Snakes and 5 Ladders
const BOARD_PRESETS = [
    {
        // Classic Style
        id: 1,
        snakes: { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 },
        ladders: { 3: 38, 5: 14, 9: 31, 21: 42, 28: 84 }
    },
    {
        // Late Game Risk
        id: 2,
        snakes: { 99: 5, 95: 25, 92: 72, 88: 68, 85: 45, 75: 35, 65: 25, 40: 10, 30: 5, 20: 2 },
        ladders: { 3: 20, 15: 35, 45: 65, 60: 80, 70: 95 }
    },
    {
        // Ladder Heaven (but Snakes hurt)
        id: 3,
        snakes: { 98: 10, 94: 64, 84: 54, 74: 24, 64: 34, 54: 14, 44: 4, 34: 2, 24: 1, 14: 2 },
        ladders: { 2: 22, 12: 50, 22: 60, 50: 80, 70: 98 }
    },
    {
        // The Minefield (Dense Middle)
        id: 4,
        snakes: { 35: 5, 38: 12, 45: 20, 48: 22, 55: 30, 58: 32, 65: 40, 68: 42, 85: 60, 95: 70 },
        ladders: { 5: 25, 15: 40, 40: 70, 60: 85, 80: 99 }
    },
    {
        // Random Mix
        id: 5,
        snakes: { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79, 32: 10, 29: 9 },
        ladders: { 4: 14, 9: 31, 20: 38, 51: 67, 80: 99 }
    }
];

// Player Themes
const PLAYER_CONFIGS = [
    { id: 1, color: 'cyan', light: 'bg-cyan-500/20', border: 'border-cyan-500', text: 'text-cyan-400', shadow: 'shadow-[0_0_10px_cyan]' },
    { id: 2, color: 'fuchsia', light: 'bg-fuchsia-500/20', border: 'border-fuchsia-500', text: 'text-fuchsia-400', shadow: 'shadow-[0_0_10px_fuchsia]' },
    { id: 3, color: 'yellow', light: 'bg-yellow-500/20', border: 'border-yellow-500', text: 'text-yellow-400', shadow: 'shadow-[0_0_10px_yellow]' },
    { id: 4, color: 'green', light: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-400', shadow: 'shadow-[0_0_10px_green]' },
];

function SnakeAndLadders() {
    const [players, setPlayers] = useState([
        { id: 1, pos: 1, config: PLAYER_CONFIGS[0], isAi: false, hasStarted: false },
        { id: 2, pos: 1, config: PLAYER_CONFIGS[1], isAi: true, hasStarted: false }
    ]);
    const [playerCount, setPlayerCount] = useState(2);
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
    const [diceValue, setDiceValue] = useState(null);
    const [isRolling, setIsRolling] = useState(false);
    const [gameMode, setGameMode] = useState('pve'); // 'pvp' or 'pve'
    const [winner, setWinner] = useState(null);
    const [moveLog, setMoveLog] = useState([]);
    const [board, setBoard] = useState(BOARD_PRESETS[0]);

    // Online Config
    const [room, setRoom] = useState("");
    const [isRoomJoined, setIsRoomJoined] = useState(false);
    const [onlineView, setOnlineView] = useState('menu'); // 'menu', 'create', 'join'
    const [myIndex, setMyIndex] = useState(null);
    const [serverMaxPlayers, setServerMaxPlayers] = useState(2);
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);

    // Persistence load
    useEffect(() => {
        const loadGame = () => {
            const saved = sessionStorage.getItem('snl_game_state');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.gameMode !== 'online') {
                        setPlayers(parsed.players);
                        setPlayerCount(parsed.playerCount);
                        setCurrentPlayerIndex(parsed.currentPlayerIndex);
                        setDiceValue(parsed.diceValue);
                        setGameMode(parsed.gameMode);
                        setWinner(parsed.winner);
                        setMoveLog(parsed.moveLog);
                        setBoard(parsed.board);
                    } else if (sessionStorage.getItem('active_room_id')) {
                        // Attempt reconnect?
                        setRoom(sessionStorage.getItem('active_room_id'));
                        setOnlineView('join');
                        setIsRoomJoined(false); // Wait for manual or auto trigger
                        // We could auto-join here but it's tricky with React StrictMode double mounts.
                        // Let's rely on user clicking join, or improve later.
                    }
                } catch (e) {
                    console.error("Failed to load saved game", e);
                }
            }
        };
        loadGame();
    }, []);

    useEffect(() => {
        if (gameMode !== 'online') {
            const stateToSave = {
                players,
                playerCount,
                currentPlayerIndex,
                diceValue,
                gameMode,
                winner,
                moveLog,
                board
            };
            sessionStorage.setItem('snl_game_state', JSON.stringify(stateToSave));
            sessionStorage.removeItem('active_room_id');
        } else if (isRoomJoined) {
            sessionStorage.setItem('active_room_id', room);
        }
    }, [players, playerCount, currentPlayerIndex, diceValue, gameMode, winner, moveLog, board, isRoomJoined, room]);

    // Socket Handlers
    useEffect(() => {
        socket.on("player_role", ({ index, maxPlayers }) => {
            setMyIndex(index);
            if (maxPlayers) setServerMaxPlayers(maxPlayers);
        });

        socket.on("room_full", () => {
            alert("Room is full!");
            setIsRoomJoined(false);
            setOnlineView('menu');
            sessionStorage.removeItem('active_room_id');
        });

        socket.on("receive_message", (data) => {
            // Server Rules Update
            if (data.players) {
                setPlayers(prev => {
                    // Map server players to local structure
                    return data.players.map((p, i) => ({
                        ...p,
                        id: i + 1,
                        config: PLAYER_CONFIGS[i] || PLAYER_CONFIGS[0],
                        hasStarted: p.hasStarted !== undefined ? p.hasStarted : false
                    }));
                });
                // Ensure playerCount matches server's reality or config
                setPlayerCount(data.players.length);
            }

            if (data.currentPlayerIndex !== undefined) setCurrentPlayerIndex(data.currentPlayerIndex);
            if (data.diceValue !== undefined) setDiceValue(data.diceValue);

            if (Array.isArray(data.moveLog)) {
                setMoveLog(data.moveLog);
            } else if (data.logMsg) {
                setMoveLog(prev => [data.logMsg, ...prev].slice(0, 5));
            }

            // Sync Board if needed
            if (data.boardId && data.boardId !== board.id) {
                const newBoard = BOARD_PRESETS.find(b => b.id === data.boardId) || BOARD_PRESETS[0];
                setBoard(newBoard);
            }

            if (data.winner) setWinner(data.winner);
        });

        socket.on("error_message", (msg) => {
            alert(msg);
            setIsRoomJoined(false);
        });

        socket.on("rematch_requested", () => {
            setRematchRequestedBy('opponent');
        });

        socket.on("rematch_accepted", () => {
            setRematchRequestedBy(null);
        });

        socket.on("rematch_declined", () => {
            alert("Opponent declined rematch.");
            handleLeaveRoom();
        });

        socket.on("opponent_left", () => {
            alert("A player left the game.");
        });

        return () => {
            socket.off("player_role");
            socket.off("room_full");
            socket.off("receive_message");
            socket.off("error_message");
            socket.off("rematch_requested");
            socket.off("rematch_accepted");
            socket.off("rematch_declined");
            socket.off("opponent_left");
        }
    }, [socket, board.id]);

    // Reconnect Logic
    useEffect(() => {
        const handleReconnect = () => {
            if (gameMode === 'online' && room && isRoomJoined) {
                // Re-join with the same room ID
                socket.emit("join_room", { room, gameType: 'snakeandladders', action: 'join' });
                // We don't need to specify maxPlayers here for join
            }
        };

        socket.on("connect", handleReconnect);
        return () => socket.off("connect", handleReconnect);
    }, [socket, gameMode, room, isRoomJoined]);

    const joinRoom = (roomIdInput, action = 'join', max = 2) => {
        const targetRoom = roomIdInput || room;
        if (targetRoom !== "") {
            if (!socket.connected) socket.connect();

            socket.emit("join_room", {
                room: targetRoom,
                gameType: 'snakeandladders',
                maxPlayers: action === 'create' ? max : undefined, // Only send max on create
                action
            });
            setRoom(targetRoom);
            if (action === 'create') setServerMaxPlayers(max);
            setIsRoomJoined(true); // Optimistic, error handler will revert
        }
    };

    const handleLeaveRoom = () => {
        socket.emit("leave_room", { room });
        setIsRoomJoined(false);
        setRoom("");
        setOnlineView('menu');
        setMyIndex(null);
        setWinner(null);
        setRematchRequestedBy(null);
        sessionStorage.removeItem('active_room_id');
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

    const currentPlayer = players[currentPlayerIndex] || players[0];

    const resetGame = (mode = gameMode, count = playerCount) => {
        // Generate Players
        const newPlayers = Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            pos: 1,
            config: PLAYER_CONFIGS[i],
            isAi: mode === 'pve' && i > 0,
            hasStarted: false
        }));

        setPlayers(newPlayers);
        setCurrentPlayerIndex(0);
        setDiceValue(null);
        setWinner(null);
        setMoveLog([]);
        setGameMode(mode);
        setPlayerCount(count);

        // Randomize Board - Force different one
        let newBoard;
        do {
            newBoard = BOARD_PRESETS[Math.floor(Math.random() * BOARD_PRESETS.length)];
        } while (newBoard.id === board.id && BOARD_PRESETS.length > 1);
        setBoard(newBoard);

        // Reset online state if switching away
        if (mode !== 'online') {
            setMyIndex(null);
            setIsRoomJoined(false);
            setOnlineView('menu');
        } else {
            setOnlineView('menu'); // Reset menu view within online
            setIsRoomJoined(false);
        }
    };

    const rollDice = async () => {
        if (winner || isRolling) return;

        // Online Turn Check
        if (gameMode === 'online') {
            if (myIndex !== currentPlayerIndex) return; // Not your turn

            setIsRolling(true);
            socket.emit("make_move", { room, action: 'roll' });
            setTimeout(() => setIsRolling(false), 500);
            return;
        }

        setIsRolling(true);

        // Rolling animation simulation
        let rolls = 0;
        const rollInterval = setInterval(() => {
            setDiceValue(Math.floor(Math.random() * 6) + 1);
            rolls++;
            if (rolls > 10) {
                clearInterval(rollInterval);
                finishTurn();
            }
        }, 50);
    };

    const finishTurn = () => {
        const value = Math.floor(Math.random() * 6) + 1;
        setIsRolling(false);
        movePlayer(value);
    };

    const movePlayer = (steps) => {
        const newPlayers = players.map(p => ({ ...p }));
        const player = newPlayers[currentPlayerIndex];

        let logMsg = `Player ${player.id} rolled ${steps}`;
        let canMove = true;

        if (!player.hasStarted) {
            if (steps === 1 || steps === 6) {
                player.hasStarted = true;
                logMsg += " -> Started!";
            } else {
                logMsg += " -> Needs 1 or 6 to start.";
                canMove = false;
            }
        }

        let hasWon = false;
        if (canMove) {
            let nextPos = player.pos + steps;

            if (nextPos > BOARD_SIZE) {
                nextPos = player.pos; // Stay if overshoot
                logMsg += " -> Overshot!";
            } else {
                if (board.snakes[nextPos]) {
                    logMsg += ` to ${nextPos} -> Snake! Down to ${board.snakes[nextPos]}`;
                    nextPos = board.snakes[nextPos];
                } else if (board.ladders[nextPos]) {
                    logMsg += ` to ${nextPos} -> Ladder! Up to ${board.ladders[nextPos]}`;
                    nextPos = board.ladders[nextPos];
                } else {
                    logMsg += ` to ${nextPos}`;
                }
            }

            player.pos = nextPos;
            if (nextPos === BOARD_SIZE) hasWon = true;
        }

        const nextPlayerIndex = (hasWon || steps === 6) ? currentPlayerIndex : (currentPlayerIndex + 1) % players.length;

        setDiceValue(steps);
        setPlayers(newPlayers);
        setMoveLog(prev => [logMsg, ...prev].slice(0, 5));
        if (hasWon) setWinner(player);
        setCurrentPlayerIndex(nextPlayerIndex);
    };

    // AI Turn effect
    useEffect(() => {
        if (gameMode === 'pve' && currentPlayer?.isAi && !winner && !isRolling) {
            const timer = setTimeout(() => {
                rollDice();
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [currentPlayerIndex, isRolling, winner, gameMode]);


    // Board Grid Generation
    const renderBoard = () => {
        const cells = [];
        for (let row = 9; row >= 0; row--) {
            for (let col = 0; col < 10; col++) {
                let num;
                if (row % 2 === 0) {
                    num = row * 10 + col + 1;
                } else {
                    num = row * 10 + (9 - col) + 1;
                }

                const playersHere = players.filter(p => p.pos === num);
                const isSnakeHead = board.snakes[num];
                const isLadderBottom = board.ladders[num];

                cells.push(
                    <div
                        key={num}
                        className={`relative flex flex-col items-center justify-center border border-white/5 
                    ${(row + col) % 2 === 0 ? 'bg-white/5' : 'bg-transparent'}
                    w-full h-full aspect-square text-xs sm:text-sm font-mono text-gray-600
                    ${isSnakeHead ? 'bg-red-500/10' : ''}
                    ${isLadderBottom ? 'bg-green-500/10' : ''}
                    `}
                    >
                        <span className="absolute top-0.5 left-1 opacity-50 text-[10px] sm:text-xs">{num}</span>
                        {isSnakeHead && <span className="absolute bottom-0.5 right-1 text-[8px] sm:text-[10px] text-red-500 font-bold">🐍 {board.snakes[num]}</span>}
                        {isLadderBottom && <span className="absolute bottom-0.5 right-1 text-[8px] sm:text-[10px] text-green-500 font-bold">🪜 {board.ladders[num]}</span>}

                        {playersHere.length > 0 && (
                            <div className="flex flex-wrap items-center justify-center gap-0.5 z-10 w-full h-full p-1 lg:p-2">
                                {playersHere.map(p => (
                                    <motion.div
                                        key={p.id}
                                        layoutId={`p${p.id}`}
                                        className={`
                                        relative rounded-full border border-white shadow-sm
                                        w-3 h-3 sm:w-4 sm:h-4 lg:w-5 lg:h-5
                                        ${p.config.color === 'cyan' ? 'bg-cyan-500 shadow-cyan-500/50' :
                                                p.config.color === 'fuchsia' ? 'bg-fuchsia-500 shadow-fuchsia-500/50' :
                                                    p.config.color === 'yellow' ? 'bg-yellow-500 shadow-yellow-500/50' :
                                                        'bg-green-500 shadow-green-500/50'}
                                    `}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            }
        }
        return cells;
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
                        SNAKE & LADDERS
                    </h1>
                </div>
                {/* Online Exit Button */}
                {gameMode === 'online' && isRoomJoined && (
                    <button
                        onClick={handleLeaveRoom}
                        className="absolute right-0 top-1/2 -translate-y-1/2 bg-red-500/20 hover:bg-red-500/40 text-red-300 px-4 py-2 rounded-lg font-bold text-sm transition-all border border-red-500/20"
                    >
                        Exit Match
                    </button>
                )}
            </motion.div>

            {gameMode === 'online' && <ConnectionStatus />}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">

                {/* Left Col: Board */}
                <div className="lg:col-span-2 flex flex-col gap-6">

                    {/* Mode Selection - Now Outside Board */}
                    {(!isRoomJoined && gameMode !== 'online') || (gameMode === 'online' && !isRoomJoined) ? (
                        <div className="flex flex-col items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md w-full shadow-lg">
                            <div className="flex flex-wrap justify-center gap-4">
                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                                    <button onClick={() => resetGame('pvp')} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${gameMode === 'pvp' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25 scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><User size={18} /> PvP</button>
                                    <button onClick={() => resetGame('pve')} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${gameMode === 'pve' ? 'bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/25 scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Bot size={18} /> PvAI</button>
                                    <button onClick={() => { setGameMode('online'); setIsRoomJoined(false); setOnlineView('menu'); }} className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${gameMode === 'online' ? 'bg-green-500 text-white shadow-lg shadow-green-500/25 scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}><Globe size={18} /> Online</button>
                                </div>
                            </div>

                            {gameMode !== 'online' && (
                                <div className="flex items-center gap-3 bg-black/20 p-2 rounded-xl border border-white/10">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-2">Players</span>
                                    <div className="flex gap-2">
                                        {[2, 3, 4].map(c => (
                                            <button key={c} onClick={() => resetGame(gameMode, c)} className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-all border ${playerCount === c ? 'bg-white text-black border-white scale-110 shadow-lg' : 'bg-transparent border-white/20 text-gray-400 hover:border-white/50 hover:text-white'}`}>{c}</button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Online Menu Overlay - Integrated here instead of overlay */}
                            {gameMode === 'online' && !isRoomJoined && (
                                <div className="w-full max-w-md bg-black/20 p-6 rounded-2xl border border-white/10 animate-in slide-in-from-top-2 shadow-2xl">
                                    {onlineView === 'menu' && (
                                        <div className="flex gap-4">
                                            <button onClick={() => setOnlineView('create')} className="flex-1 py-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl font-black text-white hover:scale-[1.02] transition-transform shadow-lg shadow-green-500/20 flex flex-col items-center gap-2">
                                                <MonitorPlay size={24} />
                                                <span>CREATE ROOM</span>
                                            </button>
                                            <button onClick={() => setOnlineView('join')} className="flex-1 py-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl font-black text-white hover:scale-[1.02] transition-transform shadow-lg shadow-blue-500/20 flex flex-col items-center gap-2">
                                                <Users size={24} />
                                                <span>JOIN ROOM</span>
                                            </button>
                                        </div>
                                    )}
                                    {onlineView === 'create' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                                <button onClick={() => setOnlineView('menu')} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs font-bold uppercase tracking-wider"><ArrowLeft size={14} /> Back</button>
                                                <span className="text-white font-bold text-sm">CREATE ROOM</span>
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-400 font-bold uppercase block mb-2">Max Players</label>
                                                <div className="flex gap-2">
                                                    {[2, 3, 4].map(n => <button key={n} onClick={() => setServerMaxPlayers(n)} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-all ${serverMaxPlayers === n ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/20' : 'border-white/10 bg-white/5 text-gray-400 hover:bg-white/10'}`}>{n}</button>)}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs text-gray-400 font-bold uppercase block">Room ID (Optional)</label>
                                                <input type="text" placeholder="e.g. MYROOM" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-green-500 outline-none font-mono shadow-inner" onChange={e => setRoom(e.target.value)} />
                                            </div>
                                            <button onClick={() => joinRoom(room || Math.random().toString(36).substring(2, 7), 'create', serverMaxPlayers)} className="w-full py-3 bg-green-500 rounded-xl font-black text-white hover:bg-green-400 shadow-lg shadow-green-500/20 transform active:scale-95 transition-all">CREATE</button>
                                        </div>
                                    )}
                                    {onlineView === 'join' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                                <button onClick={() => setOnlineView('menu')} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs font-bold uppercase tracking-wider"><ArrowLeft size={14} /> Back</button>
                                                <span className="text-white font-bold text-sm">JOIN ROOM</span>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-xs text-gray-400 font-bold uppercase block">Room ID</label>
                                                <input type="text" placeholder="Enter ID..." className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none font-mono shadow-inner" onChange={e => setRoom(e.target.value)} />
                                            </div>
                                            <button onClick={() => joinRoom(room, 'join')} className="w-full py-3 bg-blue-500 rounded-xl font-black text-white hover:bg-blue-400 shadow-lg shadow-blue-500/20 transform active:scale-95 transition-all">JOIN</button>
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    ) : null}

                    {/* Game Board */}
                    <div className="relative w-full aspect-square max-w-[650px] mx-auto bg-white/5 rounded-2xl border-2 border-white/10 shadow-2xl p-4 flex flex-col items-center justify-center backdrop-blur-md">
                        <div className="absolute inset-0 p-4">
                            <div className="grid grid-cols-10 grid-rows-10 w-full h-full border border-white/10 rounded-lg overflow-hidden">
                                {renderBoard()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Col: Controls */}
                <div className="flex flex-col gap-6">

                    {/* Current Turn / Dice Panel */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md flex flex-col items-center justify-center min-h-[200px]">
                        <h3 className="text-sm font-bold mb-4 text-gray-400 uppercase">Current Turn</h3>

                        <div className="flex items-center gap-3 mb-6">
                            <div className={`w-4 h-4 rounded-full ${players[currentPlayerIndex]?.config.light.replace('/20', '')} shadow-[0_0_10px_current]`} />
                            <span className={`text-2xl font-black capitalize ${players[currentPlayerIndex]?.config.text}`}>
                                {gameMode === 'pve' && players[currentPlayerIndex]?.isAi ? 'AI Bot' : `Player ${players[currentPlayerIndex]?.id}`}
                            </span>
                        </div>

                        <motion.button
                            onClick={rollDice}
                            disabled={isRolling || winner || (gameMode === 'pve' && currentPlayerIndex !== 0) || (gameMode === 'online' && myIndex !== currentPlayerIndex)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`
                                w-24 h-24 rounded-2xl border-2 flex items-center justify-center text-5xl font-black shadow-xl
                                ${isRolling ? 'animate-spin border-t-transparent' : ''}
                                ${(gameMode === 'pve' && currentPlayerIndex !== 0) || (gameMode === 'online' && myIndex !== currentPlayerIndex)
                                    ? 'bg-gray-800 border-gray-700 text-gray-600 opacity-50 cursor-not-allowed'
                                    : 'bg-gradient-to-br from-white to-gray-200 border-white text-black cursor-pointer hover:shadow-2xl'}
                            `}
                        >
                            {isRolling ? <RefreshCcw className="animate-spin" /> : (diceValue || <Dice5 size={48} />)}
                        </motion.button>
                        <p className="mt-4 text-sm text-gray-400 text-center font-mono">
                            {(gameMode === 'pve' && currentPlayerIndex !== 0) ? "AI is thinking..." :
                                (gameMode === 'online' && myIndex !== currentPlayerIndex) ? "Waiting for opponent..." :
                                    "Click to Roll"}
                        </p>
                    </div>

                    {/* Status Panel */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                        <h3 className="text-sm font-bold mb-4 text-gray-400 uppercase">Status</h3>

                        {gameMode === 'online' && isRoomJoined && (
                            <div className="mb-4 p-3 bg-blue-500/20 rounded-xl border border-blue-500/30 text-center">
                                <p className="text-blue-300 font-bold">Room: {room}</p>
                                <PingDisplay />
                            </div>
                        )}

                        <div className="space-y-2">
                            {players.map((p, i) => (
                                <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl border transition-all ${currentPlayerIndex === i ? `${p.config.light} ${p.config.border}` : 'border-white/5 bg-white/5 opacity-60'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${p.config.light.replace('/20', '')} shadow-[0_0_8px_current]`} />
                                        <span className={`font-bold ${p.config.text}`}>
                                            {gameMode === 'pve' && p.isAi ? 'AI Opponent' : `Player ${p.id}`}
                                            {gameMode === 'online' && myIndex === i ? ' (You)' : ''}
                                        </span>
                                    </div>
                                    <span className="font-mono text-white text-sm font-bold">Pos: {p.pos}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Move Log */}
                    <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex-1 overflow-y-auto h-[300px]">
                        <div className="space-y-1 pr-2 text-xs font-mono text-gray-400">
                            {moveLog.map((log, i) => (
                                <div key={i} className="border-b border-white/5 pb-1 last:border-0">{log}</div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Win Overlay */}
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
                            className="bg-[#1a1a1a] p-8 rounded-3xl border border-white/20 shadow-2xl text-center max-w-sm w-full mx-4"
                        >
                            <Trophy className="w-20 h-20 text-yellow-500 mx-auto mb-6 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)]" />
                            <h2 className="text-4xl font-black text-white mb-2">Winner!</h2>
                            <p className={`text-xl font-bold mb-8 ${winner.config.text}`}>
                                {gameMode === 'pve' && winner.isAi ? 'AI Opponent' : `Player ${winner.id}`}
                            </p>

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
                                    onClick={() => resetGame(gameMode)}
                                    className="w-full py-4 bg-white text-black font-black rounded-xl hover:bg-gray-200 transition-colors"
                                >
                                    PLAY AGAIN
                                </button>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default SnakeAndLadders;
