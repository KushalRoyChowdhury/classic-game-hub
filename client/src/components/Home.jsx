import React from 'react';
import { motion } from 'framer-motion';
import { Grid3X3, TrendingUp, Circle, Settings, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useGameStore from '../store/gameStore';

const Home = () => {
    const navigate = useNavigate();
    const toggleSettings = useGameStore((state) => state.toggleSettings);

    const GAMES = [
        {
            id: 'tictactoe',
            title: 'Tic Tac Toe',
            icon: Grid3X3,
            path: '/tictactoe',
            color: 'from-cyan-500 to-blue-600',
            desc: 'The classic game of X and O'
        },
        {
            id: 'snakeladder',
            title: 'Snake & Ladder',
            icon: TrendingUp,
            path: '/snakeladder',
            color: 'from-green-500 to-emerald-600',
            desc: 'Climb the ladders, avoid the snakes'
        },
        {
            id: 'ludo',
            title: 'Ludo',
            icon: Circle,
            path: '/ludo',
            color: 'from-purple-500 to-pink-600',
            desc: 'Race your tokens to the finish'
        }
    ];

    return (
        <div className="min-h-screen flex flex-col relative z-10">
            {/* Header */}
            <header className="p-6 fixed top-0 left-0 right-0 z-50 flex justify-between items-center max-w-7xl mx-auto w-full backdrop-blur-xl bg-[#0a0a0a]/10 border-b border-white/5 shadow-sm">
                <div className="flex items-center gap-3 select-none">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-fuchsia-600 rounded-lg blur opacity-25 group-hover:opacity-75 transition duration-1000"></div>
                        <motion.img
                            src="/game-logo.png"
                            alt="Logo"
                            animate={{
                                x: [0, -2, 2, -1, 3, 0],
                                filter: [
                                    "hue-rotate(0deg) brightness(1)",
                                    "hue-rotate(0deg) brightness(1)",
                                    "hue-rotate(90deg) brightness(1.3)",
                                    "hue-rotate(-90deg) brightness(1.3)",
                                    "hue-rotate(0deg) brightness(1)",
                                    "hue-rotate(0deg) brightness(1)",
                                ]
                            }}
                            transition={{
                                duration: 0.3,
                                repeat: Infinity,
                                repeatDelay: 4,
                                times: [0, 0.1, 0.2, 0.3, 0.4, 1]
                            }}
                            className="relative w-12 h-12 rounded-lg object-cover shadow-2xl border border-white/10 z-10"
                        />
                    </div>
                    <div className="flex flex-col">
                        <span
                            className="font-bold text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-fuchsia-400"
                            style={{
                                animation: 'glitch-color 4s infinite linear alternate-reverse, glitch-skew 5s infinite linear alternate-reverse'
                            }}
                        >
                            GAME HUB
                        </span>
                        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Classic Arcade</span>
                    </div>
                </div>
                <button
                    onClick={() => toggleSettings(true)}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:scale-105 transition-all active:scale-95 group"
                >
                    <Settings className="text-gray-400 group-hover:text-cyan-400 transition-colors" size={20} />
                </button>
            </header>

            {/* Main Content */}
            <main className="flex-1 container mx-auto px-4 flex flex-col items-center justify-center pt-24 mt-6 md:pt-0 md:-mt-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl"
                >
                    {GAMES.map((game, index) => (
                        <motion.div
                            key={game.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            whileHover={{ y: -5, scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => navigate(game.path)}
                            className="relative group cursor-pointer"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${game.color} rounded-3xl blur-[20px] opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
                            <div className="relative h-full bg-[#1a1a1a]/80 backdrop-blur-xl border border-white/10 p-8 rounded-3xl overflow-hidden flex flex-col gap-4 group-hover:border-white/20 transition-all">
                                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${game.color} flex items-center justify-center shadow-lg`}>
                                    <game.icon size={28} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-white mb-1">{game.title}</h3>
                                    <p className="text-sm text-gray-400">{game.desc}</p>
                                </div>
                                <div className="mt-auto pt-4 flex items-center gap-2 text-sm font-bold text-gray-500 group-hover:text-white transition-colors">
                                    PLAY NOW <Play size={12} className="fill-current" />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="m-12 text-center"
                >
                    <p className="text-gray-600 text-sm uppercase tracking-widest font-medium">More games coming soon</p>
                </motion.div>
            </main>
        </div>
    );
};

export default Home;
