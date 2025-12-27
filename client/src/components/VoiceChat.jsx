import React, { useEffect, useState, useRef } from 'react';
import Peer from 'simple-peer';
import socket from '../socket';
import { Mic, MicOff, Volume2, VolumeX, X, Phone, Users, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Polyfills for simple-peer in Vite environment
import { Buffer } from 'buffer';
import process from 'process';

if (typeof window !== 'undefined') {
    if (!window.global) window.global = window;
    if (!window.Buffer) window.Buffer = Buffer;
    if (!window.process) window.process = process;
    // Essential for simple-peer/readable-stream
    if (!window.process.nextTick) {
        window.process.nextTick = (cb, ...args) => setTimeout(() => cb(...args), 0);
    }
}

// Separate component for rendering audio allows for better react lifecycle management of streams
const AudioPlayer = ({ stream, isSpeakerMuted, onVolumeChange }) => {
    const audioRef = useRef();

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
            // Force play for mobile browsers
            audioRef.current.play().catch(e => console.log("[VoiceChat] Playback blocked or failed:", e));
        }

        // Voice activity detection
        let audioContext;
        let analyser;
        let source;
        let animationFrame;

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();

            // Wait for context to be running
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }

            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 64;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            const checkVolume = () => {
                // Persistent resume attempt
                if (audioContext.state === 'suspended') {
                    audioContext.resume().catch(e => { });
                }

                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const avg = sum / bufferLength;
                if (onVolumeChange) onVolumeChange(avg);
                animationFrame = requestAnimationFrame(checkVolume);
            };
            checkVolume();

            console.log("[AudioPlayer] Initialized for track:", stream.getAudioTracks()[0]?.label);
        } catch (e) {
            console.warn("[VoiceChat] Audio Context error:", e);
        }

        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            if (audioContext) audioContext.close();
        };
    }, [stream, onVolumeChange]);

    return (
        <audio
            ref={audioRef}
            autoPlay
            playsInline
            muted={isSpeakerMuted}
            onError={(e) => console.error("Audio playback error", e)}
        />
    );
};


