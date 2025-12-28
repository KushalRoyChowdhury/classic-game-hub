import { create } from 'zustand';

const useGameStore = create((set) => ({
    activeGame: localStorage.getItem('activeGame') || 'home',
    setActiveGame: (game) => {
        localStorage.setItem('activeGame', game);
        set({ activeGame: game });
    },

    // Settings
    customServerUrl: localStorage.getItem('custom_server_url') || '',
    setCustomServerUrl: (url) => {
        if (url) {
            localStorage.setItem('custom_server_url', url.trim());
        } else {
            localStorage.removeItem('custom_server_url');
        }
        set({ customServerUrl: url });
        // Usually requires reload to take effect on socket connection
    },

    // User Profile
    userName: localStorage.getItem('user_name') || '',
    setUserName: (name) => {
        localStorage.setItem('user_name', name.trim());
        set({ userName: name });
    },

    showSettings: false,
    toggleSettings: (show) => set({ showSettings: show }),
}));

export default useGameStore;
