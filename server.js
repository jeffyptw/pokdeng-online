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

// --- Game Logic (เหมือนเดิม) ---
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
  // Client ก็มีฟังก์ชันนี้ อาจจะต้องเหมือนกัน
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
      sortedNumericalValues.length === 3 &&
      sortedNumericalValues[1] === sortedNumericalValues[0] + 1 &&
      sortedNumericalValues[2] === sortedNumericalValues[1] + 1;
    const isAQKStraight =
      sortedNumericalValues.length === 3 &&
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
    baseRole: isDealer ? "เจ้ามือ" : "ผู้เล่น",
    role: isDealer ? "เจ้ามือ" : "ผู้เล่น", // Will be updated by getRoomPlayerData
    actionTakenThisTurn: false,
    disconnectedMidGame: false,
  };
}

function getRoomPlayerData(room) {
  if (!room || !room.players) return [];
  let playerNumber = 1;
  const activePlayersForRoleAssignment = room.players.filter(
    (p) => !p.disconnectedMidGame
  );
  return activePlayersForRoleAssignment.map((p) => {
    let displayRole = p.baseRole;
    if (!p.isDealer) {
      displayRole = `ผู้เล่นที่ ${playerNumber}`;
      playerNumber++;
    }
    p.role = displayRole; // Update player object's role
    return {
      id: p.id,
      name: p.name,
      balance: p.balance,
      role: displayRole,
      isDealer: p.isDealer,
      hasStayed: p.hasStayed,
    };
  });
}

