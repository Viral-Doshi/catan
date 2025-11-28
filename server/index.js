import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import * as GameLogic from './gameLogic.js';

const app = express();
app.use(cors());
app.use(express.json());

// Health check and info routes
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

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    activeGames: games.size,
    timestamp: new Date().toISOString()
  });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store games in memory
const games = new Map();
const playerSockets = new Map(); // socketId -> { gameId, playerId }

// Generate a short game code
function generateGameCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Broadcast game state to all players
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

// Broadcast to all players in a game
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

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Create a new game
  socket.on('createGame', ({ playerName, isExtended = false }, callback) => {
    const gameCode = generateGameCode();
    const playerId = uuidv4();
    
    const game = GameLogic.createGame(gameCode, {
      id: playerId,
      name: playerName
    }, isExtended);
    
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
  
  // Join an existing game
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
  
  // Start the game
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
  
  // Shuffle board (before game starts)
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
  
  // Roll dice
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
      
      // Broadcast resource gains to all players
      if (result.resourceGains) {
        game.players.forEach((player, idx) => {
          const gains = result.resourceGains[idx];
          const hasGains = Object.values(gains).some(v => v > 0);
          if (hasGains) {
            // Find socket for this player and send them their gains
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
  
  // Discard cards (when 7 is rolled)
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
  
  // Move robber
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
  
  // Place settlement
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
  
  // Place road
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
  
  // Upgrade to city
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
  
  // Buy development card
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
  
  // Play development card
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
  
  // Year of Plenty pick
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
  
  // Bank trade (with port ratios)
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
  
  // Propose trade
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
  
  // Respond to trade
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
  
  // Cancel trade
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
  
  // Advance setup (after placing settlement + road)
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
  
  // End turn
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
  
  // End special building phase (5-6 player extension)
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
  
  // Get players on hex (for robber)
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
  
  // Chat message
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
  
  // Disconnect
  socket.on('disconnect', () => {
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
    
    console.log('Player disconnected:', socket.id);
  });
  
  // Reconnect to game
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

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Catan server running on port ${PORT}`);
});

