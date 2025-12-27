<div align="center">

  <img src="client/public/game-logo.png" alt="Classic Game Hub Logo" width="200" height="200">

  # 🎮 Classic Game Hub
  
  **A Modern, Real-time Multiplayer Arcade Experience**
  
  [![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)
  [![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
  [![Socket.io](https://img.shields.io/badge/Socket.io-4.0-010101?style=for-the-badge&logo=socket.io)](https://socket.io/)
  [![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js)](https://nodejs.org/)

  <p align="center">
    <a href="#-features">Features</a> •
    <a href="#-getting-started">Getting Started</a> •
    <a href="#-how-to-play">How to Play</a> •
    <a href="#-technologies">Technologies</a>
  </p>
</div>

---

## ✨ Overview

**Classic Game Hub** is a stunningly designed web application that brings your childhood favorite board games into the modern era. Featuring **Tic-Tac-Toe**, **Snake & Ladders**, and **Ludo**, this hub offers a seamless **Online Multiplayer** experience alongside local PvP and PvAI modes. 

Built with a "Neon Retro" aesthetic, glassmorphism UI, and smooth Framer Motion animations, it's designed to look as good as it plays.

## 🚀 Features

- **🎲 Three Classic Games**:
  - **Tic-Tac-Toe**: The classic strategy game.
  - **Snake & Ladders**: Race to 100 with twists and turns.
  - **Ludo**: The ultimate 4-player strategy race.
- **🌐 Real-Time Multiplayer**: Hosted on a custom Node.js/Socket.io server for lag-free online play.
- **🤖 Game Modes**:
  - **PvP (Local)**: Play on the same device.
  - **PvAI**: Challenge a smart AI bot (Tic-Tac-Toe & Snake & Ladders).
  - **Online**: Create or join rooms to play with friends anywhere. (*Note: This mode does not use optimistic updates; actions are confirmed by the server to ensure fairness. High ping may cause slight delays. The default server is located in Singapore; average ping tested in India is ~50ms on WiFi. If you face high latency, try hosting the server locally.*)
- **🎨 Premium UI/UX**:
  - **Glassmorphism Design**: Sleek, modern, transparent aesthetics.
  - **Dark Mode**: Optimized for comfortable gaming.
  - **Responsive**: Fully playable on Desktop and Mobile.
  - **PWA Support**: Installable as a native app on your device.
- **⚙️ Customization**: Configure your own custom server URL directly from the settings.

## 🛠️ Technologies

### Client
- **React 19**: Latest React features for robust UI logic.
- **Vite**: Lightning-fast build tool and dev server.
- **Tailwind CSS 4**: Next-gen utility-first styling.
- **Framer Motion**: Complex, fluid layout animations.
- **Lucide React**: Beautiful, consistent iconography.

### Server
- **Node.js**: Runtime environment.
- **Express**: Web server framework.
- **Socket.io**: Real-time, bidirectional event-based communication.

## 🏁 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- pnpm (recommended) or npm

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/KushalRoyChowdhury/classic-game-hub
    cd classic-game-hub
    ```

2.  **Install Dependencies**
    ```bash
    # Install client dependencies
    cd client
    pnpm install

    # Install server dependencies
    cd ../server
    pnpm install
    ```

### Running the Application

1.  **Start the Server** (Terminal 1)
    ```bash
    cd server
    pnpm run dev
    # Server runs on port 3001
    ```

2.  **Start the Client** (Terminal 2)
    ```bash
    cd client
    pnpm run dev
    # Client runs on http://localhost:5173 
    ```

3.  **Access the App**
    Open your browser and navigate to `http://localhost:5173`.

### 🔧 Configuration

**Environment Variables**:
Create a `.env` file in the `client` directory (optional):
```env
VITE_SERVER_URL=http://localhost:3001
```

**Custom Server**:
You can also set a custom server URL via the specialized **Settings Menu** (⋮) within the application interface.

## 📱 Progressive Web App (PWA)

This app is fully PWA compliant.
- **Install**: Click the "Install" button in your browser address bar.
- **Offline Capable**: Assets are cached for fast loading (game logic requires connection for online modes).

## 🤝 Contributing

Contributions are welcome!
1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  Made with ❤️ by Kushal Roy Chowdhury
</div>
