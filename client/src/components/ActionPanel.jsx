import './ActionPanel.css';

const BUILDING_COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
  developmentCard: { ore: 1, grain: 1, wool: 1 }
};

function hasResources(player, costs) {
  for (const [resource, amount] of Object.entries(costs)) {
    if ((player.resources[resource] || 0) < amount) {
      return false;
    }
  }
  return true;
}

function ActionPanel({ 
  isMyTurn, 
  turnPhase, 
  selectedAction, 
  setSelectedAction,
  onRollDice,
  onEndTurn,
  onBuyDevCard,
  onOpenTrade,
  onOpenDevCards,
  player,
  freeRoads,
  yearOfPlentyPicks,
  devCardsLeft,
  isSpecialBuildPhase = false,
  isMySpecialBuild = false
}) {
  const canRoll = isMyTurn && turnPhase === 'roll';
  
  // During special build phase, the player can build but not trade or roll
  const canBuild = (isMyTurn && turnPhase === 'main') || isMySpecialBuild;
  const canTrade = isMyTurn && turnPhase === 'main' && !isSpecialBuildPhase;
  const canEnd = isMyTurn && turnPhase === 'main' && !isSpecialBuildPhase;
  
  // Can play dev cards on your own turn before or after rolling (but not during special build)
  const canPlayDevCards = isMyTurn && (turnPhase === 'roll' || turnPhase === 'main');

  const canAffordRoad = hasResources(player, BUILDING_COSTS.road) || freeRoads > 0;
  const canAffordSettlement = hasResources(player, BUILDING_COSTS.settlement);
  const canAffordCity = hasResources(player, BUILDING_COSTS.city);
  const canAffordDevCard = hasResources(player, BUILDING_COSTS.developmentCard);

  const hasDevCards = (player.developmentCards?.length || 0) > 0;

  return (
    <div className="action-panel">
      <h3>Actions</h3>
      
      {/* Special Build Phase indicator */}
      {isMySpecialBuild && (
        <div className="special-build-indicator">
          🏗️ Special Building Phase
          <span className="no-trade-hint">(No trading allowed)</span>
        </div>
      )}
      
      {/* Roll Dice */}
      <button 
        className={`action-btn roll-btn ${canRoll ? 'primary' : ''}`}
        onClick={onRollDice}
        disabled={!canRoll}
      >
        🎲 Roll Dice
      </button>

      {/* Year of Plenty indicator */}
      {yearOfPlentyPicks > 0 && (
        <div className="special-action">
          <p>Year of Plenty: Pick {yearOfPlentyPicks} resource(s)</p>
          <button onClick={onOpenDevCards}>Choose Resources</button>
        </div>
      )}

      {/* Free Roads indicator */}
      {freeRoads > 0 && (
        <div className="special-action">
          <p>Road Building: {freeRoads} free road(s)</p>
          <button 
            className={selectedAction === 'road' ? 'active' : ''}
            onClick={() => setSelectedAction('road')}
          >
            Place Road
          </button>
        </div>
      )}

      {/* Build Section */}
      <div className="action-section">
        <h4>Build</h4>
        
        <button
          className={`action-btn build-btn ${selectedAction === 'road' ? 'active' : ''}`}
          onClick={() => setSelectedAction(selectedAction === 'road' ? null : 'road')}
          disabled={!canBuild || (!canAffordRoad && freeRoads === 0)}
        >
          <span className="btn-icon">━</span>
          <span className="btn-label">Road</span>
          <span className="cost">🧱1 🪵1</span>
        </button>

        <button
          className={`action-btn build-btn ${selectedAction === 'settlement' ? 'active' : ''}`}
          onClick={() => setSelectedAction(selectedAction === 'settlement' ? null : 'settlement')}
          disabled={!canBuild || !canAffordSettlement || player.settlements <= 0}
        >
          <span className="btn-icon">🏠</span>
          <span className="btn-label">Settlement</span>
          <span className="cost">🧱1 🪵1 🐑1 🌾1</span>
        </button>

        <button
          className={`action-btn build-btn ${selectedAction === 'city' ? 'active' : ''}`}
          onClick={() => setSelectedAction(selectedAction === 'city' ? null : 'city')}
          disabled={!canBuild || !canAffordCity || player.cities <= 0}
        >
          <span className="btn-icon">🏰</span>
          <span className="btn-label">City</span>
          <span className="cost">⛏️3 🌾2</span>
        </button>

        <button
          className="action-btn build-btn dev-card-btn"
          onClick={onBuyDevCard}
          disabled={!canBuild || !canAffordDevCard || devCardsLeft === 0}
        >
          <span className="btn-icon">📜</span>
          <span className="btn-label">Dev Card</span>
          <span className="cost">⛏️1 🌾1 🐑1</span>
          {devCardsLeft <= 5 && <span className="remaining">({devCardsLeft} left)</span>}
        </button>
      </div>

      {/* Trade Section */}
      <div className="action-section">
        <h4>Trade {isMySpecialBuild && <span className="disabled-hint">(disabled)</span>}</h4>
        
        <button
          className="action-btn trade-btn"
          onClick={onOpenTrade}
          disabled={!canTrade}
        >
          🤝 Trade
        </button>
      </div>

      {/* Development Cards */}
      {hasDevCards && (
        <div className="action-section">
          <h4>Development Cards</h4>
          <button
            className="action-btn"
            onClick={onOpenDevCards}
            disabled={!canPlayDevCards}
          >
            📜 View & Play Cards ({player.developmentCards.length})
          </button>
        </div>
      )}

      {/* End Turn */}
      <button 
        className={`action-btn end-turn-btn ${canEnd ? 'highlight' : ''}`}
        onClick={onEndTurn}
        disabled={!canEnd}
      >
        ⏭️ End Turn
      </button>
    </div>
  );
}

export default ActionPanel;
