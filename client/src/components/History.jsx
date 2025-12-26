import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Trophy, Calendar, CircleUser, Hash } from 'lucide-react';

const History = ({ history, onClearHistory }) => {
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [history]);

    return (
        <div className="flex w-full flex-col rounded-2xl bg-black/40 border border-white/5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 p-6 bg-white/5">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Trophy className="h-5 w-5 text-purple-400" />
                    </div>
                    <h2 className="text-xl font-bold text-white tracking-wide">Match History</h2>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-500 bg-white/5 px-2 py-1 rounded-md border border-white/5">
                        {history.length} Games
                    </span>
                    <button
                        onClick={onClearHistory}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
                        title="Clear History"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </button>
                </div>
            </div>

            <div className="p-4 space-y-3">
                <AnimatePresence initial={false}>
                    {history.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex h-40 flex-col items-center justify-center text-gray-500"
                        >
                            <Hash className="h-10 w-10 mb-2 opacity-20" />
                            <p className="text-sm">No games played yet</p>
                        </motion.div>
                    ) : (
                        history.map((game, index) => (
                            <motion.div
                                key={game.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="group relative flex flex-col justify-between gap-3 overflow-hidden rounded-xl border border-white/5 bg-white/5 p-4 transition-all hover:border-white/10 hover:bg-white/10"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono text-gray-500">#{history.length - index}</span>
                                        <div className="h-1.5 w-1.5 rounded-full bg-gray-500/50" />
                                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                            <Calendar className="h-3 w-3" />
                                            {new Date(game.date).toLocaleDateString()}
                                            <span className="opacity-50 mx-1">|</span>
                                            {new Date(game.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {game.winner === 'X' && (
                                            <div className="flex items-center gap-2 text-cyan-400">
                                                <span className="text-sm font-bold">X Won</span>
                                            </div>
                                        )}
                                        {game.winner === 'O' && (
                                            <div className="flex items-center gap-2 text-fuchsia-400">
                                                <span className="text-sm font-bold">O Won</span>
                                            </div>
                                        )}
                                        {game.winner === 'Draw' && (
                                            <div className="flex items-center gap-2 text-gray-400">
                                                <span className="text-sm font-bold">Draw</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-xs text-gray-500 font-mono bg-black/20 px-2 py-1 rounded">
                                        {game.moveCount} moves
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default History;
