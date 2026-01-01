/**
 * ============================================================================
 * CATAN CLIENT APPLICATION
 * ============================================================================
 * 
 * Main React application for the Catan game client.
 * Handles:
 * - Socket.io connection management
 * - Game state management
 * - Session persistence (localStorage)
 * - Global notifications
 * - Keep-alive pings (for Render free tier)
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

// Server URL from environment variable, falls back to localhost for development
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

// Keep server alive by pinging every 4 minutes (Render free tier spins down after 15 min)
const KEEP_ALIVE_INTERVAL = 4 * 60 * 1000;

function App() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  
  const [socket, setSocket] = useState(null);           // Socket.io connection
  const [connected, setConnected] = useState(false);     // Connection status
  const [gameState, setGameState] = useState(null);      // Current game state from server
  const [playerId, setPlayerId] = useState(null);        // This player's unique ID
  const [gameCode, setGameCode] = useState(null);        // Current game room code
  const [error, setError] = useState(null);              // Error messages for display
  const [chatMessages, setChatMessages] = useState([]);  // Chat message history
  const [notifications, setNotifications] = useState([]); // Toast notifications
  const [serverFull, setServerFull] = useState(false);   // Server capacity flag

  // ============================================================================
  // SOCKET CONNECTION & EVENT HANDLERS
  // ============================================================================
  
  useEffect(() => {
    const newSocket = io(SERVER_URL);
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      setServerFull(false);
      
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
    
    newSocket.on('serverFull', ({ message }) => {
      console.log('Server is full:', message);
      setServerFull(true);
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

  // ============================================================================
  // KEEP-ALIVE PING (prevents Render free tier from sleeping)
  // ============================================================================
  
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

  // ============================================================================
  // NOTIFICATION HELPERS
  // ============================================================================
  
  /** Add a toast notification that auto-dismisses after 4 seconds */
  const addNotification = useCallback((message) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  }, []);

  // ============================================================================
  // GAME ACTIONS
  // ============================================================================
  
  /** Create a new game room as the host */
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

  /** Join an existing game room using a code */
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

  /** Leave the current game and return to lobby */
  const handleLeaveGame = useCallback(() => {
    setGameState(null);
    setGameCode(null);
    setPlayerId(null);
    setChatMessages([]);
    localStorage.removeItem('catanGame');
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================
  
  // Server at capacity - show retry screen
  if (serverFull) {
    return (
      <div className="loading-screen server-full">
        <div className="loading-content">
          <h1>CATAN</h1>
          <div className="server-full-icon">🏰</div>
          <h2>Server at Capacity</h2>
          <p>Too many players are currently online!</p>
          <p className="server-full-hint">Please try again in a few minutes.</p>
          <button 
            className="retry-btn"
            onClick={() => window.location.reload()}
          >
            🔄 Try Again
          </button>
        </div>
      </div>
    );
  }

  // Connecting to server - show loading screen
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

  // No active game - show lobby for creating/joining games
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

  // Active game - render the game board
  return (
    <>
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
      </div>
      
      {/* Toast notifications - rendered via Portal to document.body for proper z-index */}
      {createPortal(
        <div className="notifications">
          {notifications.map(n => (
            <div key={n.id} className="notification fade-in">
              {n.message}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default App;
