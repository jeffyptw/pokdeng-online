// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid"); // ตรวจสอบว่าได้ npm install uuid --save แล้ว

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://pokdeng-online.onrender.com", // หรือ origin ของ client ของคุณ
    // origin: "*", // สำหรับทดสอบ local
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

const rooms = {}; // Global rooms object

// --- Game Logic Functions ---
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
    return { rank: 9, type: "ไม่มีไพ่", score: 0, multiplier: 1, cards };
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
    const isA23 =
      isNormalStraight &&
      sortedNumericalValues[0] === 1 &&
      sortedNumericalValues[1] === 2 &&
      sortedNumericalValues[2] === 3;
    if (isNormalStraight && !isA23) {
      isStraight = true;
    }
    if (isAQKStraight) {
      isStraight = true;
    }
  }

  // 1. ป๊อก (Rank 1)
  if (cards.length === 2) {
    const isPair = values[0] === values[1];
    const isTwoCardSameSuit = isSameSuit;
    const isDoubleDeng = isPair || isTwoCardSameSuit;

    if (score === 9) {
      return {
        rank: 1,
        type: isDoubleDeng ? "ป๊อก 9 สองเด้ง" : "ป๊อก 9",
        score,
        multiplier: isDoubleDeng ? 2 : 1,
        cards,
      };
    }
    if (score === 8) {
      return {
        rank: 1,
        type: isDoubleDeng ? "ป๊อก 8 สองเด้ง" : "ป๊อก 8",
        score,
        multiplier: isDoubleDeng ? 2 : 1,
        cards,
      };
    }
  }

  // การตรวจสอบไพ่ 3 ใบ
  if (cards.length === 3) {
    // 2. ตอง (Rank 2)
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
    // 3. สเตรทฟลัช (Rank 3)
    if (isStraight && isSameSuit) {
      return { rank: 3, type: "สเตรทฟลัช", score, multiplier: 5, cards };
    }
    // 4. เซียน (Rank 4)
    const isThreeFaceCards = values.every((v) => ["J", "Q", "K"].includes(v));
    if (isThreeFaceCards) {
      return { rank: 4, type: "เซียน", score: 0, multiplier: 3, cards };
    }
    // 5. เรียง (Rank 5)
    if (isStraight) {
      return { rank: 5, type: "เรียง", score, multiplier: 3, cards };
    }
    // 6. สี (สามเด้ง) (Rank 8 หรือ Rank 9 ถ้าบอด)
    if (isSameSuit) {
      if (score === 0) {
        return { rank: 9, type: "บอด", score: 0, multiplier: 3, cards }; // คง multiplier เดิม
      } else {
        return {
          rank: 8, // ปรับ Rank เพื่อให้เทียบแต้มกับ Rank 8 อื่นๆ
          type: `${score} แต้มสามเด้ง`,
          score,
          multiplier: 3,
          cards,
        };
      }
    }
    // 8. แต้มธรรมดาสำหรับไพ่ 3 ใบ (Rank 8 หรือ Rank 9 ถ้าบอด)
    if (score === 9) {
      return { rank: 8, type: "9 หลัง", score, multiplier: 1, cards };
    }
    if (score === 8) {
      return { rank: 8, type: "8 หลัง", score, multiplier: 1, cards };
    }
    // แต้มธรรมดาอื่นๆ ของไพ่ 3 ใบ
    if (score === 0) {
      return { rank: 9, type: "บอด", score: 0, multiplier: 1, cards };
    } else {
      return { rank: 8, type: `${score} แต้ม`, score, multiplier: 1, cards };
    }
  }

  // การตรวจสอบไพ่ 2 ใบ (ที่ไม่ใช่ป๊อก)
  if (cards.length === 2) {
    const isPair = values[0] === values[1];
    const isTwoCardSameSuit = isSameSuit;

    // สองเด้ง (Rank 8 หรือ Rank 9 ถ้าบอด)
    if (isPair || isTwoCardSameSuit) {
      if (score === 0) {
        return { rank: 9, type: "บอด", score: 0, multiplier: 2, cards }; // คง multiplier เดิม
      } else {
        return {
          rank: 8, // ปรับ Rank เพื่อให้เทียบแต้ม
          type: `${score} แต้มสองเด้ง`,
          score,
          multiplier: 2,
          cards,
        };
      }
    }
    // แต้มธรรมดาสำหรับไพ่ 2 ใบ (Rank 8 หรือ Rank 9 ถ้าบอด)
    if (score === 0) {
      return { rank: 9, type: "บอด", score: 0, multiplier: 1, cards };
    } else {
      return { rank: 8, type: `${score} แต้ม`, score, multiplier: 1, cards };
    }
  }

  // กรณีอื่นๆ ที่ไม่เข้าเงื่อนไข (เช่น ไพ่ 1 ใบ)
  if (score === 0) {
    return { rank: 9, type: "บอด", score: 0, multiplier: 1, cards };
  } else {
    return { rank: 8, type: `${score} แต้ม`, score, multiplier: 1, cards };
  }
}
// --- End Game Logic ---

