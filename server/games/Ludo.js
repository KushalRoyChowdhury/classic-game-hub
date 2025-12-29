
// Constants
const SAFE_SPOTS = [0, 8, 13, 21, 26, 34, 39, 47];
const HOME_START_TILES = [0, 13, 26, 39]; // Global start index for R, G, Y, B
const MAIN_PATH_STEPS = 52; // Tokens stay on main path from relative 0 to 51
const WINNING_POS = 57; // Final home position
const GLOBAL_PATH_LENGTH = 52; // Full loop length

class Ludo {
    constructor(maxPlayers = 4) {
        this.maxPlayers = maxPlayers;
        this.seats = new Array(4).fill(null);
        this.reset();
    }

    reset() {
        // Red(0), Yellow(2) for 2 players
        const activeIndices = this.maxPlayers === 2 ? [0, 2] :
            this.maxPlayers === 3 ? [0, 1, 2] :
                [0, 1, 2, 3];

        this.players = Array.from({ length: 4 }, (_, i) => ({
            id: i,
            color: ['red', 'green', 'yellow', 'blue'][i],
            tokens: [-1, -1, -1, -1],
            finishedTokens: 0,
            hasFinished: false,
            isActive: activeIndices.includes(i)
        }));

        this.currentTurn = 0;
        this.diceValue = null;
        this.turnPhase = 'ROLL';
        this.moveLog = [];
        this.winner = null;
        this.consecutiveSixes = 0;

        return this.getState();
    }

    addPlayer(socketId, name = null) {
        const existingIndex = this.seats.indexOf(socketId);
        if (existingIndex !== -1) {
            if (name) this.players[existingIndex].name = name;
            return existingIndex;
        }

        const activeIndices = this.maxPlayers === 2 ? [0, 2] :
            this.maxPlayers === 3 ? [0, 1, 2] :
                [0, 1, 2, 3];

        const isEmpty = activeIndices.every(i => this.seats[i] === null);
        if (isEmpty) this.reset();

        for (let i of activeIndices) {
            if (this.seats[i] === null) {
                this.seats[i] = socketId;
                this.players[i].name = name || this.players[i].color;
                return i;
            }
        }
        return -1;
    }

    removePlayer(socketId) {
        const index = this.seats.indexOf(socketId);
        if (index !== -1) {
            this.seats[index] = null;
            this.players[index].name = null;
        }
    }

