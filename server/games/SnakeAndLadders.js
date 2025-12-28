
const BOARD_PRESETS = [
    {
        id: 1,
        snakes: { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 },
        ladders: { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84 }
    },
    {
        id: 2,
        snakes: { 99: 5, 95: 25, 92: 72, 88: 68, 85: 45, 75: 35, 65: 25, 40: 10, 30: 5, 20: 2 },
        ladders: { 3: 20, 15: 35, 45: 65, 60: 80, 70: 95 }
    },
    {
        id: 3,
        snakes: { 98: 10, 94: 64, 84: 54, 74: 24, 64: 34, 54: 14, 44: 4, 34: 2, 24: 1, 14: 2 },
        ladders: { 2: 22, 12: 50, 22: 60, 50: 80, 70: 98 }
    },
    {
        id: 4,
        snakes: { 35: 5, 38: 12, 45: 20, 48: 22, 55: 30, 58: 32, 65: 40, 68: 42, 85: 60, 95: 70 },
        ladders: { 5: 25, 15: 40, 40: 70, 60: 85, 80: 99 }
    },
    {
        id: 5,
        snakes: { 17: 7, 54: 34, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 79, 32: 10, 29: 9 },
        ladders: { 4: 14, 9: 31, 20: 38, 51: 67, 80: 99 }
    }
];

class SnakeAndLadders {
    constructor(maxPlayers = 2, boardId = null) {
        this.maxPlayers = maxPlayers;
        this.board = boardId
            ? BOARD_PRESETS.find(b => b.id === boardId) || BOARD_PRESETS[0]
            : BOARD_PRESETS[Math.floor(Math.random() * BOARD_PRESETS.length)];

        // Seats: Array of socketIds
        this.seats = new Array(maxPlayers).fill(null);

        // Players State
        this.players = Array.from({ length: maxPlayers }, (_, i) => ({
            id: i + 1,
            pos: 1,
            hasStarted: false,
            isFinished: false
        }));

        this.currentPlayerIndex = 0;
        this.winner = null;
        this.moveLog = [];
        this.diceValue = null;
    }

    addPlayer(socketId, name = null) {
        // Idempotency
        const existingIndex = this.seats.indexOf(socketId);
        if (existingIndex !== -1) {
            if (name) this.players[existingIndex].name = name;
            return existingIndex;
        }

        const seatIndex = this.seats.indexOf(null);
        if (seatIndex === -1) return -1;
        this.seats[seatIndex] = socketId;
        this.players[seatIndex].name = name || `Player ${seatIndex + 1}`;
        return seatIndex;
    }

    removePlayer(socketId) {
        const index = this.seats.indexOf(socketId);
        if (index !== -1) {
            this.seats[index] = null;
            this.players[index].name = null; // Optional: revert to default or leave null
        }
    }

    handleMove(socketId, { action }) {
        if (action !== 'roll') return { valid: false, error: "Invalid action" };

        const playerIndex = this.seats.indexOf(socketId);
        if (playerIndex === -1) return { valid: false, error: "Not a player" };
        if (playerIndex !== this.currentPlayerIndex) return { valid: false, error: "Not your turn" };
        if (this.winner) return { valid: false, error: "Game over" };

        // Logic
        const steps = Math.floor(Math.random() * 6) + 1;
        this.diceValue = steps;

        const player = this.players[playerIndex];
        let logMsg = `Player ${player.id} rolled ${steps}`;
        let canMove = true;

        if (!player.hasStarted) {
            if (steps === 1 || steps === 6) {
                player.hasStarted = true;
                logMsg += " -> Started!";
            } else {
                logMsg += " -> Needs 1 or 6";
                canMove = false;
            }
        }

        let hasWon = false;
        if (canMove) {
            let nextPos = player.pos + steps;
            if (nextPos > 100) {
                nextPos = player.pos; // Overshoot
                logMsg += " -> Too high!";
            } else {
                // Check Snakes/Ladders
                if (this.board.snakes[nextPos]) {
                    logMsg += ` -> Snake to ${this.board.snakes[nextPos]}`;
                    nextPos = this.board.snakes[nextPos];
                } else if (this.board.ladders[nextPos]) {
                    logMsg += ` -> Ladder to ${this.board.ladders[nextPos]}`;
                    nextPos = this.board.ladders[nextPos];
                }
            }
            player.pos = nextPos;
            if (nextPos === 100) hasWon = true;
        }

        this.moveLog.unshift(logMsg);
        this.moveLog = this.moveLog.slice(0, 5);

        if (hasWon) {
            this.winner = player;
        } else if (steps !== 6) {
            // Next turn for next active seat? 
            // Simplified: Just update index. If seat is empty, logic elsewhere handles it? 
            // No, games usually shouldn't start until full or logic skips.
            // Loop until we find the next player index?
            // Find next occupied seat
            let next = (this.currentPlayerIndex + 1) % this.maxPlayers;
            let checked = 0;
            while (this.seats[next] === null && checked < this.maxPlayers) {
                next = (next + 1) % this.maxPlayers;
                checked++;
            }
            this.currentPlayerIndex = next;
        }

        return { valid: true, state: this.getState() };
    }

    reset() {
        this.players.forEach(p => {
            p.pos = 1; p.hasStarted = false; p.isFinished = false;
        });
        this.currentPlayerIndex = 0;
        this.winner = null;
        this.moveLog = [];
        this.diceValue = null;
        this.board = BOARD_PRESETS[Math.floor(Math.random() * BOARD_PRESETS.length)];
        return this.getState();
    }

    getState() {
        return {
            gameType: 'snakeandladders',
            boardId: this.board.id,
            players: this.players,
            currentPlayerIndex: this.currentPlayerIndex,
            diceValue: this.diceValue,
            moveLog: this.moveLog,
            winner: this.winner,
            seats: this.seats
        };
    }
}

module.exports = SnakeAndLadders;
