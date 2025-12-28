import React, { useEffect, useState, useRef } from 'react';
import Peer from 'peerjs';
import socket from '../socket';
import { Mic, MicOff, Volume2, VolumeX, X, Phone, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- PeerJS Implementation ---
// Replaces manual Webrtc/binary sockets with PeerJS cloud signaling

const VoiceChat = ({ room, isRoomJoined }) => {
    // UI State
    const [isVoiceJoined, setIsVoiceJoined] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(true); // Default Mute
    const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [remotePeerStatus, setRemotePeerStatus] = useState({});

    // PeerJS Refs
    const peerInstance = useRef(null);
    const myPeerId = useRef(null);
    const streamRef = useRef(null);
    const peersCalls = useRef([]); // Keep track of active calls to close them

    // UI Refs
    const remoteAudioRefs = useRef({}); // Map<callId, HTMLAudioElement>
    const panelRef = useRef(null); // For click-outside detection

    const SPRING_TRANSITION = { type: "spring", stiffness: 5000, damping: 300 };

    // --- Actions ---
    const joinVoice = async () => {
        if (!room) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Default Mute
            stream.getAudioTracks().forEach(t => t.enabled = false);
            setIsMicMuted(true);

            streamRef.current = stream;
            setIsVoiceJoined(true);
            setIsMinimized(false);

            // Init PeerJS
            // We use the default free cloud server. 
            // In a prod app, you'd run your own 'peerjs-server'
            const peer = new Peer(undefined, {
                debug: 2
            });

            peer.on('open', (id) => {
                myPeerId.current = id;
                // Announce to room via Socket
                socket.emit('voice_peer_join', { room, peerId: id });
                socket.emit("voice_status_update", { room, status: { isMicMuted: true } });
            });

            // Handle Incoming Calls
            peer.on('call', (call) => {
                call.answer(stream); // Answer with our stream
                peersCalls.current.push(call);

                call.on('stream', (remoteStream) => {
                    // Add Audio Element
                    addRemoteAudio(call.peer, remoteStream);
                });

                call.on('close', () => {
                    removeRemoteAudio(call.peer);
                });
            });

            peerInstance.current = peer;

        } catch (err) {
            console.error(err);
            alert("Mic Access Denied or Peer Error");
        }
    };

    // --- Outgoing Calls ---
    // When a new user joins, existing users call them? 
    // Usually easier: New user calls everyone else.
    // We need to know who is in the room. 
    // Let's use socket 'all_voice_peers' logic.

    const connectToNewUser = (userId, remotePeerId) => {
        if (!peerInstance.current) return;

        const call = peerInstance.current.call(remotePeerId, streamRef.current);
        if (!call) return; // Happens if connection not ready

        peersCalls.current.push(call);

        call.on('stream', (remoteStream) => {
            addRemoteAudio(remotePeerId, remoteStream);
        });

        call.on('close', () => {
            removeRemoteAudio(remotePeerId);
        });

        call.on('error', (err) => {
            console.error("Call error:", err);
        });
    };

    // --- Audio Element Management ---
    const addRemoteAudio = (id, stream) => {
        const existingInfo = remoteAudioRefs.current[id];
        if (existingInfo) return;

        // Update UI list for visuals
        setRemotePeerStatus(prev => ({ ...prev, [id]: { isMicMuted: true } }));

        // Create Audio Element
        const audio = document.createElement('audio');
        audio.id = `audio-${id}`;
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.playsInline = true; // iOS
        audio.style.display = 'none'; // Hidden

        document.body.appendChild(audio);

        // Attempt play
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.log("[VoiceChat] Auto-play prevented:", error);
                // We might need a "Click to Play" UI if this fails, 
                // but usually joining voice (click) grants permission.
            });
        }

        remoteAudioRefs.current[id] = audio;
    };

    const removeRemoteAudio = (id) => {
        const audio = remoteAudioRefs.current[id];
        if (audio) {
            audio.pause();
            audio.srcObject = null;
            if (audio.parentNode) audio.parentNode.removeChild(audio);
            delete remoteAudioRefs.current[id];
        }

        setRemotePeerStatus(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    // --- Leave Voice ---
    const leaveVoice = () => {
        if (peerInstance.current) {
            peerInstance.current.destroy();
            peerInstance.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        peersCalls.current.forEach(c => c.close());
        peersCalls.current = [];

        // Notify socket
        if (room && isVoiceJoined) {
            socket.emit('leave_voice', room);
            // We should also tell socket to remove our peerID mapping
            socket.emit('voice_peer_leave', { room, peerId: myPeerId.current });
        }

        setIsVoiceJoined(false);
        setIsMicMuted(true);
        setRemotePeerStatus({});
        myPeerId.current = null;
    };

    // --- Socket Events ---
    useEffect(() => {
        if (!isVoiceJoined) return;

        // When WE join, server sends list of existing peers
        socket.on('all_voice_peers', (peersList) => {
            peersList.forEach(p => {
                if (p.peerId !== myPeerId.current) {
                    connectToNewUser(null, p.peerId);
                }
            });
        });

        // When SOMEONE ELSE joins
        socket.on('user_joined_voice_peer', ({ peerId }) => {
            setRemotePeerStatus(prev => ({ ...prev, [peerId]: { isMicMuted: true } }));
        });

        socket.on('user_left_voice_peer', ({ peerId }) => {
            removeRemoteAudio(peerId);
        });

        socket.on("voice_status_update", ({ peerId, status }) => {
            if (peerId) setRemotePeerStatus(prev => ({ ...prev, [peerId]: status }));
        });

        return () => {
            socket.off('all_voice_peers');
            socket.off('user_joined_voice_peer');
            socket.off('user_left_voice_peer');
            socket.off('voice_status_update');
        };
    }, [isVoiceJoined]);

    // --- Controls ---
    const toggleMic = () => {
        if (streamRef.current) {
            const tracks = streamRef.current.getAudioTracks();
            const shouldEnable = isMicMuted; // Toggle
            tracks.forEach(t => t.enabled = shouldEnable);
            setIsMicMuted(!isMicMuted);

            socket.emit("voice_status_update", { room, peerId: myPeerId.current, status: { isMicMuted: !isMicMuted } });
        }
    };

    const toggleSpeaker = () => {
        setIsSpeakerMuted(!isSpeakerMuted);
        // Force audio elements update?
        // We can pass this prop to AudioWrapper
    };

    // Auto cleanup
    useEffect(() => {
        if (!isRoomJoined) leaveVoice();
    }, [isRoomJoined]);
    useEffect(() => () => leaveVoice(), []);

    // Click outside to minimize
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target) && !isMinimized && isVoiceJoined) {
                setIsMinimized(true);
            }
        };
        if (isVoiceJoined && !isMinimized) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isVoiceJoined, isMinimized]);

    // --- Render ---
    if (!isRoomJoined) return null;

    return (
        <div className="fixed bottom-4 left-4 z-[9000] flex flex-col gap-2">
            <AnimatePresence mode="wait">
                {isVoiceJoined && (
                    isMinimized ? (
                        <motion.button
                            key="min"
                            layoutId="voice-panel"
                            layout
                            onClick={() => setIsMinimized(false)}
                            className="relative p-3 rounded-full shadow-lg border-2 backdrop-blur-md flex items-center justify-center bg-black/70 border-green-500/50"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.98 }}
                            transition={SPRING_TRANSITION}
                        >
                            {/* Pulsing ring when unmuted */}
                            {!isMicMuted && (
                                <motion.div
                                    className="absolute inset-0 rounded-full border-2 border-green-400"
                                    animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                                />
                            )}
                            {isMicMuted ? <MicOff size={24} className="text-red-400" /> : <Mic size={24} className="text-green-400 drop-shadow-[0_0_8px_#4ade80]" />}
                        </motion.button>
                    ) : (
                        <motion.div
                            key="exp"
                            ref={panelRef}
                            layoutId="voice-panel"
                            layout
                            className="bg-[#0d0d0d]/95 backdrop-blur-xl border border-green-500/30 p-4 rounded-2xl shadow-[0_0_30px_rgba(34,197,94,0.15)] w-64"
                            transition={SPRING_TRANSITION}
                        >
                            <div className="flex justify-between items-center mb-3 border-b border-green-500/20 pb-2">
                                <span className="font-bold text-xs uppercase tracking-wider text-green-400 flex items-center gap-2">
                                    <motion.div
                                        animate={{ scale: [1, 1.15, 1] }}
                                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                    >
                                        <Radio size={12} className="text-green-400" />
                                    </motion.div>
                                    Voice Chat
                                </span>
                                <div className="flex gap-2">
                                    <button onClick={() => setIsMinimized(true)}><X size={16} className="text-gray-400" /></button>
                                    <button onClick={leaveVoice}><Phone size={16} className="text-red-400 rotate-[135deg]" /></button>
                                </div>
                            </div>

                            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                {/* Me */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <LocalActivityIndicator stream={streamRef.current} isMicMuted={isMicMuted} />
                                        <span className="text-xs font-bold text-gray-300">You</span>
                                    </div>
                                    {isMicMuted ? <MicOff size={14} className="text-red-400" /> : <Mic size={14} className="text-gray-400" />}
                                </div>
                                {/* Peers */}
                                {Object.keys(remotePeerStatus).map(pid => (
                                    <RemotePeer key={pid} peerId={pid} status={remotePeerStatus[pid]} isSpeakerMuted={isSpeakerMuted} peerInstance={peerInstance.current} />
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={toggleMic} className={`p-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${isMicMuted ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white'}`}>
                                    {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />} <span className="text-[10px] font-bold">{isMicMuted ? 'Unmute' : 'Mute'}</span>
                                </button>
                                <button onClick={toggleSpeaker} className={`p-2 rounded-lg flex items-center justify-center gap-2 transition-colors ${isSpeakerMuted ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white'}`}>
                                    {isSpeakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />} <span className="text-[10px] font-bold">{isSpeakerMuted ? 'Deafen' : 'Speaker'}</span>
                                </button>
                            </div>
                        </motion.div>
                    )
                )}
            </AnimatePresence>
            {!isVoiceJoined && isRoomJoined && (
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={joinVoice}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="relative bg-gradient-to-br from-green-600 to-emerald-700 text-white p-4 rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] border-2 border-green-400/40 backdrop-blur-sm flex items-center justify-center group"
                >
                    {/* Outer pulsing ring - smooth */}
                    <motion.div
                        className="absolute inset-0 rounded-full border-2 border-green-400/50"
                        animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
                    />
                    <motion.div
                        className="absolute inset-0 rounded-full border border-green-400/20"
                        animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                    />
                    <Phone size={24} className="group-hover:rotate-12 transition-transform duration-300" />
                    <span className="sr-only">Join Voice Chat</span>
                </motion.button>
            )}
        </div>
    );
};

const LocalActivityIndicator = ({ stream, isMicMuted }) => {
    const [volume, setVolume] = useState(0);

    useEffect(() => {
        if (!stream || isMicMuted) {
            setVolume(0);
            return;
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser); // Intentionally not connecting to destination (feedback)
        analyser.fftSize = 64;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let rafId;

        const checkVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            setVolume(sum / dataArray.length);
            rafId = requestAnimationFrame(checkVolume);
        };
        checkVolume();

        return () => {
            cancelAnimationFrame(rafId);
            audioContext.close();
        };
    }, [stream, isMicMuted]);

    const isTalking = volume > 10;
    const normalizedVolume = Math.min(volume / 50, 1); // Normalize to 0-1

    return (
        <div className="flex items-center gap-0.5">
            {[0.15, 0.35, 0.55, 0.75].map((threshold, i) => (
                <motion.div
                    key={i}
                    className="w-1 rounded-full bg-green-500"
                    animate={{
                        height: normalizedVolume > threshold ? 4 + (normalizedVolume - threshold) * 12 : 4,
                        opacity: normalizedVolume > threshold ? 0.6 + normalizedVolume * 0.4 : 0.25
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 15,
                        mass: 0.5
                    }}
                    style={{ height: 4 }}
                />
            ))}
        </div>
    );
};

