import { useState, useEffect } from 'react';
import { Wifi } from 'lucide-react';
import socket from '../socket';

const PingDisplay = () => {
    const [ping, setPing] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!socket.connected) {
                setPing(0); // Optional: Reset to 0 or keep last if disconnected
                return;
            }

            const start = Date.now();
            socket.emit("ping", () => {
                const duration = Date.now() - start;
                setPing(duration);
            });
        }, 2000);

        return () => clearInterval(interval);
    }, []);

    let colorClass = "text-green-400";
    if (ping > 100) colorClass = "text-yellow-400";
    if (ping > 300) colorClass = "text-red-400";

    return (
        <div className={`flex items-center gap-1.5 text-[10px] sm:text-xs font-mono font-bold ${colorClass} opacity-70`}>
            <Wifi size={14} />
            <span>{ping}ms</span>
        </div>
    );
};

export default PingDisplay;
