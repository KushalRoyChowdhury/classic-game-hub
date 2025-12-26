import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WifiOff, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import socket from '../socket';

const ConnectionStatus = () => {
    const [isConnected, setIsConnected] = useState(socket.connected);
    const [isReconnecting, setIsReconnecting] = useState(false);

    useEffect(() => {
        const onConnect = () => {
            setIsConnected(true);
            setIsReconnecting(false);
        };

        const onDisconnect = () => {
            setIsConnected(false);
        };

        const onReconnectAttempt = () => {
            setIsReconnecting(true);
        }

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.io.on("reconnect_attempt", onReconnectAttempt);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.io.off("reconnect_attempt", onReconnectAttempt);
        };
    }, []);

    return createPortal(
        <AnimatePresence>
            {!isConnected && (
                <motion.div
                    initial={{ y: -50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    className="fixed top-4 left-0 right-0 z-[9999] flex justify-center pointer-events-none"
                >
                    <div className="bg-red-500/90 backdrop-blur-md text-white px-4 py-2 rounded-full shadow-[0_0_20px_rgba(239,68,68,0.5)] flex items-center gap-3 text-sm font-bold pointer-events-auto border border-red-400/50">
                        {isReconnecting ? (
                            <>
                                <Loader2 className="animate-spin w-4 h-4" />
                                <span>Reconnecting...</span>
                            </>
                        ) : (
                            <>
                                <WifiOff className="w-4 h-4" />
                                <span>Disconnected</span>
                            </>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

export default ConnectionStatus;
