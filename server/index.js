/**
 * ============================================================================
 * CATAN GAME SERVER
 * ============================================================================
 * 
 * Express + Socket.io server for multiplayer Catan game.
 * Handles real-time game communication, session management, and game state.
 * 
 * Features:
 * - WebSocket-based real-time multiplayer
 * - Game room management with 6-character codes
 * - Automatic cleanup of stale games
 * - Connection limits for free tier hosting
 * - Keep-alive ping endpoint for Render free tier
 * 
 * @author Viral Doshi
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as GameLogic from './gameLogic.js';

// ============================================================================
// EXPRESS APP SETUP
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// HTTP ENDPOINTS
// ============================================================================

/** Server info and health check */
app.get('/', (req, res) => {
  res.json({
    name: 'Catan Game Server',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      socket: 'ws://[this-url]'
    },
    author: 'Viral Doshi'
  });
});

/** Detailed health check with server stats */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    activeGames: games.size,
    maxGames: MAX_CONCURRENT_GAMES,
    connectedPlayers: totalConnectedPlayers,
    maxPlayers: MAX_TOTAL_PLAYERS,
    timestamp: new Date().toISOString()
  });
});

/** Status endpoint for client to check if server has capacity */
app.get('/status', (req, res) => {
  const isAtCapacity = totalConnectedPlayers >= MAX_TOTAL_PLAYERS || games.size >= MAX_CONCURRENT_GAMES;
  res.json({
    available: !isAtCapacity,
    players: totalConnectedPlayers,
    maxPlayers: MAX_TOTAL_PLAYERS,
    games: games.size,
    maxGames: MAX_CONCURRENT_GAMES
  });
});

/** Lightweight keep-alive ping (prevents Render free tier from sleeping) */
app.get('/ping', (req, res) => {
  res.send('pong');
});

// ============================================================================
// SOCKET.IO SETUP
// ============================================================================

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ============================================================================
// IN-MEMORY STATE
// ============================================================================

/** Map of gameCode -> game state object */
const games = new Map();

/** Map of socketId -> { gameId, playerId } for tracking player connections */
const playerSockets = new Map();

// Connection limits for free tier hosting (Render, Heroku, etc.)
const MAX_CONCURRENT_GAMES = 50;
const MAX_TOTAL_PLAYERS = 200;
let totalConnectedPlayers = 0;

// ============================================================================
// AUTOMATIC CLEANUP
// ============================================================================

