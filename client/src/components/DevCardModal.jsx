import { useState } from 'react';
import './DevCardModal.css';

const DEV_CARD_INFO = {
  knight: {
    name: 'Knight',
    icon: '⚔️',
    description: 'Move the robber and steal from an opponent. Counts toward Largest Army.',
    playable: true
  },
  victoryPoint: {
    name: 'Victory Point',
    icon: '🏆',
    description: 'Worth 1 VP. Revealed at end of game or when you win.',
    playable: false
  },
  roadBuilding: {
    name: 'Road Building',
    icon: '🛤️',
    description: 'Build 2 roads for free.',
    playable: true
  },
  yearOfPlenty: {
    name: 'Year of Plenty',
    icon: '🌈',
    description: 'Take any 2 resources from the bank.',
    playable: true
  },
  monopoly: {
    name: 'Monopoly',
    icon: '💰',
    description: 'Name a resource. All players give you all their cards of that type.',
    playable: true
  }
};

const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
const RESOURCE_ICONS = {
  brick: '🧱',
  lumber: '🪵',
  wool: '🐑',
  grain: '🌾',
  ore: '⛏️'
};

function DevCardModal({ socket, myPlayer, isMyTurn, turnPhase, yearOfPlentyPicks, onClose, addNotification }) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [monopolyResource, setMonopolyResource] = useState(null);

  // Can play dev cards before rolling (roll phase) or after rolling (main phase)
  const canPlay = isMyTurn && (turnPhase === 'roll' || turnPhase === 'main');

  const handlePlayCard = (cardType) => {
    if (cardType === 'monopoly') {
      setSelectedCard('monopoly');
      return;
    }

    socket.emit('playDevCard', { cardType, params: {} }, (response) => {
      if (response.success) {
        addNotification(`Played ${DEV_CARD_INFO[cardType].name}!`);
        if (cardType === 'knight' || cardType === 'roadBuilding') {
          onClose();
        }
      } else {
        addNotification(response.error);
      }
    });
  };

  const handleMonopoly = () => {
    if (!monopolyResource) {
      addNotification('Select a resource');
      return;
    }

    socket.emit('playDevCard', { 
      cardType: 'monopoly', 
      params: { resource: monopolyResource } 
    }, (response) => {
      if (response.success) {
        addNotification(`Monopoly on ${monopolyResource}!`);
        onClose();
      } else {
        addNotification(response.error);
      }
    });
  };

  const handleYearOfPlentyPick = (resource) => {
    socket.emit('yearOfPlentyPick', { resource }, (response) => {
      if (!response.success) {
        addNotification(response.error);
      }
    });
  };

  // Group cards by type
  const cardCounts = {};
  myPlayer.developmentCards?.forEach(card => {
    cardCounts[card] = (cardCounts[card] || 0) + 1;
  });

  const newCards = myPlayer.newDevCards || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="dev-card-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>×</button>
        
        <h2>Development Cards</h2>

        {/* Year of Plenty resource picking */}
        {yearOfPlentyPicks > 0 && (
          <div className="year-of-plenty-picker">
            <h3>Year of Plenty - Pick {yearOfPlentyPicks} resource(s)</h3>
            <div className="resource-buttons">
              {RESOURCES.map(r => (
                <button
                  key={r}
                  className="resource-pick-btn"
                  onClick={() => handleYearOfPlentyPick(r)}
                >
                  <span className="icon">{RESOURCE_ICONS[r]}</span>
                  <span className="name">{r}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Monopoly resource selection */}
        {selectedCard === 'monopoly' && (
          <div className="monopoly-picker">
            <h3>Choose resource to monopolize</h3>
            <div className="resource-buttons">
              {RESOURCES.map(r => (
                <button
                  key={r}
                  className={`resource-pick-btn ${monopolyResource === r ? 'selected' : ''}`}
                  onClick={() => setMonopolyResource(r)}
                >
                  <span className="icon">{RESOURCE_ICONS[r]}</span>
                  <span className="name">{r}</span>
                </button>
              ))}
            </div>
            <div className="monopoly-actions">
              <button onClick={() => setSelectedCard(null)}>Cancel</button>
              <button className="confirm" onClick={handleMonopoly}>Confirm</button>
            </div>
          </div>
        )}

        {/* Cards list */}
        {!selectedCard && (
          <>
            {Object.keys(cardCounts).length === 0 && newCards.length === 0 ? (
              <p className="no-cards">You have no development cards.</p>
            ) : (
              <>
                {/* Playable cards */}
                <div className="card-list">
                  {Object.entries(cardCounts).map(([cardType, count]) => {
                    const info = DEV_CARD_INFO[cardType];
                    const isPlayable = info.playable && canPlay;
                    
                    return (
                      <div key={cardType} className={`dev-card ${isPlayable ? 'playable' : ''}`}>
                        <div className="card-header">
                          <span className="card-icon">{info.icon}</span>
                          <span className="card-name">{info.name}</span>
                          <span className="card-count">×{count}</span>
                        </div>
                        <p className="card-description">{info.description}</p>
                        {info.playable && (
                          <button
                            className="play-card-btn"
                            onClick={() => handlePlayCard(cardType)}
                            disabled={!isPlayable}
                          >
                            Play
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* New cards (bought this turn) */}
                {newCards.length > 0 && (
                  <div className="new-cards">
                    <h4>Bought This Turn (can't play yet)</h4>
                    <div className="card-list small">
                      {newCards.map((cardType, idx) => {
                        const info = DEV_CARD_INFO[cardType];
                        return (
                          <div key={idx} className="dev-card new">
                            <span className="card-icon">{info.icon}</span>
                            <span className="card-name">{info.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default DevCardModal;

