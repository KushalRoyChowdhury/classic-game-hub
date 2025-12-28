import React, { Suspense, lazy } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings, X, Server, RotateCcw, Save, User, Volume2, VolumeX } from 'lucide-react';
import useGameStore from './store/gameStore';

// Global Components
import CustomCursor from './components/CustomCursor';
import Home from './components/Home';
import GameLayout from './components/GameLayout';

// Lazy Loaded Games
const TicTacToe = lazy(() => import('./components/TicTacToe'));
const SnakeAndLadders = lazy(() => import('./components/SnakeAndLadders'));
const Ludo = lazy(() => import('./components/Ludo'));

function App() {
    const location = useLocation();
    const {
        showSettings,
        toggleSettings,
        customServerUrl,
        setCustomServerUrl,
        userName,
        setUserName,
        soundEnabled,
        setSoundEnabled
    } = useGameStore();

    // Settings Handlers
    const handleSaveSettings = () => {
        window.location.reload();
    };

    const handleResetSettings = () => {
        setCustomServerUrl('');
        window.location.reload();
    };

    // Loading State
    const PageLoader = () => (
        <div className="flex items-center justify-center min-h-[50vh]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-gray-400 text-sm animate-pulse">Loading Game...</span>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen select-none bg-[#0a0a0a] text-white selection:bg-cyan-500/30 font-sans overflow-x-hidden relative cursor-none flex flex-col">
            <CustomCursor />

            {/* Ambient Light (Global) */}
            <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none z-0" />
            <div className="fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px] pointer-events-none z-0" />

            {/* Routes */}
            <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>
                    <Route path="/" element={<Home />} />

                    <Route path="/tictactoe" element={
                        <GameLayout title="Tic Tac Toe">
                            <Suspense fallback={<PageLoader />}>
                                <TicTacToe />
                            </Suspense>
                        </GameLayout>
                    } />

                    <Route path="/snakeladder" element={
                        <GameLayout title="Snake & Ladders">
                            <Suspense fallback={<PageLoader />}>
                                <SnakeAndLadders />
                            </Suspense>
                        </GameLayout>
                    } />

                    <Route path="/ludo" element={
                        <GameLayout title="Ludo">
                            <Suspense fallback={<PageLoader />}>
                                <Ludo />
                            </Suspense>
                        </GameLayout>
                    } />
                </Routes>
            </AnimatePresence>

            {/* Global Voice Chat? Or per game? 
                If voice is only relevant in "Rooms", and games handle joining Rooms,
                maybe we mount VoiceChat inside games? 
                Or we keep it global if the user joins a "Lobby".
                Currently TicTacToe etc. manage connection. 
                But let's mount it, assuming it only activates when 'joined'.
                Actually, the VoiceChat component takes props.
                We might need to refactor VoiceChat usage if we want it global.
                For now, let's assume games render VoiceChat themselves (as they did before).
            */}

            {/* Settings Modal (Global) */}
            <AnimatePresence>
                {showSettings && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => toggleSettings(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full md:max-w-md max-w-[95vw] bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 shadow-2xl z-[10000]"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Settings className="text-cyan-400" size={24} />
                                    Settings
                                </h2>
                                <button
                                    onClick={() => toggleSettings(false)}
                                    className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X size={20} className="text-gray-400" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm text-center text-gray-400 flex items-center gap-2">
                                        <User size={14} />
                                        Your Name
                                    </label>
                                    <input
                                        type="text"
                                        value={userName}
                                        onChange={(e) => setUserName(e.target.value)}
                                        placeholder="Player Name"
                                        maxLength={15}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all font-bold tracking-wide"
                                    />
                                </div>
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

                                <div className="flex flex-col md:flex-row gap-3 pt-4">
                                    <button
                                        onClick={handleResetSettings}
                                        className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition-colors flex items-center justify-center gap-2"
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
        </div>
    );
}

export default App;
