# 🏝️ Catan Online

A real-time multiplayer implementation of the classic Settlers of Catan board game, built with React and Socket.io.

![Catan](https://img.shields.io/badge/Players-2--6-blue) ![License](https://img.shields.io/badge/License-MIT-green) ![Status](https://img.shields.io/badge/Status-Complete-brightgreen)

## ✨ Features

- **Full Game Rules** - Complete implementation of official Catan rules
- **Multiplayer** - Play with 2-6 friends online in real-time
- **5-6 Player Extension** - Larger board with Special Building Phase
- **Trading System** - Player-to-player trades, bank trades (4:1), and port trades (3:1 / 2:1)
- **Development Cards** - Knights, Victory Points, Road Building, Year of Plenty, Monopoly
- **Dynamic Board** - Shuffle and preview board before starting
- **Interactive UI** - Right-click any element for helpful info
- **Responsive Design** - Beautiful dark theme with animations

## 🎮 How to Play

1. **Play Now** → [https://catan-henna.vercel.app](https://catan-henna.vercel.app)
2. **Create or Join** - One player creates a game and shares the 6-letter code
3. **Setup Phase** - Each player places 2 settlements and 2 roads
4. **Main Game** - Roll dice, collect resources, build, and trade
5. **Win** - First player to reach 10 Victory Points wins!

## 🚀 Quick Start

### Prerequisites (for debugging)
- Node.js 18+
- npm

### Run Locally (for debugging)

```bash
# Clone the repository
git clone https://github.com/Viral-Doshi/catan.git
cd catan

# Start the server
cd server
npm install
npm start

# In a new terminal, start the client
cd client
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## 🌐 Deployment

**Live Game:** [https://catan-henna.vercel.app](https://catan-henna.vercel.app)

| Component | Platform | URL |
|-----------|----------|-----|
| Frontend | Vercel | https://catan-henna.vercel.app |
| Backend | Render | https://catan-server-oc59.onrender.com |

### ⚠️ Free Tier Notice

This deployment uses **free hosting tiers** with the following limitations:
- Server may take 30-60 seconds to wake up on first request
- Limited to ~200 concurrent players and ~50 active games
- Server may experience slowdowns during high traffic

**For uninterrupted gameplay**, consider deploying your own private instance. Fork this repository and deploy to your own Vercel/Render accounts for a dedicated experience.

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | React, Vite |
| Backend | Node.js, Express |
| Real-time | Socket.io |
| Styling | CSS3 with CSS Variables |


## 🎯 Game Rules Quick Reference

| Building | Cost | Victory Points |
|----------|------|----------------|
| Road | 🧱 🪵 | 0 |
| Settlement | 🧱 🪵 🐑 🌾 | 1 |
| City | ⛏️⛏️⛏️ 🌾🌾 | 2 |
| Dev Card | ⛏️ 🌾 🐑 | ? |

**Bonus VP:** Longest Road (5+) = 2 VP | Largest Army (3+ Knights) = 2 VP

## 👤 Author

**Viral Doshi**
LinkedIn - https://www.linkedin.com/in/doshi-viral/

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

## ⚠️ Disclaimer

This is an independent fan-made project for **educational purposes only**. It is NOT affiliated with, endorsed by, or connected to Catan GmbH, Catan Studio, or Asmodee.

"Catan" is a registered trademark of Catan GmbH. For the official game, visit [catan.com](https://www.catan.com/).



