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
  if (value === "A") return 1;
  if (["K", "Q", "J", "10"].includes(value)) return 0;
  return parseInt(value, 10);
}

function calculateScore(cards) {
  if (!cards || cards.length === 0) return 0; // เพิ่มการตรวจสอบกรณีไม่มีไพ่
  let totalPoints = 0;
  for (let i = 0; i < cards.length; i++) {
    totalPoints += getCardPoint(cards[i].value);
  }
  return totalPoints % 10;
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

function getCardNumericValue(value) {
  if (value === "A") return 14;
  if (value === "K") return 13;
  if (value === "Q") return 12;
  if (value === "J") return 11;
  if (value === "10") return 10;
  return parseInt(value, 10);
}

function getHandRank(cardsInput) {
  // Helper function moved inside getHandRank to avoid new global function
  function checkStraight(numericValues) {
    if (numericValues.length !== 3) return false;
    // A-K-Q (14, 13, 12)
    if (
      numericValues[0] === 14 &&
      numericValues[1] === 13 &&
      numericValues[2] === 12
    ) {
      return true;
    }
    // K-A-2 and A-2-3 are NOT straights. Smallest is 2-3-4.
    // General case: 5-4-3, 4-3-2 etc.
    return (
      numericValues[0] - 1 === numericValues[1] &&
      numericValues[1] - 1 === numericValues[2]
    );
  }

  const cards = [...cardsInput];
  const numCards = cards.length;

  if (numCards === 0) {
    // จัดการกรณีไม่มีไพ่
    return {
      name: "ไม่มีไพ่",
      rank: 7,
      score: 0,
      multiplier: 1,
      cards: [],
      isPok: false,
      isDeng: false,
      dengType: null,
      tieBreakerValue: null,
    };
  }

  const score = calculateScore(cards);
  const cardValues = cards.map((c) => c.value);
  const cardSuits = cards.map((c) => c.suit);

  const sortedCardsByNumericValue = cards
    .slice()
    .sort(
      (a, b) => getCardNumericValue(b.value) - getCardNumericValue(a.value)
    );
  const numericValues = sortedCardsByNumericValue.map((c) =>
    getCardNumericValue(c.value)
  );

  let handDetails = {
    name: "",
    rank: 7,
    score: score,
    multiplier: 1,
    cards: sortedCardsByNumericValue,
    tieBreakerValue: null,
    isPok: false,
    isDeng: false,
    dengType: null,
  };

  if (numCards === 2) {
    const isSameSuit = cardSuits[0] === cardSuits[1];
    if (score === 9) {
      return {
        name: isSameSuit ? "Pok 9 Deng" : "Pok 9",
        rank: 1,
        score: 9,
        multiplier: isSameSuit ? 2 : 1,
        cards: sortedCardsByNumericValue,
        isPok: true,
        isDeng: isSameSuit,
        dengType: isSameSuit ? "pok_deng" : null,
      };
    }
    if (score === 8) {
      return {
        name: isSameSuit ? "Pok 8 Deng" : "Pok 8",
        rank: 2,
        score: 8,
        multiplier: isSameSuit ? 2 : 1,
        cards: sortedCardsByNumericValue,
        isPok: true,
        isDeng: isSameSuit,
        dengType: isSameSuit ? "pok_deng" : null,
      };
    }
    // Fall through to Rank 7 (Points Hand) for 2 cards not Pok
  }

  if (numCards === 3) {
    const isAllSameSuit = new Set(cardSuits).size === 1;
    const isTong = new Set(cardValues).size === 1;

    if (isTong) {
      return {
        name: `Tong ${cardValues[0]}`,
        rank: 3,
        score: score,
        multiplier: 5,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0],
        isPok: false,
        isDeng: false,
        dengType: null,
      };
    }

    const isStraight = checkStraight(numericValues);
    if (isStraight && isAllSameSuit) {
      return {
        name: "Straight Flush",
        rank: 4,
        score: score,
        multiplier: 5,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0],
        isPok: false,
        isDeng: true,
        dengType: "straight_flush",
      };
    }

    if (isStraight) {
      // Not Straight Flush
      return {
        name: "Rieng",
        rank: 5,
        score: score,
        multiplier: 3,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0],
        isPok: false,
        isDeng: false,
        dengType: null,
      };
    }

    const isSian = cardValues.every((v) => ["J", "Q", "K"].includes(v));
    if (isSian) {
      return {
        name: "Sian",
        rank: 6,
        score: score,
        multiplier: 3,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues,
        isPok: false,
        isDeng: false,
        dengType: null,
      };
    }
    // Fall through to Rank 7 (Points Hand) for 3 cards not special
  }

  // Rank 7: Points Hand (2 cards not Pok, or 3 cards not special)
  handDetails.rank = 7;
  if (numCards === 3) {
    const isAllSameSuitForThreeCards = new Set(cardSuits).size === 1;
    if (isAllSameSuitForThreeCards) {
      // Sam Deng (and not SF)
      handDetails.name = `${score} Points Sam Deng`;
      handDetails.multiplier = 3;
      handDetails.isDeng = true;
      handDetails.dengType = "sam_deng";
    } else {
      // Normal 3 cards
      handDetails.name = `${score} Points`;
      handDetails.multiplier = 1;
    }
  } else if (numCards === 2) {
    // Normal 2 cards (not Pok)
    const isSameSuitTwoCards = cardSuits[0] === cardSuits[1];
    const isPairTwoCards = cardValues[0] === cardValues[1];
    if (isSameSuitTwoCards) {
      // Song Deng (Suit)
      handDetails.name = `${score} Points Song Deng`;
      handDetails.multiplier = 2;
      handDetails.isDeng = true;
      handDetails.dengType = "song_deng_suit";
    } else if (isPairTwoCards) {
      // Song Deng (Pair)
      handDetails.name = `${score} Points Song Deng (Pair)`;
      handDetails.multiplier = 2;
      handDetails.isDeng = true;
      handDetails.dengType = "song_deng_pair";
    } else {
      // Normal 2 cards
      handDetails.name = `${score} Points`;
      handDetails.multiplier = 1;
    }
  }
  if (
    score === 0 &&
    !handDetails.isDeng &&
    !handDetails.isPok &&
    handDetails.rank === 7
  ) {
    // กรณีแต้มบอดธรรมดา (ที่ไม่ใช่บอดเด้ง หรือ บอดจากไพ่พิเศษ)
    handDetails.name = "Bod";
  }

  return handDetails;
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
    // เพิ่ม hasPok เพื่อติดตามสถานะป๊อก
    hasPok: false,
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
    // p.role = displayRole; // This mutation might be problematic if players array is shared. Let's return new object.
    return {
      id: p.id,
      name: p.name,
      balance: p.balance,
      role: displayRole, // ใช้ displayRole ที่คำนวณใหม่
      isDealer: p.isDealer,
      hasStayed: p.hasStayed,
      // ส่ง hasPok ไปให้ client ด้วย ถ้าต้องการให้ client รู้
      // hasPok: p.hasPok
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
  const dealer = room.players.find((p) => p.isDealer && !p.disconnectedMidGame); // Ensure active dealer
  if (!dealer) {
    console.error(
      `[Server] CRITICAL: Active dealer not found in performResultCalculation for room: ${room.id}`
    );
    if (io && room && room.id) {
      io.to(room.id).emit("errorMessage", {
        text: "เกิดข้อผิดพลาด: ไม่พบเจ้ามือ (Active) ขณะคำนวณผล",
      });
    }
    return null;
  }

  // Ensure dealer has hand details calculated if not already
  if (!dealer.handDetails) dealer.handDetails = getHandRank(dealer.cards);

  if (!dealer.handDetails) {
    // Double check after attempting calculation
    console.error(
      `[Server] CRITICAL: Failed to get hand details for dealer in room: ${room.id}`
    );
    io.to(room.id).emit("errorMessage", {
      text: "เกิดข้อผิดพลาด: ไม่สามารถคำนวณไพ่เจ้ามือ",
    });
    return null;
  }

  const roundResults = [];
  let dealerNetChangeTotal = 0;
  const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

  room.players.forEach((player) => {
    if (player.isDealer || player.disconnectedMidGame) {
      // Skip disconnected players here too for actual calculation
      if (player.isDealer && player.disconnectedMidGame) {
        // Handle scenario where dealer disconnected mid-game if needed for summary,
        // but active dealer is already fetched above for calculations.
      }
      return;
    }

    if (!player.handDetails) player.handDetails = getHandRank(player.cards); // Calculate if missing

    if (!player.handDetails) {
      // If still no hand details (e.g. no cards error in getHandRank)
      player.handDetails = {
        name: "ไม่มีไพ่",
        rank: 7,
        score: 0,
        multiplier: 1,
        cards: player.cards || [],
      };
    }

    let outcome = "แพ้";
    let moneyChange = 0;
    // Use handDetails.name for display, handDetails.rank for logic
    const playerHand = player.handDetails;
    const dealerHand = dealer.handDetails; // Already confirmed to exist

    // กรณีผู้เล่นป๊อก และ เจ้ามือก็ป๊อก
    if (playerHand.isPok && dealerHand.isPok) {
      if (playerHand.rank < dealerHand.rank) {
        // ป๊อก9 (rank 1) vs ป๊อก8 (rank 2)
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (playerHand.rank > dealerHand.rank) {
        // ป๊อก8 vs ป๊อก9
        outcome = "แพ้";
        moneyChange = -(betAmount * dealerHand.multiplier);
      } else {
        // ป๊อกแต้มเท่ากัน (ป๊อก9 vs ป๊อก9 หรือ ป๊อก8 vs ป๊อก8) -> เสมอ ตามกฎ
        outcome = "เสมอ";
        moneyChange = 0;
      }
    }
    // กรณีเจ้ามือป๊อก แต่ผู้เล่นไม่ป๊อก
    else if (dealerHand.isPok) {
      outcome = "แพ้";
      moneyChange = -(betAmount * dealerHand.multiplier);
    }
    // กรณีผู้เล่นป๊อก แต่เจ้ามือไม่ป๊อก
    else if (playerHand.isPok) {
      outcome = "ชนะ";
      moneyChange = betAmount * playerHand.multiplier;
    }
    // กรณีไม่มีใครป๊อก: เทียบ rank อื่นๆ
    else if (playerHand.rank < dealerHand.rank) {
      // Rank ผู้เล่นดีกว่า (เช่น ตอง vs สเตรทฟลัช)
      outcome = "ชนะ";
      moneyChange = betAmount * playerHand.multiplier;
    } else if (playerHand.rank > dealerHand.rank) {
      // Rank ผู้เล่นแย่กว่า
      outcome = "แพ้";
      moneyChange = -(betAmount * dealerHand.multiplier);
    } else {
      // Rank เท่ากัน (ไม่ใช่ป๊อก) -> เทียบ tieBreakerValue หรือ score
      if (playerHand.rank <= 6) {
        // ไพ่พิเศษ (ตอง, สเตรทฟลัช, เรียง, เซียน)
        let playerWinsByTieBreaker = false;
        if (Array.isArray(playerHand.tieBreakerValue)) {
          // Sian
          for (let i = 0; i < playerHand.tieBreakerValue.length; i++) {
            if (playerHand.tieBreakerValue[i] > dealerHand.tieBreakerValue[i]) {
              playerWinsByTieBreaker = true;
              break;
            }
            if (playerHand.tieBreakerValue[i] < dealerHand.tieBreakerValue[i])
              break;
          }
        } else if (playerHand.tieBreakerValue > dealerHand.tieBreakerValue) {
          playerWinsByTieBreaker = true;
        }

        if (
          playerHand.tieBreakerValue === dealerHand.tieBreakerValue || // For single value tiebreakers
          (Array.isArray(playerHand.tieBreakerValue) &&
            JSON.stringify(playerHand.tieBreakerValue) ===
              JSON.stringify(dealerHand.tieBreakerValue)) // For Sian array
        ) {
          outcome = "เสมอ"; // ไพ่พิเศษเหมือนกันเป๊ะ
          moneyChange = 0;
        } else if (playerWinsByTieBreaker) {
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else {
          outcome = "แพ้";
          moneyChange = -(betAmount * dealerHand.multiplier);
        }
      } else {
        // Rank 7 (Points Hand)
        if (playerHand.score > dealerHand.score) {
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.score < dealerHand.score) {
          outcome = "แพ้";
          moneyChange = -(betAmount * dealerHand.multiplier);
        } else {
          // แต้มเท่ากัน -> เสมอ (เด้งมีผลแค่ตัวคูณตอนชนะ)
          outcome = "เสมอ";
          moneyChange = 0;
        }
      }
    }

    if (player.disconnectedMidGame && outcome !== "ชนะ") {
      // ถ้าหลุดแล้วผลไม่ชนะ ให้ถือว่าแพ้เดิมพันพื้นฐาน
      outcome = "ขาดการเชื่อมต่อ";
      moneyChange = player.balance >= betAmount ? -betAmount : -player.balance;
      // ถ้าชนะด้วยไพ่ที่ถืออยู่ก่อนหลุด ก็ให้ชนะไปตามนั้น
    }

    if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
      moneyChange = -player.balance;
    }
    player.balance += moneyChange;
    dealerNetChangeTotal -= moneyChange;

    roundResults.push({
      id: player.id,
      name: player.name,
      role: player.role, // player.role ควรถูก set ตอน getRoomPlayerData
      cardsDisplay: (playerHand.cards || []).map(getCardDisplay).join(" "),
      score: playerHand.score,
      specialType: playerHand.name, // ใช้ name จาก handDetails
      outcome: outcome,
      moneyChange: moneyChange,
      balance: player.balance,
      disconnectedMidGame: player.disconnectedMidGame,
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
    specialType: dealer.handDetails.name,
    outcome: "เจ้ามือ",
    moneyChange: dealerNetChangeTotal,
    balance: dealer.balance,
    disconnectedMidGame: dealer.disconnectedMidGame,
  });

  const finalSortedResults = [...roundResults].sort((a, b) => {
    const getRoleOrder = (roleStr) => {
      if (roleStr === "เจ้ามือ") return 0;
      const match = roleStr.match(/ขาที่ (\d+)/);
      if (match) return parseInt(match[1]);
      return Infinity;
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
    // อาจจะไม่จำเป็นต้อง cache ถ้าคำนวณใหม่ทุกครั้งที่ showResult
    io.to(roomId).emit("result", room.resultsCache);
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
    if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false);
    return;
  }
  clearTurnTimer(room);
  const roundResults = performResultCalculation(room); // คำนวณผล
  if (roundResults) {
    room.resultsCache = roundResults; // เก็บผลไว้เผื่อกรณีจำเป็น
    io.to(roomId).emit("result", roundResults);
    // อัปเดต playersData หลังคำนวณผล เพื่อให้ balance ถูกต้อง
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
  } else {
    // กรณี performResultCalculation คืนค่า null (เช่น หาเจ้ามือไม่เจอ)
    io.to(roomId).emit("errorMessage", {
      text: "เกิดข้อผิดพลาดในการคำนวณผลลัพธ์ของรอบ",
    });
  }

  room.gameStarted = false; // เกมจบแล้วสำหรับรอบนี้
  room.currentTurnPlayerId = null;
  io.to(roomId).emit("currentTurn", {
    id: null,
    name: "",
    role: "",
    timeLeft: 0,
  });
  if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false); // ซ่อนปุ่มเปิดไพ่
  // แจ้ง Client ให้สามารถเริ่มเกมใหม่ได้ หรือรอเจ้ามือ
}

function startPlayerTurnTimer(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  // เพิ่มการตรวจสอบ player.hasPok ถ้าผู้เล่นป๊อกแล้ว ไม่ควรมี turn timer สำหรับจั่วไพ่
  if (
    !room ||
    !player ||
    player.hasStayed ||
    player.disconnectedMidGame ||
    player.hasPok
  ) {
    // ถ้าผู้เล่นป๊อกไปแล้ว หรือหมอบแล้ว หรือหลุด ให้เคลียร์ timer (ถ้ามี) แล้ว advanceTurn
    clearTurnTimer(room);
    // advanceTurn(room.id); // อาจจะไม่จำเป็นต้องเรียก advanceTurn ซ้ำซ้อน ถ้า advanceTurn จัดการได้ดี
    return;
  }

  clearTurnTimer(room); // เคลียร์ timer เก่าก่อนเริ่มใหม่
  let timeLeft = DEFAULT_TURN_DURATION;
  player.actionTakenThisTurn = false; // รีเซ็ต action สำหรับตานี้

  room.turnTimerInterval = setInterval(() => {
    if (
      !rooms[room.id] ||
      room.players.find((p) => p.id === playerId)?.hasStayed ||
      room.players.find((p) => p.id === playerId)?.hasPok
    ) {
      clearInterval(room.turnTimerInterval); // หยุด interval ถ้าห้องไม่มีแล้ว หรือผู้เล่นหมอบ/ป๊อกไปแล้ว
      return;
    }
    io.to(room.id).emit("turnTimerUpdate", { playerId: player.id, timeLeft });
    timeLeft--;
    if (timeLeft < 0) {
      clearInterval(room.turnTimerInterval);
      // ไม่ต้องทำ auto-stay ที่นี่แล้ว เพราะ timeout จะจัดการ
    }
  }, 1000);

  room.turnTimeout = setTimeout(() => {
    if (
      rooms[room.id] &&
      room.currentTurnPlayerId === player.id &&
      !player.actionTakenThisTurn && // ตรวจสอบว่ายังไม่ได้ทำ action
      !player.hasStayed &&
      !player.hasPok // และยังไม่ได้หมอบหรือป๊อก
    ) {
      io.to(room.id).emit("message", {
        text: `${player.role || player.name} หมดเวลา, หมอบอัตโนมัติ.`,
      });
      player.hasStayed = true;
      player.actionTakenThisTurn = true; // สำคัญมาก
      io.to(room.id).emit("playersData", getRoomPlayerData(room));
      advanceTurn(room.id);
    }
  }, DEFAULT_TURN_DURATION * 1000 + 500); // เพิ่มเวลาเล็กน้อยให้ client ตอบสนอง
}

function startPlayerTurn(roomId) {
  const room = rooms[roomId];
  if (!room || !room.gameStarted || !room.currentTurnPlayerId) return;

  const currentPlayer = room.players.find(
    (p) => p.id === room.currentTurnPlayerId
  );

  // ถ้าไม่พบผู้เล่นปัจจุบัน หรือผู้เล่นคนนั้นหมอบแล้ว/ป๊อกแล้ว/หลุดไปแล้ว ให้ไปยังคนถัดไป
  if (
    !currentPlayer ||
    currentPlayer.hasStayed ||
    currentPlayer.disconnectedMidGame ||
    currentPlayer.hasPok
  ) {
    advanceTurn(roomId);
    return;
  }

  io.to(roomId).emit("message", {
    text: `ตาของ ${currentPlayer.role || currentPlayer.name}.`,
  });
  io.to(roomId).emit("currentTurn", {
    id: currentPlayer.id,
    name: currentPlayer.name,
    role: currentPlayer.role,
    timeLeft: DEFAULT_TURN_DURATION,
  });
  startPlayerTurnTimer(room, currentPlayer.id); // เริ่ม timer สำหรับผู้เล่นคนนี้
}

function advanceTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearTurnTimer(room); // เคลียร์ timer ของคนก่อนหน้าเสมอ

  if (!room.gameStarted && room.resultsCache) {
    // ถ้าเกมยังไม่เริ่มใหม่ แต่มีผลลัพธ์แล้ว (คือจบรอบ)
    // console.log(`[AvT] Room ${roomId} round over. Waiting for new game or end.`);
    // ไม่ควรทำอะไรมาก นอกจากรอ dealer กด startGame หรือ endGame
    // อาจจะ emit สถานะบางอย่างให้ client รู้ว่า "รอเริ่มรอบใหม่"
    io.to(room.dealerId).emit("enableShowResult", false); // ซ่อนปุ่ม Show Result
    // และอาจจะส่ง enableStartGame: true ให้ dealer
    return;
  }
  if (!room.gameStarted) {
    // ถ้าเกมไม่เคยเริ่มเลย
    // console.log(`[AvT] Room ${roomId} not started.`);
    return;
  }

  // หาผู้เล่นคนถัดไปใน playerActionOrder
  let nextActivePlayerFound = false;
  // วนหาตาม playerActionOrder ที่กำหนดไว้ตอนเริ่มเกม
  for (let i = 0; i < room.playerActionOrder.length; i++) {
    room.currentPlayerIndexInOrder =
      (room.currentPlayerIndexInOrder + 1) % room.playerActionOrder.length;
    const nextPlayerId = room.playerActionOrder[room.currentPlayerIndexInOrder];
    const nextPlayer = room.players.find((p) => p.id === nextPlayerId);

    if (
      nextPlayer &&
      !nextPlayer.hasStayed &&
      !nextPlayer.disconnectedMidGame &&
      !nextPlayer.hasPok
    ) {
      room.currentTurnPlayerId = nextPlayer.id;
      startPlayerTurn(roomId); // เริ่มตาของผู้เล่นคนนี้
      nextActivePlayerFound = true;
      return; // ออกจาก advanceTurn เมื่อเจอผู้เล่นที่สามารถเล่นได้
    }
  }

  // ถ้าวนจนครบแล้วไม่เจอใครที่เล่นได้ (ทุกคนหมอบ/ป๊อก/หลุด หรือถึงคิวเจ้ามือเป็นคนสุดท้ายที่ยังไม่หมอบ/ป๊อก)
  if (!nextActivePlayerFound) {
    room.currentTurnPlayerId = null; // ไม่มีใครกำลังเล่น (รอเจ้ามือเปิดไพ่)
    io.to(roomId).emit("currentTurn", {
      id: null,
      name: "",
      role: "",
      timeLeft: 0,
    });

    // ตรวจสอบว่าเจ้ามือได้เล่นหรือยัง (ถ้าเจ้ามือไม่ใช่คนสุดท้ายใน playerActionOrder และยังไม่ hasStayed/hasPok)
    const dealer = room.players.find(
      (p) => p.isDealer && !p.disconnectedMidGame
    );
    if (dealer && !dealer.hasStayed && !dealer.hasPok) {
      // ถ้าเจ้ามือยังไม่ได้เล่น ให้เป็นตาเจ้ามือ
      room.currentTurnPlayerId = dealer.id;
      // ถ้าเจ้ามือเป็นคนเดียวที่เหลือใน playerActionOrder และยังไม่เล่น จะเข้า loop นี้
      // แต่ถ้าเจ้ามือถูกรวมใน playerActionOrder แล้ว จะถูกจัดการใน loop ด้านบน
      // ส่วนนี้อาจจะต้องปรับให้เข้ากับว่า playerActionOrder รวมเจ้ามือหรือไม่ และเจ้ามือเล่นเมื่อไหร่
      // ถ้า playerActionOrder รวมเจ้ามือ และวนมาถึงเจ้ามือแล้วเจ้ามือยังไม่ HasStayed/HasPok/Disconnected -> จะเข้า startPlayerTurn ด้านบน
      // ถ้าเจ้ามือไม่ได้อยู่ใน playerActionOrder หรือเป็นกรณีพิเศษ:
      // startPlayerTurn(roomId); // ให้ตาเจ้ามือเล่น
      // return;
      // --> ลอจิกนี้ซับซ้อน ดูที่การตั้ง playerActionOrder อีกที
    }

    // ถ้าทุกคนเล่นครบแล้วจริงๆ (รวมเจ้ามือถ้าเจ้ามือต้องจั่ว/อยู่)
    // เปิดให้เจ้ามือกด "เปิดไพ่"
    if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", true);
    io.to(roomId).emit("message", {
      text: "ผู้เล่นทุกคนดำเนินการเสร็จสิ้น เจ้ามือสามารถเปิดไพ่ได้",
    });
  }
}

// --- Socket.IO Connection Handler ---
io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("createRoom", ({ playerName, initialBalance }) => {
    try {
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });
      const bal = parseInt(initialBalance);
      // ปรับปรุงเงื่อนไขเงินเริ่มต้นตามที่ Client ส่งมา (ขั้นต่ำ 10)
      if (isNaN(bal) || bal < 10 || (bal % 10 !== 0 && bal % 5 !== 0)) {
        // Client สำหรับ createRoom มีขั้นต่ำ 50 แต่ joinRoom 10, Server ควรมีมาตรฐานเดียว
        // เพื่อความง่าย ให้ Server ยอมรับขั้นต่ำ 10 สำหรับทั้งคู่ หรือให้ Client ปรับ
        // สมมติว่า Server ยอมรับ 10 สำหรับการสร้างด้วย
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 10, ลงท้าย 0 หรือ 5)",
        });
      }

      const roomId = uuidv4().slice(0, 5).toUpperCase();
      // ผู้สร้างห้องเป็นเจ้ามือเสมอ และต้องมี hasPok field
      const dealer = initializePlayer(socket.id, playerName, bal, true);
      dealer.hasPok = false; // เพิ่ม field นี้

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
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });

      const bal = parseInt(initialBalance);
      if (isNaN(bal) || bal < 10 || (bal % 10 !== 0 && bal % 5 !== 0)) {
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 10, ลงท้าย 0 หรือ 5)",
        });
      }

      const player = initializePlayer(socket.id, playerName, bal, false);
      player.hasPok = false; // เพิ่ม field นี้
      room.players.push(player);
      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId: room.id,
        dealerName: room.dealerName,
        betAmount: room.betAmount,
      });

      // อัปเดต role ของผู้เล่นทุกคนก่อนส่ง playersData
      const currentPlayersData = getRoomPlayerData(room); // getRoomPlayerData จะ set p.role
      io.to(roomId).emit("playersData", currentPlayersData);

      // const joinedPlayerDisplay = currentPlayersData.find(p => p.id === player.id); // อาจจะไม่จำเป็น
      io.to(roomId).emit("message", {
        text: `${playerName} (${player.role}) ได้เข้าร่วมห้อง.`,
      }); // แสดง role ที่ถูกต้อง
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

      const activePlayersForStart = room.players.filter(
        (p) => !p.disconnectedMidGame
      );
      if (activePlayersForStart.length < 2)
        return socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 2 คน (Active)",
        });

      for (const player of activePlayersForStart) {
        if (!player.isDealer && player.balance < room.betAmount) {
          return io.to(roomId).emit("errorMessage", {
            text: `ผู้เล่น ${player.name} มีเงินไม่พอ (${player.balance}) สำหรับเดิมพัน ${room.betAmount}`,
          });
        }
      }

      room.gameStarted = true;
      room.gameRound++;
      room.resultsCache = null;
      room.deck = shuffleDeck(createDeck());
      io.to(roomId).emit("enableShowResult", false);

      // รีเซ็ตสถานะผู้เล่นสำหรับรอบใหม่ และแจกไพ่
      activePlayersForStart.forEach((player) => {
        player.cards = [];
        player.hasStayed = false;
        player.actionTakenThisTurn = false;
        player.handDetails = null;
        player.hasPok = false; // รีเซ็ตสถานะป๊อก
        // แจกไพ่ใบแรก
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
      });
      activePlayersForStart.forEach((player) => {
        // แจกไพ่ใบที่สอง
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
      });

      // ตรวจสอบป๊อกและส่งข้อมูล
      let anyPlayerPok = false;
      let dealerHasPok = false;
      const dealer = activePlayersForStart.find((p) => p.isDealer);

      activePlayersForStart.forEach((player) => {
        if (player.cards.length === 2) {
          player.handDetails = getHandRank(player.cards);
          io.to(player.id).emit("yourCards", player.cards); // ส่งไพ่ให้แต่ละคน

          if (player.handDetails.isPok) {
            player.hasPok = true;
            player.hasStayed = true; // ถ้าป๊อกคืออยู่เลย ไม่ต้องจั่ว
            player.actionTakenThisTurn = true;

            if (player.isDealer) {
              dealerHasPok = true;
            } else {
              anyPlayerPok = true;
            }
            // ส่ง event เปิดไพ่ป๊อก
            io.to(roomId).emit("player_revealed_pok", {
              playerId: player.id,
              name: player.name,
              role: player.role, // role ควรถูกตั้งค่าแล้วโดย getRoomPlayerData ตอน join/create หรือก่อน startGame
              cards: player.cards,
              handDetails: player.handDetails,
            });
            io.to(roomId).emit("message", {
              text: `${player.role || player.name} (${player.name}) ได้ ${
                player.handDetails.name
              }!`,
            });
          }
        } else {
          // กรณีไม่ได้รับไพ่ 2 ใบ (ควรไม่เกิดขึ้น)
          console.error(
            `[Server] Player ${player.name} in room ${room.id} did not receive 2 cards. Cards:`,
            player.cards
          );
          player.handDetails = getHandRank([]); // ให้เป็นไม่มีไพ่
        }
      });

      // ส่ง playersData ที่อัปเดตแล้ว (รวม handDetails, hasPok, hasStayed)
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // getRoomPlayerData ควรดึง role ที่ถูกต้อง
      io.to(roomId).emit("gameStarted", { betAmount: room.betAmount });
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่ม! เดิมพัน: ${room.betAmount}`,
      });

      // ถ้าเจ้ามือป๊อก เกมอาจจะจบเลย หรือผู้เล่นอื่นที่ป๊อกด้วยก็เทียบกัน
      if (dealerHasPok) {
        io.to(roomId).emit("message", {
          text: `เจ้ามือ (${dealer.name}) ได้ ${dealer.handDetails.name}! เปิดไพ่ทันที!`,
        });
        // ให้ผู้เล่นอื่นที่ไม่ป๊อก (และยังไม่ได้ Stay) ต้อง Stay ทันที
        activePlayersForStart.forEach((p) => {
          if (!p.isDealer && !p.hasPok) {
            // ถ้าไม่ใช่เจ้ามือ และยังไม่ป๊อกเอง
            p.hasStayed = true;
            p.actionTakenThisTurn = true;
          }
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดตสถานะ hasStayed
        calculateAndEmitResults(roomId);
        return;
      }

      // ถ้ามีผู้เล่นป๊อก แต่เจ้ามือไม่ป๊อก เกมดำเนินต่อ แต่ผู้เล่นที่ป๊อกจะข้ามตาจั่ว
      // ตั้งค่าลำดับการเล่น (ไม่รวมผู้ที่ป๊อกไปแล้ว หรือเจ้ามือถ้าเจ้ามือป๊อก)
      // playerActionOrder ควรเป็น ID ของผู้เล่นที่ "ยังต้องเล่น" (ยังไม่ป๊อก และไม่ใช่เจ้ามือที่ป๊อก)
      room.playerActionOrder = activePlayersForStart
        .filter((p) => !p.isDealer && !p.hasPok && !p.disconnectedMidGame) // ขาที่ยังไม่ป๊อก
        .map((p) => p.id);

      // เพิ่มเจ้ามือเข้าไปในลำดับการเล่น ถ้าเจ้ามือยังไม่ป๊อก
      if (dealer && !dealer.hasPok && !dealer.disconnectedMidGame) {
        room.playerActionOrder.push(dealer.id);
      }

      room.currentPlayerIndexInOrder = -1; // เริ่มจาก index แรกใน advanceTurn
      if (room.playerActionOrder.length > 0) {
        advanceTurn(roomId);
      } else {
        // ไม่มีใครต้องเล่นแล้ว (เช่น ทุกคนป๊อก หรือเหลือแต่เจ้ามือที่ป๊อก)
        // ซึ่งกรณีนี้ควรถูกจัดการโดย dealerHasPok ด้านบนไปแล้ว
        // หรือถ้าผู้เล่นทุกคนป๊อก แต่เจ้ามือไม่ป๊อก -> เจ้ามือก็ควรจะได้เล่น (ถ้าไม่ป๊อก) หรือเปิดไพ่
        // ถ้าทุกคนป๊อกหมดเลย และเจ้ามือก็ป๊อก -> dealerHasPok จัดการแล้ว
        // ถ้าทุกคนป๊อกหมดเลย แต่เจ้ามือไม่ป๊อก -> เจ้ามือต้องจั่ว/อยู่ หรือเปิดไพ่
        // เพื่อความปลอดภัย ถ้า playerActionOrder ว่างเปล่า แต่เกมยังไม่จบเพราะ dealerHasPok
        // อาจจะต้องให้เจ้ามือเล่น หรือเปิดไพ่
        const activeNonPokDealer = activePlayersForStart.find(
          (p) => p.isDealer && !p.hasPok && !p.disconnectedMidGame
        );
        if (activeNonPokDealer && room.playerActionOrder.length === 0) {
          // ทุกขาป๊อกหมดแล้ว เหลือเจ้ามือที่ยังไม่ป๊อก
          room.playerActionOrder = [activeNonPokDealer.id]; // ให้เจ้ามือเป็นคนเดียวใน action order
          room.currentPlayerIndexInOrder = -1;
          advanceTurn(roomId);
        } else if (!dealerHasPok) {
          // ไม่มีใครต้องเล่น และเจ้ามือก็ไม่ป๊อก (อาจจะไม่มีเจ้ามือ?)
          calculateAndEmitResults(roomId); // ไม่มีใครเล่นต่อได้ ให้คำนวณผลเลย
        }
      }
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

      if (
        !player ||
        player.id !== room.currentTurnPlayerId ||
        player.hasStayed ||
        player.hasPok ||
        player.disconnectedMidGame
      )
        return;
      if (player.cards.length >= 3)
        return socket.emit("errorMessage", { text: "มีไพ่ 3 ใบแล้ว" });

      clearTurnTimer(room);
      if (room.deck.length > 0) {
        player.cards.push(room.deck.pop());
      } else {
        // กรณีไพ่หมดสำรับ (ควรไม่เกิดขึ้นในป๊อกเด้งปกติถ้าจำนวนผู้เล่นไม่มากไป)
        io.to(roomId).emit("errorMessage", { text: "ไพ่ในสำรับหมด!" });
        player.hasStayed = true; // ให้ผู้เล่นนี้หมอบไป
      }

      player.handDetails = getHandRank(player.cards);
      player.actionTakenThisTurn = true;
      if (player.cards.length === 3) {
        player.hasStayed = true;
      }
      // ป๊อกหลัง (ได้ไพ่ 3 ใบแล้วป๊อก) -- กฎป๊อกเด้งมาตรฐาน ป๊อกคือไพ่ 2 ใบแรกเท่านั้น
      // แต่ถ้าโค้ดเดิมมี "player.handDetails.rank === 1 && player.cards.length === 3"
      // หมายถึงการตีความว่า 3 ใบก็ป๊อกได้ (ซึ่งไม่ตรงกติกามาตรฐาน)
      // ผมจะยึดตาม getHandRank ที่ isPok จะเป็น true เฉพาะ 2 ใบแรก
      // ดังนั้นเงื่อนไขนี้ไม่จำเป็นอีกต่อไป nếu isPok ถูก set อย่างถูกต้อง

      io.to(player.id).emit("yourCards", player.cards);
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: `${player.role || player.name} (${player.name}) จั่วไพ่.`,
      });

      if (player.hasStayed) {
        advanceTurn(roomId);
      } else {
        // ถ้ายังไม่หมอบ (เช่น จั่วใบที่ 2 -> 3 แล้วยังไม่หมอบอัตโนมัติ และไม่ใช่ 3 ใบ)
        // ซึ่งในป๊อกเด้งปกติ จั่วใบที่ 3 แล้วคือจบเทิร์นเลย
        // ดังนั้นควรจะ advanceTurn เสมอถ้าไม่เกิด error
        advanceTurn(roomId); // หรือ startPlayerTurnTimer(room, player.id); ถ้ายังมี action ต่อได้ (ซึ่งไม่ควรมี)
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

      if (
        !player ||
        player.id !== room.currentTurnPlayerId ||
        player.hasStayed ||
        player.hasPok ||
        player.disconnectedMidGame
      )
        return;

      clearTurnTimer(room);
      player.hasStayed = true;
      player.actionTakenThisTurn = true;
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: `${player.role || player.name} (${player.name}) หมอบ (Stay).`,
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

      // if (!room.resultsCache) { // ถ้าไม่ใช้ cache และคำนวณใหม่ทุกครั้ง
      const dealerPlayer = room.players.find(
        (p) => p.id === room.dealerId && !p.disconnectedMidGame
      );
      if (
        dealerPlayer &&
        !dealerPlayer.hasStayed &&
        !dealerPlayer.hasPok &&
        room.currentTurnPlayerId === room.dealerId
      ) {
        // ถ้าเป็นตาเจ้ามือ และเจ้ามือกด Show Result ให้ถือว่าเจ้ามือ Stay
        dealerPlayer.hasStayed = true;
        dealerPlayer.actionTakenThisTurn = true;
      }

      const allActivePlayersDone = room.players
        .filter((p) => !p.disconnectedMidGame)
        .every((p) => p.hasStayed || p.hasPok || p.cards.length === 0); // เพิ่ม cards.length === 0 เผื่อกรณีแจกไพ่ไม่ได้

      if (!allActivePlayersDone) {
        // ตรวจสอบว่าใครยังไม่ทำ action
        const waitingFor = room.players.find(
          (p) =>
            !p.disconnectedMidGame &&
            !p.hasStayed &&
            !p.hasPok &&
            p.cards.length > 0
        );
        return socket.emit("errorMessage", {
          text: `ผู้เล่น ${
            waitingFor ? waitingFor.name : ""
          } ยังดำเนินการไม่ครบ`,
        });
      }
      // }
      calculateAndEmitResults(roomId);
    } catch (error) {
      console.error("[Server] Error showing results:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการแสดงผล" });
    }
  });

  socket.on("resetGame", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) return; // ห้ามรีเซ็ตระหว่างเกมกำลังเล่น

      room.players.forEach((p) => {
        // ไม่รีเซ็ต balance ตอน resetGame (แค่รีเซ็ตรอบ)
        p.cards = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.actionTakenThisTurn = false;
        p.hasPok = false;
        // p.disconnectedMidGame ควรจะคงไว้จนกว่าจะจบเกมจริงๆ หรือผู้เล่นกลับมาเชื่อมต่อใหม่
      });
      room.deck = [];
      room.currentTurnPlayerId = null;
      room.currentPlayerIndexInOrder = -1;
      room.resultsCache = null; // เคลียร์ cache ผลลัพธ์เก่า
      room.gameStarted = false; // สถานะเกมยังไม่เริ่ม

      io.to(roomId).emit("resetGame"); // Client รีเซ็ต UI
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // ส่งข้อมูลผู้เล่นที่รีเซ็ตแล้ว
      io.to(roomId).emit("message", {
        text: "เจ้ามือรีเซ็ตเกม & สับไพ่ใหม่ (เตรียมรอบต่อไป)",
      });
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

      // คำนวณสรุปยอดจาก initialBalance และ balance ปัจจุบัน
      const gameSummary = room.players.map((player) => {
        // ต้องแน่ใจว่า p.role ถูกตั้งค่าอย่างถูกต้องก่อนหน้านี้
        const displayRole = player.isDealer
          ? "เจ้ามือ"
          : room.players
              .filter((pl) => !pl.isDealer)
              .findIndex((pl) => pl.id === player.id) !== -1
          ? `ขาที่ ${
              room.players
                .filter((pl) => !pl.isDealer)
                .findIndex((pl) => pl.id === player.id) + 1
            }`
          : player.role || "ขา";

        return {
          id: player.id,
          name: player.name,
          role: displayRole, // ใช้ role ที่แสดงผลได้
          initialBalance: player.initialBalance,
          finalBalance: player.balance,
          netChange: player.balance - player.initialBalance,
        };
      });

      io.to(roomId).emit("gameEnded", gameSummary);
      io.to(roomId).emit("message", {
        text: `เจ้ามือ ${room.dealerName} ได้จบเกม.`,
      });

      const socketsInRoom = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      );
      socketsInRoom.forEach((socketIdInRoom) => {
        // เปลี่ยนชื่อตัวแปรไม่ให้ซ้ำกับ socket ด้านนอก
        const clientSocket = io.sockets.sockets.get(socketIdInRoom);
        if (clientSocket) clientSocket.leave(roomId);
      });

      clearTurnTimer(room);
      delete rooms[roomId]; // ลบห้องออกจากระบบ
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
          `[Server] ${player.role || player.name} (${
            player.name
          }) disconnected from room ${roomId}.`
        );
        io.to(roomId).emit("playerLeft", {
          name: player.name,
          message: "ออกจากห้องแล้ว",
        });

        if (room.gameStarted && !player.disconnectedMidGame) {
          player.disconnectedMidGame = true;
          player.hasStayed = true; // ให้ถือว่าหมอบเมื่อหลุดระหว่างเกม
          player.actionTakenThisTurn = true;
          if (room.currentTurnPlayerId === player.id) {
            // clearTurnTimer(room); // advanceTurn จะ clear เอง
            advanceTurn(roomId);
          }
        } else if (!room.gameStarted) {
          // ถ้าเกมยังไม่เริ่ม ให้ลบผู้เล่นออกเลย
          room.players.splice(playerIndex, 1);
        }

        // อัปเดต playersData หลังจากจัดการผู้เล่นที่หลุด
        const activePlayersRemaining = room.players.filter(
          (p) => !p.disconnectedMidGame || !room.gameStarted
        ); // คนที่ไม่หลุด หรือถ้าเกมไม่เริ่มก็ไม่นับ disconnectedMidGame

        if (
          activePlayersRemaining.length === 0 ||
          (room.gameStarted &&
            activePlayersRemaining.filter((p) => !p.disconnectedMidGame)
              .length === 0)
        ) {
          console.log(
            `[Server] Room ${roomId} empty or all active players left. Deleting.`
          );
          clearTurnTimer(room);
          delete rooms[roomId];
        } else {
          // ตรวจสอบและตั้งเจ้ามือใหม่ถ้าเจ้ามือคนปัจจุบันหลุด
          const currentDealer = room.players.find(
            (p) => p.id === room.dealerId
          );
          if (!currentDealer || currentDealer.disconnectedMidGame) {
            // ถ้าเจ้ามือหลุด
            const newDealer = activePlayersRemaining.find(
              (p) => !p.isDealer && !p.disconnectedMidGame
            ); // หาขาคนแรกที่ยังอยู่
            if (newDealer) {
              // Promote new dealer
              const oldDealerIndex = room.players.findIndex(
                (p) => p.id === room.dealerId
              );
              if (oldDealerIndex !== -1)
                room.players[oldDealerIndex].isDealer = false; // Clear old dealer flag

              newDealer.isDealer = true;
              newDealer.baseRole = "เจ้ามือ";
              // newDealer.role = "เจ้ามือ"; // getRoomPlayerData will set this
              room.dealerId = newDealer.id;
              room.dealerName = newDealer.name;
              io.to(roomId).emit("message", {
                text: `${newDealer.name} ได้รับการแต่งตั้งเป็นเจ้ามือใหม่.`,
              });
            } else {
              // ไม่มีใครเป็นเจ้ามือได้
              io.to(roomId).emit("message", {
                text: "เจ้ามือออกจากห้องและไม่สามารถหาเจ้ามือใหม่ได้ เกมจะถูกปิด.",
              });
              // อาจจะต้อง emit endGame หรือ event ปิดห้องเฉพาะ
              const socketsInRoom = Array.from(
                io.sockets.adapter.rooms.get(roomId) || []
              );
              socketsInRoom.forEach((socketIdInRoom) => {
                const clientSocket = io.sockets.sockets.get(socketIdInRoom);
                if (clientSocket) clientSocket.leave(roomId);
              });
              clearTurnTimer(room);
              delete rooms[roomId];
              return; // ออกจาก for...in loop ถ้าห้องถูกลบ
            }
          }
          // ส่งข้อมูลผู้เล่นที่อัปเดตแล้วเสมอ (ถ้าห้องยังอยู่)
          if (rooms[roomId]) {
            // ตรวจสอบอีกครั้งว่าห้องยังไม่ถูกลบ
            io.to(roomId).emit("playersData", getRoomPlayerData(room));
          }
        }
        break; // ออกจาก loop เมื่อเจอห้องและจัดการผู้เล่นแล้ว
      }
    }
  });
});

// การเริ่ม Server ให้รอรับการเชื่อมต่อ
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(
    `[Server] Pok Deng Server is running on port ${PORT} at ${new Date().toLocaleString()}`
  );
});
