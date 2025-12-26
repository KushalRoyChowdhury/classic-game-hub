import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, RotateCcw, User, Bot, Zap, Brain, Swords, Globe, LogIn, MonitorPlay, Users, ArrowLeft, LogOut } from 'lucide-react'
import Board from './Board'
import History from './History'
import { checkWinner, filterHistory, getRandomMove, getBestMove } from '../utils/gameUtils'
import socket from '../socket'
import Toast, { useToast } from './Toast'
import PingDisplay from './PingDisplay'
import ConnectionStatus from './ConnectionStatus'

function TicTacToe() {
    const [squares, setSquares] = useState(Array(9).fill(null))
    const [xIsNext, setXIsNext] = useState(true)
    const [history, setHistory] = useState([])
    const [isLoaded, setIsLoaded] = useState(false)
    const [gameMode, setGameMode] = useState('pvp') // 'pvp', 'pve', 'online'
    const [difficulty, setDifficulty] = useState('low')

    // Online Config
    const [room, setRoom] = useState("");
    const [isRoomJoined, setIsRoomJoined] = useState(false);
    const [mySymbol, setMySymbol] = useState(null);
    const [onlineView, setOnlineView] = useState('menu'); // 'menu', 'join', 'create'

    // Rematch State
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);
    const [serverWinner, setServerWinner] = useState(null);
    const [serverIsDraw, setServerIsDraw] = useState(false);
    const [opponentPresent, setOpponentPresent] = useState(false);

    // Toast Hook
    const { toasts, addToast, removeToast } = useToast();

    // Load history from local storage on mount
    useEffect(() => {
        const savedHistory = localStorage.getItem('tic-tac-toe-history')
        if (savedHistory) {
            setHistory(filterHistory(JSON.parse(savedHistory), 3))
        }

        // Load Game State
        const savedState = sessionStorage.getItem('ttt_game_state');
        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                if (parsed.gameMode !== 'online') {
                    setSquares(parsed.squares);
                    setXIsNext(parsed.xIsNext);
                    setGameMode(parsed.gameMode);
                    setDifficulty(parsed.difficulty);
                } else {
                    // Try to restore online state?
                    // User requested auto-restore room
                    const savedRoom = sessionStorage.getItem('active_room_id');
                    if (savedRoom) {
                        setGameMode('online');
                        setRoom(savedRoom);
                        // Trigger join attempt in separate effect or here? 
                        // Better to trigger via func or separate flag to avoid side-effects in mount
                        // Let's set a flag or just call join immediately if connection ready (it won't be)
                        // Socket connects on import usually, checking connection:
                        setTimeout(() => {
                            if (socket.connected || !socket.connected) { // Try anyway
                                joinRoom(savedRoom, 'join');
                            }
                        }, 500);
                    }
                }
            } catch (e) {
                console.error("Failed to load TTT state", e);
            }
        }

        setIsLoaded(true)
    }, [])

    // Session Persistence
    useEffect(() => {
        if (gameMode !== 'online') {
            const stateToSave = {
                squares,
                xIsNext,
                gameMode,
                difficulty
            };
            sessionStorage.setItem('ttt_game_state', JSON.stringify(stateToSave));
            sessionStorage.removeItem('active_room_id');
        } else if (isRoomJoined) {
            sessionStorage.setItem('active_room_id', room);
            // Save specific online state if needed? Not strictly required if server syncs
        }
    }, [squares, xIsNext, gameMode, difficulty, isRoomJoined, room]);

    // Socket listeners
    useEffect(() => {
        socket.on("receive_message", (data) => {
            if (data.squares) setSquares(data.squares);
            if (data.xIsNext !== undefined) setXIsNext(data.xIsNext);
            if (data.winner !== undefined) setServerWinner(data.winner);
            if (data.isDraw !== undefined) setServerIsDraw(data.isDraw);
            if (data.seats) {
                // Check if both seats are filled (non-null)
                // Note: seats is [p1, p2]. If one is null, opponent missing.
                const count = data.seats.filter(Boolean).length;
                setOpponentPresent(count >= 2);
            }
        });

        socket.on("player_role", ({ role }) => {
            setMySymbol(role);
            addToast(`Joined as Player ${role}`, "Good Luck!", "info");
        });

        socket.on("room_full", () => {
            alert("Room is full! Spectating only (or try another room).");
            setIsRoomJoined(false);
        });

        socket.on("error_message", (msg) => {
            alert(msg);
            setIsRoomJoined(false);
            setOnlineView('menu');
            sessionStorage.removeItem('active_room_id');
        });

        socket.on("rematch_requested", () => {
            setRematchRequestedBy('opponent');
        });

        socket.on("rematch_accepted", () => {
            setRematchRequestedBy(null);
            // Game should have been reset by receive_message
        });

        socket.on("rematch_declined", () => {
            alert("Opponent declined rematch.");
            handleLeaveRoom();
        });

        socket.on("opponent_left", () => {
            alert("Opponent left the room.");
            handleLeaveRoom();
        });

        socket.on("user_joined", ({ role }) => {
            addToast(`Player ${role} Joined`, "", "success");
        });

        return () => {
            socket.off("receive_message");
            socket.off("player_role");
            socket.off("room_full");
            socket.off("error_message");
            socket.off("rematch_requested");
            socket.off("rematch_accepted");
            socket.off("rematch_declined");
            socket.off("opponent_left");
            socket.off("user_joined");
        }
    }, [socket]);

    // Reconnect Logic
    useEffect(() => {
        const handleReconnect = () => {
            if (gameMode === 'online' && room && isRoomJoined) {
                // Re-join with the same room ID
                // Note: If server restarted, this will trigger "Room does not exist" error, which correctly exits.
                socket.emit("join_room", { room, gameType: 'tictactoe', action: 'join' });
                addToast("Reconnecting to Room...", "", "info");
            }
        };

        socket.on("connect", handleReconnect);
        return () => socket.off("connect", handleReconnect);
    }, [socket, gameMode, room, isRoomJoined]);

    const joinRoom = (roomIdInput, action = 'join') => {
        const targetRoom = roomIdInput || room;
        if (targetRoom !== "") {
            if (!socket.connected) socket.connect();
            // action: 'create' or 'join'
            socket.emit("join_room", { room: targetRoom, gameType: 'tictactoe', action });
            setRoom(targetRoom);
            // We assume success until error_message? 
            // Better to set isRoomJoined AFTER success event? 
            // Current server emits "player_role" or "receive_message" on success.
            // Let's optimistic update, error handler will revert.
            setIsRoomJoined(true);
        }
    };

    const requestRematch = () => {
        socket.emit("request_rematch", room);
        setRematchRequestedBy('me');
    };

    const handleLeaveRoom = () => {
        socket.emit("leave_room", { room });
        setIsRoomJoined(false);
        setRoom("");
        setOnlineView('menu');
        setRematchRequestedBy(null);
        setServerWinner(null);
        setServerIsDraw(false);
        setOpponentPresent(false);
        sessionStorage.removeItem('active_room_id');
    };

    const respondRematch = (accept) => {
        if (accept) {
            socket.emit("respond_rematch", { room, accept });
            setRematchRequestedBy(null);
        } else {
            // Explicitly decline so opponent knows
            socket.emit("respond_rematch", { room, accept });
            handleLeaveRoom();
        }
    };

    // Save history to local storage whenever it changes
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem('tic-tac-toe-history', JSON.stringify(history))
        }
    }, [history, isLoaded])

    const result = checkWinner(squares)
    const localWinner = result?.winner
    const winningLine = result?.line
    const localIsDraw = !localWinner && squares.every(Boolean)

    // Final Determination
    const winner = gameMode === 'online' ? (serverWinner || localWinner) : localWinner;
    const isDraw = gameMode === 'online' ? (serverIsDraw || localIsDraw) : localIsDraw;

    const handlePlay = async (nextSquares) => {
        if (gameMode === 'online') {
            const currentTurnSymbol = xIsNext ? 'X' : 'O';
            if (mySymbol !== currentTurnSymbol) return;

            const moveIndex = nextSquares.findIndex((val, i) => val !== squares[i]);
            if (moveIndex !== -1) {
                socket.emit("make_move", { room, index: moveIndex });
            }
            return;
        }

        setSquares(nextSquares)
        setXIsNext(!xIsNext)

        const newResult = checkWinner(nextSquares)
        const newWinner = newResult?.winner
        const newIsDraw = !newWinner && nextSquares.every(Boolean)

        if (newWinner || newIsDraw) {
            const newGame = {
                id: Date.now(),
                date: new Date().toISOString(),
                winner: newWinner || 'Draw',
                squares: nextSquares,
                moveCount: nextSquares.filter(Boolean).length
            }

            setHistory(prev => {
                const newHistory = [newGame, ...prev]
                return filterHistory(newHistory, 3)
            })
        }
    }

    const makeAiMove = async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        let moveIndex;
        const currentSquares = [...squares];
        if (difficulty === 'low') {
            if (Math.random() < 0.4) moveIndex = getBestMove(currentSquares, 'O');
            else moveIndex = getRandomMove(currentSquares);
        } else {
            if (Math.random() < 0.01) moveIndex = getRandomMove(currentSquares);
            else moveIndex = getBestMove(currentSquares, 'O');
        }

        if (moveIndex !== null) {
            const nextSquares = [...currentSquares];
            nextSquares[moveIndex] = 'O';
            handlePlay(nextSquares);
        }
    }

    useEffect(() => {
        if (gameMode === 'pve' && !xIsNext && !winner && !isDraw) {
            makeAiMove();
        }
    }, [xIsNext, gameMode, winner, isDraw]);

    const resetGame = () => {
        setSquares(Array(9).fill(null))
        setXIsNext(true)
        setServerWinner(null)
        setServerIsDraw(false)
    }

    const resetBoard = () => {
        setSquares(Array(9).fill(null))
        setXIsNext(true)
        setServerWinner(null)
        setServerIsDraw(false)
    }

    return (
        <div className="flex flex-col items-center w-full max-w-6xl mx-auto gap-6">
            <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-center space-y-4 relative w-full"
            >
                <div className="flex items-center justify-center gap-3">
                    <h1 className="text-4xl sm:text-6xl font-black tracking-tighter text-white drop-shadow-lg flex items-center justify-center gap-3">
                        TIC TAC TOE
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

                    {/* Controls Section - Moved Outside Board */}
                    {(!isRoomJoined && gameMode !== 'online') || (gameMode === 'online' && !isRoomJoined) ? (
                        <div className="flex flex-col items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-md w-full shadow-lg">
                            <div className="flex flex-wrap justify-center gap-4">
                                <div className="flex bg-black/40 p-1 rounded-xl border border-white/10 shadow-inner">
                                    <button
                                        onClick={() => { setGameMode('pvp'); resetBoard(); setMySymbol(null); setIsRoomJoined(false); setOnlineView('menu'); }}
                                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${gameMode === 'pvp' ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25 scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <User size={18} /> PvP
                                    </button>
                                    <button
                                        onClick={() => { setGameMode('pve'); resetBoard(); setMySymbol(null); setIsRoomJoined(false); setOnlineView('menu'); }}
                                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${gameMode === 'pve' ? 'bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/25 scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <Bot size={18} /> PvAI
                                    </button>
                                    <button
                                        onClick={() => { setGameMode('online'); resetBoard(); }}
                                        className={`flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all ${gameMode === 'online' ? 'bg-green-500 text-white shadow-lg shadow-green-500/25 scale-105' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                                    >
                                        <Globe size={18} /> Online
                                    </button>
                                </div>

                                {gameMode === 'pve' && (
                                    <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl border border-white/10">
                                        <button onClick={() => { setDifficulty('low'); resetBoard(); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${difficulty === 'low' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <Zap size={14} /> Low
                                        </button>
                                        <button onClick={() => { setDifficulty('high'); resetBoard(); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${difficulty === 'high' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                                            <Brain size={14} /> High
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Online Sub-Menus (Join/Create) */}
                            {gameMode === 'online' && !isRoomJoined && (
                                <div className="w-full max-w-md bg-black/20 p-6 rounded-2xl border border-white/10 animate-in slide-in-from-top-2 shadow-2xl">
                                    {onlineView === 'menu' && (
                                        <div className="flex justify-center gap-4">
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
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="ID (Optional)" className="flex-1 bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none font-mono text-sm shadow-inner" onChange={(e) => setRoom(e.target.value)} />
                                                <button onClick={() => joinRoom(room || Math.random().toString(36).substring(2, 7), 'create')} className="px-6 bg-green-500 rounded-xl font-bold text-white hover:bg-green-400 shadow-lg shadow-green-500/20">Create</button>
                                            </div>
                                        </div>
                                    )}
                                    {onlineView === 'join' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                                <button onClick={() => setOnlineView('menu')} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs font-bold uppercase tracking-wider"><ArrowLeft size={14} /> Back</button>
                                                <span className="text-white font-bold text-sm">JOIN ROOM</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <input type="text" placeholder="Room ID" className="flex-1 bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none font-mono text-sm shadow-inner" onChange={(e) => setRoom(e.target.value)} />
                                                <button onClick={() => joinRoom(room, 'join')} className="px-6 bg-blue-500 rounded-xl font-bold text-white hover:bg-blue-400 shadow-lg shadow-blue-500/20">Join</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : null}

                    <div className="relative w-full aspect-square max-w-[600px] mx-auto bg-white/5 rounded-2xl border-2 border-white/10 shadow-2xl p-6 flex flex-col items-center justify-center backdrop-blur-md">

                        <Board
                            xIsNext={xIsNext}
                            squares={squares}
                            onPlay={handlePlay}
                            winningLine={winningLine}
                            isLocked={
                                winner ||
                                isDraw ||
                                (gameMode === 'pve' && !xIsNext) ||
                                (gameMode === 'online' && (!opponentPresent || mySymbol !== (xIsNext ? 'X' : 'O')))
                            }
                        />

                        {/* Win Overlay is handled inside Board or mapped here? 
                            TTT Code had it separate. Reintegrating... 
                        */}
                        <AnimatePresence>
                            {(winner || isDraw) && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 rounded-2xl backdrop-blur-sm"
                                >
                                    <div className="text-center p-6 bg-[#1a1a1a] border border-white/20 rounded-2xl shadow-2xl">
                                        <h2 className="text-4xl font-black mb-4">{winner ? `${winner} Wins!` : "Draw!"}</h2>

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
                                            <button onClick={resetBoard} className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200">Play Again</button>
                                        )}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right Col: Info/History */}
                <div className="flex flex-col gap-6">
                    {/* Status Panel */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                        <h3 className="text-sm font-bold mb-4 text-gray-400 uppercase">Status</h3>

                        {gameMode === 'online' && isRoomJoined && (
                            <div className="mb-4 p-3 bg-blue-500/20 rounded-xl border border-blue-500/30 text-center">
                                <p className="text-blue-300 font-bold">Room: {room}</p>
                                <PingDisplay />
                            </div>
                        )}

                        <div className="space-y-3">
                            <div className={`flex justify-between items-center p-3 rounded-xl border ${xIsNext ? 'bg-cyan-500/10 border-cyan-500/50' : 'border-white/5 bg-white/5'}`}>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-cyan-400 text-xl">X</span>
                                    <span className="text-gray-300 font-bold">Player X</span>
                                </div>
                                {xIsNext && !winner && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span></span>}
                            </div>
                            <div className={`flex justify-between items-center p-3 rounded-xl border ${!xIsNext ? 'bg-fuchsia-500/10 border-fuchsia-500/50' : 'border-white/5 bg-white/5'}`}>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-fuchsia-400 text-xl">O</span>
                                    <span className="text-gray-300 font-bold">Player O</span>
                                </div>
                                {!xIsNext && !winner && <span className="flex h-3 w-3 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-fuchsia-500"></span></span>}
                            </div>
                        </div>
                    </div>

                    {/* History Panel */}
                    <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex-1 overflow-y-auto h-[300px]">
                        <History history={history} onClearHistory={() => setHistory([])} />
                    </div>
                </div>
            </div>

            <Toast messages={toasts} removeToast={removeToast} />
        </div>
    );
}

export default TicTacToe;
