
const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

class TicTacToe {
    constructor() {
        this.squares = Array(9).fill(null);
        this.xIsNext = true;
        this.winner = null;
        this.isDraw = false;
        this.seats = [null, null]; // [PlayerX_SocketId, PlayerO_SocketId]
        this.playerNames = [null, null]; // [PlayerX_Name, PlayerO_Name]
    }

    addPlayer(socketId, name = null) {
        // Idempotency: If this socket is already in a seat, return valid index
        const existingIndex = this.seats.indexOf(socketId);
        if (existingIndex !== -1) {
            // Update name if reconnecting or just in case
            if (name) this.playerNames[existingIndex] = name;
            return existingIndex;
        }

        // If room is empty (all null), ensure clean state
        if (this.seats.every(s => s === null)) {
            this.reset();
        }

        const seatIndex = this.seats.indexOf(null);
        if (seatIndex === -1) return -1; // Full
        this.seats[seatIndex] = socketId;
        this.playerNames[seatIndex] = name || `Player ${seatIndex === 0 ? 'X' : 'O'}`;
        return seatIndex; // 0 or 1
    }

    removePlayer(socketId) {
        const index = this.seats.indexOf(socketId);
        if (index !== -1) {
            this.seats[index] = null;
            this.playerNames[index] = null;
            // Last Man Standing Win
            // If game is in progress (no winner, not disabled), declare other player winner
            if (!this.winner && !this.isDraw) {
                const otherPlayerIndex = index === 0 ? 1 : 0;
                // Only declare if other player is actually there
                if (this.seats[otherPlayerIndex]) {
                    this.winner = otherPlayerIndex === 0 ? 'X' : 'O';
                    this.winningMethod = 'abandonment'; // Optional metadata
                }
            }
        }
    }

    handleMove(socketId, { index }) {
        const playerIndex = this.seats.indexOf(socketId);
        if (playerIndex === -1) return { valid: false, error: "Not a player" };

        // Turn Validation
        const isPlayerX = playerIndex === 0;
        if (isPlayerX !== this.xIsNext) return { valid: false, error: "Not your turn" };
        if (this.winner || this.isDraw) return { valid: false, error: "Game over" };
        if (this.squares[index]) return { valid: false, error: "Square taken" };

        // Execution
        this.squares[index] = isPlayerX ? 'X' : 'O';
        this.xIsNext = !this.xIsNext;

        this.checkWin();

        return { valid: true, state: this.getState() };
    }

    checkWin() {
        for (let line of WINNING_LINES) {
            const [a, b, c] = line;
            if (this.squares[a] && this.squares[a] === this.squares[b] && this.squares[a] === this.squares[c]) {
                this.winner = this.squares[a];
                return;
            }
        }
        if (!this.squares.includes(null)) {
            this.isDraw = true;
        }
    }

    reset() {
        this.squares = Array(9).fill(null);
        this.xIsNext = true;
        this.winner = null;
        this.isDraw = false;
        // Keep seats and names
        return this.getState();
    }

    getState() {
        return {
            gameType: 'tictactoe',
            squares: this.squares,
            xIsNext: this.xIsNext,
            winner: this.winner,
            isDraw: this.isDraw,
            seats: this.seats,
            playerNames: this.playerNames
        };
    }
}

module.exports = TicTacToe;
