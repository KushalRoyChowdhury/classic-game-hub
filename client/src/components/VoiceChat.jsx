import React, { useEffect, useState, useRef } from 'react';
import socket from '../socket';
import { Mic, MicOff, Volume2, VolumeX, X, Phone, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- WebSocket Audio Logic ---
// We send MediaRecorder chunks -> Server -> Other Clients -> Decode -> Queue -> Play

const VoiceChat = ({ room, isRoomJoined }) => {
    // UI State
    const [isVoiceJoined, setIsVoiceJoined] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(true); // Default Muted
    const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [remotePeerStatus, setRemotePeerStatus] = useState({});

    // Active speakers tracking (for visualizer)
    const [activeSpeakers, setActiveSpeakers] = useState(new Set());

    // Refs for internals
    const mediaRecorderRef = useRef(null);
    const audioContextRef = useRef(null);
    const streamRef = useRef(null);
    const panelRef = useRef(null);

    // Playback Queue: Map<senderId, { nextTime: number, analyser: AnalyserNode }>
    const audioPlayersRef = useRef(new Map());

    // --- Audio Context Helper ---
    const getAudioContext = () => {
        if (!audioContextRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContext();
        }
        // Always try resume if suspended
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(e => console.warn("AudioContext Resume failed", e));
        }
        return audioContextRef.current;
    };

    // --- Action: Join Voice ---
    const joinVoice = async () => {
        if (!room) return;
        try {
            console.log("[VoiceChat] Requesting mic access...");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Immediately Mute
            stream.getAudioTracks().forEach(t => t.enabled = false);
            setIsMicMuted(true);

            streamRef.current = stream;
            setIsVoiceJoined(true);
            setIsMinimized(false);

            // Start Socket logic
            socket.emit("join_voice", room);
            socket.emit("voice_status_update", { room, status: { isMicMuted: true } });

            // Start Recording Loop (we record silence if muted, which effectively sends nothing if we filter it, 
            // but MediaRecorder sends data regardless if track is enabled but MUTED. 
            // Wait, track.enabled=false means MediaRecorder receives silence. 
            // Sending silence is waste of bandwidth. We can pause recorder when muted.)
            startRecording(stream);

        } catch (err) {
            console.error("Mic Error:", err);
            alert("Could not access microphone.");
        }
    };

    const startRecording = (stream) => {
        // Use small timeslice for low latency
        // 100ms is aggressive but good for voice. 250ms is safer for bad net.
        // Let's go with 200ms.
        // Mimetype: 'audio/webm;codecs=opus' is standard.
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = {}; // Default
        }

        const recorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
            if (e.data.size > 0 && socket.connected && !isMicMuted) {
                // Convert Blob to ArrayBuffer to send over socket efficiently
                const buffer = await e.data.arrayBuffer();
                socket.emit("voice_data", { room, data: buffer });

                // Visualizer for self
                if (activeSpeakers.has("me")) {
                    // Timeout to un-highlight self is handled by volume check or manual ?
                    // Actually, simple way to visualize self is checking volume of stream
                }
            }
        };

        recorder.start(150); // 150ms chunks
    };

    const leaveVoice = () => {
        // Stop Recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        // Stop Tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        // Notify
        if (room && isVoiceJoined) {
            socket.emit("leave_voice", room);
        }

        // Reset State
        setIsVoiceJoined(false);
        setIsMicMuted(true);
        setActiveSpeakers(new Set());
        setRemotePeerStatus({});
        audioPlayersRef.current.clear();

        // Close Context (optional, but good cleanup)
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
    };

    // --- Playback Logic ---
    const handleReceiveVoiceData = async ({ senderId, data }) => {
        if (isSpeakerMuted || !isVoiceJoined) return;

        const ctx = getAudioContext();

        try {
            // Decode opus/webm chunk (async)
            const audioBuffer = await ctx.decodeAudioData(data);

            // Queueing Logic
            let playerState = audioPlayersRef.current.get(senderId);
            if (!playerState) {
                // Create Analyser for Visualizer
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 64;
                analyser.connect(ctx.destination);

                playerState = {
                    nextTime: ctx.currentTime, // Start immediately (buffer willing)
                    analyser
                };
                audioPlayersRef.current.set(senderId, playerState);

                // Start polling volume for visualizer
                pollVolume(senderId, analyser);
            }

            // Schedule Playback
            // If nextTime is in past, reset to now (we lagged out or first packet)
            // Add a tiny buffer (30ms) to ensure smooth stitching if jitter is low
            const now = ctx.currentTime;
            if (playerState.nextTime < now) {
                playerState.nextTime = now + 0.05; // 50ms startup buffer
            }

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(playerState.analyser);

            source.start(playerState.nextTime);

            // Advance pointer
            playerState.nextTime += audioBuffer.duration;

        } catch (err) {
            console.error("Audio Decode Error:", err);
        }
    };

    // --- Visualizer Polling ---
    const pollVolume = (id, analyser) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const check = () => {
            if (!audioPlayersRef.current.has(id)) return; // Stopped

            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avg = sum / dataArray.length;

            if (avg > 10) {
                setActiveSpeakers(prev => new Set(prev).add(id));
            } else {
                setActiveSpeakers(prev => {
                    if (!prev.has(id)) return prev;
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }
            requestAnimationFrame(check);
        };
        check();
    };

    // --- Self Visualizer ---
    useEffect(() => {
        if (!streamRef.current || isMicMuted || !isVoiceJoined) {
            setActiveSpeakers(prev => {
                const next = new Set(prev);
                next.delete("me");
                return next;
            });
            return;
        }

        const ctx = getAudioContext();
        const info = { animation: null };
        try {
            const source = ctx.createMediaStreamSource(streamRef.current);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser); // Don't connect to destination (feedback loop)

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const check = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;

                if (avg > 10) setActiveSpeakers(p => new Set(p).add("me"));
                else setActiveSpeakers(p => { const n = new Set(p); n.delete("me"); return n; });

                info.animation = requestAnimationFrame(check);
            };
            check();
        } catch (e) { }

        return () => cancelAnimationFrame(info.animation);
    }, [isMicMuted, isVoiceJoined]);


    // --- Socket Listeners ---
    useEffect(() => {
        if (!isVoiceJoined) return;

        socket.on("receive_voice_data", handleReceiveVoiceData);

        // Voice Status (Mute icons)
        socket.on("voice_status_update", ({ id, status }) => {
            setRemotePeerStatus(prev => ({ ...prev, [id]: status }));
        });

        // User Left Cleanup
        socket.on("user_left_voice", (id) => {
            audioPlayersRef.current.delete(id);
            setActiveSpeakers(p => { const n = new Set(p); n.delete(id); return n; });
            setRemotePeerStatus(p => {
                const next = { ...p };
                delete next[id];
                return next;
            });
        });

        return () => {
            socket.off("receive_voice_data", handleReceiveVoiceData);
            socket.off("voice_status_update");
            socket.off("user_left_voice");
        };
    }, [isVoiceJoined, isSpeakerMuted]); // Re-bind if mute changes to stop processing? No, check in handler.

    // --- Controls ---
    const toggleMic = () => {
        getAudioContext(); // Resume context
        if (streamRef.current) {
            const tracks = streamRef.current.getAudioTracks();
            // We want to toggle the current state.
            // If currently Muted (isMicMuted=true), we want enabled=true.
            const shouldEnable = isMicMuted;

            tracks.forEach(t => t.enabled = shouldEnable);

            setIsMicMuted(!isMicMuted); // Update state to new value
            socket.emit("voice_status_update", { room, status: { isMicMuted: !isMicMuted } });
        }
    };

    const toggleSpeaker = () => {
        getAudioContext();
        setIsSpeakerMuted(!isSpeakerMuted);
    };

    // Auto-leave on unmount or room change
    useEffect(() => {
        if (!isRoomJoined) leaveVoice();
    }, [isRoomJoined]);

    useEffect(() => {
        return () => leaveVoice();
    }, []);

    // --- Render ---
    if (!isRoomJoined) return null;

    const SPRING_TRANSITION = { type: "spring", stiffness: 5000, damping: 300 };

    return (
        <div className="fixed bottom-4 left-4 z-[9000] flex flex-col gap-2">
            <AnimatePresence mode="wait">
                {isVoiceJoined && (
                    isMinimized ? (
                        <motion.button
                            key="minimized"
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
                                    <span className="font-bold text-xs uppercase tracking-wider">Voice (WS)</span>
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

                            {/* Participants List */}
                            <div className="space-y-2 mb-4 max-h-40 overflow-y-auto custom-scrollbar">
                                {/* Me */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full transition-all duration-200 ${activeSpeakers.has("me") ? 'bg-green-400 scale-125 shadow-[0_0_8px_#4ade80]' : 'bg-gray-600'}`} />
                                        <span className="text-xs font-bold text-gray-300">You</span>
                                    </div>
                                    {isMicMuted ? <MicOff size={14} className="text-red-400" /> : <Mic size={14} className="text-gray-400" />}
                                </div>

                                {/* Active Speakers (or just anyone sending data really, simplified as we don't track full user list in this simplified component, but we can infer from status updates or just rely on 'activeSpeakers' set logic if we want to be minimal. But better to reuse User list from props if available? No props. 
                                We should track 'known' users via voice_status_update or receive_voice_data events to render list. 
                                Let's assume we render users who sent data or status updates. */}
                                {Object.keys(remotePeerStatus).map((id, i) => (
                                    <div key={id} className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full transition-all duration-200 ${activeSpeakers.has(id) ? 'bg-blue-400 scale-125 shadow-[0_0_8px_#3b82f6]' : 'bg-blue-900'}`} />
                                            <span className="text-xs font-bold text-gray-400">Player {i + 1}</span>
                                        </div>
                                        {remotePeerStatus[id]?.isMicMuted ? <MicOff size={14} className="text-red-500/50" /> : <Mic size={14} className="text-green-500/50" />}
                                    </div>
                                ))}
                                {Object.keys(remotePeerStatus).length === 0 && (
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
                        Join Voice (WS)
                    </span>
                </motion.button>
            )}
        </div>
    );
};

export default VoiceChat;
