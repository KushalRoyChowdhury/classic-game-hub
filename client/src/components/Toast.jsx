import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { X, Check, Info, AlertCircle } from 'lucide-react';

const Toast = ({ messages, removeToast }) => {
    return (
        <div className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {messages.map((msg) => (
                    <motion.div
                        key={msg.id}
                        layout
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.9 }}
                        className="pointer-events-auto bg-[#1a1a1a]/90 backdrop-blur-md border border-white/10 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 min-w-[200px]"
                    >
                        {msg.type === 'success' && <Check size={18} className="text-green-400" />}
                        {msg.type === 'error' && <X size={18} className="text-red-400" />}
                        {msg.type === 'info' && <Info size={18} className="text-blue-400" />}
                        {msg.type === 'warning' && <AlertCircle size={18} className="text-yellow-400" />}

                        <div className="flex flex-col">
                            <span className="text-sm font-bold">{msg.title}</span>
                            {msg.text && <span className="text-xs text-gray-400">{msg.text}</span>}
                        </div>

                        <button
                            onClick={() => removeToast(msg.id)}
                            className="ml-auto text-gray-500 hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export const useToast = () => {
    const [toasts, setToasts] = useState([]);

    const addToast = (title, text = "", type = "info", duration = 3000) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { id, title, text, type };

        setToasts((prev) => [...prev, newToast]);

        if (duration) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    };

    const removeToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return { toasts, addToast, removeToast };
};

export default Toast;