// --- Global Helper/Utility & Core Game Flow Functions ---
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
    baseRole: isDealer ? "เจ้ามือ" : "ขา",
    role: isDealer ? "เจ้ามือ" : "ขา",
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
      displayRole = `ขาที่ ${playerNumber}`;
      playerNumber++;
    }
    p.role = displayRole;
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

function performResultCalculation(room) {
  const dealer = room.players.find((p) => p.isDealer);
  if (!dealer) {
    console.error(
      `[Server] CRITICAL: Dealer not found in performResultCalculation for room: ${room.id}`
    );
    if (io && room && room.id) {
      // ตรวจสอบ io, room, room.id ก่อนใช้งาน
      io.to(room.id).emit("errorMessage", {
        text: "เกิดข้อผิดพลาด: ไม่พบเจ้ามือขณะคำนวณผล",
      });
    }
    return null;
  }
  dealer.handDetails = getHandRank(dealer.cards);
  if (!dealer.handDetails) {
    console.error(
      `[Server] CRITICAL: Failed to get hand details for dealer in room: ${room.id}`
    );
    if (io && room && room.id) {
      // ตรวจสอบ io, room, room.id ก่อนใช้งาน
      io.to(room.id).emit("errorMessage", {
        text: "เกิดข้อผิดพลาด: ไม่สามารถคำนวณไพ่เจ้ามือ",
      });
    }
    return null;
  }

  const roundResults = [];
  let dealerNetChangeTotal = 0;
  const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

  room.players.forEach((player) => {
    if (player.isDealer) return;

    if (!player.disconnectedMidGame) {
      player.handDetails = getHandRank(player.cards);
    }
    // กำหนด handDetails เริ่มต้นหากยังไม่มี (เช่น disconnected ก่อนได้ไพ่ หรือ error)
    if (!player.handDetails) {
      player.handDetails = {
        score: 0,
        type: player.disconnectedMidGame ? "ขาดการเชื่อมต่อ" : "ไม่มีไพ่",
        rank: 9, // ให้ rank อ่อนสุดถ้าไม่มีไพ่หรือขาดการเชื่อมต่อ
        multiplier: 1,
        cards: player.cards || [],
      };
    }

    let outcome = "แพ้"; // กำหนดค่าเริ่มต้น
    let moneyChange = 0;

    if (player.disconnectedMidGame) {
      outcome = "ขาดการเชื่อมต่อ";
      moneyChange = player.balance >= betAmount ? -betAmount : -player.balance;
      // player.balance += moneyChange; // การปรับ balance ควรทำทีเดียวหลังคำนวณเสร็จสิ้น
      // dealerNetChangeTotal -= moneyChange;
    } else {
      const playerHand = player.handDetails;
      const dealerHand = dealer.handDetails;

      if (!playerHand || !dealerHand) {
        console.error(
          `[Server] Hand details missing for comparison. Player: ${player.id}, Dealer: ${dealer.id} in room ${room.id}`
        );
        outcome = "Error/แพ้"; // ถือว่าแพ้ถ้ามี error
        moneyChange = -(betAmount * dealerHand.multiplier); // เจ้ามือชนะ ควรได้ตาม multiplier ของเจ้ามือ
      } else if (playerHand.rank === 1 && dealerHand.rank === 1) {
        // ป๊อกชนป๊อก
        if (playerHand.score > dealerHand.score) {
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.score < dealerHand.score) {
          outcome = "แพ้";
          moneyChange = -(betAmount * dealerHand.multiplier);
        } else {
          // แต้มป๊อกเท่ากัน
          outcome = "เสมอ"; // <<<< แก้ไข: ป๊อกแต้มเท่ากันคือเสมอ ไม่ดูเด้ง
          moneyChange = 0;
        }
      } else if (playerHand.rank === 1 && dealerHand.rank !== 1) {
        // ผู้เล่นป๊อก เจ้ามือไม่ป๊อก
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (dealerHand.rank === 1 && playerHand.rank !== 1) {
        // เจ้ามือป๊อก ผู้เล่นไม่ป๊อก
        outcome = "แพ้";
        moneyChange = -(betAmount * dealerHand.multiplier);
      } else {
        // ไม่ใช่ป๊อกทั้งคู่ หรือมีฝ่ายใดฝ่ายหนึ่งไม่ใช่ป๊อก (กรณีนี้คือไม่ใช่ป๊อกทั้งคู่แล้ว)
        if (playerHand.rank < dealerHand.rank) {
          // ผู้เล่น Rank ดีกว่า (เช่น ตอง ชนะ สี)
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.rank > dealerHand.rank) {
          // ผู้เล่น Rank แย่กว่า (เช่น แต้มธรรมดา แพ้ สี)
          outcome = "แพ้";
          moneyChange = -(betAmount * dealerHand.multiplier);
        } else {
          // playerHand.rank === dealerHand.rank (Rank เท่ากัน, ให้เทียบแต้ม)
          let pScore = playerHand.score;
          let dScore = dealerHand.score;

          // กรณีพิเศษ: ตองชนตอง (Rank 2) ให้ใช้ subRank (ความใหญ่ของหน้าไพ่ตอง)
          if (playerHand.rank === 2 && dealerHand.rank === 2) {
            pScore = playerHand.subRank || pScore; // ใช้ subRank ถ้ามี
            dScore = dealerHand.subRank || dScore; // ใช้ subRank ถ้ามี
          }
          // กรณีพิเศษ: สเตรทฟลัชชนสเตรทฟลัช (Rank 3) หรือ เรียงชนเรียง (Rank 5)
          // อาจจะต้องมี subRank สำหรับความสูงของไพ่เรียง หากต้องการตัดสิน (ตอนนี้จะไปเทียบแต้ม %10)
          // หากไม่ต้องการเทียบความสูงของไพ่เรียง สามารถข้ามไปเทียบแต้ม %10 ได้เลย

          if (pScore > dScore) {
            // ผู้เล่นแต้มสูงกว่า
            outcome = "ชนะ";
            moneyChange = betAmount * playerHand.multiplier;
          } else if (pScore < dScore) {
            // ผู้เล่นแต้มน้อยกว่า
            outcome = "แพ้";
            moneyChange = -(betAmount * dealerHand.multiplier);
          } else {
            // แต้มเท่ากัน, ให้เทียบ Multiplier (เด้ง)
            if (playerHand.multiplier > dealerHand.multiplier) {
              outcome = "ชนะ";
              moneyChange = betAmount * playerHand.multiplier;
            } else if (playerHand.multiplier < dealerHand.multiplier) {
              outcome = "แพ้";
              moneyChange = -(betAmount * dealerHand.multiplier);
            } else {
              // Multiplier ก็เท่ากัน
              outcome = "เสมอ";
              moneyChange = 0;
            }
          }
        }
      }
    }

    // ตรวจสอบว่าผู้เล่นมีเงินพอจ่ายหรือไม่
    if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
      moneyChange = -player.balance; // ถ้าเงินไม่พอ จ่ายเท่าที่มี
    }
    player.balance += moneyChange;
    dealerNetChangeTotal -= moneyChange; // dealerNetChangeTotal จะเป็น + ถ้าผู้เล่นเสีย, - ถ้าผู้เล่นได้

    roundResults.push({
      id: player.id,
      name: player.name,
      role: player.role,
      cardsDisplay: (player.handDetails.cards || [])
        .map(getCardDisplay)
        .join(" "),
      score: player.handDetails.score,
      specialType: player.handDetails.type,
      outcome: outcome,
      moneyChange: moneyChange,
      balance: player.balance,
      disconnectedMidGame: player.disconnectedMidGame, // เพิ่มสถานะนี้เข้าไปด้วย
    });
  });

  dealer.balance += dealerNetChangeTotal;
  roundResults.push({
    id: dealer.id,
    name: dealer.name,
    role: dealer.role,
    cardsDisplay: (dealer.handDetails.cards || [])
      .map(getCardDisplay)
      .join(" "),
    score: dealer.handDetails.score,
    specialType: dealer.handDetails.type,
    outcome: "เจ้ามือ",
    moneyChange: dealerNetChangeTotal,
    balance: dealer.balance,
    disconnectedMidGame: dealer.disconnectedMidGame,
  });

  // ส่วนการ sort ผลลัพธ์ (ควรปรับปรุงให้เรียงตาม role ที่กำหนดไว้ตอนเริ่มเกม)
  // การ sort เดิมของคุณอาจจะซับซ้อนและมีส่วนที่ซ้ำซ้อน
  // นี่คือตัวอย่างการ sort ที่ง่ายกว่า:
  const finalSortedResults = [...roundResults].sort((a, b) => {
    const getRoleOrder = (role) => {
      if (role === "เจ้ามือ") return 0;
      const match = role.match(/ขาที่ (\d+)/);
      if (match) return parseInt(match[1]);
      return Infinity; // หรือเลขมากๆ สำหรับ role ที่ไม่รู้จัก
    };
    return getRoleOrder(a.role) - getRoleOrder(b.role);
  });

  return finalSortedResults;
}