function performResultCalculation(room) {
  const dealer = room.players.find(p => p.isDealer);
  if (!dealer) {
      console.error(`[Server] CRITICAL: Dealer not found for result calculation in room: ${room.id}`);
      io.to(room.id).emit("errorMessage", { text: "เกิดข้อผิดพลาด: ไม่พบเจ้ามือ aoคำนวณผล" });
      return null;
  }
  // คำนวณ handDetails ของเจ้ามือให้แน่ใจว่าล่าสุด
  dealer.handDetails = getHandRank(dealer.cards);
  if (!dealer.handDetails) { // ป้องกันกรณี getHandRank คืน null/undefined
      console.error(`[Server] CRITICAL: Failed to get hand details for dealer in room: ${room.id}`);
      io.to(room.id).emit("errorMessage", { text: "เกิดข้อผิดพลาด: ไม่สามารถคำนวณไพ่เจ้ามือ" });
      return null;
  }


  const roundResults = [];
  let dealerNetChangeTotal = 0;
  const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

  room.players.forEach(player => {
      if (player.isDealer) return; // ข้ามเจ้ามือไปก่อน จะคำนวณแยกตอนท้าย

      // คำนวณ handDetails ของผู้เล่นทุกคนให้แน่ใจว่าล่าสุด
      if (!player.disconnectedMidGame) {
          player.handDetails = getHandRank(player.cards);
      }
      // ถ้า handDetails ยังไม่มี (เช่น disconnected ก่อนได้ไพ่ หรือมีปัญหา) ให้ใช้ค่า default
      if (!player.handDetails) {
          player.handDetails = { score: 0, type: player.disconnectedMidGame ? "ขาดการเชื่อมต่อ" : "ไม่มีไพ่", rank: 8, multiplier: 1, cards: player.cards || [] };
      }


      let outcome = "แพ้";
      let moneyChange = 0;

      if (player.disconnectedMidGame) {
          outcome = "ขาดการเชื่อมต่อ";
          // เงินที่เสีย = เดิมพัน แต่ไม่เกินเงินที่มี
          moneyChange = player.balance >= betAmount ? -betAmount : -player.balance;
          player.balance += moneyChange;
          dealerNetChangeTotal -= moneyChange; // เจ้ามือได้เงินส่วนนี้
      } else {
          const playerHand = player.handDetails;
          const dealerHand = dealer.handDetails;
          if (!playerHand || !dealerHand) {
            console.error(`[Server] Hand details missing for comparison. Player: ${player.id}, Dealer: ${dealer.id} in room ${room.id}`);
            // อาจจะถือว่าผู้เล่นแพ้ หรือ เสมอ ในกรณีนี้
            outcome = "Error/แพ้";
            moneyChange = -betAmount; // หรือ 0
        } else if (playerHand.rank === 1 && dealerHand.rank === 1) {
            // ... (Pok vs Pok)
            if (playerHand.score > dealerHand.score) { outcome = "ชนะ"; moneyChange = betAmount * playerHand.multiplier; }
            else if (playerHand.score < dealerHand.score) { outcome = "แพ้"; moneyChange = -betAmount; }
            else { if (playerHand.multiplier > dealerHand.multiplier) { outcome = "ชนะ"; moneyChange = betAmount * playerHand.multiplier; } else if (playerHand.multiplier < dealerHand.multiplier) { outcome = "แพ้"; moneyChange = -betAmount; } else { outcome = "เสมอ"; moneyChange = 0; } }
        } else if (playerHand.rank === 1 && dealerHand.rank !== 1) { outcome = "ชนะ"; moneyChange = betAmount * playerHand.multiplier;
        } else if (dealerHand.rank === 1 && playerHand.rank !== 1) { outcome = "แพ้"; moneyChange = -betAmount;
        } else { // Neither has Pok
            if (playerHand.rank < dealerHand.rank) { outcome = "ชนะ"; moneyChange = betAmount * playerHand.multiplier; }
            else if (playerHand.rank > dealerHand.rank) { outcome = "แพ้"; moneyChange = -betAmount; }
            else { // Ranks are equal
                let playerComparableScore = playerHand.score; let dealerComparableScore = dealerHand.score;
                if (playerHand.rank === 2 && dealerHand.rank === 2) { // Both Tong
                    playerComparableScore = playerHand.subRank || playerHand.score; dealerComparableScore = dealerHand.subRank || dealerHand.score;
                }
                if (playerComparableScore > dealerComparableScore) { outcome = "ชนะ"; moneyChange = betAmount * playerHand.multiplier; }
                else if (playerComparableScore < dealerComparableScore) { outcome = "แพ้"; moneyChange = -betAmount; }
                else { if (playerHand.multiplier > dealerHand.multiplier) { outcome = "ชนะ"; moneyChange = betAmount * playerHand.multiplier; } else if (playerHand.multiplier < dealerHand.multiplier) { outcome = "แพ้"; moneyChange = -betAmount; } else { outcome = "เสมอ"; moneyChange = 0; } }
            }
        }
        if (moneyChange < 0 && Math.abs(moneyChange) > player.balance && !player.disconnectedMidGame) { // dont apply if already disconnected
          moneyChange = -player.balance;
      }
      // Player cannot win more than what dealer can pay for this specific player interaction
      // Dealer's total balance change is handled by dealerNetChangeTotal
      if (moneyChange > 0 && moneyChange > (dealer.balance + dealerNetChangeTotal)) { // Check against dealer's available pot for this win
           // This logic can be complex if dealer's money runs out mid-payouts to multiple winners
           // Simpler: Cap win at dealer's current balance (before this specific payout) if dealer cannot cover.
           // For now, let's assume dealer has enough or this will be reflected in dealer's final balance.
      }

      player.balance += moneyChange;
      dealerNetChangeTotal -= moneyChange;
  }
  roundResults.push({
      id: player.id, name: player.name,
      cardsDisplay: (player.handDetails.cards || []).map(getCardDisplay).join(" "),
      score: player.handDetails.score, specialType: player.handDetails.type,
      outcome: outcome, moneyChange: moneyChange, balance: player.balance,
  });
});
if (moneyChange < 0 && Math.abs(moneyChange) > player.balance && !player.disconnectedMidGame) { // dont apply if already disconnected
  moneyChange = -player.balance;
}
// Player cannot win more than what dealer can pay for this specific player interaction
// Dealer's total balance change is handled by dealerNetChangeTotal
if (moneyChange > 0 && moneyChange > (dealer.balance + dealerNetChangeTotal)) { // Check against dealer's available pot for this win
   // This logic can be complex if dealer's money runs out mid-payouts to multiple winners
   // Simpler: Cap win at dealer's current balance (before this specific payout) if dealer cannot cover.
   // For now, let's assume dealer has enough or this will be reflected in dealer's final balance.
}

player.balance += moneyChange;
dealerNetChangeTotal -= moneyChange;
}
roundResults.push({
id: player.id, name: player.name,
cardsDisplay: (player.handDetails.cards || []).map(getCardDisplay).join(" "),
score: player.handDetails.score, specialType: player.handDetails.type,
outcome: outcome, moneyChange: moneyChange, balance: player.balance,
});