const RemotePeer = ({ peerId, status, isSpeakerMuted }) => {
    const [volume, setVolume] = useState(0);

    useEffect(() => {
        // Find DOM element
        const audioEl = document.getElementById(`audio-${peerId}`);
        if (!audioEl) {
            console.log("No audio el for", peerId);
            return;
        }

        // Handling Cross-Origin audio analysis is tricky without CORS, but PeerJS streams are usually fine.
        // We need an AudioContext.
        let audioContext, analyser, source, rafId;

        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;

            // We need to capture the stream from the element OR the srcObject
            if (audioEl.srcObject) {
                source = audioContext.createMediaStreamSource(audioEl.srcObject);
                source.connect(analyser); // Don't connect source->dest, the Audio Element handles output usually. 
                // Wait, if we use srcObject on Audio element, it plays.
                // If we connect Source -> Analyser -> ?, we just analyze.
            }

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const check = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                setVolume(sum / dataArray.length);
                rafId = requestAnimationFrame(check);
            };
            check();

        } catch (e) {
            console.error("Visualizer Error", e);
        }

        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            if (audioContext) audioContext.close();
        };
    }, [peerId]);

    // Handle Mute logic via side-effect here (cleaner than PeerAudio component)
    useEffect(() => {
        const audioEl = document.getElementById(`audio-${peerId}`);
        if (audioEl) audioEl.muted = isSpeakerMuted;
    }, [isSpeakerMuted, peerId]);


    const isTalking = volume > 10;
    const normalizedVolume = Math.min(volume / 50, 1);

    return (
        <motion.div
            className={`flex items-center justify-between p-2 rounded-lg border ${isTalking ? 'bg-blue-500/10 border-blue-500/30' : 'bg-black/40 border-white/5'}`}
            animate={{ scale: isTalking ? 1.015 : 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
            <div className="flex items-center gap-2">
                {/* Audio bars - smooth spring */}
                <div className="flex items-center gap-0.5">
                    {[0.15, 0.35, 0.55, 0.75].map((threshold, i) => (
                        <motion.div
                            key={i}
                            className="w-1 rounded-full bg-blue-400"
                            animate={{
                                height: normalizedVolume > threshold ? 4 + (normalizedVolume - threshold) * 10 : 4,
                                opacity: normalizedVolume > threshold ? 0.6 + normalizedVolume * 0.4 : 0.25
                            }}
                            transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 15,
                                mass: 0.5
                            }}
                            style={{ height: 4 }}
                        />
                    ))}
                </div>
                <span className={`text-xs font-bold transition-colors duration-300 ${isTalking ? 'text-blue-300' : 'text-gray-400'}`}>
                    Player {peerId.substr(0, 4)}
                </span>
            </div>
            {status?.isMicMuted ?
                <MicOff size={14} className="text-red-500/50" /> :
                <motion.div
                    animate={{ scale: isTalking ? 1.15 : 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 15 }}
                >
                    <Mic size={14} className="text-green-400" />
                </motion.div>
            }
        </motion.div>
    );
};

export default VoiceChat;
