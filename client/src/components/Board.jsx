import { motion } from 'framer-motion';
import Square from './Square';

const Board = ({ xIsNext, squares, onPlay, winningLine, isLocked }) => {
    const handleClick = (i) => {
        if (squares[i] || winningLine || isLocked) return;
        const nextSquares = squares.slice();
        nextSquares[i] = xIsNext ? 'X' : 'O';
        onPlay(nextSquares);
    };

    return (
        <div className={`relative grid grid-cols-3 gap-3 p-4 bg-black/20 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-md transition-opacity duration-300 ${isLocked ? 'opacity-80 pointer-events-none' : ''}`}>
            {squares.map((square, i) => (
                <Square
                    key={i}
                    value={square}
                    onClick={() => handleClick(i)}
                    isWinningSquare={winningLine?.includes(i)}
                    disabled={!!square || !!winningLine || isLocked}
                />
            ))}

            {/* Decorative background glow */}
            <div className="absolute -inset-4 -z-10 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 blur-3xl rounded-[3rem]" />
        </div>
    );
};

export default Board;