const VoiceChat = ({ room, isRoomJoined }) => {
    const [peers, setPeers] = useState([]);
    const [stream, setStream] = useState(null);
    const [isVoiceJoined, setIsVoiceJoined] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(true); // Default to muted
    const [remotePeerStatus, setRemotePeerStatus] = useState({});
    const peersRef = useRef([]);
    const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    // Refs
    const panelRef = useRef(null);
    const floatRef = useRef(null);
    const streamRef = useRef(null); // Keep track of stream in ref for cleanup

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isVoiceJoined && !isMinimized &&
                panelRef.current && !panelRef.current.contains(event.target)) {
                setIsMinimized(true);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isVoiceJoined, isMinimized]);

    // --- Actions ---
    const joinVoice = () => {
        if (!room) return;
        console.log("[VoiceChat] Joining voice...");

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Voice Chat not supported/secure context needed.");
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
            .then(currentStream => {
                console.log("[VoiceChat] Stream acquired");
                // Mute by default
                currentStream.getAudioTracks().forEach(track => track.enabled = false);

                setStream(currentStream);
                streamRef.current = currentStream;
                setIsVoiceJoined(true);
                setIsMinimized(false);

                // Note: We need to broadcast strict initial state, but socket logic is in useEffect
                // The useEffect will pick up the 'isMicMuted' state if we pass it or emit it?
                // Currently socket.emit('join_voice') doesn't send status. 
                // We should probably emit an initial status update or handle it in the effect.
            })
            .catch(err => {
                console.error("[VoiceChat] Failed to get stream", err);
                alert("Could not access microphone.");
            });
    };

    // --- Socket & Peer Logic ---
    useEffect(() => {
        if (!isVoiceJoined || !stream || !room) return;

        console.log("[VoiceChat] Initializing socket listeners for room:", room);
        console.log("[VoiceChat] Initializing socket listeners for room:", room);
        socket.emit("join_voice", room);
        // Immediately broadcast initial mute state
        socket.emit("voice_status_update", { room, status: { isMicMuted: true } });

        // 1. Existing users in room
        const handleAllUsers = (users) => {
            console.log("[VoiceChat] existing users:", users);
            // Cleanup old
            peersRef.current.forEach(p => { try { p.peer.destroy(); } catch (e) { } });
            peersRef.current = [];

            const peersList = [];
            users.forEach(userID => {
                const peer = createPeer(userID, socket.id, stream);
                peersRef.current.push({ peerID: userID, peer });
                peersList.push({ peerID: userID, peer });
            });
            setPeers(peersList);
        };

        // 2. New user joining (Incoming Call)
        const handleUserJoined = (payload) => {
            console.log("[VoiceChat] User joined (incoming signal):", payload.callerID);

            // Remove existing peer if any (deduplication)
            const existingIdx = peersRef.current.findIndex(p => p.peerID === payload.callerID);
            if (existingIdx !== -1) {
                console.warn("[VoiceChat] Duplicate peer detected, replacing:", payload.callerID);
                try { peersRef.current[existingIdx].peer.destroy(); } catch (e) { }
                peersRef.current.splice(existingIdx, 1);
            }

            const peer = addPeer(payload.signal, payload.callerID, stream);
            peersRef.current.push({ peerID: payload.callerID, peer });

            setPeers(prev => {
                const filtered = prev.filter(p => p.peerID !== payload.callerID);
                return [...filtered, { peerID: payload.callerID, peer }];
            });
        };

        // 3. Receive signal response (Answer)
        const handleReturningSignal = (payload) => {
            console.log("[VoiceChat] Received returned signal from:", payload.id);
            const item = peersRef.current.find(p => p.peerID === payload.id);
            if (item) {
                item.peer.signal(payload.signal);
            }
        };

        // 4. User left
        const handleUserLeft = (id) => {
            console.log("[VoiceChat] User left:", id);
            const peerObj = peersRef.current.find(p => p.peerID === id);
            if (peerObj) peerObj.peer.destroy();
            const newPeers = peersRef.current.filter(p => p.peerID !== id);
            peersRef.current = newPeers;
            setPeers(newPeers);
            setRemotePeerStatus(prev => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
        };

        const handleStatusUpdate = ({ id, status }) => {
            setRemotePeerStatus(prev => ({ ...prev, [id]: status }));
        };

        socket.on("all_voice_users", handleAllUsers);
        socket.on("user_joined_voice", handleUserJoined);
        socket.on("receiving_returned_signal", handleReturningSignal);
        socket.on("user_left_voice", handleUserLeft);
        socket.on("voice_status_update", handleStatusUpdate);

        return () => {
            socket.off("all_voice_users", handleAllUsers);
            socket.off("user_joined_voice", handleUserJoined);
            socket.off("receiving_returned_signal", handleReturningSignal);
            socket.off("user_left_voice", handleUserLeft);
            socket.off("voice_status_update", handleStatusUpdate);
        };
    }, [isVoiceJoined, stream, room]);

    const leaveVoice = () => {
        // Stop all tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            setStream(null);
            streamRef.current = null;
        }

        // Notify server
        if (room && isVoiceJoined) {
            socket.emit("leave_voice", room);
        }

        // Destroy all peers
        if (peersRef.current) {
            peersRef.current.forEach(p => {
                if (p.peer) p.peer.destroy();
            });
            peersRef.current = [];
        }
        setPeers([]);
        setIsVoiceJoined(false);
        setIsMicMuted(false);
        setIsSpeakerMuted(false);
        setRemotePeerStatus({});
        setIsMinimized(false);

        // Note: Listeners are cleaned up by useEffect when isVoiceJoined becomes false
    };

    const ICE_CONFIG = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
        ]
    };

    const createPeer = (userToSignal, callerID, stream) => {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
            config: ICE_CONFIG
        });

        peer.on("signal", signal => {
            socket.emit("sending_signal", { userToSignal, callerID, signal });
        });

        return peer;
    };

    const addPeer = (incomingSignal, callerID, stream) => {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
            config: ICE_CONFIG
        });

        peer.on("signal", signal => {
            socket.emit("returning_signal", { signal, callerID });
        });

        peer.signal(incomingSignal);

        return peer;
    };

    const resumeAudio = () => {
        // Helper to force resume audio context if suspended (common in Chrome/Mobile)
        // Creating and resuming a context on user gesture unlocks the audio subsystem
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            const ctx = new AudioContext();
            if (ctx.state === 'suspended') {
                ctx.resume().then(() => ctx.close());
            } else {
                ctx.close();
            }
        }
    };

    const toggleMic = () => {
        resumeAudio();
        if (stream) {
            const audioTrack = stream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMicMuted(!audioTrack.enabled);
                // Broadcast status
                socket.emit("voice_status_update", { room, status: { isMicMuted: !audioTrack.enabled } });
            }
        }
    };

    const toggleSpeaker = () => {
        resumeAudio();
        setIsSpeakerMuted(!isSpeakerMuted);
    };

    // --- Lifecycle ---
    // Ensure we leave voice when the room ID changes (cleanup previous room)
    useEffect(() => {
        return () => {
            leaveVoice();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room]);

    // Reset when isRoomJoined becomes false
    useEffect(() => {
        if (!isRoomJoined) {
            leaveVoice();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRoomJoined]);

    // Reconnection Handler
    useEffect(() => {
        const handleReconnect = () => {
            if (isVoiceJoined && room) {
                console.log("Reconnecting to voice...");
                // Note: verify if we need to clear peers. 
                // WebRTC connections might persist independent of socket.
                // However, for discovery of new users or re-sync, re-joining is safe.
                // If the server lost state, we NEED to re-join to be discoverable.
                socket.emit("join_voice", room);
            }
        };

        socket.on("connect", handleReconnect);
        return () => socket.off("connect", handleReconnect);
    }, [isVoiceJoined, room]);

    const SPRING_TRANSITION = { type: "spring", stiffness: 5000, damping: 300 };

    // --- Render ---
    // Only show if room is joined
    if (!isRoomJoined) {
        return null;
    }

    return (
        <div className="fixed bottom-4 left-4 z-[9000] flex flex-col gap-2">
            <AnimatePresence mode="wait">
                {isVoiceJoined && (
                    isMinimized ? (
                        <motion.button
                            key="minimized"
                            ref={floatRef}
                            layoutId="voice-panel"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{
                                scale: 1,
                                opacity: 1,
                                backgroundColor: isMicMuted ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)",
                                borderColor: isMicMuted ? "rgb(239, 68, 68)" : "rgb(34, 197, 94)",
                                color: isMicMuted ? "rgb(248, 113, 113)" : "rgb(74, 222, 128)"
                            }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={SPRING_TRANSITION}
                            onClick={() => setIsMinimized(false)}
                            className="p-3 rounded-full shadow-lg border-2 backdrop-blur-md flex items-center justify-center"
                        >
                            {isMicMuted ? <MicOff size={24} /> : <Mic size={24} />}
                        </motion.button>
                    ) : (
                        <motion.div
                            key="expanded"
                            ref={panelRef}
                            layoutId="voice-panel"
                            initial={{ opacity: 0, scale: 0.9, y: 50 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 50 }}
                            transition={SPRING_TRANSITION}
                            className="bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl w-64"
                        >
                            <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
                                <div className="flex items-center gap-2 text-green-400">
                                    <Radio size={16} className="animate-pulse" />
                                    <span className="font-bold text-xs uppercase tracking-wider">Voice Connected</span>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setIsMinimized(true)} className="text-gray-400 hover:text-white transition-colors">
                                        <X size={16} />
                                    </button>
                                    <button onClick={leaveVoice} className="text-red-400 hover:text-white transition-colors">
                                        <Phone size={16} className="rotate-[135deg]" />
                                    </button>
                                </div>
                            </div>

                            {/* Peers List */}
                            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                {/* Me */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full transition-all duration-300 ${!isMicMuted ? 'bg-green-500 shadow-[0_0_8px_green]' : 'bg-gray-600'}`} />
                                        <span className="text-xs font-bold text-gray-300">You</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {stream && <LocalActivityIndicator stream={stream} isMuted={isMicMuted} />}
                                        {isMicMuted ? <MicOff size={14} className="text-red-400" /> : <Mic size={14} className="text-gray-400" />}
                                    </div>
                                </div>

                                {/* Others */}
                                {peers.map((p, i) => {
                                    const status = remotePeerStatus[p.peerID] || {};
                                    return (
                                        <div key={p.peerID} className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_blue]" />
                                                <span className="text-xs font-bold text-gray-400">Player {i + 1}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <AudioWrapper peer={p.peer} isSpeakerMuted={isSpeakerMuted} />
                                                {status.isMicMuted ? <MicOff size={14} className="text-red-500/50" /> : <Mic size={14} className="text-green-500/50" />}
                                            </div>
                                        </div>
                                    );
                                })}
                                {peers.length === 0 && (
                                    <div className="text-[10px] text-gray-500 text-center py-2">Waiting for others...</div>
                                )}
                            </div>

                            {/* Controls */}
                            <div className="grid grid-cols-2 gap-2">
                                <motion.button
                                    onClick={toggleMic}
                                    animate={{
                                        backgroundColor: isMicMuted ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.1)",
                                        color: isMicMuted ? "rgb(252, 165, 165)" : "rgb(255, 255, 255)"
                                    }}
                                    whileHover={{
                                        backgroundColor: isMicMuted ? "rgba(239, 68, 68, 0.3)" : "rgba(255, 255, 255, 0.2)"
                                    }}
                                    whileTap={{ scale: 0.95 }}
                                    className="p-2 rounded-lg flex items-center justify-center gap-2"
                                >
                                    {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
                                    <span className="text-[10px] font-bold">{isMicMuted ? 'Unmute' : 'Mute'}</span>
                                </motion.button>
                                <motion.button
                                    onClick={toggleSpeaker}
                                    animate={{
                                        backgroundColor: isSpeakerMuted ? "rgba(239, 68, 68, 0.2)" : "rgba(255, 255, 255, 0.1)",
                                        color: isSpeakerMuted ? "rgb(252, 165, 165)" : "rgb(255, 255, 255)"
                                    }}
                                    whileHover={{
                                        backgroundColor: isSpeakerMuted ? "rgba(239, 68, 68, 0.3)" : "rgba(255, 255, 255, 0.2)"
                                    }}
                                    whileTap={{ scale: 0.95 }}
                                    className="p-2 rounded-lg flex items-center justify-center gap-2"
                                >
                                    {isSpeakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                    <span className="text-[10px] font-bold">{isSpeakerMuted ? 'Deafen' : 'Speaker'}</span>
                                </motion.button>
                            </div>

                        </motion.div>
                    )
                )}
            </AnimatePresence>

            {!isVoiceJoined && (
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={joinVoice}
                    className="bg-green-600/90 text-white p-3 rounded-full shadow-lg border-2 border-green-400/30 backdrop-blur-sm flex items-center justify-center group"
                >
                    <Phone size={24} className="group-hover:animate-bounce" />
                    <span className="absolute left-full ml-2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        Join Voice
                    </span>
                </motion.button>
            )}
        </div>
    );
};

// Helper wrapper to extract stream from peer
const AudioWrapper = ({ peer, isSpeakerMuted }) => {
    const [stream, setStream] = useState(null);
    const [avgVolume, setAvgVolume] = useState(0);

    useEffect(() => {
        peer.on("stream", currentStream => {
            console.log("[VoiceChat] Received remote stream");
            setStream(currentStream);
        });
    }, [peer]);

    if (!stream) return null;

    const isTalking = avgVolume > 10;

    return (
        <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${isTalking ? 'bg-green-400 scale-125 shadow-[0_0_8px_#4ade80]' : 'bg-transparent'}`} />
            <AudioPlayer stream={stream} isSpeakerMuted={isSpeakerMuted} onVolumeChange={setAvgVolume} />
        </div>
    );
}

const LocalActivityIndicator = ({ stream, isMuted }) => {
    const [avgVolume, setAvgVolume] = useState(0);
    // Reuse AudioPlayer logic without rendering audio element
    useEffect(() => {
        if (isMuted || !stream) {
            setAvgVolume(0);
            return;
        }
        let audioContext, analyser, source, animationFrame;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);
            analyser.fftSize = 64;
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const check = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                setAvgVolume(sum / dataArray.length);
                animationFrame = requestAnimationFrame(check);
            };
            check();
        } catch (e) { }
        return () => {
            if (animationFrame) cancelAnimationFrame(animationFrame);
            if (audioContext) audioContext.close();
        };
    }, [stream, isMuted]);

    const isTalking = avgVolume > 10;
    return <div className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${isTalking ? 'bg-green-400 scale-125 shadow-[0_0_8px_#4ade80]' : 'bg-transparent'}`} />;
}

export default VoiceChat;
