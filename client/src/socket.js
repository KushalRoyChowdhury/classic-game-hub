import io from 'socket.io-client';

// Create socket instance but do not connect automatically
const getSocketUrl = () => {
    const customUrl = localStorage.getItem('custom_server_url');
    if (customUrl) return customUrl;
    return import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
};

const socket = io(getSocketUrl(), {
    autoConnect: false
});

export default socket;
