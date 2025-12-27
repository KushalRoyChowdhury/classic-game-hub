import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid3X3, TrendingUp, Circle, MoreVertical, Settings, Save, RotateCcw, X, Server } from 'lucide-react'
import CustomCursor from './components/CustomCursor'
import TicTacToe from './components/TicTacToe'
import SnakeAndLadders from './components/SnakeAndLadders'
import Ludo from './components/Ludo'

function App() {
    const [activeGame, setActiveGame] = useState(() => {
        return localStorage.getItem('activeGame') || 'tictactoe';
    });

    useEffect(() => {
        localStorage.setItem('activeGame', activeGame);
    }, [activeGame]);

    const [showSettings, setShowSettings] = useState(false);
    const [customServerUrl, setCustomServerUrl] = useState(() => {
        return localStorage.getItem('custom_server_url') || '';
    });

    const handleSaveSettings = () => {
        if (customServerUrl.trim()) {
            localStorage.setItem('custom_server_url', customServerUrl.trim());
        } else {
            localStorage.removeItem('custom_server_url');
        }
        window.location.reload();
    };

    const handleResetSettings = () => {
        localStorage.removeItem('custom_server_url');
        setCustomServerUrl('');
        window.location.reload();
    };

    return (
        <div className="min-h-screen select-none bg-[#0a0a0a] text-white selection:bg-cyan-500/30 font-sans overflow-x-hidden relative cursor-none flex flex-col">
            <CustomCursor />
            {/* Ambient Light */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none" />

            {/* Global Navigation */}
            <header className="relative w-full p-4 sticky top-0 backdrop-blur-sm z-[9998]">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">

                    {/* Logo Section */}
                    <div className="flex items-center gap-3 select-none">
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000"></div>
                            <img src="/game-logo.png" alt="Logo" className="relative w-12 h-12 rounded-lg object-cover shadow-2xl border border-white/10" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">GAME HUB</span>
                            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-medium">Classic Arcade</span>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex gap-2 p-1.5 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md overflow-x-auto max-w-full shadow-2xl">
                        <button
                            onClick={() => setActiveGame('tictactoe')}
                            className={`relative px-4 sm:px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 whitespace-nowrap ${activeGame === 'tictactoe' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <Grid3X3 size={18} />
                            Tic Tac Toe
                        </button>
                        <button
                            onClick={() => setActiveGame('snakeladder')}
                            className={`relative px-4 sm:px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 whitespace-nowrap ${activeGame === 'snakeladder' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <TrendingUp size={18} />
                            Snake & Ladder
                        </button>
                        <button
                            onClick={() => setActiveGame('ludo')}
                            className={`relative px-4 sm:px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 whitespace-nowrap ${activeGame === 'ludo' ? 'bg-white text-black shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                            <Circle size={18} />
                            Ludo
                        </button>
                        <div className="w-px bg-white/10 mx-1" />
                        <button
                            onClick={() => setShowSettings(true)}
                            className="relative px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-300"
                        >
                            <MoreVertical size={18} />
                        </button>
                    </nav>

                    {/* Spacer for Balance (Desktop) */}
                    <div className="hidden md:block w-[140px]"></div>
                </div>
            </header>

            <main className="relative z-10 flex-1 container mx-auto px-4 py-8 flex flex-col items-center justify-center min-h-[850px]">
                <AnimatePresence mode="wait">
                    {activeGame === 'tictactoe' ? (
                        <motion.div
                            key="tictactoe"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="w-full"
                        >
                            <TicTacToe />
                        </motion.div>
                    ) : activeGame === 'snakeladder' ? (
                        <motion.div
                            key="snakeladder"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="w-full"
                        >
                            <SnakeAndLadders />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="ludo"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="w-full"
                        >
                            <Ludo />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* Settings Modal */}
            <AnimatePresence>
                {showSettings && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSettings(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-2xl z-[10000]"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Settings className="text-cyan-400" size={24} />
                                    Server Settings
                                </h2>
                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X size={20} className="text-gray-400" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-gray-400 flex items-center gap-2">
                                        <Server size={14} />
                                        Custom Server URL
                                    </label>
                                    <input
                                        type="text"
                                        value={customServerUrl}
                                        onChange={(e) => setCustomServerUrl(e.target.value)}
                                        placeholder="e.g., http://192.168.1.5:3001"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                    />
                                    <p className="text-xs text-gray-500">
                                        Leave empty to use the default server.
                                    </p>
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        onClick={handleResetSettings}
                                        className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition-colors flex items-center gap-2"
                                    >
                                        <RotateCcw size={16} />
                                        Reset Default
                                    </button>
                                    <button
                                        onClick={handleSaveSettings}
                                        className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        <Save size={16} />
                                        Save & Reload
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div >
    )
}

export default App
