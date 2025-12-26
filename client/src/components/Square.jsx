import { motion } from 'framer-motion';
import { cn } from '../utils/cn';

const Square = ({ value, onClick, isWinningSquare, disabled }) => {
    return (
        <motion.button
            whileHover={!disabled ? { scale: 1.05, backgroundColor: "rgba(255,255,255,0.05)" } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
            className={cn(
                "relative flex h-20 w-20 sm:h-24 sm:w-24 md:h-32 md:w-32 items-center justify-center rounded-xl text-4xl font-black shadow-inner backdrop-blur-sm transition-colors",
                "bg-white/5 border-2 border-white/10",
                isWinningSquare && "bg-green-500/20 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.3)]",
                !value && !disabled && "cursor-pointer hover:border-white/30",
                (value || disabled) && "cursor-default"
            )}
            onClick={onClick}
            disabled={disabled}
        >
            {value === 'X' && (
                <motion.div
                    initial={{ scale: 0.5, opacity: 0, rotate: -45 }}
                    animate={{ scale: 1, opacity: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="bg-gradient-to-br from-cyan-400 to-blue-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                >
                    X
                </motion.div>
            )}
            {value === 'O' && (
                <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="bg-gradient-to-br from-fuchsia-400 to-pink-600 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(232,121,249,0.5)]"
                >
                    O
                </motion.div>
            )}
        </motion.button>
    );
};

export default Square;
