import { useState, useEffect, useCallback, useRef } from 'react';
import HexBoard from './HexBoard';
import PlayerPanel from './PlayerPanel';
import ResourceCards from './ResourceCards';
import ActionPanel from './ActionPanel';
import TradeModal from './TradeModal';
import DiceDisplay from './DiceDisplay';
import Chat from './Chat';
import DevCardModal from './DevCardModal';
import DiscardModal from './DiscardModal';
import CardReveal from './CardReveal';
import InfoPopup, { useInfoPopup, INFO_DATA } from './InfoPopup';
import Confetti from './Confetti';
import './GameBoard.css';

function GameBoard({ socket, gameState, playerId, gameCode, chatMessages, onLeaveGame, addNotification }) {
  const [selectedAction, setSelectedAction] = useState(null); // 'settlement', 'road', 'city'
  const [lastPlacedSettlement, setLastPlacedSettlement] = useState(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [showDevCardModal, setShowDevCardModal] = useState(false);
  const [pendingRobberHex, setPendingRobberHex] = useState(null);
  const [playersOnHex, setPlayersOnHex] = useState([]);
  const [showChat, setShowChat] = useState(false);
  const [resourceGainNotification, setResourceGainNotification] = useState(null);
  const [revealedCard, setRevealedCard] = useState(null);
  const [lastTradeOfferId, setLastTradeOfferId] = useState(null);
  const [dismissedTradeId, setDismissedTradeId] = useState(null);
  const [showDice, setShowDice] = useState(false);
  const [lastNotifiedRoll, setLastNotifiedRoll] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  
  // Info popup for right-click
  const { popup: infoPopup, showInfo, showHexInfo, closePopup: closeInfoPopup } = useInfoPopup();
  
  const myPlayer = gameState.players[gameState.myIndex];
  const currentPlayer = gameState.phase !== 'waiting' ? gameState.players[gameState.currentPlayerIndex] : null;
  const isMyTurn = gameState.phase !== 'waiting' && gameState.currentPlayerIndex === gameState.myIndex;
  const isSetup = gameState.phase === 'setup';
  const isWaiting = gameState.phase === 'waiting';
  const isHost = gameState.players[0]?.id === playerId;
  const needsToDiscard = gameState.discardingPlayers?.some(
    d => d.playerIndex === gameState.myIndex
  );
  
  // 5-6 player extension: Special Building Phase
  const isSpecialBuildPhase = gameState.specialBuildingPhase && gameState.turnPhase === 'specialBuild';
  const isMySpecialBuild = isSpecialBuildPhase && gameState.specialBuildIndex === gameState.myIndex;
  const canBuildNow = isMyTurn || isMySpecialBuild;

  // Auto-hide dice display after 5 seconds
  useEffect(() => {
    if (gameState.diceRoll && gameState.turnPhase !== 'roll') {
      // Show the dice
      setShowDice(true);
      
      // Hide dice after 5 seconds
      const timer = setTimeout(() => {
        setShowDice(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    } else if (gameState.turnPhase === 'roll') {
      // Reset when new turn starts (waiting for roll)
      setShowDice(false);
    }
  }, [gameState.diceRoll?.dice1, gameState.diceRoll?.dice2, gameState.turnPhase, gameState.currentPlayerIndex]);

  // Listen for personal resource received events (shows center popup for your own gains)
  useEffect(() => {
    const handleResourcesReceived = ({ gains, fromRoll }) => {
      const resourceNames = { brick: '🧱', lumber: '🪵', wool: '🐑', grain: '🌾', ore: '⛏️' };
      const gainsList = Object.entries(gains)
        .filter(([_, amount]) => amount > 0)
        .map(([resource, amount]) => `${resourceNames[resource]} ${amount}`)
        .join(' ');
      
      if (gainsList) {
        // Show center popup for your own resources
        setResourceGainNotification({ gains, fromRoll, gainsList });
        setTimeout(() => setResourceGainNotification(null), 4000);
      }
    };
    
    socket.on('resourcesReceived', handleResourcesReceived);
    return () => socket.off('resourcesReceived', handleResourcesReceived);
  }, [socket]);

  // Listen for all resource distributions (public info - everyone sees who got what)
  useEffect(() => {
    const handleResourcesDistributed = ({ fromRoll, allGains }) => {
      const resourceNames = { brick: '🧱', lumber: '🪵', wool: '🐑', grain: '🌾', ore: '⛏️' };
      
      allGains.forEach(({ playerName, playerId: gainPlayerId, gains }) => {
        const gainsList = Object.entries(gains)
          .filter(([_, amount]) => amount > 0)
          .map(([resource, amount]) => `${resourceNames[resource]}${amount}`)
          .join(' ');
        
        if (gainPlayerId === playerId) {
          // Your own gains
          addNotification(`🎲 You received: ${gainsList}`);
        } else {
          // Other player's gains
          addNotification(`🎲 ${playerName} received: ${gainsList}`);
        }
      });
    };
    
    socket.on('resourcesDistributed', handleResourcesDistributed);
    return () => socket.off('resourcesDistributed', handleResourcesDistributed);
  }, [socket, playerId, addNotification]);

  // Listen for steal notifications
  useEffect(() => {
    const resourceIcons = { brick: '🧱', lumber: '🪵', wool: '🐑', grain: '🌾', ore: '⛏️' };
    
    const handleStealResult = ({ type, resource, otherPlayer }) => {
      const icon = resourceIcons[resource] || resource;
      if (type === 'stole') {
        addNotification(`🥷 You stole ${icon} ${resource} from ${otherPlayer}!`);
      } else {
        addNotification(`😢 ${otherPlayer} stole ${icon} ${resource} from you!`);
      }
    };
    
    socket.on('stealResult', handleStealResult);
    return () => socket.off('stealResult', handleStealResult);
  }, [socket, addNotification]);

  // Listen for special building phase events (5-6 player extension)
  useEffect(() => {
    const handleSpecialBuildStarted = ({ currentBuilder }) => {
      if (currentBuilder === playerId) {
        addNotification('🏗️ Special Building Phase - Your turn to build!');
      }
    };
    
    const handleSpecialBuildNext = ({ currentBuilder }) => {
      if (currentBuilder === playerId) {
        addNotification('🏗️ Your turn in Special Building Phase!');
      }
    };
    
    const handleSpecialBuildEnded = () => {
      addNotification('Special Building Phase ended');
    };
    
    socket.on('specialBuildingPhaseStarted', handleSpecialBuildStarted);
    socket.on('specialBuildNext', handleSpecialBuildNext);
    socket.on('specialBuildingPhaseEnded', handleSpecialBuildEnded);
    
    return () => {
      socket.off('specialBuildingPhaseStarted', handleSpecialBuildStarted);
      socket.off('specialBuildNext', handleSpecialBuildNext);
      socket.off('specialBuildingPhaseEnded', handleSpecialBuildEnded);
    };
  }, [socket, playerId, addNotification]);

  // Track new chat messages for notification dot
  useEffect(() => {
    if (chatMessages.length > lastMessageCount) {
      // Only increment unread if chat is closed and message is from another player
      if (!showChat) {
        const newMessages = chatMessages.slice(lastMessageCount);
        const otherPlayerMessages = newMessages.filter(msg => msg.playerId !== playerId);
        if (otherPlayerMessages.length > 0) {
          setUnreadMessages(prev => prev + otherPlayerMessages.length);
        }
      }
      setLastMessageCount(chatMessages.length);
    }
  }, [chatMessages, lastMessageCount, showChat, playerId]);

  // Reset unread count when chat is opened
  useEffect(() => {
    if (showChat) {
      setUnreadMessages(0);
    }
  }, [showChat]);

  // Auto-open trade modal when there's a pending trade from another player
  useEffect(() => {
    const tradeOffer = gameState.tradeOffer;
    const isTradeFromMe = tradeOffer?.from === gameState.myIndex;
    
    // Create a unique ID for this trade to track if we've already shown it
    const tradeId = tradeOffer ? `${tradeOffer.from}-${JSON.stringify(tradeOffer.offer)}` : null;
    
    if (tradeOffer && !isTradeFromMe && tradeId !== lastTradeOfferId) {
      // New trade from another player - auto open the modal
      setShowTradeModal(true);
      setLastTradeOfferId(tradeId);
      setDismissedTradeId(null); // Reset dismissed state for new trade
      const traderName = gameState.players[tradeOffer.from]?.name || 'A player';
      addNotification(`${traderName} wants to trade with you!`);
    } else if (!tradeOffer) {
      // Trade was cancelled or completed - clear all trade state
      setLastTradeOfferId(null);
      setDismissedTradeId(null);
    }
  }, [gameState.tradeOffer, gameState.myIndex, gameState.players, lastTradeOfferId, addNotification]);

  // Auto-select action during setup
  useEffect(() => {
    if (isSetup && isMyTurn) {
      // Check if we need to place settlement or road
      const mySettlements = Object.values(gameState.vertices)
        .filter(v => v.owner === gameState.myIndex && v.building === 'settlement').length;
      const myRoads = Object.values(gameState.edges)
        .filter(e => e.owner === gameState.myIndex && e.road).length;
      
      const expectedSettlements = gameState.setupPhase === 0 ? 1 : 2;
      const expectedRoads = gameState.setupPhase === 0 ? 1 : 2;
      
      if (mySettlements < expectedSettlements) {
        setSelectedAction('settlement');
      } else if (myRoads < expectedRoads) {
        setSelectedAction('road');
      } else {
        setSelectedAction(null);
      }
    }
  }, [isSetup, isMyTurn, gameState]);

  // Reset roll notification tracker when turn phase goes back to 'roll' (new turn)
  useEffect(() => {
    if (gameState.turnPhase === 'roll') {
      setLastNotifiedRoll(null);
    }
  }, [gameState.turnPhase]);

  // Handle dice roll notification (only for 7 - robber)
  useEffect(() => {
    if (gameState.diceRoll && gameState.turnPhase !== 'roll') {
      // Create unique key for this roll to prevent duplicate notifications
      const rollKey = `${gameState.diceRoll.dice1}-${gameState.diceRoll.dice2}-${gameState.currentPlayerIndex}`;
      
      // Only notify for 7 (robber) - regular rolls are shown in the dice display
      if (rollKey !== lastNotifiedRoll && gameState.diceRoll.total === 7) {
        const roller = gameState.players[gameState.currentPlayerIndex];
        addNotification(`⚠️ ${roller.name} rolled a 7! Move the robber.`);
        setLastNotifiedRoll(rollKey);
      } else if (rollKey !== lastNotifiedRoll) {
        setLastNotifiedRoll(rollKey);
      }
    }
  }, [gameState.diceRoll, gameState.turnPhase, gameState.currentPlayerIndex, gameState.players, lastNotifiedRoll, addNotification]);

  // Handle winner
  useEffect(() => {
    if (gameState.winner) {
      const winner = gameState.players.find(p => p.id === gameState.winner);
      addNotification(`🎉 ${winner.name} wins the game!`);
    }
  }, [gameState.winner]);

  const handleRollDice = useCallback(() => {
    socket.emit('rollDice', (response) => {
      if (!response.success) {
        addNotification(response.error);
      }
    });
  }, [socket, addNotification]);

  const handlePlaceSettlement = useCallback((vertexKey) => {
    socket.emit('placeSettlement', { vertexKey, isSetup }, (response) => {
      if (response.success) {
        setLastPlacedSettlement(vertexKey);
        if (isSetup) {
          setSelectedAction('road');
        } else {
          setSelectedAction(null);
        }
      } else {
        addNotification(response.error);
      }
    });
  }, [socket, isSetup, addNotification]);

  const handlePlaceRoad = useCallback((edgeKey) => {
    socket.emit('placeRoad', { 
      edgeKey, 
      isSetup, 
      lastSettlement: lastPlacedSettlement 
    }, (response) => {
      if (response.success) {
        if (isSetup) {
          // Advance setup
          socket.emit('advanceSetup', () => {});
          setLastPlacedSettlement(null);
        } else if (gameState.freeRoads > 1) {
          // Still have free roads from Road Building card
          setSelectedAction('road');
        } else {
          setSelectedAction(null);
        }
      } else {
        addNotification(response.error);
      }
    });
  }, [socket, isSetup, lastPlacedSettlement, gameState.freeRoads, addNotification]);

  const handleUpgradeToCity = useCallback((vertexKey) => {
    socket.emit('upgradeToCity', { vertexKey }, (response) => {
      if (response.success) {
        setSelectedAction(null);
      } else {
        addNotification(response.error);
      }
    });
  }, [socket, addNotification]);

  const handleHexClick = useCallback((hexKey) => {
    if (gameState.turnPhase === 'robber' && isMyTurn) {
      if (hexKey === gameState.robber) {
        addNotification('Must move robber to a different hex');
        return;
      }
      
      // Get players on this hex
      socket.emit('getPlayersOnHex', { hexKey }, (response) => {
        if (response.success && response.players.length > 0) {
          setPendingRobberHex(hexKey);
          setPlayersOnHex(response.players);
        } else {
          // No players to steal from, just move
          socket.emit('moveRobber', { hexKey, stealFromPlayerId: null }, (res) => {
            if (!res.success) {
              addNotification(res.error);
            }
          });
        }
      });
    }
  }, [gameState.turnPhase, gameState.robber, isMyTurn, socket, addNotification]);

  const handleStealFromPlayer = useCallback((stealPlayerId) => {
    socket.emit('moveRobber', { 
      hexKey: pendingRobberHex, 
      stealFromPlayerId: stealPlayerId 
    }, (response) => {
      if (response.success) {
        setPendingRobberHex(null);
        setPlayersOnHex([]);
      } else {
        addNotification(response.error);
      }
    });
  }, [socket, pendingRobberHex, addNotification]);

  const handleEndTurn = useCallback(() => {
    socket.emit('endTurn', (response) => {
      if (!response.success) {
        addNotification(response.error);
      }
    });
  }, [socket, addNotification]);

  const handleBuyDevCard = useCallback(() => {
    socket.emit('buyDevCard', (response) => {
      if (response.success) {
        setRevealedCard(response.card);
      } else {
        addNotification(response.error);
      }
    });
  }, [socket, addNotification]);

  const handleStartGame = useCallback(() => {
    socket.emit('startGame', (response) => {
      if (!response.success) {
        addNotification(response.error);
      }
    });
  }, [socket, addNotification]);

  const handleShuffleBoard = useCallback(() => {
    socket.emit('shuffleBoard', (response) => {
      if (response.success) {
        addNotification('Board shuffled!');
      } else {
        addNotification(response.error);
      }
    });
  }, [socket, addNotification]);

  const handleSendChat = useCallback((message) => {
    socket.emit('chatMessage', { message });
  }, [socket]);

  const getStatusMessage = () => {
    const maxPlayers = gameState.maxPlayers || 4;
    if (gameState.phase === 'waiting') {
      const modeText = gameState.isExtended ? '(5-6 Player Mode)' : '';
      return `Board Preview ${modeText} - Waiting for players... (${gameState.players.length}/${maxPlayers})`;
    }
    if (gameState.phase === 'finished') {
      const winner = gameState.players.find(p => p.id === gameState.winner);
      return `🎉 ${winner.name} wins!`;
    }
    if (needsToDiscard) {
      const discardInfo = gameState.discardingPlayers.find(
        d => d.playerIndex === gameState.myIndex
      );
      return `Discard ${discardInfo.cardsToDiscard} cards`;
    }
    if (isSetup) {
      return isMyTurn 
        ? `Place your ${gameState.setupPhase === 0 ? 'first' : 'second'} settlement and road`
        : `${currentPlayer?.name} is placing...`;
    }
    // Special Building Phase (5-6 player extension)
    if (isSpecialBuildPhase) {
      if (isMySpecialBuild) {
        return '🏗️ Special Building Phase - Build or buy cards, then pass';
      }
      const specialBuilder = gameState.players[gameState.specialBuildIndex];
      return `🏗️ Special Building Phase - ${specialBuilder?.name}'s turn to build`;
    }
    if (!isMyTurn) {
      return `${currentPlayer?.name}'s turn`;
    }
    switch (gameState.turnPhase) {
      case 'roll': return 'Roll the dice';
      case 'robber': return 'Move the robber';
      case 'discard': return 'Waiting for players to discard';
      case 'main': return 'Build, trade, or end turn';
      default: return '';
    }
  };
  
  // Handler to end special building phase turn
  const handleEndSpecialBuild = useCallback(() => {
    socket.emit('endSpecialBuild', (response) => {
      if (!response.success) {
        addNotification(response.error);
      }
    });
  }, [socket, addNotification]);

  return (
    <div className="game-board">
      {/* Header */}
      <div className="game-header">
        <div className="game-code-display">
          <span className="label">Game Code:</span>
          <span className="code">{gameCode}</span>
        </div>
        
        <div className="turn-indicator">
          {currentPlayer ? (
            <div 
              className="current-player-badge"
              style={{ backgroundColor: currentPlayer.color }}
            >
              {currentPlayer.name}
            </div>
          ) : (
            <div className="current-player-badge waiting-badge">
              Lobby
            </div>
          )}
          <span className="status-message">{getStatusMessage()}</span>
        </div>

        <button className="leave-btn" onClick={onLeaveGame}>
          Leave Game
        </button>
      </div>

      {/* Main game area */}
      <div className="game-main">
        {/* Left sidebar - Players */}
        <div className="sidebar left-sidebar">
          <h3>Players</h3>
          {gameState.players.map((player, idx) => (
            <PlayerPanel 
              key={player.id}
              player={player}
              isCurrentTurn={idx === gameState.currentPlayerIndex}
              isMe={idx === gameState.myIndex}
              longestRoad={gameState.longestRoadPlayer === idx}
              largestArmy={gameState.largestArmyPlayer === idx}
              gameOver={gameState.phase === 'finished'}
              onRightClick={(e, key, extra) => {
                if (extra) {
                  // Custom info passed
                  e.preventDefault();
                  showInfo(e, key, extra);
                } else {
                  showInfo(e, key);
                }
              }}
            />
          ))}
          
          {isWaiting && (
            <div className="waiting-controls">
              {isHost && (
                <>
                  <button 
                    className="shuffle-btn"
                    onClick={handleShuffleBoard}
                  >
                    🔀 Shuffle Board
                  </button>
                  <button 
                    className="start-game-btn"
                    onClick={handleStartGame}
                    disabled={gameState.players.length < 2}
                  >
                    ▶️ Start Game ({gameState.players.length}/4)
                  </button>
                </>
              )}
              {!isHost && (
                <p className="waiting-text">Waiting for host to start...</p>
              )}
            </div>
          )}
        </div>

        {/* Center - Board */}
        <div className="board-container">
          <HexBoard 
            hexes={gameState.hexes}
            vertices={gameState.vertices}
            edges={gameState.edges}
            robber={gameState.robber}
            players={gameState.players}
            ports={gameState.ports || []}
            selectedAction={selectedAction}
            isMyTurn={isMyTurn}
            canBuildNow={canBuildNow}
            myIndex={gameState.myIndex}
            gamePhase={gameState.phase}
            turnPhase={gameState.turnPhase}
            onPlaceSettlement={handlePlaceSettlement}
            onPlaceRoad={handlePlaceRoad}
            onUpgradeToCity={handleUpgradeToCity}
            onHexClick={handleHexClick}
            onHexRightClick={showHexInfo}
            lastPlacedSettlement={lastPlacedSettlement}
            freeRoads={gameState.freeRoads}
          />
          
          {/* Dice display - auto-hides after 5 seconds */}
          {showDice && gameState.diceRoll && (
            <DiceDisplay 
              roll={gameState.diceRoll} 
              onRightClick={(e, key, extra) => showInfo(e, key, extra)}
            />
          )}
        </div>

        {/* Right sidebar - Actions */}
        <div className="sidebar right-sidebar">
          {gameState.phase === 'playing' && (
            <>
              <ActionPanel 
                isMyTurn={isMyTurn}
                turnPhase={gameState.turnPhase}
                selectedAction={selectedAction}
                setSelectedAction={setSelectedAction}
                onRollDice={handleRollDice}
                onEndTurn={handleEndTurn}
                onBuyDevCard={handleBuyDevCard}
                onOpenTrade={() => setShowTradeModal(true)}
                onOpenDevCards={() => setShowDevCardModal(true)}
                player={myPlayer}
                freeRoads={gameState.freeRoads}
                yearOfPlentyPicks={gameState.yearOfPlentyPicks}
                devCardsLeft={gameState.devCardDeck}
                isSpecialBuildPhase={isSpecialBuildPhase}
                isMySpecialBuild={isMySpecialBuild}
              />
            </>
          )}
          
          <button 
            className="chat-toggle"
            onClick={() => setShowChat(!showChat)}
          >
            💬 Chat
            {unreadMessages > 0 && (
              <span className="chat-notification-dot">{unreadMessages}</span>
            )}
          </button>
        </div>
      </div>

      {/* Bottom - My Resources */}
      <div className="my-resources-bar">
        <ResourceCards 
          resources={myPlayer.resources} 
          onRightClick={(e, resourceKey) => showInfo(e, resourceKey)}
        />
        
        <div className="dev-cards-summary" onClick={() => setShowDevCardModal(true)}>
          <span className="label">Dev Cards:</span>
          <span className="count">{myPlayer.developmentCards?.length || 0}</span>
          {myPlayer.newDevCards?.length > 0 && (
            <span className="new-badge">+{myPlayer.newDevCards.length} new</span>
          )}
        </div>
      </div>

      {/* Robber Phase Banner - shows when player needs to move the robber */}
      {gameState.turnPhase === 'robber' && isMyTurn && (
        <div className="robber-notification-banner">
          <span className="robber-icon">🥷</span>
          <span className="robber-text">
            <strong>Move the Robber!</strong> Click on a hex to place the robber there.
          </span>
        </div>
      )}

      {/* Discard Phase Banner - shows when waiting for others to discard */}
      {gameState.turnPhase === 'discard' && isMyTurn && (
        <div className="discard-notification-banner">
          <span className="discard-icon">⏳</span>
          <span className="discard-text">
            Waiting for players to discard cards...
          </span>
        </div>
      )}

      {/* Special Building Phase Banner (5-6 player extension) */}
      {isMySpecialBuild && (
        <div className="special-build-banner">
          <span className="special-build-icon">🏗️</span>
          <span className="special-build-text">
            <strong>Special Building Phase!</strong> You may build roads, settlements, cities, or buy development cards. No trading allowed.
          </span>
          <button className="special-build-done-btn" onClick={handleEndSpecialBuild}>
            Done Building
          </button>
        </div>
      )}

      {/* Trade Notification Banner - shows when there's a pending trade from another player */}
      {gameState.tradeOffer && 
       gameState.tradeOffer.from !== gameState.myIndex && 
       !showTradeModal && 
       dismissedTradeId !== lastTradeOfferId && (
        <div className="trade-notification-banner">
          <span className="trade-icon">🤝</span>
          <span className="trade-text" onClick={() => setShowTradeModal(true)}>
            <strong>{gameState.players[gameState.tradeOffer.from]?.name}</strong> wants to trade with you!
          </span>
          <button className="view-trade-btn" onClick={() => setShowTradeModal(true)}>View Trade</button>
          <button 
            className="dismiss-trade-btn" 
            onClick={(e) => {
              e.stopPropagation();
              setDismissedTradeId(lastTradeOfferId);
            }}
            title="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Modals */}
      {showTradeModal && (
        <TradeModal 
          socket={socket}
          gameState={gameState}
          myPlayer={myPlayer}
          isMyTurn={isMyTurn}
          onClose={() => setShowTradeModal(false)}
          addNotification={addNotification}
        />
      )}

      {showDevCardModal && (
        <DevCardModal 
          socket={socket}
          myPlayer={myPlayer}
          isMyTurn={isMyTurn}
          turnPhase={gameState.turnPhase}
          yearOfPlentyPicks={gameState.yearOfPlentyPicks}
          onClose={() => setShowDevCardModal(false)}
          addNotification={addNotification}
        />
      )}

      {revealedCard && (
        <CardReveal 
          cardType={revealedCard}
          onClose={() => setRevealedCard(null)}
        />
      )}

      {needsToDiscard && (
        <DiscardModal 
          socket={socket}
          player={myPlayer}
          cardsToDiscard={
            gameState.discardingPlayers.find(d => d.playerIndex === gameState.myIndex)?.cardsToDiscard
          }
          addNotification={addNotification}
        />
      )}

      {/* Steal selection modal */}
      {pendingRobberHex && playersOnHex.length > 0 && (
        <div className="modal-overlay">
          <div className="steal-modal">
            <h3>Steal from whom?</h3>
            <div className="steal-options">
              {playersOnHex.map(p => (
                <button 
                  key={p.id}
                  className="steal-btn"
                  onClick={() => handleStealFromPlayer(p.id)}
                  disabled={!p.hasResources}
                >
                  {p.name}
                  {!p.hasResources && <span className="no-cards">(no cards)</span>}
                </button>
              ))}
            </div>
            {/* Show OK button if no players have cards to steal */}
            {playersOnHex.every(p => !p.hasResources) && (
              <button 
                className="steal-ok-btn"
                onClick={() => handleStealFromPlayer(null)}
              >
                OK
              </button>
            )}
          </div>
        </div>
      )}

      {/* Resource gain notification */}
      {resourceGainNotification && (
        <div className="resource-gain-popup">
          <div className="resource-gain-title">🎲 Rolled {resourceGainNotification.fromRoll}</div>
          <div className="resource-gain-content">
            You received: {resourceGainNotification.gainsList}
          </div>
        </div>
      )}

      {/* Chat panel */}
      {showChat && (
        <Chat 
          messages={chatMessages}
          onSend={handleSendChat}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Info Popup for right-click help */}
      {infoPopup && (
        <InfoPopup 
          position={infoPopup.position}
          info={infoPopup.info}
          onClose={closeInfoPopup}
        />
      )}

      {/* Victory celebration with confetti */}
      {gameState.phase === 'finished' && gameState.winner && (
        <Confetti 
          winner={gameState.players.find(p => p.id === gameState.winner)}
          onBackToLobby={onLeaveGame}
        />
      )}
    </div>
  );
}

export default GameBoard;