    handleMove(socketId, payload) {
        const playerIndex = this.seats.indexOf(socketId);
        if (playerIndex === -1) return { valid: false, error: "Not a player" };

        if (playerIndex !== this.currentTurn) return { valid: false, error: "Not your turn" };
        if (this.winner) return { valid: false, error: "Game Finished" };

        const { action, tokenIndex } = payload;

        if (action === 'roll') {
            if (this.turnPhase !== 'ROLL') return { valid: false, error: "Must move token" };

            this.diceValue = Math.floor(Math.random() * 6) + 1;

            const hasPlayableMoves = this.checkPlayableMoves(playerIndex, this.diceValue);

            if (!hasPlayableMoves) {
                this.moveLog.unshift(`P${playerIndex + 1} rolled ${this.diceValue} - No moves`);
                this.turnPhase = 'NO_MOVES'; // Wait for client to acknowledge
                return { valid: true, state: this.getState() };
            } else {
                if (this.diceValue === 6) {
                    this.consecutiveSixes++;
                    if (this.consecutiveSixes === 3) {
                        this.moveLog.unshift(`P${playerIndex + 1} rolled three 6s! Turn skipped.`);
                        this.nextTurn();
                        return { valid: true, state: this.getState() };
                    }
                } else {
                    this.consecutiveSixes = 0;
                }

                this.turnPhase = 'MOVE';
            }

            return { valid: true, state: this.getState() };
        }

        if (action === 'move') {
            if (this.turnPhase !== 'MOVE') return { valid: false, error: "Must roll first" };

            const player = this.players[playerIndex];
            const currentPos = player.tokens[tokenIndex];

            if (currentPos === undefined) return { valid: false, error: "Invalid token" };

            if (currentPos === -1) {
                if (this.diceValue === 6) {
                    player.tokens[tokenIndex] = 0;
                    this.moveLog.unshift(`P${playerIndex + 1} opened Token ${tokenIndex + 1}`);
                    this.turnPhase = 'ROLL';
                    this.diceValue = null; // Allow re-roll after opening token
                } else {
                    return { valid: false, error: "Need 6 to open" };
                }
            }
            else {
                const newPos = currentPos + this.diceValue;
                if (newPos > WINNING_POS) return { valid: false, error: "Overshoot" };

                player.tokens[tokenIndex] = newPos;

                if (newPos === WINNING_POS) {
                    player.finishedTokens++;
                    this.moveLog.unshift(`P${playerIndex + 1} Token ${tokenIndex + 1} Finished!`);
                    if (player.finishedTokens === 4) {
                        this.winner = playerIndex;
                    }
                }

                if (newPos < MAIN_PATH_STEPS) {
                    const conflict = this.checkCollisions(playerIndex, newPos);
                    if (conflict) {
                        this.moveLog.unshift(`P${playerIndex + 1} captured P${conflict.player + 1}!`);
                        this.turnPhase = 'ROLL';
                        this.diceValue = null; // Allow re-roll after capture
                        return { valid: true, state: this.getState() };
                    }
                }

                if (this.diceValue === 6 || newPos === WINNING_POS) {
                    this.turnPhase = 'ROLL';
                    this.diceValue = null; // Allow re-roll after 6 or reaching home
                } else {
                    this.nextTurn();
                }
            }

            return { valid: true, state: this.getState() };
        }

        if (action === 'pass') {
            if (this.turnPhase !== 'NO_MOVES') return { valid: false, error: "Cannot pass now" };
            this.nextTurn();
            return { valid: true, state: this.getState() };
        }

        return { valid: false, error: "Unknown action" };
    }

    checkPlayableMoves(playerIndex, dice) {
        const p = this.players[playerIndex];
        return p.tokens.some(pos => {
            if (pos === -1) return dice === 6;
            if (pos >= WINNING_POS) return false;
            return pos + dice <= WINNING_POS;
        });
    }

    getGlobalPos(playerIndex, relativePos) {
        if (relativePos === -1 || relativePos >= MAIN_PATH_STEPS) return null;
        const offset = HOME_START_TILES[playerIndex];
        return (offset + relativePos) % GLOBAL_PATH_LENGTH;
    }

    checkCollisions(attackerIndex, relativePos) {
        const globalPos = this.getGlobalPos(attackerIndex, relativePos);
        const isSafe = SAFE_SPOTS.includes(globalPos);
        if (isSafe) return null;

        for (let i = 0; i < 4; i++) {
            if (i === attackerIndex) continue;
            const opp = this.players[i];

            for (let t = 0; t < 4; t++) {
                const oppRel = opp.tokens[t];
                if (oppRel === -1 || oppRel >= MAIN_PATH_STEPS) continue;

                const oppGlobal = this.getGlobalPos(i, oppRel);
                if (oppGlobal === globalPos) {
                    opp.tokens[t] = -1;
                    return { player: i, token: t };
                }
            }
        }
        return null;
    }

    nextTurn() {
        this.consecutiveSixes = 0;
        this.turnPhase = 'ROLL';
        this.diceValue = null;

        let next = (this.currentTurn + 1) % 4;
        // Skip inactive, empty seats, or finished players (optional but good)
        // Ludo usually ends when one player wins (simplification), but if continuing, we'd check finished.
        let checked = 0;
        while ((!this.players[next].isActive || this.seats[next] === null) && checked < 4) {
            next = (next + 1) % 4;
            checked++;
        }
        this.currentTurn = next;
    }

    getState() {
        return {
            gameType: 'ludo',
            players: this.players,
            currentTurn: this.currentTurn,
            diceValue: this.diceValue,
            turnPhase: this.turnPhase,
            seats: this.seats,
            winner: this.winner,
            lastMove: this.moveLog[0]
        };
    }
}

module.exports = Ludo;
