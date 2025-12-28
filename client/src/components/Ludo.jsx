import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Bot, Dice5, Trophy, RefreshCcw, Circle, Globe, PlusCircle, ArrowRightCircle, Copy, Check, Share2, Smile, X, Pencil } from 'lucide-react'
import useGameStore from '../store/gameStore'

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
import VoiceChat from './VoiceChat'

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
    const [isAnimating, setIsAnimating] = useState(false);
    const [editingPlayerIdx, setEditingPlayerIdx] = useState(null);

    // Online State
    const [room, setRoom] = useState("");
    const [isRoomJoined, setIsRoomJoined] = useState(false);
    const [onlineView, setOnlineView] = useState('menu'); // 'menu', 'create', 'join'
    const [myIndex, setMyIndex] = useState(null);
    const [serverMaxPlayers, setServerMaxPlayers] = useState(4);
    const [connectedPlayers, setConnectedPlayers] = useState(0);
    const [turnPhase, setTurnPhase] = useState('ROLL'); // 'ROLL' or 'MOVE'
    const [rematchRequestedBy, setRematchRequestedBy] = useState(null);
    const [isPublic, setIsPublic] = useState(true);
    const [publicRooms, setPublicRooms] = useState([]);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const { userName } = useGameStore();

    // Reaction State
    const [activeReactions, setActiveReactions] = useState([]); // Array of { id, playerId, emoji }
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const REACTION_EMOJIS = ["😀", "😂", "😎", "😭", "😡", "🎉", "🔥", "🎲", "👻"];
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
    useEffect(() => {
        // Check URL for room ID
        const searchParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = searchParams.get('id');

        if (roomIdFromUrl) {
            console.log("Auto-joining room from URL:", roomIdFromUrl);
            setGameMode('online');
            setRoom(roomIdFromUrl);
            setOnlineView('join');
            setTimeout(() => {
                // Ensure socket is connected and join
                joinRoom(roomIdFromUrl, 'join');
            }, 500);
        }
    }, []);



    // Socket Handlers
    useEffect(() => {
        socket.on("connect", () => {
            // Reconnect logic handled manually or via joinRoom
            if (gameMode === 'online' && room && isRoomJoined) {
                socket.emit("join_room", { room, gameType: 'ludo', action: 'join', userName });
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

        socket.on("public_rooms_list", (data) => {
            setPublicRooms(data);
        });

        socket.on("receive_message", (data) => {
            if (data.seats) {
                setConnectedPlayers(data.seats.filter(s => s !== null).length);
            }

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

        socket.on("receive_reaction", (data) => {
            // data: { room, reaction, playerIndex }
            // Ludo uses integer Index (0-3)
            const id = Date.now() + Math.random();
            setActiveReactions(prev => [...prev, { id, playerId: data.playerIndex, emoji: data.reaction }]);

            // Remove after animation
            setTimeout(() => {
                setActiveReactions(prev => prev.filter(r => r.id !== id));
            }, 3000);
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
            socket.off("receive_reaction");
        }
    }, [socket, gameMode, gameState, room, isRoomJoined]);

    // Auto-fetch Public Rooms
    useEffect(() => {
        if (onlineView === 'join') {
            if (!socket.connected) socket.connect();
            socket.emit("get_public_rooms", { gameType: 'ludo' });
            const interval = setInterval(() => {
                socket.emit("get_public_rooms", { gameType: 'ludo' });
            }, 5000);
            return () => clearInterval(interval);
        }
    }, [onlineView]);

    // Online Helpers
    const joinRoom = (roomIdInput, action = 'join', max = 4) => {
        let targetRoom = roomIdInput || room;

        // Extract ID if URL is pasted
        try {
            if (targetRoom.includes('http') || targetRoom.includes('?id=')) {
                const urlObj = new URL(targetRoom.startsWith('http') ? targetRoom : `http://dummy.com/${targetRoom}`);
                const idParam = urlObj.searchParams.get('id');
                if (idParam) targetRoom = idParam;
            }
        } catch (e) { console.log(e); }

        if (!targetRoom) return;

        if (!socket.connected) socket.connect();

        socket.emit("join_room", {
            room: targetRoom,
            gameType: 'ludo',
            maxPlayers: max,
            action,
            isPublic: action === 'create' ? isPublic : false,
            userName
        });
        setRoom(targetRoom);
        setGameMode('online');
        setIsRoomJoined(true);
        setServerMaxPlayers(max);
        setServerMaxPlayers(max);
        if (action === 'create') {
            // Wait for server to confirm via receive_message
        }

        // Update URL
        const url = new URL(window.location);
        url.searchParams.set('id', targetRoom);
        window.history.pushState({}, '', url);
    };

    const [isCopied, setIsCopied] = useState(false);
    const handleCopyLink = () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const handleLeaveRoom = () => {
        socket.emit("leave_room", { room });
        setIsRoomJoined(false);
        setRoom("");
        setOnlineView('menu');
        setMyIndex(null);
        setGameState('setup');
        setGameMode('pve');
        setGameMode('pve');
        setRematchRequestedBy(null);
        setRematchRequestedBy(null);

        setRematchRequestedBy(null);
        setActiveReactions([]);

        // Reset URL
        const url = new URL(window.location);
        url.searchParams.delete('id');
        window.history.pushState({}, '', url);
    };

    const sendReaction = (emoji) => {
        if (gameMode !== 'online' || !isRoomJoined) return;

        // Send to server
        socket.emit("send_reaction", { room, reaction: emoji, playerIndex: myIndex });
        // Removed auto-close to allow spamming
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

        // Block if animation is in progress
        if (isAnimating) return;

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

    const moveToken = async (playerId, tokenId, roll) => {
        const player = players[playerId];
        const token = player.tokens[tokenId];
        const startPos = token.pos;

        setIsAnimating(true);
        setSelectedToken(null);

        if (startPos === -1) {
            // Token entering the board
            setPlayers(prev => {
                const updated = prev.map(p => ({
                    ...p,
                    tokens: p.tokens.map(t => ({ ...t }))
                }));
                updated[playerId].tokens[tokenId].pos = 0;
                return updated;
            });
            addLog(`${player.color.toUpperCase()} token entered the board`);
        } else {
            // Step-by-step movement animation
            const targetPos = Math.min(startPos + roll, WINNING_POS);

            for (let pos = startPos + 1; pos <= targetPos; pos++) {
                await new Promise(resolve => setTimeout(resolve, 120)); // 120ms per step
                setPlayers(prev => {
                    const updated = prev.map(p => ({
                        ...p,
                        tokens: p.tokens.map(t => ({ ...t }))
                    }));
                    updated[playerId].tokens[tokenId].pos = pos;
                    return updated;
                });
            }

            // Check for finish and captures after animation
            setPlayers(prev => {
                const updated = prev.map(p => ({
                    ...p,
                    tokens: p.tokens.map(t => ({ ...t }))
                }));
                const finalToken = updated[playerId].tokens[tokenId];

                if (finalToken.pos === WINNING_POS) {
                    finalToken.isFinished = true;
                    updated[playerId].finishedCount = (updated[playerId].finishedCount || 0) + 1;
                    addLog(`${updated[playerId].color.toUpperCase()} token reached HOME!`);
                } else if (finalToken.pos < HOME_ENTRY_POS) {
                    // Check for captures on main path
                    checkCapture(updated, playerId, finalToken.pos);
                }

                // Check win
                if (updated[playerId].finishedCount === 4) {
                    setWinner(updated[playerId]);
                    setGameState('finished');
                    addLog(`🎉 ${updated[playerId].color.toUpperCase()} WINS!`);
                }

                return updated;
            });
        }

        setIsAnimating(false);

        // Turn logic
        setTimeout(() => {
            if (roll !== 6 && !winner) {
                nextTurn();
            } else {
                setDice(null); // Allow another roll
            }
        }, 300);
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
        if (gameState === 'playing' && players[turn]?.isAi && !dice && !rolling && !winner && !isAnimating) {
            const timer = setTimeout(rollDice, 1000);
            return () => clearTimeout(timer);
        }
    }, [turn, gameState, players, dice, rolling, winner, isAnimating]);

    const handleTokenClick = (playerId, tokenId) => {
        if (playerId !== turn || (!dice && gameMode !== 'online') || rolling || winner || isAnimating) return;
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
                                    className="p-4 rounded-xl bg-white/5 border-2 border-white/20 hover:bg-white/10 hover:border-blue-500 transition-all flex flex-col items-center gap-2"
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

                            <div className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/10">
                                <span className="text-gray-300 text-sm font-bold">Public Room</span>
                                <button
                                    onClick={() => setIsPublic(!isPublic)}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors ${isPublic ? 'bg-green-500' : 'bg-gray-600'}`}
                                >
                                    <div className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform ${isPublic ? 'translate-x-6' : 'translate-x-0'}`} />
                                </button>
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
                            <h3 className="text-xl font-bold text-center text-white">Browse Rooms</h3>
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

                            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                                <div className="flex justify-between items-center text-xs text-gray-500 font-bold uppercase tracking-wider">
                                    <span>Public Rooms</span>
                                    <button
                                        onClick={() => {
                                            setIsRefreshing(true);
                                            socket.emit("get_public_rooms", { gameType: 'ludo' });
                                            setTimeout(() => setIsRefreshing(false), 1000);
                                        }}
                                        className={`text-blue-400 hover:text-white transition-all ${isRefreshing ? 'animate-spin' : ''}`}
                                    >
                                        <RefreshCcw size={12} />
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
                                    })
                                )}

                                {gameMode === 'online' && connectedPlayers < serverMaxPlayers && (
                                    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm rounded-2xl">
                                        <div className="text-white text-3xl font-black mb-6 animate-pulse text-center px-4 drop-shadow-2xl uppercase tracking-tighter">
                                            Waiting for Players...
                                            <span className="block text-xl text-blue-400 mt-2 font-mono">({connectedPlayers}/{serverMaxPlayers})</span>
                                        </div>
                                        <div className="animate-spin rounded-full h-20 w-20 border-8 border-white/10 border-t-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.5)]"></div>
                                        <div className="mt-8 bg-black/60 px-8 py-4 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
                                            <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-1 text-center">Room Code</p>
                                            <p className="text-white font-mono text-2xl font-bold tracking-widest text-center">{room}</p>
                                        </div>
                                    </div>
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
                                    disabled={rolling || winner || players[turn]?.isAi || dice !== null || (gameMode === 'online' && (turn !== myIndex || connectedPlayers < serverMaxPlayers))}
                                    className={`
                                        w-20 h-20 rounded-2xl border-2 flex items-center justify-center text-4xl font-black shadow-lg
                                        ${rolling ? 'animate-spin' : ''} transition-all
                                        ${players[turn]?.isAi || dice || (gameMode === 'online' && (turn !== myIndex || connectedPlayers < serverMaxPlayers))
                                            ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed opacity-50'
                                            : 'bg-white text-black border-white hover:bg-gray-100 cursor-pointer'}
                                    `}
                                >
                                    {rolling ? <RefreshCcw /> : (dice || <Dice5 />)}
                                </motion.button>
                                <p className="text-xs text-gray-400 text-center">
                                    {dice ? 'Select a token' : players[turn]?.isAi ? 'AI thinking...' : (gameMode === 'online' && connectedPlayers < serverMaxPlayers) ? `Waiting for players (${connectedPlayers}/${serverMaxPlayers})...` : (gameMode === 'online' && turn !== myIndex) ? `Waiting for ${players[turn]?.color}...` : 'Roll dice'}
                                </p>
                            </div>
                        </div>

                        {/* Player Status */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md">
                            <h3 className="text-sm font-bold mb-3 text-gray-400 uppercase">Status</h3>
                            <div className="space-y-2">
                                {gameMode === 'online' && isRoomJoined && (
                                    <div className="mb-2 p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Share2 size={14} className="text-blue-400" />
                                                <span className="text-blue-300 font-bold text-xs uppercase tracking-wider">Room</span>
                                            </div>
                                            <PingDisplay />
                                        </div>
                                        <div className="flex items-center gap-2 bg-black/40 rounded-lg p-2 border border-blue-500/20 mb-2">
                                            <code className="flex-1 font-mono text-center font-bold text-sm tracking-widest text-white">{room}</code>
                                            <button
                                                onClick={handleCopyLink}
                                                className="p-1 hover:bg-white/10 rounded transition-colors text-blue-400"
                                                title="Copy Link"
                                            >
                                                {isCopied ? <Check size={14} /> : <Copy size={14} />}
                                            </button>
                                        </div>
                                        <p className="text-xs text-blue-200 mt-1 text-center">You are Player {myIndex !== null ? myIndex + 1 : "?"}</p>
                                    </div>
                                )}
                                {players.map((p, i) => {
                                    if (p.isActive === false) return null; // Skip inactive
                                    return (
                                        <div key={i} className={`flex justify-between items-center p-2 rounded-lg ${turn === i ? 'bg-white/10' : ''} relative group`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded-full ${COLOR_STYLES[p.color].bg}`} />
                                                {editingPlayerIdx === i && gameMode !== 'online' ? (
                                                    <input
                                                        autoFocus
                                                        className={`bg-black/40 border border-white/20 rounded px-1 min-w-[60px] text-xs focus:outline-none ${COLOR_STYLES[p.color].text} border-current`}
                                                        value={p.name || (i === 0 && userName ? userName : p.color)}
                                                        onChange={(e) => {
                                                            const newName = e.target.value;
                                                            setPlayers(prev => prev.map((p2, idx) => idx === i ? { ...p2, name: newName } : p2));
                                                        }}
                                                        onBlur={() => setEditingPlayerIdx(null)}
                                                        onKeyDown={(e) => e.key === 'Enter' && setEditingPlayerIdx(null)}
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-1 group/name">
                                                        <span className={`capitalize font-bold text-sm ${COLOR_STYLES[p.color].text}`}>
                                                            {p.name || ((gameMode === 'online' ? myIndex === i : i === 0) && userName ? userName : p.color)}
                                                            {myIndex === i && gameMode === 'online' ? ' (You)' : ''}
                                                        </span>
                                                        {gameMode === 'pvp' && (
                                                            <button
                                                                onClick={() => setEditingPlayerIdx(i)}
                                                                className="p-1 hover:bg-white/10 rounded transition-colors"
                                                            >
                                                                <Pencil size={14} className="text-gray-500 hover:text-white" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-gray-400">{p.finishedCount || 0}/4</span>

                                                {/* ME Reaction Button - Inline */}
                                                {gameMode === 'online' && myIndex === i && (
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
                                            </div>

                                            {/* Reaction Display Area */}
                                            <AnimatePresence>
                                                {activeReactions.filter(r => r.playerId === p.id).map(r => (
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
                                                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none text-4xl z-50"
                                                    >
                                                        {r.emoji}
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>
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
            <VoiceChat room={room} isRoomJoined={gameMode === 'online' && isRoomJoined} />
        </div>
    );
}

export default Ludo;
