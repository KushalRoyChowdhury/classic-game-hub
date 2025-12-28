import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, RotateCcw, User, Bot, Zap, Brain, Swords, Globe, LogIn, MonitorPlay, Users, ArrowLeft, LogOut, Copy, Check, Share2, Smile, X, Pencil } from 'lucide-react'
import Board from './Board'
import History from './History'
import { checkWinner, filterHistory, getRandomMove, getBestMove } from '../utils/gameUtils'
import socket from '../socket'
import Toast, { useToast } from './Toast'
import PingDisplay from './PingDisplay'
import ConnectionStatus from './ConnectionStatus'
import VoiceChat from './VoiceChat'
import useGameStore from '../store/gameStore'

function TicTacToe() {
    const [squares, setSquares] = useState(Array(9).fill(null))
    const [xIsNext, setXIsNext] = useState(true)
    const [history, setHistory] = useState([])
    const [isLoaded, setIsLoaded] = useState(false)
    const [gameMode, setGameMode] = useState('pvp') // 'pvp', 'pve', 'online'
    const [difficulty, setDifficulty] = useState('low')
    const { userName } = useGameStore()
    const [playerNames, setPlayerNames] = useState([null, null]) // [NameX, NameO]
    const [localNames, setLocalNames] = useState({ X: '', O: '' })
    const [editingName, setEditingName] = useState(null) // 'X' or 'O' or null

    // Online Config
    const [room, setRoom] = useState("");
    const [isRoomJoined, setIsRoomJoined] = useState(false);
    const [isPublic, setIsPublic] = useState(true);
    const [publicRooms, setPublicRooms] = useState([]);
    const [mySymbol, setMySymbol] = useState(null);
    const [onlineView, setOnlineView] = useState('menu'); // 'menu', 'join', 'create', 'lobby'

    // Reconnect Logic - Use refs to access latest state in the callback without re-binding
    const roomRef = useRef(room);
    const gameModeRef = useRef(gameMode);
    const isRoomJoinedRef = useRef(isRoomJoined);

    useEffect(() => {
        roomRef.current = room;
        gameModeRef.current = gameMode;
        isRoomJoinedRef.current = isRoomJoined;
    }, [room, gameMode, isRoomJoined]);

    useEffect(() => {
        const handleReconnect = () => {
            const r = roomRef.current;
            const gm = gameModeRef.current;
            const joined = isRoomJoinedRef.current;

            if (gm === 'online' && r && joined) {
                console.log("Socket reconnected, re-joining room:", r);
                socket.emit("join_room", { room: r, gameType: 'tictactoe', action: 'join' });
                addToast("Reconnecting...", "", "info");
            }
        };

        socket.on("connect", handleReconnect);
        return () => socket.off("connect", handleReconnect);
    }, [socket]); // Only bind once

    // Rematch State
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);
    const [serverWinner, setServerWinner] = useState(null);
    const [serverIsDraw, setServerIsDraw] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [opponentPresent, setOpponentPresent] = useState(false);

    // Reaction State
    const [activeReactions, setActiveReactions] = useState([]); // Array of { id, playerId, emoji }
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const REACTION_EMOJIS = ["😀", "😂", "😎", "😭", "😡", "🎉", "🔥", "❌", "⭕"];
    const reactionPickerRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (reactionPickerRef.current && !reactionPickerRef.current.contains(event.target)) {
                setShowReactionPicker(false);
            }
        }

        if (showReactionPicker) {
            document.addEventListener("mousedown", handleClickOutside);
        } else {
            document.removeEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [showReactionPicker]);

    // Toast Hook
    const { toasts, addToast, removeToast } = useToast();

    // Load history and Handle Auto-Join
    useEffect(() => {
        const savedHistory = localStorage.getItem('tic-tac-toe-history')
        if (savedHistory) {
            setHistory(filterHistory(JSON.parse(savedHistory), 3))
        }

        // Check URL for room ID
        const searchParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = searchParams.get('id');

        if (roomIdFromUrl) {
            console.log("Auto-joining room from URL:", roomIdFromUrl);
            setGameMode('online');
            setRoom(roomIdFromUrl);
            // Slight delay to ensure socket connect
            setTimeout(() => {
                joinRoom(roomIdFromUrl, 'join');
            }, 500);
            setOnlineView('join'); // Start in join view to avoid jarring transition
        }

        setIsLoaded(true)
    }, [])



    // Socket listeners
    useEffect(() => {
        socket.on("receive_message", (data) => {
            if (data.squares) {
                setSquares(data.squares);
            }
            if (data.xIsNext !== undefined) setXIsNext(data.xIsNext);
            if (data.winner !== undefined) setServerWinner(data.winner);
            if (data.isDraw !== undefined) setServerIsDraw(data.isDraw);
            // Handle playerNames
            if (data.playerNames) {
                setPlayerNames(data.playerNames);
            }
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
            setOnlineView('menu');
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

        socket.on("public_rooms_list", (data) => {
            setPublicRooms(data);
        });

        socket.on("receive_reaction", (data) => {
            // data: { room, reaction, playerIndex }
            // For TTT, playerIndex might be symbol? Or index. 
            // In Server: seatIndex 0=X, 1=O.
            const id = Date.now() + Math.random();
            const symbol = data.playerIndex === 0 ? 'X' : (data.playerIndex === 1 ? 'O' : '?');

            setActiveReactions(prev => [...prev, { id, symbol, emoji: data.reaction }]);

            // Remove after animation
            setTimeout(() => {
                setActiveReactions(prev => prev.filter(r => r.id !== id));
            }, 3000);
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
            socket.off("public_rooms_list");
            socket.off("receive_reaction");
        }
    }, [socket]);

    // Old problematic reconnect logic removed
    // New logic handled via refs above

    // Auto-fetch Public Rooms
    useEffect(() => {
        if (onlineView === 'join') {
            if (!socket.connected) socket.connect();
            socket.emit("get_public_rooms", { gameType: 'tictactoe' });
            const interval = setInterval(() => {
                socket.emit("get_public_rooms", { gameType: 'tictactoe' });
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [onlineView]);

    const joinRoom = (roomIdInput, action = 'join') => {
        let targetRoom = roomIdInput || room;

        // Extract ID if URL is pasted
        try {
            // Basic check if it looks like a URL
            if (targetRoom.includes('http') || targetRoom.includes('?id=')) {
                const urlObj = new URL(targetRoom.startsWith('http') ? targetRoom : `http://dummy.com/${targetRoom}`);
                const idParam = urlObj.searchParams.get('id');
                if (idParam) targetRoom = idParam;
            }
        } catch (e) {
            console.log("Input parsing error, using raw:", e);
        }

        if (targetRoom !== "") {
            if (!socket.connected) socket.connect();

            socket.emit("join_room", { room: targetRoom, gameType: 'tictactoe', action, isPublic: action === 'create' ? isPublic : false, userName });
            // Only set room state if creating/joining actually sends event? 
            // We should assume success or wait for event? 
            // Existing logic sets it immediately.
            setRoom(targetRoom);
            setIsRoomJoined(true);
            if (action === 'create') setMySymbol('X'); // Creator is X

            // Update URL
            const url = new URL(window.location);
            url.searchParams.set('id', targetRoom);
            window.history.pushState({}, '', url);
        }
    };

    const [isCopied, setIsCopied] = useState(false);
    const handleCopyLink = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
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
        setActiveReactions([]);

        const url = new URL(window.location);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url);
    };

    const sendReaction = (emoji) => {
        if (gameMode !== 'online' || !isRoomJoined) return;

        // Determine my index
        const index = mySymbol === 'X' ? 0 : 1;

        // Send to server
        socket.emit("send_reaction", { room, reaction: emoji, playerIndex: index });
        // Removed auto-close to allow spamming
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
                return;
            }
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
                                            <div className="flex flex-col gap-3">
                                                <input type="text" placeholder="Room ID (Optional)" className="flex-1 bg-black/40 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-green-500 outline-none font-mono text-sm shadow-inner" onChange={(e) => setRoom(e.target.value)} />

                                                <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/10">
                                                    <span className="text-gray-300 text-sm font-bold">Public Room</span>
                                                    <button
                                                        onClick={() => setIsPublic(!isPublic)}
                                                        className={`w-12 h-6 rounded-full p-1 transition-colors ${isPublic ? 'bg-green-500' : 'bg-gray-600'}`}
                                                    >
                                                        <div className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-0'}`} />
                                                    </button>
                                                </div>

                                                <button onClick={() => joinRoom(room || Math.random().toString(36).substring(2, 7), 'create')} className="w-full py-3 bg-green-500 rounded-xl font-bold text-white hover:bg-green-400 shadow-lg shadow-green-500/20">Create & Play</button>
                                            </div>
                                        </div>
                                    )}
                                    {onlineView === 'join' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                                <button onClick={() => setOnlineView('menu')} className="text-gray-400 hover:text-white flex items-center gap-1 text-xs font-bold uppercase tracking-wider"><ArrowLeft size={14} /> Back</button>
                                                <span className="text-white font-bold text-sm">BROWSE ROOMS</span>
                                            </div>

                                            <div className="flex gap-2">
                                                <input type="text" placeholder="Enter Room ID..." className="flex-1 bg-black/40 border border-white/20 rounded-xl px-4 py-2 text-white focus:border-blue-500 outline-none font-mono text-sm shadow-inner" onChange={(e) => setRoom(e.target.value)} />
                                                <button onClick={() => joinRoom(room, 'join')} className="px-4 bg-blue-500 rounded-xl font-bold text-white hover:bg-blue-400 shadow-lg shadow-blue-500/20">Join</button>
                                            </div>

                                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                                <div className="flex justify-between items-center text-xs text-gray-500 font-bold uppercase tracking-wider">
                                                    <span>Public Rooms</span>
                                                    <button
                                                        onClick={() => {
                                                            setIsRefreshing(true);
                                                            socket.emit("get_public_rooms", { gameType: 'tictactoe' });
                                                            setTimeout(() => setIsRefreshing(false), 1000);
                                                        }}
                                                        className={`text-blue-400 hover:text-white transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                                                    >
                                                        <RefreshCw size={12} />
                                                    </button>
                                                </div>
                                                {publicRooms.length === 0 ? (
                                                    <div className="text-center py-8 text-gray-500 text-sm italic">No public rooms found. Create one!</div>
                                                ) : (
                                                    publicRooms.map(r => (
                                                        <div key={r.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 hover:border-white/20 hover:bg-white/10 transition-all group">
                                                            <div>
                                                                <div className="text-white font-mono font-bold">{r.id}</div>
                                                                <div className="text-xs text-gray-400">{r.players}/{r.max} Players</div>
                                                            </div>
                                                            <button
                                                                onClick={() => joinRoom(r.id, 'join')}
                                                                className="px-3 py-1 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-bold border border-blue-500/20 group-hover:bg-blue-500 group-hover:text-white transition-colors"
                                                            >
                                                                JOIN
                                                            </button>
                                                        </div>
                                                    ))
                                                )}
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

                        {gameMode === 'online' && !opponentPresent && (
                            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
                                <div className="text-white text-xl font-bold mb-4 animate-pulse text-center px-4">Waiting for Opponent...</div>
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                                <p className="text-gray-400 text-xs mt-4">Share Room ID: {room}</p>
                            </div>
                        )}

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
                            <div className="mb-4 p-3 bg-blue-500/20 rounded-xl border border-blue-500/30">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Share2 size={14} className="text-blue-400" />
                                        <span className="text-blue-300 font-bold text-xs uppercase tracking-wider">Room Code</span>
                                    </div>
                                    <PingDisplay />
                                </div>
                                <div className="flex items-center gap-2 bg-black/40 rounded-lg p-2 border border-blue-500/20">
                                    <code className="flex-1 font-mono text-center font-bold text-lg tracking-widest text-white">{room}</code>
                                    <button
                                        onClick={handleCopyLink}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-blue-400 relative group"
                                        title="Copy Link"
                                    >
                                        {isCopied ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            {/* Player X Status */}
                            <div className={`flex justify-between items-center p-3 rounded-xl border relative ${xIsNext ? 'bg-cyan-500/10 border-cyan-500/50' : 'border-white/5 bg-white/5'}`}>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-cyan-400 text-xl">X</span>
                                    {editingName === 'X' && gameMode !== 'online' ? (
                                        <input
                                            autoFocus
                                            className="bg-black/40 border border-white/20 rounded px-1 text-sm text-white w-24 focus:outline-none focus:border-cyan-500"
                                            value={localNames.X || userName || 'Player X'}
                                            onChange={(e) => setLocalNames(prev => ({ ...prev, X: e.target.value }))}
                                            onBlur={() => setEditingName(null)}
                                            onKeyDown={(e) => e.key === 'Enter' && setEditingName(null)}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-1 group">
                                            <span className="text-gray-300 font-bold">
                                                {gameMode === 'online'
                                                    ? (playerNames[0] || (mySymbol === 'X' ? userName : 'Player X'))
                                                    : (localNames.X || userName || 'Player X')}
                                                {gameMode === 'online' && mySymbol === 'X' ? ' (You)' : ''}
                                            </span>
                                            {gameMode !== 'online' && (
                                                <button
                                                    onClick={() => setEditingName('X')}
                                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                                >
                                                    <Pencil size={14} className="text-gray-500 hover:text-cyan-400" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {gameMode === 'online' && mySymbol === 'X' && (
                                    <div className="relative">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowReactionPicker(!showReactionPicker); }}
                                            className="w-6 h-6 hover:bg-white/10 rounded-full flex items-center justify-center transition-colors text-yellow-400/50 hover:text-yellow-400"
                                        >
                                            <Smile size={14} />
                                        </button>

                                        <AnimatePresence>
                                            {showReactionPicker && (
                                                <motion.div
                                                    ref={reactionPickerRef}
                                                    initial={{ scale: 0, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0, opacity: 0 }}
                                                    className="absolute right-0 top-full mt-2 bg-[#222] border border-white/20 rounded-xl p-2 shadow-xl grid grid-cols-3 gap-1 w-[120px] z-50 pointer-events-auto origin-top-right"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {REACTION_EMOJIS.map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => sendReaction(emoji)}
                                                            className="text-xl p-1 hover:bg-white/10 rounded cursor-pointer transition-colors transform hover:scale-110 active:scale-95"
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                <AnimatePresence>
                                    {activeReactions.filter(r => r.symbol === 'X').map(r => (
                                        <motion.div
                                            key={r.id}
                                            initial={{ y: 0, opacity: 0, scale: 0.9 }}
                                            animate={{
                                                y: -120,
                                                x: [0, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0],
                                                opacity: [0, 1, 1, 0],
                                                scale: [0.9, 1.1, 1]
                                            }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 3, ease: "easeInOut" }}
                                            className="absolute left-1/2 top-1/2 -translate-x-1/2 pointer-events-none text-4xl z-50"
                                        >
                                            {r.emoji}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>

                            </div>

                            {/* Player O Status */}
                            <div className={`flex justify-between items-center p-3 rounded-xl border relative ${!xIsNext ? 'bg-fuchsia-500/10 border-fuchsia-500/50' : 'border-white/5 bg-white/5'}`}>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-fuchsia-400 text-xl">O</span>
                                    {editingName === 'O' && gameMode !== 'online' ? (
                                        <input
                                            autoFocus
                                            className="bg-black/40 border border-white/20 rounded px-1 text-sm text-white w-24 focus:outline-none focus:border-fuchsia-500"
                                            value={localNames.O || 'Player O'}
                                            onChange={(e) => setLocalNames(prev => ({ ...prev, O: e.target.value }))}
                                            onBlur={() => setEditingName(null)}
                                            onKeyDown={(e) => e.key === 'Enter' && setEditingName(null)}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-1 group">
                                            <span className="text-gray-300 font-bold">
                                                {gameMode === 'online'
                                                    ? (playerNames[1] || (mySymbol === 'O' ? userName : 'Player O'))
                                                    : (localNames.O || (gameMode === 'pve' ? 'AI Bot' : 'Player O'))}
                                                {gameMode === 'online' && mySymbol === 'O' ? ' (You)' : ''}
                                            </span>
                                            {gameMode === 'pvp' && (
                                                <button
                                                    onClick={() => setEditingName('O')}
                                                    className="p-1 hover:bg-white/10 rounded transition-colors"
                                                >
                                                    <Pencil size={14} className="text-gray-500 hover:text-fuchsia-400" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {gameMode === 'online' && mySymbol === 'O' && (
                                    <div className="relative">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowReactionPicker(!showReactionPicker); }}
                                            className="w-6 h-6 hover:bg-white/10 rounded-full flex items-center justify-center transition-colors text-yellow-400/50 hover:text-yellow-400"
                                        >
                                            <Smile size={14} />
                                        </button>

                                        <AnimatePresence>
                                            {showReactionPicker && (
                                                <motion.div
                                                    ref={reactionPickerRef}
                                                    initial={{ scale: 0, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    exit={{ scale: 0, opacity: 0 }}
                                                    className="absolute right-0 top-full mt-2 bg-[#222] border border-white/20 rounded-xl p-2 shadow-xl grid grid-cols-3 gap-1 w-[120px] z-50 pointer-events-auto origin-top-right"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {REACTION_EMOJIS.map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => sendReaction(emoji)}
                                                            className="text-xl p-1 hover:bg-white/10 rounded cursor-pointer transition-colors transform hover:scale-110 active:scale-95"
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}

                                <AnimatePresence>
                                    {activeReactions.filter(r => r.symbol === 'O').map(r => (
                                        <motion.div
                                            key={r.id}
                                            initial={{ y: 0, opacity: 0, scale: 0.9 }}
                                            animate={{
                                                y: -120,
                                                x: [0, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0],
                                                opacity: [0, 1, 1, 0],
                                                scale: [0.9, 1.1, 1.1]
                                            }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 3, ease: "easeInOut" }}
                                            className="absolute left-1/2 top-1/2 -translate-x-1/2 pointer-events-none text-4xl z-50"
                                        >
                                            {r.emoji}
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
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
            <VoiceChat room={room} isRoomJoined={gameMode === 'online' && isRoomJoined} />
        </div>
    );
}

export default TicTacToe;
