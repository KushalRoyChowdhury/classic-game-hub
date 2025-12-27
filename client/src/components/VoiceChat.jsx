import React, { useEffect, useState, useRef } from 'react';
import Peer from 'simple-peer';
import socket from '../socket';
import { Mic, MicOff, Volume2, VolumeX, X, Phone, Users, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Separate component for rendering audio allows for better react lifecycle management of streams
const AudioPlayer = ({ stream, isSpeakerMuted }) => {
    const audioRef = useRef();

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <audio
            ref={audioRef}
            autoPlay
            playsInline
            muted={isSpeakerMuted} // Controlled by local speaker mute
            onError={(e) => console.error("Audio playback error", e)}
        />
    );
};


const VoiceChat = ({ room, isRoomJoined }) => {
    const [peers, setPeers] = useState([]);
    const [stream, setStream] = useState(null);
    const [isVoiceJoined, setIsVoiceJoined] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [remotePeerStatus, setRemotePeerStatus] = useState({}); // { [socketId]: { isMicMuted: bool } }
    const peersRef = useRef([]); // To keep track of peer objects directly { peerID, peer }
    const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    // Add ref for the panel
    const panelRef = useRef(null);
    const floatRef = useRef(null);

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

    // --- Core Logic ---
    const joinVoice = () => {
        if (!room) return;

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Voice Chat is not supported in this browser or requires a secure context (HTTPS/localhost). If you are on a local network, try using 'localhost' instead of IP.");
            return;
        }

        navigator.mediaDevices.getUserMedia({ video: false, audio: true })
            .then(currentStream => {
                setStream(currentStream);
                setIsVoiceJoined(true);
                setIsMinimized(false); // Expand on join

                socket.emit("join_voice", room);

                // Listen for other users ALREADY in call -> We call them (Initiator)
                socket.on("all_voice_users", (users) => {
                    const peersList = [];
                    users.forEach(userID => {
                        const peer = createPeer(userID, socket.id, currentStream);
                        peersRef.current.push({
                            peerID: userID,
                            peer,
                        });
                        peersList.push({
                            peerID: userID,
                            peer,
                        });
                    });
                    setPeers(peersList);
                });

                // Listen for NEW user joining -> They call us (Receiver)
                socket.on("user_joined_voice", (payload) => {
                    const peer = addPeer(payload.signal, payload.callerID, currentStream);
                    peersRef.current.push({
                        peerID: payload.callerID,
                        peer,
                    });
                    setPeers(users => [...users, { peerID: payload.callerID, peer }]);
                });

                socket.on("receiving_returned_signal", (payload) => {
                    const item = peersRef.current.find(p => p.peerID === payload.id);
                    if (item) {
                        item.peer.signal(payload.signal);
                    }
                });

                socket.on("user_left_voice", (id) => {
                    const peerObj = peersRef.current.find(p => p.peerID === id);
                    if (peerObj) {
                        peerObj.peer.destroy();
                    }
                    const newPeers = peersRef.current.filter(p => p.peerID !== id);
                    peersRef.current = newPeers;
                    setPeers(newPeers);

                    // Cleanup status
                    setRemotePeerStatus(prev => {
                        const next = { ...prev };
                        delete next[id];
                        return next;
                    });
                });

                socket.on("voice_status_update", ({ id, status }) => {
                    setRemotePeerStatus(prev => ({
                        ...prev,
                        [id]: status
                    }));
                });

            })
            .catch(err => {
                console.error("Failed to get local stream", err);
                alert("Could not access microphone.");
            });
    };

    const leaveVoice = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }

        // Notify server
        if (room && isVoiceJoined) {
            socket.emit("leave_voice", room);
        }

        // Destroy all peers
        peersRef.current.forEach(p => {
            if (p.peer) p.peer.destroy();
        });
        peersRef.current = [];
        setPeers([]);
        setIsVoiceJoined(false);
        setIsMicMuted(false);
        setIsSpeakerMuted(false);
        setRemotePeerStatus({});
        setIsMinimized(false);

        // Remove listeners
        socket.off("all_voice_users");
        socket.off("user_joined_voice");
        socket.off("receiving_returned_signal");
        socket.off("user_left_voice");
        socket.off("voice_status_update");
    };

    const createPeer = (userToSignal, callerID, stream) => {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
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
        });

        peer.on("signal", signal => {
            socket.emit("returning_signal", { signal, callerID });
        });

        peer.signal(incomingSignal);

        return peer;
    };

    const toggleMic = () => {
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
                            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto">
                                {/* Me */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_green]" />
                                        <span className="text-xs font-bold text-gray-300">You</span>
                                    </div>
                                    {isMicMuted ? <MicOff size={14} className="text-red-400" /> : <Mic size={14} className="text-gray-400" />}
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
                                                {/* If they muted themselves */}
                                                {status.isMicMuted ? <MicOff size={14} className="text-red-500/50" /> : <Mic size={14} className="text-green-500/50" />}
                                                {/* Audio Element */}
                                                <AudioWrapper peer={p.peer} isSpeakerMuted={isSpeakerMuted} />
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

    useEffect(() => {
        peer.on("stream", currentStream => {
            setStream(currentStream);
        });
    }, [peer]);

    if (!stream) return null;

    return <AudioPlayer stream={stream} isSpeakerMuted={isSpeakerMuted} />;
}

export default VoiceChat;