function calculateAndEmitResults(roomId) {
  // ... (เหมือนเดิมจากครั้งก่อน) ...
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
  room.gameStarted = false;
  room.currentTurnPlayerId = null;
  io.to(roomId).emit("currentTurn", {
    id: null,
    name: "",
    role: "",
    timeLeft: 0,
  });
  io.to(room.dealerId).emit("enableShowResult", false);
}

io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("createRoom", ({ playerName, initialBalance }) => {
    // ... (เหมือนเดิม)
    try {
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });
      const bal = parseInt(initialBalance);
      if (isNaN(bal) || bal < 10 || (bal % 10 !== 0 && bal % 5 !== 0))
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 10, ลงท้าย 0 หรือ 5)",
        });
      const roomId = uuidv4().slice(0, 5).toUpperCase();
      const dealer = initializePlayer(socket.id, playerName, bal, true);
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
      io.to(roomId).emit("playersData", getRoomPlayerData(rooms[roomId])); // ส่ง role ที่มีหมายเลข
      io.to(roomId).emit("message", {
        text: `${dealer.role} (${playerName}) ได้สร้างห้อง.`,
      }); // ใช้ dealer.role ที่ update แล้ว
      console.log(
        `[Server] Room ${roomId} created by ${playerName} (${socket.id})`
      );
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
        return socket.emit("errorMessage", { text: "ห้องถูกล็อค" });
      if (room.gameStarted)
        return socket.emit("errorMessage", { text: "เกมเริ่มไปแล้ว" });
      if (room.players.length >= 7)
        return socket.emit("errorMessage", { text: "ห้องเต็ม" });
      if (room.players.find((p) => p.id === socket.id))
        return socket.emit("errorMessage", { text: "คุณอยู่ในห้องนี้แล้ว" });
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });
      const bal = parseInt(initialBalance);
      if (isNaN(bal) || bal < 10 || (bal % 10 !== 0 && bal % 5 !== 0))
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 10, ลงท้าย 0 หรือ 5)",
        });
      const player = initializePlayer(socket.id, playerName, bal, false);
      room.players.push(player);
      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId: room.id,
        dealerName: room.dealerName,
        betAmount: room.betAmount,
      });
      const currentPlayersData = getRoomPlayerData(room); // จะได้ role "ผู้เล่นที่ X"
      io.to(roomId).emit("playersData", currentPlayersData);
      const joinedPlayerDisplay = currentPlayersData.find(
        (p) => p.id === player.id
      ); // หา role ที่ถูกต้องของผู้เล่นที่เพิ่ง join
      io.to(roomId).emit("message", {
        text: `${
          joinedPlayerDisplay ? joinedPlayerDisplay.role : player.baseRole
        } (${playerName}) ได้เข้าร่วมห้อง.`,
      });
      console.log(
        `[Server] ${playerName} (${socket.id}) joined room ${roomId}`
      );
    } catch (error) {
      console.error("[Server] Error joining room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการเข้าร่วมห้อง" });
    }
  });

  // ... (setBetAmount, lockRoom เหมือนเดิม) ...
  socket.on("setBetAmount", ({ roomId, amount }) => {
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
          text: `เดิมพันต้อง >= ${DEFAULT_BET_AMOUNT}, ลงท้าย 0 หรือ 5`,
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
        return socket.emit("errorMessage", { text: "กรุณาตั้งค่าเดิมพัน" });
      const activePlayersCount = room.players.filter(
        (p) => !p.disconnectedMidGame
      ).length;
      if (activePlayersCount < 2)
        return socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 2 คน",
        });
      for (const player of room.players) {
        if (
          !player.isDealer &&
          !player.disconnectedMidGame &&
          player.balance < room.betAmount
        ) {
          return io
            .to(roomId)
            .emit("errorMessage", {
              text: `ผู้เล่น ${player.name} มีเงินไม่พอ`,
            });
        }
      }

      room.gameStarted = true;
      room.gameRound++;
      room.resultsCache = null;
      room.deck = shuffleDeck(createDeck());
      io.to(roomId).emit("enableShowResult", false);

      // --- ส่วนการแจกไพ่ทีละใบ (เหมือนเดิมจากครั้งก่อน) ---
      let dealOrderPlayers = [];
      const activePlayersForDeal = room.players.filter(
        (p) => !p.disconnectedMidGame
      );
      const nonDealersForDeal = activePlayersForDeal.filter((p) => !p.isDealer);
      const dealerForDeal = activePlayersForDeal.find((p) => p.isDealer);
      dealOrderPlayers = [...nonDealersForDeal];
      if (dealerForDeal) {
        dealOrderPlayers.push(dealerForDeal);
      }
      dealOrderPlayers.forEach((player) => {
        player.cards = [];
        player.hasStayed = false;
        player.actionTakenThisTurn = false;
      });
      dealOrderPlayers.forEach((player) => {
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
      });
      dealOrderPlayers.forEach((player) => {
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
      });
      // --- สิ้นสุดการแจกไพ่ ---

      room.players.forEach((player) => {
        // คำนวณ handDetails และส่งไพ่
        if (!player.disconnectedMidGame) {
          if (player.cards.length === 2) {
            player.handDetails = getHandRank(player.cards);
          } else {
            console.error(
              `[Server] Player ${player.name} did not receive 2 cards.`
            );
            player.handDetails = getHandRank([]);
          }
          io.to(player.id).emit("yourCards", player.cards); // ส่ง OBJECT ไพ่
        }
      });

      io.to(roomId).emit("gameStarted", { betAmount: room.betAmount });
      const currentPlayersData = getRoomPlayerData(room); // ส่ง role "ผู้เล่นที่ X"
      io.to(roomId).emit("playersData", currentPlayersData);
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่ม! เดิมพัน: ${room.betAmount}`,
      });

      const dealer = room.players.find((p) => p.isDealer);
      if (dealer && dealer.handDetails && dealer.handDetails.rank === 1) {
        // เจ้ามือป๊อก
        io.to(roomId).emit("message", {
          text: `${dealer.role} (${dealer.name}) ได้ ${dealer.handDetails.type}! เปิดไพ่ทันที!`,
        });
        room.players.forEach((p) => {
          if (!p.isDealer && !p.disconnectedMidGame) p.hasStayed = true;
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดต hasStayed
        calculateAndEmitResults(roomId);
        return;
      }

      let playerPokMessageSent = false;
      room.players.forEach((player) => {
        if (
          !player.isDealer &&
          !player.disconnectedMidGame &&
          player.handDetails &&
          player.handDetails.rank === 1
        ) {
          // ผู้เล่นป๊อก
          player.hasStayed = true;
          player.actionTakenThisTurn = true;
          io.to(roomId).emit("message", {
            text: `${player.role} (${player.name}) ได้ ${player.handDetails.type}! (ข้ามตา)`,
          });
          // *** NEW: Emit event to reveal this player's Pok cards ***
          io.to(roomId).emit("player_revealed_pok", {
            playerId: player.id,
            name: player.name,
            role: player.role,
            cards: player.cards, // ส่ง object ไพ่
            handDetails: player.handDetails,
          });
          playerPokMessageSent = true;
        }
      });
      if (playerPokMessageSent) {
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดต hasStayed
      }

      room.playerActionOrder = activePlayersForDeal
        .filter((p) => !p.isDealer)
        .map((p) => p.id);
      if (dealerForDeal) {
        room.playerActionOrder.push(dealerForDeal.id);
      }
      room.currentPlayerIndexInOrder = -1;
      advanceTurn(roomId);
    } catch (error) {
      console.error("[Server] Error starting game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการเริ่มเกม" });
    }
  });

  // ... (drawCard, stay, showResult, resetGame, endGame, disconnect เหมือนเดิมจากเวอร์ชันสมบูรณ์ล่าสุด) ...
  // ตรวจสอบให้แน่ใจว่า drawCard ส่ง player.cards (object) กลับไปใน event "yourCards"
  socket.on("drawCard", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || !room.gameStarted) return;
      const player = room.players.find((p) => p.id === socket.id);
      if (!player || player.id !== room.currentTurnPlayerId || player.hasStayed)
        return;
      if (player.cards.length >= 3)
        return socket.emit("errorMessage", { text: "มีไพ่ 3 ใบแล้ว" });
      clearTurnTimer(room);
      player.cards.push(room.deck.pop());
      player.handDetails = getHandRank(player.cards);
      player.actionTakenThisTurn = true;
      if (player.cards.length === 3) {
        player.hasStayed = true;
      }
      if (player.handDetails.rank === 1 && player.cards.length === 3) {
        player.hasStayed = true;
      } // กรณีป๊อก 3 ใบ (ถ้ามีกฎ)
      io.to(player.id).emit("yourCards", player.cards); // ส่ง OBJECT ไพ่
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: `${player.role} (${player.name}) จั่วไพ่.`,
      });
      if (player.hasStayed) {
        advanceTurn(roomId);
      } else {
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
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: `${player.role} (${player.name}) หมอบ (Stay).`,
      });
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
        return socket.emit("errorMessage", { text: "เฉพาะเจ้ามือ" });
      if (!room.resultsCache) {
        const dealerPlayer = room.players.find((p) => p.id === room.dealerId);
        if (
          dealerPlayer &&
          !dealerPlayer.hasStayed &&
          room.currentTurnPlayerId === room.dealerId
        ) {
          // If dealer showing result on their turn
          dealerPlayer.hasStayed = true;
          dealerPlayer.actionTakenThisTurn = true;
        }
        const allDone = room.players
          .filter((p) => !p.disconnectedMidGame)
          .every((p) => p.hasStayed); // Check all active players
        if (!allDone) {
          return socket.emit("errorMessage", {
            text: "ผู้เล่น/เจ้ามือยังดำเนินการไม่ครบ",
          });
        }
      }
      calculateAndEmitResults(roomId);
    } catch (error) {
      console.error("[Server] Error showing results:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการแสดงผล" });
    }
  });

  socket.on("resetGame", (roomId) => {
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
      io.to(roomId).emit("enableShowResult", false);
    } catch (error) {
      console.error("[Server] Error resetting game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการรีเซ็ตเกม" });
    }
  });

  socket.on("endGame", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId) return;
      const finalPlayerData = getRoomPlayerData(room); // Get roles with numbers
      const gameSummary = finalPlayerData.map((fp) => {
        const originalPlayer = room.players.find((op) => op.id === fp.id);
        return {
          id: fp.id,
          name: fp.name,
          role: fp.role,
          initialBalance: originalPlayer.initialBalance,
          finalBalance: fp.balance,
          netChange: fp.balance - originalPlayer.initialBalance,
        };
      });
      io.to(roomId).emit("gameEnded", gameSummary);
      io.to(roomId).emit("message", {
        text: `เจ้ามือ ${room.dealerName} ได้จบเกม.`,
      });
      const socketsInRoom = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      );
      socketsInRoom.forEach((socketId) => {
        const clientSocket = io.sockets.sockets.get(socketId);
        if (clientSocket) clientSocket.leave(roomId);
      });
      clearTurnTimer(room);
      delete rooms[roomId];
      console.log(`[Server] Room ${roomId} ended by dealer ${socket.id}`);
    } catch (error) {
      console.error("[Server] Error ending game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการจบเกม" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[Server] User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        console.log(
          `[Server] ${player.role} (${player.name}) disconnected from room ${roomId}.`
        );
        io.to(roomId).emit("playerLeft", {
          name: player.name,
          message: "ออกจากห้องแล้ว",
        });

        if (room.gameStarted && !player.disconnectedMidGame) {
          player.disconnectedMidGame = true;
          player.hasStayed = true;
          player.actionTakenThisTurn = true;
          if (room.currentTurnPlayerId === player.id) {
            clearTurnTimer(room);
            advanceTurn(roomId);
          }
        } else if (!room.gameStarted) {
          room.players.splice(playerIndex, 1);
        }

        const activePlayersRemaining = room.players.filter(
          (p) => !p.disconnectedMidGame
        );
        if (activePlayersRemaining.length === 0) {
          console.log(`[Server] Room ${roomId} empty. Deleting.`);
          clearTurnTimer(room);
          delete rooms[roomId];
        } else {
          const activeDealer = activePlayersRemaining.find((p) => p.isDealer);
          if (!activeDealer && player.isDealer) {
            // Dealer left and no active dealer remains
            const newDealer = activePlayersRemaining[0]; // Promote first available active player
            if (newDealer) {
              newDealer.isDealer = true;
              newDealer.baseRole = "เจ้ามือ";
              newDealer.role = "เจ้ามือ";
              room.dealerId = newDealer.id;
              room.dealerName = newDealer.name;
              io.to(roomId).emit("message", {
                text: `${newDealer.name} ได้เป็นเจ้ามือใหม่.`,
              });
            } else {
              // Should not happen if activePlayersRemaining.length > 0
              io.to(roomId).emit("message", {
                text: "เกิดปัญหา: ไม่สามารถหาเจ้ามือใหม่ได้",
              });
              clearTurnTimer(room);
              delete rooms[roomId]; // Or handle differently
            }
          }
          // Always update player data for the room if it still exists
          io.to(roomId).emit("playersData", getRoomPlayerData(room));
        }
        break;
      }
    }
  });
  // --- Turn Management Functions (startPlayerTurnTimer, startPlayerTurn, advanceTurn, clearTurnTimer) ---
  // Ensure startPlayerTurn uses the updated player.role
  function startPlayerTurnTimer(room, playerId) {
    const player = room.players.find((p) => p.id === playerId);
    if (!room || !player || player.hasStayed || player.disconnectedMidGame)
      return;
    clearTurnTimer(room);
    let timeLeft = DEFAULT_TURN_DURATION;
    player.actionTakenThisTurn = false;
    room.turnTimerInterval = setInterval(() => {
      if (!rooms[room.id]) {
        clearInterval(room.turnTimerInterval);
        return;
      }
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
          text: `${player.role} (${player.name}) หมดเวลา, หมอบอัตโนมัติ.`,
        });
        player.hasStayed = true;
        player.actionTakenThisTurn = true;
        io.to(room.id).emit("playersData", getRoomPlayerData(room));
        advanceTurn(room.id);
      }
    }, DEFAULT_TURN_DURATION * 1000);
  }

  function startPlayerTurn(roomId) {
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
      advanceTurn(roomId);
      return;
    }
    // currentPlayer.role should now be "ผู้เล่นที่ X" or "เจ้ามือ" due to getRoomPlayerData updating it.
    io.to(roomId).emit("message", {
      text: `ตาของ ${currentPlayer.role} (${currentPlayer.name}).`,
    });
    io.to(roomId).emit("currentTurn", {
      id: currentPlayer.id,
      name: currentPlayer.name,
      role: currentPlayer.role,
      timeLeft: DEFAULT_TURN_DURATION,
    });
    startPlayerTurnTimer(room, currentPlayer.id);
  }

  function advanceTurn(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    if (!room.gameStarted && room.resultsCache) {
      console.log(`[AvT] Room ${roomId} game over.`);
      return;
    }
    if (!room.gameStarted) {
      console.log(`[AvT] Room ${roomId} not started.`);
      return;
    }
    clearTurnTimer(room);
    let nextActivePlayerFound = false;
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
        return;
      }
    }
    if (!nextActivePlayerFound) {
      room.currentTurnPlayerId = null;
      io.to(roomId).emit("currentTurn", {
        id: null,
        name: "",
        role: "",
        timeLeft: 0,
      });
      io.to(room.dealerId).emit("enableShowResult", true);
      io.to(roomId).emit("message", {
        text: "ผู้เล่น/เจ้ามือดำเนินการครบแล้ว เจ้ามือสามารถแสดงผลได้",
      });
      console.log(
        `[Server] All players/dealer acted in room ${roomId}. Dealer can show results.`
      );
    }
  }
  function clearTurnTimer(room) {
    if (!room) return;
    if (room.turnTimerInterval) {
      clearInterval(room.turnTimerInterval);
      room.turnTimerInterval = null;
    }
    if (room.turnTimeout) {
      clearTimeout(room.turnTimeout);
      room.turnTimeout = null;
    }
  }
}); // End of io.on("connection")

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(
    `[Server] Pok Deng Server is running on port ${PORT} at ${new Date().toLocaleString()}`
  );
});
