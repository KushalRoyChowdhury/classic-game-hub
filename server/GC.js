
/**
 * Garbage Collection Service
 * Periodically cleans up empty rooms to free up memory and Room IDs.
 * 
 * @param {Map} rooms - The global Map of game instances.
 * @param {number} intervalMs - How often to run (default: 5 minutes).
 */
function startGC(rooms, intervalMs = 300000) {
    console.log(`[GC] Service started. Interval: ${intervalMs / 1000}s`);

    setInterval(() => {
        let deletedCount = 0;
        const now = Date.now();

        for (const [roomId, game] of rooms.entries()) {
            // Check if all seats are empty (null)
            const isRoomEmpty = game.seats.every(seat => seat === null);

            if (isRoomEmpty) {
                rooms.delete(roomId);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            console.log(`[GC] Cleaned up ${deletedCount} empty room(s).`);
        }
    }, intervalMs);
}

module.exports = startGC;
