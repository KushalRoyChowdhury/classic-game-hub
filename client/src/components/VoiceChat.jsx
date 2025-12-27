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

    // --- Actions ---
    const joinVoice = async () => {
        if (!room) return;
        try {
            console.log("[VoiceChat] Getting User Media...");
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
                console.log('[VoiceChat] My peer ID is: ' + id);
                myPeerId.current = id;
                // Announce to room via Socket
                socket.emit('voice_peer_join', { room, peerId: id });
                socket.emit("voice_status_update", { room, status: { isMicMuted: true } });
            });

            // Handle Incoming Calls
            peer.on('call', (call) => {
                console.log("[VoiceChat] Incoming call from:", call.peer);
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
        console.log("[VoiceChat] Calling new user:", remotePeerId);

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

        console.log("[VoiceChat] Adding audio for:", id);

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
        console.log("[VoiceChat] Removing audio for:", id);
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
            console.log("[VoiceChat] Existing peers:", peersList);
            peersList.forEach(p => {
                if (p.peerId !== myPeerId.current) {
                    connectToNewUser(null, p.peerId);
                }
            });
        });

        // When SOMEONE ELSE joins
        socket.on('user_joined_voice_peer', ({ peerId }) => {
            console.log("[VoiceChat] User joined with PeerJS ID:", peerId);
            // Depending on mesh strategy. Mesh = everyone calls everyone.
            // If new user calls us, we wait. If we call them, we do it here.
            // PeerJS best practice: Newcomer calls existing users? 
            // Or Existing users call newcomer?
            // Sending 'all_voice_peers' to newcomer is easier, so newcomer calls everyone.
            // See server implementation below. Assuming new user calls us.
            // Actually, wait for 'call' event is better for existing users.
            // BUT, if we want to show them in UI before they call?
            setRemotePeerStatus(prev => ({ ...prev, [peerId]: { isMicMuted: true } }));
        });

        socket.on('user_left_voice_peer', ({ peerId }) => {
            removeRemoteAudio(peerId);
        });

        socket.on("voice_status_update", ({ peerId, status }) => {
            // We need to map socket ID to Peer ID? 
            // Or just use PeerID everywhere for voice.
            // Let's assume status update sends peerId now.
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

    // --- Render ---
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
                                    <Radio size={12} className="animate-pulse" /> PeerJS Voice
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
                                        <div className={`w-2 h-2 rounded-full bg-green-500 ${!isMicMuted ? 'shadow-[0_0_8px_green]' : 'opacity-50'}`} />
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
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={joinVoice}
                    className="bg-green-600/90 text-white p-3 rounded-full shadow-lg border-2 border-green-400/30 backdrop-blur-sm flex items-center justify-center">
                    <Phone size={24} />
                    <span className="sr-only">Join PeerJS</span>
                </motion.button>
            )}
        </div>
    );
};

// Helper to handle audio stream for a remote peer
const RemotePeer = ({ peerId, status, isSpeakerMuted, peerInstance }) => {
    const audioRef = useRef(null);
    // We need to access the stream for this peer key. 
    // In PeerJS, we get the stream in the 'call' event.
    // Since we can't easily pass the stream object via props (managed in callbacks), 
    // we use a trick: save streams in a global or context?
    // OR, better: We don't render RemotePeer based on status keys alone.
    // We render based on "Calls". 
    // But we need to combine Status + Audio.
    // Let's fix this: The parent has the 'call' objects. We can store calls in state instead of refs.

    // TEMPORARY FIX: We won't render separate audio components for now, 
    // we let the main component handle audio attachment via 'addRemoteAudio' logic (hidden audio elements).
    // This component is only for Visuals.

    return (
        <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5">
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-bold text-gray-400">Player {peerId.substr(0, 4)}</span>
            </div>
            {status?.isMicMuted ? <MicOff size={14} className="text-red-500/50" /> : <Mic size={14} className="text-green-500/50" />}
            {/* Hidden Audio */}
            <PeerAudio peerId={peerId} isMuted={isSpeakerMuted} />
        </div>
    );
};

// This component finds the stream from the window/global calls cache? 
// No, that's messy.
// Let's rewrite the "addRemoteAudio" to actually mount this component properly.
// Correct PeerJS React pattern:
// 1. "calls" state = [{ peerId, stream }]
// 2. Render <Audio args /> for each call.
// 3. Render <PeerStatus /> for each peerId in socket list.

const PeerAudio = ({ peerId, isMuted }) => {
    const ref = useRef(null);
    useEffect(() => {
        // Find the stream in the parent's refs? 
        // This is getting complex for a single file. 
        // We will attach the stream in the main 'call.on(stream)' handler using standard DOM.
        // So this component does nothing but maybe visualizer later.

        // Actually, let's find the audio element we appended to body?
        const el = document.getElementById(`audio-${peerId}`);
        if (el) {
            el.muted = isMuted;
        }
    }, [isMuted, peerId]);
    return null;
};

export default VoiceChat;
