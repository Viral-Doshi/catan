import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Keep server alive by pinging every 4 minutes (Render free tier spins down after 15 min)
const KEEP_ALIVE_INTERVAL = 4 * 60 * 1000; // 4 minutes

function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [gameCode, setGameCode] = useState(null);
  const [error, setError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      
      // Try to reconnect to existing game
      const savedGame = localStorage.getItem('catanGame');
      if (savedGame) {
        const { gameCode, playerId } = JSON.parse(savedGame);
        newSocket.emit('reconnect', { gameCode, playerId }, (response) => {
          if (response.success) {
            setGameCode(gameCode);
            setPlayerId(playerId);
            setGameState(response.gameState);
          } else {
            localStorage.removeItem('catanGame');
          }
        });
      }
    });
    
    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });
    
    newSocket.on('gameState', (state) => {
      setGameState(state);
    });
    
    newSocket.on('playerJoined', ({ playerName }) => {
      addNotification(`${playerName} joined the game`);
    });
    
    newSocket.on('playerDisconnected', ({ playerName }) => {
      addNotification(`${playerName} disconnected`);
    });
    
    newSocket.on('playerReconnected', ({ playerName }) => {
      addNotification(`${playerName} reconnected`);
    });
    
    newSocket.on('gameStarted', () => {
      addNotification('Game started! Place your first settlement.');
    });
    
    newSocket.on('diceRolled', ({ roll, playerId: rollerId }) => {
      // Notification handled in GameBoard
    });
    
    newSocket.on('chatMessage', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });
    
    newSocket.on('tradeProposed', ({ from, offer, request }) => {
      // Handled in GameBoard
    });
    
    newSocket.on('tradeAccepted', ({ by }) => {
      addNotification('Trade completed!');
    });
    
    newSocket.on('tradeCancelled', () => {
      addNotification('Trade cancelled');
    });
    
    setSocket(newSocket);
    
    return () => {
      newSocket.close();
    };
  }, []);

  // Keep-alive ping to prevent Render free tier from spinning down
  useEffect(() => {
    const pingServer = async () => {
      try {
        await fetch(`${SERVER_URL}/ping`);
        console.log('Keep-alive ping sent');
      } catch (err) {
        console.log('Keep-alive ping failed:', err.message);
      }
    };

    // Initial ping
    pingServer();

    // Set up interval
    const interval = setInterval(pingServer, KEEP_ALIVE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const addNotification = useCallback((message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  const handleCreateGame = useCallback((playerName, isExtended = false, enableSpecialBuild = true) => {
    if (!socket) return;
    
    socket.emit('createGame', { playerName, isExtended, enableSpecialBuild }, (response) => {
      if (response.success) {
        setGameCode(response.gameCode);
        setPlayerId(response.playerId);
        setGameState(response.gameState);
        localStorage.setItem('catanGame', JSON.stringify({
          gameCode: response.gameCode,
          playerId: response.playerId
        }));
      } else {
        setError(response.error);
      }
    });
  }, [socket]);

  const handleJoinGame = useCallback((code, playerName) => {
    if (!socket) return;
    
    socket.emit('joinGame', { gameCode: code, playerName }, (response) => {
      if (response.success) {
        setGameCode(response.gameCode);
        setPlayerId(response.playerId);
        setGameState(response.gameState);
        localStorage.setItem('catanGame', JSON.stringify({
          gameCode: response.gameCode,
          playerId: response.playerId
        }));
      } else {
        setError(response.error);
      }
    });
  }, [socket]);

  const handleLeaveGame = useCallback(() => {
    setGameState(null);
    setGameCode(null);
    setPlayerId(null);
    setChatMessages([]);
    localStorage.removeItem('catanGame');
  }, []);

  if (!connected) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <h1>CATAN</h1>
          <p>Connecting to server...</p>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <Lobby 
        onCreateGame={handleCreateGame}
        onJoinGame={handleJoinGame}
        error={error}
        setError={setError}
      />
    );
  }

  return (
    <div className="app">
      <GameBoard 
        socket={socket}
        gameState={gameState}
        playerId={playerId}
        gameCode={gameCode}
        chatMessages={chatMessages}
        onLeaveGame={handleLeaveGame}
        addNotification={addNotification}
      />
      
      {/* Notifications */}
      <div className="notifications">
        {notifications.map(n => (
          <div key={n.id} className="notification fade-in">
            {n.message}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
