import React, { useEffect, useState, useRef } from 'react';
import socket from '../socket';
import { Mic, MicOff, Volume2, VolumeX, X, Phone, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- constants ---
const SAMPLE_RATE = 16000; // Standard for VoIP
const BUFFER_SIZE = 4096; // ~250ms latency chunk

const VoiceChat = ({ room, isRoomJoined }) => {
    // UI State
    const [isVoiceJoined, setIsVoiceJoined] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(true);
    const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [remotePeerStatus, setRemotePeerStatus] = useState({});
    const [activeSpeakers, setActiveSpeakers] = useState(new Set());

    // Refs
    const audioContextRef = useRef(null);
    const processorRef = useRef(null);
    const streamRef = useRef(null);
    const microphoneRef = useRef(null);
    const activeSpeakersTimeoutRef = useRef({});

    // Playback Timing
    const nextPlayTimeRef = useRef(0);

    // --- Audio Context Helper ---
    const getAudioContext = () => {
        if (!audioContextRef.current) {
            // Force 16k sample rate if possible to match our protocol, 
            // but usually browser enforces hardware rate. We will resample manually.
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioContextRef.current = new AudioContext(); // We'll deal with resampling in code
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => { });
        }
        return audioContextRef.current;
    };

    // --- Resampling Helper (Linear Interpolation) ---
    const resample = (inputData, inputRate, outputRate) => {
        if (inputRate === outputRate) return inputData;
        const ratio = inputRate / outputRate;
        const newLength = Math.round(inputData.length / ratio);
        const result = new Float32Array(newLength);
        for (let i = 0; i < newLength; i++) {
            const originalIndex = i * ratio;
            const index1 = Math.floor(originalIndex);
            const index2 = Math.min(Math.ceil(originalIndex), inputData.length - 1);
            const weight = originalIndex - index1;
            result[i] = inputData[index1] * (1 - weight) + inputData[index2] * weight;
        }
        return result;
    };

    // --- Encode/Decode Helpers ---
    const floatTo16BitPCM = (float32Array) => {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < float32Array.length; i++) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return buffer;
    };

    const pcm16ToFloat = (buffer) => {
        const view = new DataView(buffer);
        const float32 = new Float32Array(buffer.byteLength / 2);
        for (let i = 0; i < float32.length; i++) {
            const int16 = view.getInt16(i * 2, true);
            float32[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
        }
        return float32;
    };

    // --- Join Voice ---
    const joinVoice = async () => {
        if (!room) return;
        try {
            console.log("[VoiceChat] Requesting mic (PCM)...");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            setIsMicMuted(true); // Default mute
            setIsVoiceJoined(true);
            setIsMinimized(false);

            // Notify Server
            socket.emit("join_voice", room);
            socket.emit("voice_status_update", { room, status: { isMicMuted: true } });

            // Init Audio Processing
            const ctx = getAudioContext();
            const source = ctx.createMediaStreamSource(stream);
            microphoneRef.current = source;

            // ScriptProcessor (Deprecated but reliably lowest latency for manual PCM)
            // Buffer size 4096 @ 44.1k = ~92ms
            const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                if (!socket.connected || isMicMuted) return;

                const inputData = e.inputBuffer.getChannelData(0);

                // 1. Resample to 16kHz to save bandwidth
                const downsampled = resample(inputData, ctx.sampleRate, SAMPLE_RATE);

                // 2. Convert to PCM16
                const pcmData = floatTo16BitPCM(downsampled);

                // 3. Send
                socket.emit("voice_data", { room, data: pcmData });

                // Self Visualizer (Volume Check)
                let sum = 0;
                for (let i = 0; i < inputData.length; i += 10) sum += Math.abs(inputData[i]);
                const avg = sum / (inputData.length / 10);
                if (avg > 0.05) updateActiveSpeaker("me");
            };

            // Chain: Mic -> Processor -> Destination (to keep it alive, but mute output to avoid feedback)
            // Wait, processor -> destination will play yourself?
            // "If the input buffer is not connected to any output, the audiocallback will not be called."
            // We connect to destination but we set volume to 0? Or just don't handle output buffer.
            source.connect(processor);
            processor.connect(ctx.destination);
            // WARNING: connecting to destination might cause self-echo if we copy input to output.
            // By default `onaudioprocess` outputBuffer is silent? No, we must ensure we don't copy input to output.
            // We are NOT copying inputData to e.outputBuffer. So it should be silent.

        } catch (err) {
            console.error(err);
            alert("Mic Access Denied");
        }
    };

    // --- Leave Voice ---
    const leaveVoice = () => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current.onaudioprocess = null;
        }
        if (microphoneRef.current) microphoneRef.current.disconnect();
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

        // Don't close context, reuse it.

        socket.emit("leave_voice", room);

        setIsVoiceJoined(false);
        setIsMicMuted(true);
        setActiveSpeakers(new Set());
        setRemotePeerStatus({});
        nextPlayTimeRef.current = 0;
    };

    // --- Receive Audio ---
    const handleReceiveVoiceData = async ({ senderId, data }) => {
        if (isSpeakerMuted || !isVoiceJoined) return;

        const ctx = getAudioContext();

        // 1. Decode Int16 -> Float32
        const floatData = pcm16ToFloat(data); // These are 16kHz samples

        // 2. Playback
        // Create a buffer at 16kHz
        const buffer = ctx.createBuffer(1, floatData.length, SAMPLE_RATE);
        buffer.copyToChannel(floatData, 0);

        // 3. Schedule
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(ctx.destination);

        // Time Sync
        const now = ctx.currentTime;
        if (nextPlayTimeRef.current < now) {
            nextPlayTimeRef.current = now + 0.05; // 50ms buffer
        }

        node.start(nextPlayTimeRef.current);
        nextPlayTimeRef.current += buffer.duration;

        // Visualizer
        let sum = 0;
        for (let i = 0; i < floatData.length; i += 10) sum += Math.abs(floatData[i]);
        const avg = sum / (floatData.length / 10);
        if (avg > 0.05) updateActiveSpeaker(senderId);
    };

    // --- Active Speaker Helper ---
    const updateActiveSpeaker = (id) => {
        setActiveSpeakers(prev => new Set(prev).add(id));
        if (activeSpeakersTimeoutRef.current[id]) clearTimeout(activeSpeakersTimeoutRef.current[id]);
        activeSpeakersTimeoutRef.current[id] = setTimeout(() => {
            setActiveSpeakers(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }, 300); // Highlight lasts 300ms
    };

    // --- Socket Listeners ---
    useEffect(() => {
        if (!isVoiceJoined) return;

        socket.on("receive_voice_data", handleReceiveVoiceData);

        socket.on("all_voice_users", (users) => {
            setRemotePeerStatus(prev => {
                const next = { ...prev };
                users.forEach(id => { if (!next[id]) next[id] = { isMicMuted: true }; });
                return next;
            });
        });

        socket.on("voice_status_update", ({ id, status }) => {
            setRemotePeerStatus(prev => ({ ...prev, [id]: status }));
        });

        socket.on("user_left_voice", (id) => {
            setActiveSpeakers(prev => { const n = new Set(prev); n.delete(id); return n; });
            setRemotePeerStatus(prev => { const n = new Set(prev); delete n[id]; return n; });
        });

        return () => {
            socket.off("receive_voice_data", handleReceiveVoiceData);
            socket.off("all_voice_users");
            socket.off("voice_status_update");
            socket.off("user_left_voice");
        };
    }, [isVoiceJoined, isSpeakerMuted]);

    // --- Controls ---
    const toggleMic = () => {
        // IMPORTANT: In this PCM logic, we toggle 'isMicMuted' state mainly.
        // 'onaudioprocess' checks this state.
        // We do not need to enable/disable tracks because the ScriptProcessor is always running.
        // Disabling tracks might stop the onaudioprocess callback in some browsers.
        // So we just gate the data sending.

        const newState = !isMicMuted;
        setIsMicMuted(newState);
        socket.emit("voice_status_update", { room, status: { isMicMuted: newState } });

        getAudioContext(); // Ensure awake
    };

    const toggleSpeaker = () => {
        setIsSpeakerMuted(!isSpeakerMuted);
        getAudioContext();
    };

    // Auto cleanup
    useEffect(() => () => leaveVoice(), []);
    useEffect(() => { if (!isRoomJoined) leaveVoice(); }, [isRoomJoined]);

    // --- UI Render ---
    if (!isRoomJoined) return null;

    const SPRING_TRANSITION = { type: "spring", stiffness: 5000, damping: 300 };

    return (
        <div className="fixed bottom-4 left-4 z-[9000] flex flex-col gap-2">
            <AnimatePresence mode="wait">
                {isVoiceJoined && (
                    isMinimized ? (
                        <motion.button key="min" layoutId="voice-panel" onClick={() => setIsMinimized(false)}
                            className="p-3 rounded-full shadow-lg border-2 backdrop-blur-md flex items-center justify-center bg-black/50 border-green-500/50">
                            {isMicMuted ? <MicOff size={24} className="text-red-400" /> : <Mic size={24} className="text-green-400" />}
                        </motion.button>
                    ) : (
                        <motion.div key="exp" layoutId="voice-panel" className="bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl w-64">
                            <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
                                <span className="font-bold text-xs uppercase tracking-wider text-green-400 flex items-center gap-2">
                                    <Radio size={12} className="animate-pulse" /> Voice (PCM)
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
                                        <div className={`w-2 h-2 rounded-full transition-all duration-100 ${activeSpeakers.has("me") ? 'bg-green-400 scale-125 shadow-[0_0_8px_#4ade80]' : 'bg-gray-600'}`} />
                                        <span className="text-xs font-bold text-gray-300">You</span>
                                    </div>
                                    {isMicMuted ? <MicOff size={14} className="text-red-400" /> : <Mic size={14} className="text-gray-400" />}
                                </div>
                                {/* Others */}
                                {Object.keys(remotePeerStatus).map((id, i) => (
                                    <div key={id} className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full transition-all duration-100 ${activeSpeakers.has(id) ? 'bg-blue-400 scale-125 shadow-[0_0_8px_#3b82f6]' : 'bg-blue-900'}`} />
                                            <span className="text-xs font-bold text-gray-400">Player {i + 1}</span>
                                        </div>
                                        {remotePeerStatus[id]?.isMicMuted ? <MicOff size={14} className="text-red-500/50" /> : <Mic size={14} className="text-green-500/50" />}
                                    </div>
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
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={joinVoice}
                    className="bg-green-600/90 text-white p-3 rounded-full shadow-lg border-2 border-green-400/30 backdrop-blur-sm flex items-center justify-center">
                    <Phone size={24} />
                    <span className="sr-only">Join Voice</span>
                </motion.button>
            )}
        </div>
    );
};

export default VoiceChat;
