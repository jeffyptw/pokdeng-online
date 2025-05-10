// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://pokdeng-online1.onrender.com", // หรือ origin ของ client ของคุณ
    methods: ["GET", "POST"],
  },
});

const SUITS = ["♠️", "♥️", "♦️", "♣️"];
const VALUES = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const DEFAULT_TURN_DURATION = 30;
const DEFAULT_BET_AMOUNT = 5;

// --- Game Logic (Card Utilities, Hand Ranking - เหมือนเดิมจากครั้งที่แล้ว) ---
function createDeck() {
  return SUITS.flatMap((suit) => VALUES.map((value) => ({ suit, value })));
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function getCardPoint(value) {
  if (["10", "J", "Q", "K"].includes(value)) return 0;
  if (value === "A") return 1;
  return parseInt(value);
}

function calculateScore(cards) {
  if (!cards || cards.length === 0) return 0;
  return cards.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
}

function getCardDisplay(card) {
  if (
    card &&
    typeof card.value !== "undefined" &&
    typeof card.suit !== "undefined"
  )
    return `${card.value}${card.suit}`;
  return "?";
}

function getHandRank(cardsInput) {
  const cards = cardsInput || [];
  if (cards.length === 0) {
    return { rank: 8, type: "ไม่มีไพ่", score: 0, multiplier: 1, cards };
  }
  const values = cards.map((c) => c.value);
  const suits = cards.map((c) => c.suit);
  const score = calculateScore(cards);
  const isSameSuit = cards.length > 0 && suits.every((s) => s === suits[0]);
  const valueCounts = {};
  values.forEach((v) => (valueCounts[v] = (valueCounts[v] || 0) + 1));
  let isStraight = false;
  if (cards.length === 3) {
    const sortedNumericalValues = cards
      .map((c) => ({ A: 1, J: 11, Q: 12, K: 13 }[c.value] || parseInt(c.value)))
      .sort((a, b) => a - b);
    const isNormalStraight =
      sortedNumericalValues[1] === sortedNumericalValues[0] + 1 &&
      sortedNumericalValues[2] === sortedNumericalValues[1] + 1;
    const isAQKStraight =
      sortedNumericalValues[0] === 1 &&
      sortedNumericalValues[1] === 12 &&
      sortedNumericalValues[2] === 13;
    isStraight = isNormalStraight || isAQKStraight;
  }

  if (cards.length === 2) {
    const isPair = values[0] === values[1];
    const isTwoCardSameSuit = isSameSuit;
    const isDoubleDeng = isPair || isTwoCardSameSuit;
    if (score === 9)
      return {
        rank: 1,
        type: isDoubleDeng ? "ป๊อก 9 สองเด้ง" : "ป๊อก 9",
        score,
        multiplier: isDoubleDeng ? 2 : 1,
        cards,
      };
    if (score === 8)
      return {
        rank: 1,
        type: isDoubleDeng ? "ป๊อก 8 สองเด้ง" : "ป๊อก 8",
        score,
        multiplier: isDoubleDeng ? 2 : 1,
        cards,
      };
  }
  if (cards.length === 3) {
    if (Object.values(valueCounts).includes(3)) {
      let tongValueStrength = 0;
      const cardValue = values[0];
      if (cardValue === "A") tongValueStrength = 14;
      else if (cardValue === "K") tongValueStrength = 13;
      else if (cardValue === "Q") tongValueStrength = 12;
      else if (cardValue === "J") tongValueStrength = 11;
      else tongValueStrength = parseInt(cardValue);
      return {
        rank: 2,
        subRank: tongValueStrength,
        type: `ตอง ${values[0]}`,
        score,
        multiplier: 5,
        cards,
      };
    }
    if (isStraight && isSameSuit) {
      return { rank: 3, type: "สเตรทฟลัช", score, multiplier: 5, cards };
    }
    const isThreeFaceCards = values.every((v) => ["J", "Q", "K"].includes(v));
    if (isThreeFaceCards) {
      return { rank: 4, type: "เซียน (JQK)", score: 0, multiplier: 3, cards };
    }
    if (isStraight) {
      return { rank: 5, type: "เรียง", score, multiplier: 3, cards };
    }
    if (isSameSuit) {
      return {
        rank: 6,
        type: `สามเด้ง (${score} แต้ม)`,
        score,
        multiplier: 3,
        cards,
      };
    }
  }
  if (cards.length === 2) {
    const isPair = values[0] === values[1];
    const isTwoCardSameSuit = isSameSuit;
    if (isPair && isTwoCardSameSuit)
      return {
        rank: 7.1,
        type: `สองเด้ง (คู่และสี ${score} แต้ม)`,
        score,
        multiplier: 2,
        cards,
      };
    if (isPair)
      return {
        rank: 7.2,
        type: `สองเด้ง (คู่ ${score} แต้ม)`,
        score,
        multiplier: 2,
        cards,
      };
    if (isTwoCardSameSuit)
      return {
        rank: 7.3,
        type: `สองเด้ง (สี ${score} แต้ม)`,
        score,
        multiplier: 2,
        cards,
      };
  }
  return { rank: 8, type: `${score} แต้ม`, score, multiplier: 1, cards };
}
// --- End Game Logic ---

const rooms = {};

function initializePlayer(id, name, initialBalance, isDealer = false) {
  return {
    id,
    name,
    initialBalance: parseInt(initialBalance),
    balance: parseInt(initialBalance),
    cards: [],
    handDetails: null,
    hasStayed: false,
    isDealer,
    role: isDealer ? "เจ้ามือ" : "ผู้เล่น",
    actionTakenThisTurn: false,
    disconnectedMidGame: false,
  };
}

function getRoomPlayerData(room) {
  if (!room || !room.players) return [];
  return room.players.map((p) => ({
    id: p.id,
    name: p.name,
    balance: p.balance,
    role: p.role,
    isDealer: p.isDealer,
  }));
}

// --- Core Result Calculation Logic ---
function performResultCalculation(room) {
  const dealer = room.players.find((p) => p.isDealer);
  if (!dealer) {
    console.error(
      "[Server] Dealer not found in performResultCalculation for room:",
      room.id
    );
    return null;
  }

  dealer.handDetails = getHandRank(dealer.cards); // Ensure dealer's hand is up-to-date

  const roundResults = [];
  let dealerNetChange = 0;

  room.players.forEach((player) => {
    if (player.isDealer) {
      // Skip dealer for now, add them at the end
      return;
    }

    player.handDetails = getHandRank(player.cards); // Ensure player's hand is up-to-date
    let outcome = "แพ้";
    let moneyChange = 0;
    const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

    if (player.disconnectedMidGame) {
      outcome = "ขาดการเชื่อมต่อ";
      moneyChange = -betAmount; // Player forfeits their bet
      player.balance += moneyChange;
      dealerNetChange -= moneyChange; // Dealer collects the forfeited bet
    } else {
      const playerHand = player.handDetails;
      const dealerHand = dealer.handDetails;

      if (playerHand.rank === 1 && dealerHand.rank === 1) {
        // Player Pok, Dealer Pok
        if (playerHand.score > dealerHand.score) {
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.score < dealerHand.score) {
          outcome = "แพ้";
          moneyChange = -betAmount;
        } else {
          if (playerHand.multiplier > dealerHand.multiplier) {
            outcome = "ชนะ";
            moneyChange = betAmount * playerHand.multiplier;
          } else if (playerHand.multiplier < dealerHand.multiplier) {
            outcome = "แพ้";
            moneyChange = -betAmount;
          } else {
            outcome = "เสมอ";
            moneyChange = 0;
          }
        }
      } else if (playerHand.rank === 1 && dealerHand.rank !== 1) {
        // Player Pok, Dealer No Pok
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (dealerHand.rank === 1 && playerHand.rank !== 1) {
        // Dealer Pok, Player No Pok
        outcome = "แพ้";
        moneyChange = -betAmount;
      } else {
        // Neither has Pok
        if (playerHand.rank < dealerHand.rank) {
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.rank > dealerHand.rank) {
          outcome = "แพ้";
          moneyChange = -betAmount;
        } else {
          let playerComparableScore = playerHand.score;
          let dealerComparableScore = dealerHand.score;
          if (playerHand.rank === 2 && dealerHand.rank === 2) {
            // Both Tong
            playerComparableScore = playerHand.subRank || playerHand.score;
            dealerComparableScore = dealerHand.subRank || dealerHand.score;
          }
          if (playerComparableScore > dealerComparableScore) {
            outcome = "ชนะ";
            moneyChange = betAmount * playerHand.multiplier;
          } else if (playerComparableScore < dealerComparableScore) {
            outcome = "แพ้";
            moneyChange = -betAmount;
          } else {
            if (playerHand.multiplier > dealerHand.multiplier) {
              outcome = "ชนะ";
              moneyChange = betAmount * playerHand.multiplier;
            } else if (playerHand.multiplier < dealerHand.multiplier) {
              outcome = "แพ้";
              moneyChange = -betAmount;
            } else {
              outcome = "เสมอ";
              moneyChange = 0;
            }
          }
        }
      }
      player.balance += moneyChange;
      dealerNetChange -= moneyChange; // Accumulate dealer's change (opposite of player's)
    }

    roundResults.push({
      id: player.id,
      name: player.name,
      cardsDisplay: player.cards.map(getCardDisplay),
      score: player.handDetails.score,
      specialType: player.handDetails.type,
      outcome: outcome,
      moneyChange: moneyChange,
      balance: player.balance,
    });
  });

  dealer.balance += dealerNetChange;
  roundResults.push({
    // Add dealer's result last
    id: dealer.id,
    name: dealer.name,
    cardsDisplay: dealer.cards.map(getCardDisplay),
    score: dealer.handDetails.score,
    specialType: dealer.handDetails.type,
    outcome: "เจ้ามือ",
    moneyChange: dealerNetChange,
    balance: dealer.balance,
  });

  return roundResults;
}

function calculateAndEmitResults(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  if (room.resultsCache) {
    io.to(roomId).emit("result", room.resultsCache);
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
    io.to(room.dealerId).emit("enableShowResult", false);
    return;
  }

  clearTurnTimer(room);
  const roundResults = performResultCalculation(room);
  if (roundResults) {
    room.resultsCache = roundResults;
    io.to(roomId).emit("result", roundResults);
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
  }
  room.gameStarted = false; // Game round is over, ready for reset/new game
  room.currentTurnPlayerId = null;
  io.to(roomId).emit("currentTurn", { id: null }); // Clear current turn display on client
  io.to(room.dealerId).emit("enableShowResult", false);
}

io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("createRoom", ({ playerName, initialBalance }) => {
    // ... (เหมือนเดิม)
    try {
      if (!playerName || playerName.trim() === "") {
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });
      }
      if (isNaN(parseInt(initialBalance)) || parseInt(initialBalance) < 10) {
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นต้องเป็นตัวเลขอย่างน้อย 10",
        });
      }
      if (
        parseInt(initialBalance) % 10 !== 0 &&
        parseInt(initialBalance) % 5 !== 0
      ) {
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นต้องลงท้ายด้วย 0 หรือ 5",
        });
      }
      const roomId = uuidv4().slice(0, 5).toUpperCase();
      const dealer = initializePlayer(
        socket.id,
        playerName,
        initialBalance,
        true
      );
      rooms[roomId] = {
        id: roomId,
        dealerId: socket.id,
        dealerName: playerName,
        players: [dealer],
        betAmount: 0,
        isLocked: false,
        gameStarted: false,
        currentTurnPlayerId: null,
        currentPlayerIndexInOrder: -1,
        deck: [],
        turnTimerInterval: null,
        turnTimeout: null,
        gameRound: 0,
        playerActionOrder: [],
        resultsCache: null,
      };
      socket.join(roomId);
      socket.emit("roomCreated", {
        roomId: roomId,
        dealerName: playerName,
        betAmount: 0,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(rooms[roomId]));
      io.to(roomId).emit("message", { text: `${playerName} ได้สร้างห้อง.` });
    } catch (error) {
      console.error("[Server] Error creating room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการสร้างห้อง" });
    }
  });

  socket.on("joinRoom", ({ roomId, playerName, initialBalance }) => {
    // ... (เหมือนเดิม)
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
      if (room.isLocked && !room.gameStarted)
        return socket.emit("errorMessage", { text: "ห้องถูกล็อคโดยเจ้ามือ" });
      if (room.gameStarted)
        return socket.emit("errorMessage", {
          text: "เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้",
        });
      if (room.players.length >= 7)
        return socket.emit("errorMessage", { text: "ห้องเต็มแล้ว" });
      if (room.players.find((p) => p.id === socket.id))
        return socket.emit("errorMessage", { text: "คุณอยู่ในห้องนี้แล้ว" });
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });
      if (isNaN(parseInt(initialBalance)) || parseInt(initialBalance) < 10)
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นต้องเป็นตัวเลขอย่างน้อย 10",
        });
      if (
        parseInt(initialBalance) % 10 !== 0 &&
        parseInt(initialBalance) % 5 !== 0
      )
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นต้องลงท้ายด้วย 0 หรือ 5",
        });

      const player = initializePlayer(
        socket.id,
        playerName,
        initialBalance,
        false
      );
      room.players.push(player);
      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId: room.id,
        dealerName: room.dealerName,
        betAmount: room.betAmount,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", { text: `${playerName} ได้เข้าร่วมห้อง.` });
    } catch (error) {
      console.error("[Server] Error joining room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการเข้าร่วมห้อง" });
    }
  });

  socket.on("setBetAmount", ({ roomId, amount }) => {
    // ... (เหมือนเดิม)
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) return;
      const bet = parseInt(amount);
      if (
        isNaN(bet) ||
        bet < DEFAULT_BET_AMOUNT ||
        (bet % 10 !== 0 && bet % 5 !== 0)
      ) {
        return socket.emit("errorMessage", {
          text: `จำนวนเงินเดิมพันต้องมากกว่าหรือเท่ากับ ${DEFAULT_BET_AMOUNT} และลงท้ายด้วย 0 หรือ 5`,
        });
      }
      room.betAmount = bet;
      io.to(roomId).emit("roomSettings", { betAmount: room.betAmount });
      io.to(roomId).emit("message", {
        text: `เจ้ามือตั้งค่าเดิมพันเป็น ${bet}`,
      });
    } catch (error) {
      console.error("[Server] Error setting bet amount:", error);
      socket.emit("errorMessage", {
        text: "เกิดข้อผิดพลาดในการตั้งค่าเดิมพัน",
      });
    }
  });

  socket.on("lockRoom", ({ roomId, lock }) => {
    // ... (เหมือนเดิม)
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId) return;
      room.isLocked = lock;
      io.to(roomId).emit("lockRoom", room.isLocked);
      io.to(roomId).emit("message", {
        text: `ห้องถูก${lock ? "ล็อค" : "ปลดล็อค"}`,
      });
    } catch (error) {
      console.error("[Server] Error locking room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการล็อคห้อง" });
    }
  });

  socket.on("startGame", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) return;
      if (room.betAmount <= 0)
        return socket.emit("errorMessage", {
          text: "กรุณาตั้งค่าเดิมพันก่อนเริ่มเกม",
        });
      if (room.players.length < 2)
        return socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 2 คน",
        });

      for (const player of room.players) {
        if (!player.isDealer && player.balance < room.betAmount) {
          return io.to(roomId).emit("errorMessage", {
            text: `ผู้เล่น ${player.name} มีเงินไม่พอ (${room.betAmount})`,
          });
        }
      }

      room.gameStarted = true;
      room.gameRound++;
      room.resultsCache = null;
      room.deck = shuffleDeck(createDeck());
      io.to(roomId).emit("enableShowResult", false); // Disable show result button at start of new round

      room.players.forEach((player) => {
        player.cards = [room.deck.pop(), room.deck.pop()];
        player.handDetails = getHandRank(player.cards);
        player.hasStayed = false;
        player.actionTakenThisTurn = false;
        socket
          .to(player.id)
          .emit("yourCards", player.cards.map(getCardDisplay));
      });

      io.to(roomId).emit("gameStarted", { betAmount: room.betAmount });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่มแล้ว! เดิมพัน: ${room.betAmount}`,
      });

      // **[NEW] Check for Dealer Pok**
      const dealer = room.players.find((p) => p.isDealer);
      if (dealer.handDetails.rank === 1) {
        // Dealer has Pok
        io.to(roomId).emit("message", {
          text: `เจ้ามือได้ ${dealer.handDetails.type}! เปิดไพ่ทันที!`,
        });
        // Mark all players as "stayed" because their turn is effectively over
        room.players.forEach((p) => {
          if (!p.isDealer) p.hasStayed = true; // Their 2 cards are final
        });
        calculateAndEmitResults(roomId); // Calculate and show results immediately
        return; // End startGame processing here
      }

      // **[NEW] Check for Player Pok and mark them as stayed**
      room.players.forEach((player) => {
        if (!player.isDealer && player.handDetails.rank === 1) {
          // Player has Pok
          player.hasStayed = true;
          player.actionTakenThisTurn = true; // Their "turn" is done
          io.to(roomId).emit("message", {
            text: `${player.name} ได้ ${player.handDetails.type}! (ข้ามตา)`,
          });
        }
      });

      // Define player turn order: active non-dealer players first, then dealer
      room.playerActionOrder = room.players
        .filter((p) => !p.isDealer && !p.disconnectedMidGame)
        .map((p) => p.id);
      room.playerActionOrder.push(room.dealerId); // Dealer is always last to act if game continues

      room.currentPlayerIndexInOrder = -1; // advanceTurn will increment this
      advanceTurn(roomId); // Start the first actual turn
    } catch (error) {
      console.error("[Server] Error starting game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการเริ่มเกม" });
    }
  });

  socket.on("drawCard", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || !room.gameStarted) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || player.id !== room.currentTurnPlayerId || player.hasStayed)
        return;
      if (player.cards.length >= 3)
        return socket.emit("errorMessage", { text: "คุณมีไพ่ 3 ใบแล้ว" });

      clearTurnTimer(room);

      player.cards.push(room.deck.pop());
      player.handDetails = getHandRank(player.cards);
      player.actionTakenThisTurn = true;

      // If player draws to 3 cards, they automatically stay for drawing purposes
      if (player.cards.length === 3) {
        player.hasStayed = true; // Player cannot draw more.
      }
      // If player gets Pok with 3 cards (rare, usually means busted or low score for PokDeng)
      if (player.handDetails.rank === 1 && player.cards.length === 3) {
        // e.g. A, A, 6 = Pok 8 (if game rule allows 3 card Pok)
        player.hasStayed = true; // Pok with 3 cards also means stay
      }

      socket.emit("yourCards", player.cards.map(getCardDisplay));
      io.to(roomId).emit("message", { text: `${player.name} จั่วไพ่.` });

      if (player.hasStayed) {
        // Auto-stayed after drawing 3rd card or getting 3-card pok
        advanceTurn(roomId);
      } else {
        // Restart timer for the same player to decide to stay
        startPlayerTurnTimer(room, player.id);
      }
    } catch (error) {
      console.error("[Server] Error drawing card:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการจั่วไพ่" });
    }
  });

  socket.on("stay", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || !room.gameStarted) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || player.id !== room.currentTurnPlayerId || player.hasStayed)
        return;

      clearTurnTimer(room);
      player.hasStayed = true;
      player.actionTakenThisTurn = true;
      io.to(roomId).emit("message", { text: `${player.name} หมอบ (Stay).` });
      advanceTurn(roomId);
    } catch (error) {
      console.error("[Server] Error staying:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการหมอบ" });
    }
  });

  socket.on("showResult", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
      if (socket.id !== room.dealerId)
        return socket.emit("errorMessage", {
          text: "เฉพาะเจ้ามือที่แสดงผลได้",
        });
      // Allow showing result if cache exists (e.g. dealer pok'd) or if game not "started" (meaning it finished)
      if (room.gameStarted && !room.resultsCache) {
        // If game is marked as "started" but no results cache, it implies players might still be playing.
        // Check if it's dealer's turn and they are the one pressing.
        const dealerPlayer = room.players.find((p) => p.id === room.dealerId);
        if (room.currentTurnPlayerId === room.dealerId && dealerPlayer) {
          // If it's dealer's turn and they press show results, it implies they are staying.
          clearTurnTimer(room);
          dealerPlayer.hasStayed = true;
          dealerPlayer.actionTakenThisTurn = true;
          // proceed to calculateAndEmitResults
        } else {
          // Check if all players (including dealer through normal turn progression) have stayed
          const allDone = room.players.every(
            (p) => p.hasStayed || p.disconnectedMidGame
          );
          if (!allDone) {
            return socket.emit("errorMessage", {
              text: "ผู้เล่นยังเล่นไม่ครบทุกคน หรือยังไม่ใช่ตาเจ้ามือที่จะสรุป",
            });
          }
        }
      }
      calculateAndEmitResults(roomId);
    } catch (error) {
      console.error("[Server] Error showing results:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการแสดงผลลัพธ์" });
    }
  });

  socket.on("resetGame", (roomId) => {
    // ... (เหมือนเดิม)
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) return;
      room.players.forEach((p) => {
        p.cards = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.actionTakenThisTurn = false;
      });
      room.deck = [];
      room.currentTurnPlayerId = null;
      room.currentPlayerIndexInOrder = -1;
      room.resultsCache = null;
      io.to(roomId).emit("resetGame");
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", { text: "เจ้ามือรีเซ็ตเกม." });
      io.to(roomId).emit("enableShowResult", false); // Ensure it's disabled for next round start
    } catch (error) {
      console.error("[Server] Error resetting game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการรีเซ็ตเกม" });
    }
  });

  socket.on("endGame", (roomId) => {
    // ... (เหมือนเดิม)
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId) return;
      const gameSummary = room.players.map((p) => ({
        id: p.id,
        name: p.name,
        role: p.role,
        initialBalance: p.initialBalance,
        finalBalance: p.balance,
        netChange: p.balance - p.initialBalance,
      }));
      io.to(roomId).emit("gameEnded", gameSummary);
      io.to(roomId).emit("message", {
        text: `เจ้ามือ ${room.dealerName} ได้จบเกม.`,
      });
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (socketsInRoom) {
        socketsInRoom.forEach((socketId) => {
          io.sockets.sockets.get(socketId).leave(roomId);
        });
      }
      delete rooms[roomId];
    } catch (error) {
      console.error("[Server] Error ending game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการจบเกม" });
    }
  });

  socket.on("disconnect", () => {
    // ... (ตรรกะการจัดการ disconnect ส่วนใหญ่เหมือนเดิม แต่ต้องระวังเรื่อง advanceTurn)
    console.log(`[Server] User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        io.to(roomId).emit("message", { text: `${player.name} ออกจากห้อง.` });
        if (room.gameStarted) {
          player.disconnectedMidGame = true;
          player.hasStayed = true; // Treat as stayed to allow game to proceed
          player.actionTakenThisTurn = true;
          if (room.currentTurnPlayerId === player.id) {
            clearTurnTimer(room);
            advanceTurn(roomId); // Try to advance turn
          }
          // Check if all remaining active players are done
          const activePlayersLeft = room.players.filter(
            (p) => !p.disconnectedMidGame && !p.isDealer
          );
          const allActivePlayersDone = activePlayersLeft.every(
            (p) => p.hasStayed
          );
          if (activePlayersLeft.length === 0 || allActivePlayersDone) {
            // If only dealer or dealer + disconnected players remain, or all active players done
            // And if dealer's turn hasn't come or passed, try to enable show result for dealer
            if (
              !room.resultsCache &&
              room.dealerId &&
              !room.players.find((p) => p.id === room.dealerId).hasStayed
            ) {
              // This condition might be tricky. Essentially, if a disconnect causes all players to be "done", dealer should be able to show results.
              // The advanceTurn() should eventually lead to dealer's turn or enableShowResult.
            }
          }
        } else {
          room.players.splice(playerIndex, 1);
        }

        if (
          room.players.length === 0 ||
          room.players.every((p) => p.disconnectedMidGame)
        ) {
          clearTurnTimer(room);
          delete rooms[roomId];
        } else if (
          player.isDealer &&
          !room.players.find((p) => p.isDealer && !p.disconnectedMidGame)
        ) {
          const newDealer = room.players.find((p) => !p.disconnectedMidGame);
          if (newDealer) {
            newDealer.isDealer = true;
            newDealer.role = "เจ้ามือ";
            room.dealerId = newDealer.id;
            room.dealerName = newDealer.name;
            io.to(roomId).emit("message", {
              text: `${newDealer.name} เป็นเจ้ามือใหม่.`,
            });
          } else {
            io.to(roomId).emit("message", {
              text: "เจ้ามือออกและไม่มีผู้เล่นเหลือ.",
            });
            clearTurnTimer(room);
            delete rooms[roomId];
          }
        }
        if (rooms[roomId]) {
          io.to(roomId).emit("playersData", getRoomPlayerData(room));
        }
        break;
      }
    }
  });

  // --- Turn Management Functions ---
  function startPlayerTurnTimer(room, playerId) {
    // Renamed and focused
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.hasStayed || player.disconnectedMidGame) return; // No timer if already done

    clearTurnTimer(room);
    let timeLeft = DEFAULT_TURN_DURATION;
    player.actionTakenThisTurn = false; // Reset for this specific segment of the turn (e.g. after drawing)

    room.turnTimerInterval = setInterval(() => {
      io.to(room.id).emit("turnTimerUpdate", { playerId: player.id, timeLeft });
      timeLeft--;
      if (timeLeft < 0) {
        clearInterval(room.turnTimerInterval);
      }
    }, 1000);

    room.turnTimeout = setTimeout(() => {
      if (
        rooms[room.id] &&
        room.currentTurnPlayerId === player.id &&
        !player.actionTakenThisTurn
      ) {
        io.to(room.id).emit("message", {
          text: `${player.name} หมดเวลา, หมอบอัตโนมัติ.`,
        });
        player.hasStayed = true;
        player.actionTakenThisTurn = true;
        advanceTurn(room.id);
      }
    }, DEFAULT_TURN_DURATION * 1000);
  }

  function startPlayerTurn(roomId) {
    // Simplified: gets current player from room object
    const room = rooms[roomId];
    if (!room || !room.gameStarted || !room.currentTurnPlayerId) return;

    const currentPlayer = room.players.find(
      (p) => p.id === room.currentTurnPlayerId
    );
    if (
      !currentPlayer ||
      currentPlayer.hasStayed ||
      currentPlayer.disconnectedMidGame
    ) {
      // This should ideally be caught by advanceTurn, but as a safeguard:
      advanceTurn(roomId);
      return;
    }

    io.to(roomId).emit("message", { text: `ตาของ ${currentPlayer.name}.` });
    io.to(roomId).emit("currentTurn", {
      id: currentPlayer.id,
      name: currentPlayer.name,
      role: currentPlayer.role,
      timeLeft: DEFAULT_TURN_DURATION,
    });
    startPlayerTurnTimer(room, currentPlayer.id); // Start the timer
  }

  function advanceTurn(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    // Check if gameStarted is true before clearing timers or proceeding.
    // If game isn't started (e.g., results just shown), don't advance.
    if (!room.gameStarted && room.resultsCache) {
      // Game finished, results shown
      console.log(
        `[Server] AdvanceTurn called, but game in room ${roomId} is over (results cached). No turn advancement.`
      );
      return;
    }
    if (!room.gameStarted) {
      // Game not started yet at all
      console.log(
        `[Server] AdvanceTurn called, but game in room ${roomId} not started. No turn advancement.`
      );
      return;
    }

    clearTurnTimer(room);

    let nextActivePlayerFound = false;
    // Iterate through playerActionOrder to find the next valid player
    // The loop should run at most room.playerActionOrder.length times to avoid infinite loops
    for (let i = 0; i < room.playerActionOrder.length; i++) {
      room.currentPlayerIndexInOrder =
        (room.currentPlayerIndexInOrder + 1) % room.playerActionOrder.length;
      const nextPlayerId =
        room.playerActionOrder[room.currentPlayerIndexInOrder];
      const nextPlayer = room.players.find((p) => p.id === nextPlayerId);

      if (
        nextPlayer &&
        !nextPlayer.hasStayed &&
        !nextPlayer.disconnectedMidGame
      ) {
        room.currentTurnPlayerId = nextPlayer.id;
        startPlayerTurn(roomId);
        nextActivePlayerFound = true;
        return; // Found next player, their turn starts
      }
    }

    // If loop completes, all players in playerActionOrder have stayed or disconnected
    if (!nextActivePlayerFound) {
      room.currentTurnPlayerId = null;
      io.to(roomId).emit("currentTurn", { id: null });
      io.to(room.dealerId).emit("enableShowResult", true);
      io.to(roomId).emit("message", {
        text: "ผู้เล่นทุกคน/เจ้ามือ ได้ดำเนินการครบแล้ว เจ้ามือสามารถแสดงผลได้",
      });
      console.log(
        `[Server] All players/dealer acted in room ${roomId}. Dealer can show results.`
      );
    }
  }

  function clearTurnTimer(room) {
    if (room.turnTimerInterval) {
      clearInterval(room.turnTimerInterval);
      room.turnTimerInterval = null;
    }
    if (room.turnTimeout) {
      clearTimeout(room.turnTimeout);
      room.turnTimeout = null;
    }
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Server] Pok Deng Server is running on port ${PORT}`);
});
