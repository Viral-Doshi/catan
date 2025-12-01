import { useEffect, useState } from 'react';
import './Confetti.css';

const CONFETTI_COLORS = [
  '#e63946', // red
  '#457b9d', // blue
  '#f4a261', // orange
  '#2a9d8f', // teal
  '#d4a942', // gold
  '#9b59b6', // purple
  '#2ecc71', // green
  '#e74c3c', // bright red
];

function Confetti({ winner, onBackToLobby }) {
  const [confetti, setConfetti] = useState([]);

  useEffect(() => {
    // Generate confetti pieces
    const pieces = [];
    for (let i = 0; i < 150; i++) {
      pieces.push({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 3,
        duration: 3 + Math.random() * 2,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: 8 + Math.random() * 8,
        rotation: Math.random() * 360,
        type: Math.random() > 0.5 ? 'square' : 'circle'
      });
    }
    setConfetti(pieces);
  }, []);

  return (
    <div className="confetti-container">
      {/* Confetti pieces */}
      {confetti.map(piece => (
        <div
          key={piece.id}
          className={`confetti-piece ${piece.type}`}
          style={{
            left: `${piece.left}%`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            backgroundColor: piece.color,
            width: `${piece.size}px`,
            height: piece.type === 'square' ? `${piece.size}px` : `${piece.size * 0.4}px`,
            transform: `rotate(${piece.rotation}deg)`
          }}
        />
      ))}
      
      {/* Winner banner */}
      <div className="winner-banner">
        <div className="winner-trophy">🏆</div>
        <h1 className="winner-text">
          {winner?.name || 'Someone'} Wins!
        </h1>
        <div className="winner-subtitle">
          Victory achieved with {(winner?.victoryPoints || 10) + (winner?.hiddenVictoryPoints || 0)} points!
        </div>
        <div className="celebration-emojis">
          🎉 🎊 🥳 🎉 🎊
        </div>
        {onBackToLobby && (
          <button className="back-to-lobby-btn" onClick={onBackToLobby}>
            🏠 Back to Lobby
          </button>
        )}
      </div>
    </div>
  );
}

export default Confetti;

