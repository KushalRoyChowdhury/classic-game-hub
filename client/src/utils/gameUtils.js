export const checkWinner = (squares) => {
    const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
    ];

    for (let i = 0; i < lines.length; i++) {
        const [a, b, c] = lines[i];
        if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            return { winner: squares[a], line: lines[i] };
        }
    }

    return null;
};

// ... existing code ...
export const filterHistory = (history, limit = 100) => {
    const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let filtered = history.filter(game => {
        return (now - new Date(game.date).getTime()) < ONE_MONTH_MS;
    });

    // Keep only the most recent entries up to the limit
    if (filtered.length > limit) {
        filtered = filtered.slice(0, limit);
    }

    return filtered;
};

export const getRandomMove = (squares) => {
    const availableMoves = squares.map((sq, i) => sq === null ? i : null).filter(i => i !== null);
    if (availableMoves.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * availableMoves.length);
    return availableMoves[randomIndex];
};

export const getBestMove = (squares, player) => {
    const opponent = player === 'X' ? 'O' : 'X';

    // Minimax algorithm
    const minimax = (board, depth, isMaximizing) => {
        const result = checkWinner(board);
        if (result?.winner === player) return 10 - depth;
        if (result?.winner === opponent) return depth - 10;
        if (board.every(Boolean)) return 0;

        if (isMaximizing) {
            let bestScore = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (!board[i]) {
                    board[i] = player;
                    const score = minimax(board, depth + 1, false);
                    board[i] = null;
                    bestScore = Math.max(score, bestScore);
                }
            }
            return bestScore;
        } else {
            let bestScore = Infinity;
            for (let i = 0; i < 9; i++) {
                if (!board[i]) {
                    board[i] = opponent;
                    const score = minimax(board, depth + 1, true);
                    board[i] = null;
                    bestScore = Math.min(score, bestScore);
                }
            }
            return bestScore;
        }
    };

    let bestScore = -Infinity;
    let move = null;
    const availableMoves = squares.map((sq, i) => sq === null ? i : null).filter(i => i !== null);

    // If it's the first move, take center or random corner to save computation time
    if (availableMoves.length === 9) return 4;
    if (availableMoves.length === 8 && squares[4] === null) return 4;

    for (let i = 0; i < 9; i++) {
        if (!squares[i]) {
            squares[i] = player;
            const score = minimax(squares, 0, false);
            squares[i] = null;
            if (score > bestScore) {
                bestScore = score;
                move = i;
            }
        }
    }
    return move;
};