/** Clean up games that have been idle for 3+ hours */
setInterval(() => {
  const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
  let cleanedCount = 0;
  games.forEach((game, id) => {
    if (game.createdAt && game.createdAt < threeHoursAgo) {
      games.delete(id);
      cleanedCount++;
    }
  });
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} stale games. Active games: ${games.size}`);
  }
}, 30 * 60 * 1000); // Check every 30 minutes

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/** Generate a 6-character alphanumeric game code (excludes ambiguous chars like 0/O, 1/I) */
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/** Send player-specific game state to each player in a game */
function broadcastGameState(gameId) {
  const game = games.get(gameId);
  if (!game) return;
  
  game.players.forEach(player => {
    const socketId = [...playerSockets.entries()]
      .find(([_, v]) => v.gameId === gameId && v.playerId === player.id)?.[0];
    
    if (socketId) {
      const playerView = GameLogic.getPlayerView(game, player.id);
      io.to(socketId).emit('gameState', playerView);
    }
  });
}

/** Broadcast an event to all players in a game (same data to everyone) */
function broadcastToGame(gameId, event, data) {
  const game = games.get(gameId);
  if (!game) return;
  
  game.players.forEach(player => {
    const socketId = [...playerSockets.entries()]
      .find(([_, v]) => v.gameId === gameId && v.playerId === player.id)?.[0];
    
    if (socketId) {
      io.to(socketId).emit(event, data);
    }
  });
}

// ============================================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================================

io.on('connection', (socket) => {
  // --------------------------------------------------------------------
  // CONNECTION MANAGEMENT
  // --------------------------------------------------------------------
  
  // Check if server is at capacity
  if (totalConnectedPlayers >= MAX_TOTAL_PLAYERS) {
    console.log('Server at capacity, rejecting connection:', socket.id);
    socket.emit('serverFull', { 
      message: 'Server is at maximum capacity. Please try again in a few minutes.',
      players: totalConnectedPlayers,
      maxPlayers: MAX_TOTAL_PLAYERS
    });
    socket.disconnect(true);
    return;
  }
  
  totalConnectedPlayers++;
  console.log(`Player connected: ${socket.id} (Total: ${totalConnectedPlayers}/${MAX_TOTAL_PLAYERS})`);
  
  // --------------------------------------------------------------------
  // GAME CREATION AND JOINING
  // --------------------------------------------------------------------
  
  /** Create a new game room as the host */
  socket.on('createGame', ({ playerName, isExtended = false, enableSpecialBuild = true }, callback) => {
    // Check game limit
    if (games.size >= MAX_CONCURRENT_GAMES) {
      callback({ 
        success: false, 
        error: 'Server has reached maximum number of games. Please try again later.' 
      });
      return;
    }
    
    const gameCode = generateGameCode();
    const playerId = uuidv4();
    
    const game = GameLogic.createGame(gameCode, {
      id: playerId,
      name: playerName
    }, isExtended, enableSpecialBuild);
    
    // Add timestamp for cleanup
    game.createdAt = Date.now();
    
    games.set(gameCode, game);
    playerSockets.set(socket.id, { gameId: gameCode, playerId });
    socket.join(gameCode);
    
    console.log(`Game ${gameCode} created by ${playerName}`);
    
    callback({
      success: true,
      gameCode,
      playerId,
      gameState: GameLogic.getPlayerView(game, playerId)
    });
  });
  
  /** Join an existing game room using a game code */
  socket.on('joinGame', ({ gameCode, playerName }, callback) => {
    const game = games.get(gameCode.toUpperCase());
    
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    
    const playerId = uuidv4();
    const result = GameLogic.addPlayer(game, { id: playerId, name: playerName });
    
    if (!result.success) {
      callback({ success: false, error: result.error });
      return;
    }
    
    playerSockets.set(socket.id, { gameId: gameCode.toUpperCase(), playerId });
    socket.join(gameCode.toUpperCase());
    
    console.log(`${playerName} joined game ${gameCode}`);
    
    callback({
      success: true,
      gameCode: gameCode.toUpperCase(),
      playerId,
      gameState: GameLogic.getPlayerView(game, playerId)
    });
    
    // Notify all players
    broadcastToGame(gameCode.toUpperCase(), 'playerJoined', { playerName });
    broadcastGameState(gameCode.toUpperCase());
  });
  
  // --------------------------------------------------------------------
  // GAME FLOW CONTROLS
  // --------------------------------------------------------------------
  
  /** Start the game (host only) - randomizes player order and begins setup */
  socket.on('startGame', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    
    // Only host can start
    if (game.players[0].id !== playerInfo.playerId) {
      callback({ success: false, error: 'Only host can start the game' });
      return;
    }
    
    const result = GameLogic.startGame(game);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'gameStarted', { 
        turnOrder: result.turnOrder 
      });
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Shuffle the board layout (host only, before game starts) */
  socket.on('shuffleBoard', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    
    // Only host can shuffle
    if (game.players[0].id !== playerInfo.playerId) {
      callback({ success: false, error: 'Only host can shuffle the board' });
      return;
    }
    
    const result = GameLogic.shuffleBoard(game);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'boardShuffled', {});
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  // --------------------------------------------------------------------
  // TURN ACTIONS
  // --------------------------------------------------------------------
  
  /** Roll dice at start of turn - distributes resources or triggers robber */
  socket.on('rollDice', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.rollDice(game, playerInfo.playerId);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'diceRolled', { 
        roll: result.roll,
        playerId: playerInfo.playerId 
      });
      
      // Broadcast resource gains to all players (resource gains are public in Catan)
      if (result.resourceGains) {
        // Collect all gains for broadcast
        const allGains = [];
        game.players.forEach((player, idx) => {
          const gains = result.resourceGains[idx];
          const hasGains = Object.values(gains).some(v => v > 0);
          if (hasGains) {
            allGains.push({
              playerId: player.id,
              playerName: player.name,
              playerIndex: idx,
              gains
            });
          }
        });
        
        // Broadcast all resource gains to everyone in the game
        if (allGains.length > 0) {
          broadcastToGame(playerInfo.gameId, 'resourcesDistributed', {
            fromRoll: result.roll.total,
            allGains
          });
        }
        
        // Also send personal notification to each player who received resources
        game.players.forEach((player, idx) => {
          const gains = result.resourceGains[idx];
          const hasGains = Object.values(gains).some(v => v > 0);
          if (hasGains) {
            const socketEntry = [...playerSockets.entries()]
              .find(([_, v]) => v.gameId === playerInfo.gameId && v.playerId === player.id);
            if (socketEntry) {
              io.to(socketEntry[0]).emit('resourcesReceived', { 
                gains,
                fromRoll: result.roll.total
              });
            }
          }
        });
      }
      
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Discard cards when a 7 is rolled (for players with >7 cards) */
  socket.on('discardCards', ({ resources }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.discardCards(game, playerInfo.playerId, resources);
    
    if (result.success) {
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Move robber and optionally steal from a player */
  socket.on('moveRobber', ({ hexKey, stealFromPlayerId }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.moveRobber(game, playerInfo.playerId, hexKey, stealFromPlayerId);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'robberMoved', { hexKey });
      
      // Send steal notifications to both players
      if (result.stolenInfo) {
        const { resource, thief, thiefName, victim, victimName } = result.stolenInfo;
        
        // Notify the thief what they stole
        const thiefSocket = [...playerSockets.entries()]
          .find(([_, v]) => v.gameId === playerInfo.gameId && v.playerId === thief)?.[0];
        if (thiefSocket) {
          io.to(thiefSocket).emit('stealResult', { 
            type: 'stole',
            resource,
            otherPlayer: victimName
          });
        }
        
        // Notify the victim what was stolen from them
        const victimSocket = [...playerSockets.entries()]
          .find(([_, v]) => v.gameId === playerInfo.gameId && v.playerId === victim)?.[0];
        if (victimSocket) {
          io.to(victimSocket).emit('stealResult', { 
            type: 'stolen',
            resource,
            otherPlayer: thiefName
          });
        }
      }
      
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  // --------------------------------------------------------------------
  // BUILDING ACTIONS
  // --------------------------------------------------------------------
  
  /** Place a settlement on a vertex */
  socket.on('placeSettlement', ({ vertexKey, isSetup }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.placeSettlement(game, playerInfo.playerId, vertexKey);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'settlementPlaced', { 
        vertexKey, 
        playerId: playerInfo.playerId 
      });
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Place a road on an edge */
  socket.on('placeRoad', ({ edgeKey, isSetup, lastSettlement }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.placeRoad(game, playerInfo.playerId, edgeKey, isSetup, lastSettlement);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'roadPlaced', { 
        edgeKey, 
        playerId: playerInfo.playerId 
      });
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Upgrade an existing settlement to a city */
  socket.on('upgradeToCity', ({ vertexKey }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.upgradeToCity(game, playerInfo.playerId, vertexKey);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'cityBuilt', { 
        vertexKey, 
        playerId: playerInfo.playerId 
      });
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  // --------------------------------------------------------------------
  // DEVELOPMENT CARDS
  // --------------------------------------------------------------------
  
  /** Buy a development card from the deck */
  socket.on('buyDevCard', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.buyDevCard(game, playerInfo.playerId);
    
    if (result.success) {
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Play a development card */
  socket.on('playDevCard', ({ cardType, params }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.playDevCard(game, playerInfo.playerId, cardType, params);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'devCardPlayed', { 
        cardType, 
        playerId: playerInfo.playerId 
      });
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Pick a resource for Year of Plenty card */
  socket.on('yearOfPlentyPick', ({ resource }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.yearOfPlentyPick(game, playerInfo.playerId, resource);
    
    if (result.success) {
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  // --------------------------------------------------------------------
  // TRADING
  // --------------------------------------------------------------------
  
  /** Trade with the bank (uses port ratios if available) */
  socket.on('bankTrade', ({ giveResource, giveAmount, getResource }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.bankTrade(game, playerInfo.playerId, giveResource, giveAmount, getResource);
    
    if (result.success) {
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Propose a trade to other players */
  socket.on('proposeTrade', ({ offer, request }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.proposeTrade(game, playerInfo.playerId, offer, request);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'tradeProposed', { 
        from: playerInfo.playerId,
        offer,
        request
      });
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Accept or decline a trade offer */
  socket.on('respondToTrade', ({ accept }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.respondToTrade(game, playerInfo.playerId, accept);
    
    if (result.success) {
      if (result.traded) {
        broadcastToGame(playerInfo.gameId, 'tradeAccepted', { 
          by: playerInfo.playerId 
        });
      } else {
        broadcastToGame(playerInfo.gameId, 'tradeDeclined', { 
          by: playerInfo.playerId 
        });
      }
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** Cancel an active trade offer */
  socket.on('cancelTrade', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.cancelTrade(game, playerInfo.playerId);
    
    if (result.success) {
      broadcastToGame(playerInfo.gameId, 'tradeCancelled', {});
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  // --------------------------------------------------------------------
  // TURN MANAGEMENT
  // --------------------------------------------------------------------
  
  /** Advance to next player during setup phase */
  socket.on('advanceSetup', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.advanceSetup(game, playerInfo.playerId);
    
    if (result.success) {
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** End the current player's turn */
  socket.on('endTurn', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.endTurn(game, playerInfo.playerId);
    
    if (result.success) {
      if (result.specialBuildingPhase) {
        broadcastToGame(playerInfo.gameId, 'specialBuildingPhaseStarted', { 
          playerId: playerInfo.playerId,
          currentBuilder: game.players[game.specialBuildIndex]?.id
        });
      } else {
        broadcastToGame(playerInfo.gameId, 'turnEnded', { playerId: playerInfo.playerId });
      }
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  /** End special building phase for current player (5-6 player games) */
  socket.on('endSpecialBuild', (callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const result = GameLogic.endSpecialBuild(game, playerInfo.playerId);
    
    if (result.success) {
      if (result.specialBuildingPhaseEnded) {
        broadcastToGame(playerInfo.gameId, 'specialBuildingPhaseEnded', {});
        broadcastToGame(playerInfo.gameId, 'turnEnded', { playerId: playerInfo.playerId });
      } else {
        broadcastToGame(playerInfo.gameId, 'specialBuildNext', { 
          currentBuilder: game.players[game.specialBuildIndex]?.id 
        });
      }
      broadcastGameState(playerInfo.gameId);
    }
    
    callback(result);
  });
  
  // --------------------------------------------------------------------
  // UTILITY QUERIES
  // --------------------------------------------------------------------
  
  /** Get list of players with buildings on a hex (for robber stealing) */
  socket.on('getPlayersOnHex', ({ hexKey }, callback) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) {
      callback({ success: false, error: 'Not in a game' });
      return;
    }
    
    const game = games.get(playerInfo.gameId);
    const playerIdx = game.players.findIndex(p => p.id === playerInfo.playerId);
    const playerIndices = GameLogic.getPlayersOnHex(game, hexKey, playerIdx);
    
    const players = playerIndices.map(idx => ({
      id: game.players[idx].id,
      name: game.players[idx].name,
      hasResources: Object.values(game.players[idx].resources).reduce((a, b) => a + b, 0) > 0
    }));
    
    callback({ success: true, players });
  });
  
  // --------------------------------------------------------------------
  // CHAT
  // --------------------------------------------------------------------
  
  /** Broadcast a chat message to all players in the game */
  socket.on('chatMessage', ({ message }) => {
    const playerInfo = playerSockets.get(socket.id);
    if (!playerInfo) return;
    
    const game = games.get(playerInfo.gameId);
    if (!game) return;
    
    const player = game.players.find(p => p.id === playerInfo.playerId);
    if (!player) return;
    
    broadcastToGame(playerInfo.gameId, 'chatMessage', {
      playerName: player.name,
      playerColor: player.color,
      message,
      timestamp: Date.now()
    });
  });
  
  // --------------------------------------------------------------------
  // CONNECTION LIFECYCLE
  // --------------------------------------------------------------------
  
  /** Handle player disconnection */
  socket.on('disconnect', () => {
    totalConnectedPlayers = Math.max(0, totalConnectedPlayers - 1);
    
    const playerInfo = playerSockets.get(socket.id);
    
    if (playerInfo) {
      const game = games.get(playerInfo.gameId);
      if (game) {
        const player = game.players.find(p => p.id === playerInfo.playerId);
        if (player) {
          broadcastToGame(playerInfo.gameId, 'playerDisconnected', { 
            playerName: player.name 
          });
        }
      }
      
      playerSockets.delete(socket.id);
    }
    
    console.log(`Player disconnected: ${socket.id} (Total: ${totalConnectedPlayers}/${MAX_TOTAL_PLAYERS})`);
  });
  
  /** Reconnect to an existing game (e.g., after page refresh) */
  socket.on('reconnect', ({ gameCode, playerId }, callback) => {
    const game = games.get(gameCode);
    
    if (!game) {
      callback({ success: false, error: 'Game not found' });
      return;
    }
    
    const player = game.players.find(p => p.id === playerId);
    if (!player) {
      callback({ success: false, error: 'Player not found in game' });
      return;
    }
    
    // Remove old socket mapping if exists
    for (const [socketId, info] of playerSockets.entries()) {
      if (info.gameId === gameCode && info.playerId === playerId) {
        playerSockets.delete(socketId);
        break;
      }
    }
    
    playerSockets.set(socket.id, { gameId: gameCode, playerId });
    socket.join(gameCode);
    
    callback({
      success: true,
      gameState: GameLogic.getPlayerView(game, playerId)
    });
    
    broadcastToGame(gameCode, 'playerReconnected', { playerName: player.name });
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Catan server running on port ${PORT}`);
});

