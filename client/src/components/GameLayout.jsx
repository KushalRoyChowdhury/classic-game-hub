import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const GameLayout = ({ title, children }) => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex flex-col relative z-10">
            {/* Header */}
            <header className="p-4 flex items-center gap-4 max-w-7xl mx-auto w-full sticky top-0 backdrop-blur-sm z-[50]">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white transition-all hover:-translate-x-1"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400">
                        {title}
                    </h1>
                </div>
            </header>

            {/* Game Content */}
            <main className="flex-1 container mx-auto px-4 py-4 flex flex-col items-center justify-center min-h-[600px]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full"
                >
                    {children}
                </motion.div>
            </main>
        </div>
    );
};

export default GameLayout;