function calculateAndEmitResults(roomId) {
  const room = rooms[roomId];
  if (!room) {
    console.log(`[CalcResults] Room ${roomId} not found.`);
    return;
  }
  if (room.resultsCache) {
    io.to(roomId).emit("result", room.resultsCache);
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
    if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false);
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
  if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false);
}

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
    const nextPlayerId = room.playerActionOrder[room.currentPlayerIndexInOrder];
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
    if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", true);
    io.to(roomId).emit("message", {
      text: "ขาไพ่/เจ้ามือจั่วครบแล้ว เจ้ามือสามารถเปิดไพ่ได้",
    });
  }
}

// --- Socket.IO Connection Handler ---
io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("createRoom", ({ playerName, initialBalance }) => {
    try {
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อขาไพ่" });
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
        betAmount: DEFAULT_BET_AMOUNT,
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
        betAmount: DEFAULT_BET_AMOUNT,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(rooms[roomId]));
      io.to(roomId).emit("message", {
        text: `${dealer.role} (${playerName}) ได้สร้างห้อง.`,
      });
      console.log(
        `[Server] Room ${roomId} created by ${playerName} (${socket.id})`
      );
    } catch (error) {
      console.error("[Server] Error creating room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการสร้างห้อง" });
    }
  });

  socket.on("joinRoom", ({ roomId, playerName, initialBalance }) => {
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
      if (room.isLocked && !room.gameStarted)
        return socket.emit("errorMessage", { text: "ห้องถูกล็อค" });
      if (room.gameStarted)
        return socket.emit("errorMessage", { text: "เกมเริ่มไปแล้ว" });
      if (room.players.length >= 17)
        return socket.emit("errorMessage", { text: "ห้องเต็ม" });
      if (room.players.find((p) => p.id === socket.id))
        return socket.emit("errorMessage", { text: "คุณอยู่ในห้องนี้แล้ว" });
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อขาไพ่" });
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
      const currentPlayersData = getRoomPlayerData(room);
      io.to(roomId).emit("playersData", currentPlayersData);
      const joinedPlayerDisplay = currentPlayersData.find(
        (p) => p.id === player.id
      );
      io.to(roomId).emit("message", {
        text: `${playerName} ได้เข้าร่วมห้อง.`,
      });
      console.log(
        `[Server] ${playerName} (${socket.id}) joined room ${roomId}`
      );
    } catch (error) {
      console.error("[Server] Error joining room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการเข้าร่วมห้อง" });
    }
  });

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
          text: "ต้องมีขาไพ่อย่างน้อย 2 คน",
        });
      for (const player of room.players) {
        if (
          !player.isDealer &&
          !player.disconnectedMidGame &&
          player.balance < room.betAmount
        ) {
          return io.to(roomId).emit("errorMessage", {
            text: `ขาไพ่ ${player.name} มีเงินไม่พอ`,
          });
        }
      }

      room.gameStarted = true;
      room.gameRound++;
      room.resultsCache = null;
      room.deck = shuffleDeck(createDeck());
      io.to(roomId).emit("enableShowResult", false);

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

      room.players.forEach((player) => {
        if (!player.disconnectedMidGame) {
          if (player.cards.length === 2) {
            player.handDetails = getHandRank(player.cards);
          } else {
            console.error(
              `[Server] Player ${player.name} in room ${room.id} did not receive 2 cards. Cards:`,
              player.cards
            );
            player.handDetails = getHandRank([]);
          }
          io.to(player.id).emit("yourCards", player.cards);
        }
      });

      io.to(roomId).emit("gameStarted", { betAmount: room.betAmount });
      const currentPlayersData = getRoomPlayerData(room);
      io.to(roomId).emit("playersData", currentPlayersData);
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่ม! เดิมพัน: ${room.betAmount}`,
      });

      const dealer = room.players.find((p) => p.isDealer);
      if (dealer && dealer.handDetails && dealer.handDetails.rank === 1) {
        io.to(roomId).emit("message", {
          text: `${dealer.role} (${dealer.name}) ได้ ${dealer.handDetails.type}! เปิดไพ่ทันที!`,
        });
        room.players.forEach((p) => {
          if (!p.isDealer && !p.disconnectedMidGame) p.hasStayed = true;
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        calculateAndEmitResults(roomId); // Global function, io is accessible
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
          player.hasStayed = true;
          player.actionTakenThisTurn = true;
          io.to(roomId).emit("message", {
            text: `${player.role} (${player.name}) ได้ ${player.handDetails.type}! (ข้ามตา)`,
          });
          io.to(roomId).emit("player_revealed_pok", {
            playerId: player.id,
            name: player.name,
            role: player.role,
            cards: player.cards,
            handDetails: player.handDetails,
          });
          playerPokMessageSent = true;
        }
      });
      if (playerPokMessageSent) {
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
      }

      room.playerActionOrder = activePlayersForDeal
        .filter((p) => !p.isDealer)
        .map((p) => p.id);
      if (dealerForDeal) {
        room.playerActionOrder.push(dealerForDeal.id);
      }
      room.currentPlayerIndexInOrder = -1;
      advanceTurn(roomId); // Global function, io is accessible
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
      }
      io.to(player.id).emit("yourCards", player.cards);
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
          dealerPlayer.hasStayed = true;
          dealerPlayer.actionTakenThisTurn = true;
        }
        const allDone = room.players
          .filter((p) => !p.disconnectedMidGame)
          .every((p) => p.hasStayed);
        if (!allDone) {
          return socket.emit("errorMessage", {
            text: "ขาไพ่/เจ้ามือยังดำเนินการไม่ครบ",
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
      io.to(roomId).emit("message", { text: "เจ้ามือรีเซ็ตเกม&สับไพ่ใหม่" });
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
      const finalPlayerData = getRoomPlayerData(room);
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
            const newDealer = activePlayersRemaining[0];
            if (newDealer) {
              newDealer.isDealer = true;
              newDealer.baseRole = "เจ้ามือ";
              newDealer.role = "เจ้ามือ";
              room.dealerId = newDealer.id;
              room.dealerName = newDealer.name;
              io.to(roomId).emit("message", {
                text: `${newDealer.name} เป็นเจ้ามือใหม่.`,
              });
            } else {
              io.to(roomId).emit("message", {
                text: "เกิดปัญหา: ไม่สามารถหาเจ้ามือใหม่ได้",
              });
              clearTurnTimer(room);
              delete rooms[roomId];
            }
          }
          if (rooms[roomId]) {
            io.to(roomId).emit("playersData", getRoomPlayerData(room));
          }
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(
    `[Server] Pok Deng Server is running on port ${PORT} at ${new Date().toLocaleString()}`
  );
});
