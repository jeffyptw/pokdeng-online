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
    origin: "https://pokdeng-online.onrender.com", // หรือ origin ของ client ของคุณ // origin: "*", // สำหรับทดสอบ local

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
    if (numericValues.length !== 3) return false; // A-K-Q (14, 13, 12)

    if (
      numericValues[0] === 14 &&
      numericValues[1] === 13 &&
      numericValues[2] === 12
    ) {
      return true;
    } // K-A-2 and A-2-3 are NOT straights. Smallest is 2-3-4. // General case: 5-4-3, 4-3-2 etc.

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
        name: isSameSuit ? "ป๊อก9เด้ง" : "ป๊อก9",

        rank: 1,

        score: 9,

        multiplier: isSameSuit ? 2 : 1,

        cards: sortedCardsByNumericValue,

        isPok: true,

        isDeng: isSameSuit,

        dengType: isSameSuit ? "ป๊อกเด้ง" : null,
      };
    }

    if (score === 8) {
      return {
        name: isSameSuit ? "ป๊อก8เด้ง" : "ป๊อก8",

        rank: 2,

        score: 8,

        multiplier: isSameSuit ? 2 : 1,

        cards: sortedCardsByNumericValue,

        isPok: true,

        isDeng: isSameSuit,

        dengType: isSameSuit ? "ป๊อกเด้ง" : null,
      };
    } // Fall through to Rank 7 (Points Hand) for 2 cards not Pok
  }

  if (numCards === 3) {
    const isAllSameSuit = new Set(cardSuits).size === 1;

    const isTong = new Set(cardValues).size === 1;

    if (isTong) {
      return {
        name: `ตอง ${cardValues[0]}`,

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
        name: "สเตรทฟลัช",

        rank: 4,

        score: score,

        multiplier: 5,

        cards: sortedCardsByNumericValue,

        tieBreakerValue: numericValues[0],

        isPok: false,

        isDeng: true,

        dengType: "สเตรทฟลัช",
      };
    }

    if (isStraight) {
      // Not Straight Flush

      return {
        name: "เรียง",

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
        name: "เซียน",

        rank: 6,

        score: score,

        multiplier: 3,

        cards: sortedCardsByNumericValue,

        tieBreakerValue: numericValues,

        isPok: false,

        isDeng: false,

        dengType: null,
      };
    } // Fall through to Rank 7 (Points Hand) for 3 cards not special
  } // Rank 7: Points Hand (2 cards not Pok, or 3 cards not special)

  handDetails.rank = 7;

  if (numCards === 3) {
    const isAllSameSuitForThreeCards = new Set(cardSuits).size === 1; // (ต้องไม่เป็น Straight Flush ซึ่งถูกตรวจสอบและ return ไปแล้ว)

    if (isAllSameSuitForThreeCards) {
      handDetails.name = `${score} สามเด้ง`;

      handDetails.multiplier = 3;

      handDetails.isDeng = true;

      handDetails.dengType = "สามเด้ง";
    } else {
      // ไพ่ 3 ใบธรรมดา (ไม่เด้งดอก)

      if (score === 9) {
        handDetails.name = "9 หลัง"; // "9 หลัง"
      } else if (score === 8) {
        handDetails.name = "8 หลัง"; // "8 หลัง"
      } else {
        handDetails.name = `${score} แต้ม`;
      }

      handDetails.multiplier = 1;

      handDetails.isDeng = false;

      handDetails.dengType = null;
    }
  } else if (numCards === 2) {
    // Normal 2 cards (not Pok)

    const isSameSuitTwoCards = cardSuits[0] === cardSuits[1];

    const isPairTwoCards = cardValues[0] === cardValues[1];

    if (isSameSuitTwoCards) {
      // Song Deng (Suit)

      handDetails.name = `${score} สองเด้ง`;

      handDetails.multiplier = 2;

      handDetails.isDeng = true;

      handDetails.dengType = "สองเด้ง";
    } else if (isPairTwoCards) {
      // Song Deng (Pair)

      handDetails.name = `${score} สองเด้ง`;

      handDetails.multiplier = 2;

      handDetails.isDeng = true;

      handDetails.dengType = "สองเด้ง";
    } else {
      // Normal 2 cards

      handDetails.name = `${score} แต้ม`;

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

    handDetails.name = "บอด";
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

    disconnectedMidGame: false, // เพิ่ม hasPok เพื่อติดตามสถานะป๊อก

    hasPok: false,
  };
}

function getRoomPlayerData(room) {
  if (!room || !room.players) return [];

  let playerNumber = 1; // Display all players, including disconnected ones, so client knows who was in the room

  return room.players.map((p) => {
    let displayRole = p.baseRole;

    if (!p.isDealer && !p.disconnectedMidGame) {
      // Assign leg numbers only to active non-dealers

      displayRole = `ขาที่ ${playerNumber}`;

      playerNumber++;
    } else if (!p.isDealer && p.disconnectedMidGame) {
      displayRole = `(หลุด) ขา`;
    }

    return {
      id: p.id,

      name: p.name,

      balance: p.balance,

      role: displayRole,

      isDealer: p.isDealer,

      hasStayed: p.hasStayed,

      disconnectedMidGame: p.disconnectedMidGame, // Send this status to client

      hasPlayedThisRound: p.hasPlayedThisRound, // Send this status // Client might not need to see gameOutcomeThisRound for OTHERS until roundResults
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
  } // Ensure dealer has hand details calculated if not already

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

    let moneyChange = 0; // Use handDetails.name for display, handDetails.rank for logic

    const playerHand = player.handDetails;

    const dealerHand = dealer.handDetails; // Already confirmed to exist // กรณีผู้เล่นป๊อก และ เจ้ามือก็ป๊อก

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
    } // กรณีเจ้ามือป๊อก แต่ผู้เล่นไม่ป๊อก
    else if (dealerHand.isPok) {
      outcome = "แพ้";

      moneyChange = -(betAmount * dealerHand.multiplier);
    } // กรณีผู้เล่นป๊อก แต่เจ้ามือไม่ป๊อก
    else if (playerHand.isPok) {
      outcome = "ชนะ";

      moneyChange = betAmount * playerHand.multiplier;
    } // กรณีไม่มีใครป๊อก: เทียบ rank อื่นๆ
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
              JSON.stringify(dealerHand.tieBreakerValue))
        ) {
          // For Sian array

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

      moneyChange = player.balance >= betAmount ? -betAmount : -player.balance; // ถ้าชนะด้วยไพ่ที่ถืออยู่ก่อนหลุด ก็ให้ชนะไปตามนั้น
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

    io.to(roomId).emit("result", roundResults); // อัปเดต playersData หลังคำนวณผล เพื่อให้ balance ถูกต้อง

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

  if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false); // ซ่อนปุ่มเปิดไพ่ // แจ้ง Client ให้สามารถเริ่มเกมใหม่ได้ หรือรอเจ้ามือ
}

function startPlayerTurnTimer(room, playerId) {
  const player = room.players.find((p) => p.id === playerId); // เพิ่มการตรวจสอบ player.hasPok ถ้าผู้เล่นป๊อกแล้ว ไม่ควรมี turn timer สำหรับจั่วไพ่

  if (
    !room ||
    !player ||
    player.hasStayed ||
    player.disconnectedMidGame ||
    player.hasPok
  ) {
    // ถ้าผู้เล่นป๊อกไปแล้ว หรือหมอบแล้ว หรือหลุด ให้เคลียร์ timer (ถ้ามี) แล้ว advanceTurn

    clearTurnTimer(room); // advanceTurn(room.id); // อาจจะไม่จำเป็นต้องเรียก advanceTurn ซ้ำซ้อน ถ้า advanceTurn จัดการได้ดี

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
      clearInterval(room.turnTimerInterval); // ไม่ต้องทำ auto-stay ที่นี่แล้ว เพราะ timeout จะจัดการ
    }
  }, 1000);

  room.turnTimeout = setTimeout(() => {
    if (
      rooms[room.id] &&
      room.currentTurnPlayerId === player.id &&
      !player.actionTakenThisTurn && // ตรวจสอบว่ายังไม่ได้ทำ action
      !player.hasStayed &&
      !player.hasPok
    ) {
      // และยังไม่ได้หมอบหรือป๊อก

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
  ); // ถ้าไม่พบผู้เล่นปัจจุบัน หรือผู้เล่นคนนั้นหมอบแล้ว/ป๊อกแล้ว/หลุดไปแล้ว ให้ไปยังคนถัดไป

  if (
    !currentPlayer ||
    currentPlayer.hasStayed || // <<< --- จุดสำคัญ: ถ้า hasStayed เป็น true จะไม่เริ่มตาให้ แต่จะ advanceTurn ไปคนถัดไป
    currentPlayer.disconnectedMidGame
  ) {
    advanceTurn(roomId); // ไปยังผู้เล่นคนถัดไป

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

    io.to(room.dealerId).emit("enableShowResult", false); // ซ่อนปุ่ม Show Result // และอาจจะส่ง enableStartGame: true ให้ dealer

    return;
  }

  if (!room.gameStarted) {
    // ถ้าเกมไม่เคยเริ่มเลย

    // console.log(`[AvT] Room ${roomId} not started.`);

    return;
  } // หาผู้เล่นคนถัดไปใน playerActionOrder

  let nextActivePlayerFound = false; // วนหาตาม playerActionOrder ที่กำหนดไว้ตอนเริ่มเกม

  for (let i = 0; i < room.playerActionOrder.length; i++) {
    room.currentPlayerIndexInOrder =
      (room.currentPlayerIndexInOrder + 1) % room.playerActionOrder.length;

    const nextPlayerId = room.playerActionOrder[room.currentPlayerIndexInOrder];

    const nextPlayer = room.players.find((p) => p.id === nextPlayerId);

    if (
      nextPlayer &&
      !nextPlayer.hasStayed && // <<< --- จุดสำคัญ: ถ้า hasStayed เป็น true จะข้ามผู้เล่นนี้ไป
      !nextPlayer.disconnectedMidGame
    ) {
      room.currentTurnPlayerId = nextPlayer.id;

      startPlayerTurn(roomId); // เริ่มตาของผู้เล่นนี้

      nextActivePlayerFound = true;

      return;
    }
  } // ถ้าวนจนครบแล้วไม่เจอใครที่เล่นได้ (ทุกคนหมอบ/ป๊อก/หลุด หรือถึงคิวเจ้ามือเป็นคนสุดท้ายที่ยังไม่หมอบ/ป๊อก)

  if (!nextActivePlayerFound) {
    room.currentTurnPlayerId = null; // ไม่มีใครกำลังเล่น (รอเจ้ามือเปิดไพ่)

    io.to(roomId).emit("currentTurn", {
      id: null,

      name: "",

      role: "",

      timeLeft: 0,
    }); // ตรวจสอบว่าเจ้ามือได้เล่นหรือยัง (ถ้าเจ้ามือไม่ใช่คนสุดท้ายใน playerActionOrder และยังไม่ hasStayed/hasPok)

    const dealer = room.players.find((p) => p.isDealer);

    if (
      dealer &&
      dealer.handDetails &&
      (dealer.handDetails.rank === 1 || dealer.handDetails.rank === 2)
    ) {
      // ตรวจสอบว่าเจ้ามือได้ไพ่ป๊อก (rank === 1)

      io.to(roomId).emit("message", {
        text: `${dealer.role} (${dealer.name}) ได้ ${dealer.handDetails.type}! เปิดไพ่ทันที!`, // แจ้งเตือนว่าเจ้ามือป๊อก
      });

      room.players.forEach((p) => {
        // ทำให้ผู้เล่นคนอื่น (ที่ไม่ใช่เจ้ามือ) ทุกคนอยู่ในสถานะ "หมอบ" (hasStayed = true)

        if (!p.isDealer && !p.disconnectedMidGame) p.hasStayed = true;
      });

      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดตข้อมูลผู้เล่น

      calculateAndEmitResults(roomId); // เรียกฟังก์ชันคำนวณและแสดงผลลัพธ์ทันที (นี่คือการ "เปิดไพ่")

      return; // จบการทำงานของ startGame ทันทีเพราะเกมตัดสินแล้ว
    } // ถ้าทุกคนเล่นครบแล้วจริงๆ (รวมเจ้ามือถ้าเจ้ามือต้องจั่ว/อยู่) // เปิดให้เจ้ามือกด "เปิดไพ่"

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
        return socket.emit("errorMessage", { text: "ห้องถูกล็อคโดยเจ้ามือ" });
      if (room.gameStarted && !room.roundOver && !room.summarySent)
        return socket.emit("errorMessage", { text: "เกมในห้องนี้เริ่มไปแล้ว" });
      if (room.players.length >= 17)
        return socket.emit("errorMessage", {
          text: "ห้องเต็มแล้ว (สูงสุด 17 คนรวมเจ้ามือ)",
        });
      if (
        room.players.find((p) => p.id === socket.id || p.socketId === socket.id)
      )
        return socket.emit("errorMessage", {
          text: "คุณอยู่ในห้องนี้แล้วด้วย ID อื่น",
        });
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });
      if (
        room.players.find(
          (p) => p.name.toLowerCase() === playerName.trim().toLowerCase()
        )
      )
        return socket.emit("errorMessage", {
          text: "มีผู้เล่นอื่นใช้ชื่อนี้แล้ว กรุณาเปลี่ยนชื่อ",
        });

      const bal = parseInt(initialBalance);
      if (isNaN(bal) || bal < 10 || (bal % 10 !== 0 && bal % 5 !== 0))
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 10, ลงท้าย 0 หรือ 5)",
        });

      // สมมติว่า initializePlayer คืน object player พื้นฐานมา
      const player = initializePlayer(
        socket.id, // ควรจะเป็น ID ถาวร ไม่ใช่ socket.id ถ้าต้องการ reconnect แต่ตามโค้ดเดิมใช้ socket.id เป็น id หลักไปก่อน
        playerName.trim(),
        bal,
        false, // isDealer
        socket.id // socketId
      );

      // --- การเปลี่ยนแปลงเริ่มต้นที่นี่ ---
      // 1. ตรวจสอบและกำหนด initialBalance (เพื่อให้แน่ใจว่ามี ตามที่ endgame ต้องการใช้)
      player.initialBalance = bal; // กำหนด initialBalance โดยตรง

      // 2. กำหนดสถานะการเชื่อมต่อเริ่มต้น
      player.disconnectedMidGame = false; // เพิ่ม property นี้และกำหนดค่าเริ่มต้น
      // --- การเปลี่ยนแปลงสิ้นสุดที่นี่ ---

      room.players.push(player);
      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId: room.id,
        dealerName: room.dealerName,
        betAmount: room.betAmount, // ควรจะเป็น room.minBet หรือค่าที่เกี่ยวข้อง
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // ส่งข้อมูลผู้เล่นทั้งหมด (รวมคนใหม่)
      io.to(roomId).emit("message", {
        text: `${player.name} ได้เข้าร่วมห้อง.`,
      });
      console.log(
        // เพิ่ม Log แสดง initialBalance ตอนเข้าห้อง
        `[Server] ${player.name} (${socket.id}) joined room ${roomId} with initial balance ${player.initialBalance}`
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
      }); // ใน startGame หลัง deal ไพ่และคำนวณ handDetails

      room.players.forEach((player) => {
        if (!player.disconnectedMidGame) {
          if (player.cards.length === 2) {
            player.handDetails = getHandRank(player.cards);

            if (player.handDetails) {
              // เพิ่มการตรวจสอบว่า handDetails ไม่ใช่ null

              player.hasPok = player.handDetails.isPok; // <--- อัปเดต player.hasPok ตรงนี้
            }
          } else {
            // ... (error handling)

            player.handDetails = getHandRank([]);

            player.hasPok = false; // <--- หรือกำหนดเป็น false ถ้าไม่มีไพ่
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

      if (dealer && dealer.handDetails && dealer.handDetails.isPok) {
        // ใช้ .isPok ซึ่งครอบคลุมทั้งป๊อก 8 และ 9

        io.to(roomId).emit("message", {
          text: `${dealer.role} (${dealer.name}) ได้ ${dealer.handDetails.name}! เปิดไพ่ทันที!`, // ชื่อมือจะบอกเองว่าเป็นป๊อกอะไร
        });

        room.players.forEach((p) => {
          if (!p.isDealer && !p.disconnectedMidGame) {
            p.hasStayed = true; // ผู้เล่นอื่นทุกคนถือว่า "อยู่" เพราะเจ้ามือป๊อก

            p.actionTakenThisTurn = true;
          }
        });

        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดตสถานะผู้เล่น

        calculateAndEmitResults(roomId); // คำนวณและแสดงผลทันที

        return; // จบการทำงานของ startGame เพราะเกมตัดสินแล้ว
      }

      let playerPokMessageSent = false;

      room.players.forEach((player) => {
        if (
          !player.isDealer && // เช็คว่าเป็นผู้เล่น (ไม่ใช่เจ้ามือ)
          !player.disconnectedMidGame &&
          player.handDetails &&
          player.handDetails.isPok
        ) {
          // ใช้ .isPok จะสั้นและตรงประเด็นกว่า (rank 1 คือ ป๊อก9, rank 2 คือ ป๊อก8)

          player.hasStayed = true; // ถูกต้อง: ตั้งค่าให้ผู้เล่นคนนี้ "อยู่" (Stay) ทันที

          player.actionTakenThisTurn = true; // ถูกต้อง: ระบุว่าผู้เล่นได้ทำการตัดสินใจในเทิร์นนี้แล้ว // player.hasPok = true; // ถ้าคุณมีการใช้ player.hasPok แยกต่างหาก ก็ตั้งค่าตรงนี้ด้วย (แต่ player.handDetails.isPok ก็พอ)

          io.to(roomId).emit("message", {
            // ใช้ player.handDetails.name เพื่อแสดงชื่อเต็มของไพ่ป๊อก เช่น "ป๊อก9เด้ง", "ป๊อก8"

            text: `${player.role || player.name} ได้ ${
              player.handDetails.name
            }! (ข้ามตา)`,
          });

          io.to(roomId).emit("player_revealed_pok", {
            playerId: player.id,

            name: player.name,

            role: player.role, // ควรดึง role ที่อัปเดตล่าสุดมาแสดง

            cards: player.cards,

            handDetails: player.handDetails,
          });

          playerPokMessageSent = true;
        }
      });

      if (playerPokMessageSent) {
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดตข้อมูลผู้เล่นถ้ามีใครป๊อก
      } // ส่วนที่เหลือ: การกำหนด playerActionOrder และเรียก advanceTurn

      room.playerActionOrder = activePlayersForDeal // ควรใช้ activePlayersForDeal ที่กรองผู้เล่นที่ยังเชื่อมต่ออยู่

        .filter((p) => !p.isDealer) // ขาเท่านั้นก่อน

        .map((p) => p.id);

      if (dealerForDeal) {
        // dealerForDeal คือ dealer ที่ยัง active

        room.playerActionOrder.push(dealerForDeal.id); // เจ้ามือเป็นคนสุดท้ายในลำดับการตัดสินใจ (ถ้าต้องจั่ว)
      }

      room.currentPlayerIndexInOrder = -1; // Reset index สำหรับการวนรอบใหม่ใน advanceTurn

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

      if (!room) {
        console.error(`[Server] Room ${roomId} not found for 'stay' action.`);

        socket.emit("gameError", { message: `Room ${roomId} not found.` });

        return;
      }

      const actingPlayerId = room.currentTurnPlayerId;

      if (!actingPlayerId) {
        console.error(
          `[Server] No current turn player ID in room ${roomId} for 'stay' action.`
        );

        socket.emit("gameError", {
          message: "No current player identified for this action.",
        });

        return;
      } // ตรวจสอบว่าผู้ที่ส่ง action 'stay' คือผู้เล่นที่ถึงตาจริงๆ

      if (socket.id !== actingPlayerId) {
        console.warn(
          `[Server] Socket ${socket.id} attempted 'stay' out of turn in room ${roomId}. Current player is ${actingPlayerId}.`
        );

        socket.emit("gameError", { message: "It's not your turn." }); // แจ้งเตือนไปยัง client ที่พยายามทำผิดตา

        return;
      } // ค้นหา object ของผู้เล่นจาก actingPlayerId

      const player = room.players.find((p) => p.id === actingPlayerId);

      if (!player) {
        console.error(
          `[Server] Player object for ID ${actingPlayerId} not found in room ${roomId} players list.`
        );

        socket.emit("gameError", {
          message: "Error finding player data. Please try again.",
        });

        return;
      } // ตรวจสอบว่าผู้เล่นได้ stay ไปแล้วหรือยัง

      if (player.hasStayed) {
        console.log(
          `[Server] Player ${player.name} (${player.id}) in room ${roomId} tried to stay again.`
        );

        socket.emit("gameError", { message: "You have already stayed." });

        return;
      }

      console.log(
        `[Server] Player ${player.name} (${player.id}) in room ${roomId} chose to stay.`
      );

      player.hasStayed = true;

      player.actionTakenThisTurn = true; // ระบุว่าผู้เล่นได้กระทำการในเทิร์นนี้แล้ว // เคลียร์ turn timer ของผู้เล่นนี้ เพราะได้ทำการ action แล้ว

      if (room.turnTimer) {
        clearTimeout(room.turnTimer);

        room.turnTimer = null; // console.log(`[Server] Cleared turn timer for player ${player.name} in room ${roomId}.`);
      } // console.log(`[Server] Before advanceTurn in stay: Room ${roomId}, Player: ${player.name}, HasStayed: ${player.hasStayed}, ActionTaken: ${player.actionTakenThisTurn}`);

      advanceTurn(roomId);
    } catch (error) {
      console.error(
        `[Server] Critical error in 'stay' handler for room ${roomId}, socket ${socket.id}:`,

        error
      ); // แจ้ง client ว่าเกิด error ฝั่ง server แต่ไม่ต้องส่งรายละเอียด error ทั้งหมดไป

      socket.emit("gameError", {
        message:
          "An internal server error occurred while processing your 'stay' action. Please try again.",
      });
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

  //socket.on("endGame",
  socket.on("endGame", ({ roomId }) => {
    try {
      const room = rooms[roomId];

      if (!room) {
        // ส่ง 'roomNotFound' แทน 'errorMessage' เพื่อให้ Client จัดการเฉพาะทางได้ ถ้าต้องการ
        // return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
        return socket.emit("roomNotFound", {
          roomId: roomId,
          message: "ไม่พบห้องที่ต้องการจบเกม",
        });
      }

      // ควรใช้ room.dealerId ที่เก็บ ID ถาวรของผู้เล่น ไม่ใช่ socket.id ที่อาจเปลี่ยนได้หากมีการ reconnect
      // สมมติว่า room.dealerId เก็บ ID ถาวรที่ตรงกับ player.id
      const requestingPlayer = room.players.find(
        (p) => p.socketId === socket.id
      ); // หาผู้เล่นที่ส่ง request ด้วย socketId ปัจจุบัน
      if (!requestingPlayer || requestingPlayer.id !== room.dealerId) {
        // เปรียบเทียบ ID ถาวรของผู้เล่นกับ dealerId ของห้อง
        return socket.emit("errorMessage", {
          text: "เฉพาะเจ้ามือเท่านั้นที่สามารถจบเกมได้",
        });
      }

      // เพิ่มการตรวจสอบว่าเกมได้เริ่มไปแล้วหรือยัง หรืออยู่ในสถานะที่จบได้
      // if (!room.gameStarted && !room.roundOver) { // ตัวอย่างเงื่อนไข (อาจปรับตาม logic ของคุณ)
      //    return socket.emit("errorMessage", { text: "ยังไม่มีการเล่นเกมในรอบนี้" });
      // }

      // --- การเปลี่ยนแปลงเริ่มต้นที่นี่ ---
      // 1. ตั้งค่าสถานะห้องให้ชัดเจน (นอกเหนือจาก summarySent)
      room.status = "ended"; // เพิ่ม property นี้ หรือใช้ summarySent เป็นตัวแทนก็ได้
      room.gameStarted = false; // เกมไม่ถือว่ากำลังดำเนินอยู่
      room.roundOver = true; // รอบปัจจุบัน (และเกม) จบลง
      room.summarySent = true; // ทำเครื่องหมายว่าส่งสรุปแล้ว (สำคัญสำหรับ logic disconnect)

      // 2. หยุด Timer (ถ้ามี)
      clearTurnTimer(room); // ตรวจสอบว่ามีฟังก์ชัน clearTurnTimer และเรียกใช้ถูกต้อง

      // --- การเปลี่ยนแปลงสิ้นสุดที่นี่ ---

      // คำนวณสรุป (โค้ดเดิมดูถูกต้องแล้ว)
      const gameSummary = room.players.map((player) => {
        // การคำนวณ netChange ดูถูกต้อง
        const netChange = player.balance - player.initialBalance;
        return {
          id: player.id, // ID ถาวรของผู้เล่น
          name: player.name,
          role: player.role, // บทบาทสุดท้าย (อาจจะเป็น 'เจ้ามือ' หรือ 'ผู้เล่น')
          initialBalance: player.initialBalance,
          finalBalance: player.balance, // ยอดเงินสุดท้าย
          netChange: netChange,
          disconnectedMidGame: player.disconnectedMidGame || false, // สถานะการหลุดระหว่างเกม
          isDealer: player.id === room.dealerId, // ตรวจสอบว่าเป็นเจ้ามือหรือไม่ จาก ID ถาวร
        };
      });

      // ส่งสรุปให้ทุกคนในห้อง (โค้ดเดิมดูถูกต้อง)
      // เปลี่ยนชื่อ event จาก 'showGameSummary' เป็นชื่อที่สื่อความหมายมากขึ้น เช่น 'gameEndedSummary' ถ้าต้องการ
      io.to(roomId).emit("showGameSummary", gameSummary); // หรือ io.to(roomId).emit("gameEndedSummary", { summary: gameSummary });

      // ส่งข้อความแจ้งเตือน (โค้ดเดิมดูถูกต้อง)
      const dealer = room.players.find((p) => p.id === room.dealerId); // หาเจ้ามือจาก ID ถาวร
      io.to(roomId).emit("message", {
        text: `--- เกมจบลงแล้ว เจ้ามือ (${
          dealer ? dealer.name : room.dealerName // ใช้ชื่อจาก player object ถ้าเจอ หรือจาก room.dealerName สำรอง
        }) สรุปยอด ---`,
        type: "system", // หรือ 'info' หรือ 'game-event'
      });

      console.log(
        `[Server] Game session ended in room ${roomId} by dealer ${requestingPlayer.name} (ID: ${requestingPlayer.id}, Socket: ${socket.id}). Summary sent.`
      );
    } catch (error) {
      console.error(`[Server] Error ending game in room ${roomId}:`, error);
      // แจ้งข้อผิดพลาดกลับไปยังผู้ส่ง request เท่านั้น
      socket.emit("errorMessage", {
        text: "เกิดข้อผิดพลาดในการจบเกมและสรุปยอด",
      });
    }
  });

  //socket.on("disconnect"
  socket.on("disconnect", () => {
    console.log(`[Server] User disconnected: ${socket.id}`);
    let roomIdPlayerWasIn = null;
    let playerWhoLeft = null;
    let roomPlayerWasIn = null;
    let playerIndexInRoom = -1;

    // ค้นหาห้องและผู้เล่นที่เกี่ยวข้องกับ socket ที่หลุดการเชื่อมต่อ
    for (const id in rooms) {
      const room = rooms[id];
      // **สำคัญ:** ค้นหาด้วย socket.id ที่ตรงกับ player.socketId ที่เก็บไว้ตอน join
      const pIndex = room.players.findIndex((p) => p.socketId === socket.id);
      if (pIndex !== -1) {
        roomIdPlayerWasIn = id;
        roomPlayerWasIn = room;
        playerWhoLeft = room.players[pIndex];
        playerIndexInRoom = pIndex; // เก็บ index ไว้ใช้กรณีต้องการลบออกจาก array
        break; // เจอแล้ว ออกจาก loop
      }
    }

    // ถ้าเจอห้องและผู้เล่นที่หลุด
    if (roomPlayerWasIn && playerWhoLeft) {
      // --- ส่วนของการจัดการข้อมูลผู้เล่นที่หลุด ---
      console.log(
        `[Server] Player ${playerWhoLeft.name} (ID: ${playerWhoLeft.id}, Socket: ${socket.id}) disconnected from room ${roomIdPlayerWasIn}. Current room state: gameStarted=${roomPlayerWasIn.gameStarted}, summarySent=${roomPlayerWasIn.summarySent}`
      );

      // แจ้งผู้เล่นคนอื่นในห้อง (อาจแจ้งก่อนหรือหลังจัดการข้อมูลก็ได้)
      io.to(roomIdPlayerWasIn).emit("playerLeft", {
        id: playerWhoLeft.id, // ส่ง ID ของผู้เล่นที่ออกไปด้วย
        name: playerWhoLeft.name,
        message: "หลุดการเชื่อมต่อ", // ใช้คำว่า "หลุดการเชื่อมต่อ" จะชัดเจนกว่า
      });

      // ทำเครื่องหมายว่าผู้เล่นหลุด ถ้าเกมกำลังดำเนินอยู่ *และ* ยังไม่มีการส่งสรุปยอด
      if (roomPlayerWasIn.gameStarted && !roomPlayerWasIn.summarySent) {
        if (!playerWhoLeft.disconnectedMidGame) {
          // ทำเครื่องหมายเฉพาะครั้งแรกที่หลุดในเกมนั้น
          playerWhoLeft.disconnectedMidGame = true;
          // playerWhoLeft.socketId = null; // ล้าง socketId เพื่อแสดงว่าไม่ active แต่ยังอยู่ในห้อง
          console.log(
            `[Server] Marked ${playerWhoLeft.name} as disconnectedMidGame in room ${roomIdPlayerWasIn}. Data retained for summary.`
          );

          // จัดการเรื่อง turn ถ้าผู้เล่นที่หลุดเป็น current turn
          // สมมติว่า currentTurnPlayerId เก็บ ID ถาวรของผู้เล่น
          if (roomPlayerWasIn.currentTurnPlayerId === playerWhoLeft.id) {
            io.to(roomIdPlayerWasIn).emit("message", {
              text: `${playerWhoLeft.name} หลุดการเชื่อมต่อระหว่างตาของตนเอง.`,
              type: "warning", // หรือ type อื่นที่เหมาะสม
            });
            clearTurnTimer(roomPlayerWasIn); // หยุด timer ของคนที่หลุด
            // เรียกฟังก์ชัน advanceTurn (ต้องมั่นใจว่า advanceTurn ข้ามผู้เล่นที่มี disconnectedMidGame = true)
            advanceTurn(roomIdPlayerWasIn);
            console.log(
              `[Server] Advanced turn in room ${roomIdPlayerWasIn} because current player ${playerWhoLeft.name} disconnected.`
            );
          }
        } else {
          console.log(
            `[Server] Player ${playerWhoLeft.name} was already marked as disconnectedMidGame.`
          );
          // playerWhoLeft.socketId = null; // อาจจะยังคงล้าง socketId อยู่ดี
        }
        // *** ไม่ลบผู้เล่นออกจาก roomPlayerWasIn.players array ***
        // เพื่อให้ข้อมูลยังอยู่สำหรับคำนวณสรุปตอน endGame
      } else {
        // กรณีอื่นๆ: เกมยังไม่เริ่ม หรือ สรุปยอดไปแล้ว หรือ ไม่ได้อยู่ในสถานะ gameStarted
        // สามารถลบผู้เล่นออกจาก array ได้เลย เพราะไม่ต้องการข้อมูลสำหรับสรุปแล้ว
        roomPlayerWasIn.players.splice(playerIndexInRoom, 1);
        console.log(
          `[Server] Removed ${playerWhoLeft.name} from room ${roomIdPlayerWasIn} players array (Game not started OR Summary already sent).`
        );
      }

      // --- ส่วนของการจัดการห้อง (ตรวจสอบเจ้ามือ, ลบห้อง) ---

      // หาผู้เล่นที่ยัง "Active" (ไม่ได้ถูก mark ว่าหลุด และควรจะมี socketId - แต่การเช็ค disconnectedMidGame สำคัญกว่า)
      // ในที่นี้ "Active" หมายถึงคนที่ยังสามารถเล่นต่อได้ หรือยังเชื่อมต่ออยู่ (ถ้าไม่นับคนที่หลุดไปแล้ว)
      const activePlayersRemaining = roomPlayerWasIn.players.filter(
        (p) => !p.disconnectedMidGame
      );
      // นับจำนวน socket ที่ยังเชื่อมต่อกับ room ID นี้จริงๆ (อาจต่างจาก activePlayersRemaining ถ้ารวมคนที่ disconnect แต่ข้อมูลยังอยู่)
      const connectedSocketsCount =
        io.sockets.adapter.rooms.get(roomIdPlayerWasIn)?.size || 0;
      console.log(
        `[Server] Room ${roomIdPlayerWasIn}: Active players remaining (not marked DC): ${activePlayersRemaining.length}, Connected sockets: ${connectedSocketsCount}`
      );

      // เงื่อนไขการลบห้อง:
      // 1. ไม่มีผู้เล่นเหลือใน array เลย (หลังจาก splice ข้างบน)
      // 2. หรือ ผู้เล่นทุกคนใน array ถูก mark ว่า disconnectedMidGame
      // 3. หรือ ไม่มี socket เชื่อมต่อกับห้องนี้แล้ว (ปลอดภัยสุดในการลบ)
      const shouldDeleteRoom =
        roomPlayerWasIn.players.length === 0 ||
        roomPlayerWasIn.players.every((p) => p.disconnectedMidGame) ||
        connectedSocketsCount === 0;

      if (shouldDeleteRoom) {
        console.log(
          `[Server] Deleting room ${roomIdPlayerWasIn}. Reason: No players left in array OR all marked disconnected OR no connected sockets.`
        );
        clearTurnTimer(roomPlayerWasIn); // หยุด timer ก่อนลบ
        delete rooms[roomIdPlayerWasIn];
        // ไม่ต้องทำอะไรต่อ เพราะห้องถูกลบแล้ว
        return; // ออกจากฟังก์ชัน disconnect
      } else {
        // ห้องยังไม่ถูกลบ: จัดการเรื่องเจ้ามือถ้าจำเป็น และส่งข้อมูลอัปเดต
        console.log(
          `[Server] Room ${roomIdPlayerWasIn} still exists. Checking for dealer change and updating players.`
        );

        // ตรวจสอบการเปลี่ยนเจ้ามือ ถ้าคนที่หลุดเป็นเจ้ามือ *และ* ยังมีผู้เล่น active เหลืออยู่
        if (
          playerWhoLeft.id === roomPlayerWasIn.dealerId &&
          activePlayersRemaining.length > 0
        ) {
          // หาเจ้ามือใหม่จากคนที่ยัง active
          const newDealer = activePlayersRemaining[0]; // เอาคนแรกที่ active
          if (newDealer) {
            // อัปเดตข้อมูลเจ้ามือใน room object
            roomPlayerWasIn.dealerId = newDealer.id;
            roomPlayerWasIn.dealerName = newDealer.name;

            // อัปเดตสถานะ isDealer ใน player object ของทั้งคู่
            playerWhoLeft.isDealer = false; // คนที่หลุดไม่ใช่เจ้ามือแล้ว (แม้ข้อมูลจะยังอยู่)
            const newDealerIndex = roomPlayerWasIn.players.findIndex(
              (p) => p.id === newDealer.id
            );
            if (newDealerIndex !== -1) {
              roomPlayerWasIn.players[newDealerIndex].isDealer = true;
              roomPlayerWasIn.players[newDealerIndex].role = "เจ้ามือ"; // อัปเดต role ด้วย
              // อาจจะต้องอัปเดต baseRole ด้วยถ้าใช้
              // roomPlayerWasIn.players[newDealerIndex].baseRole = "เจ้ามือ";
            }

            // แจ้งทุกคนในห้อง
            io.to(roomIdPlayerWasIn).emit("message", {
              text: `${newDealer.name} เป็นเจ้ามือใหม่.`,
              type: "system",
            });
            // อาจมี event เฉพาะสำหรับการเปลี่ยนเจ้ามือ เพื่อให้ client อัปเดต UI
            io.to(roomIdPlayerWasIn).emit("dealerChanged", {
              dealerId: newDealer.id,
              dealerName: newDealer.name,
            });
            console.log(
              `[Server] New dealer assigned in room ${roomIdPlayerWasIn}: ${newDealer.name} (ID: ${newDealer.id})`
            );
          } else {
            // ไม่ควรเกิดขึ้น ถ้า activePlayersRemaining.length > 0 แต่เผื่อไว้
            console.error(
              `[Server] Error: Could not find a new dealer in room ${roomIdPlayerWasIn} even though active players exist.`
            );
            io.to(roomIdPlayerWasIn).emit("message", {
              text: `เกิดข้อผิดพลาด: ไม่สามารถหาเจ้ามือใหม่ได้หลังจากเจ้ามือเดิมหลุดการเชื่อมต่อ.`,
              type: "error",
            });
            // อาจจะต้องพิจารณาจบเกม หรือให้ admin จัดการ
          }
        } else if (
          playerWhoLeft.id === roomPlayerWasIn.dealerId &&
          activePlayersRemaining.length === 0
        ) {
          // เจ้ามือหลุด และไม่มี active player เหลือ -> ห้องควรจะถูกลบไปแล้วโดย logic ก่อนหน้า แต่ log ไว้เผื่อ
          console.log(
            `[Server] Dealer ${playerWhoLeft.name} disconnected, and no active players remain. Room should have been deleted.`
          );
        }

        // ส่งข้อมูลผู้เล่นล่าสุด (รวมสถานะ disconnected และการเปลี่ยนเจ้ามือ) ให้ทุกคนที่ยังเชื่อมต่ออยู่
        // ใช้ getRoomPlayerData ซึ่งควรจะกรองข้อมูลที่ไม่จำเป็นออกก่อนส่ง
        io.to(roomIdPlayerWasIn).emit(
          "playersData",
          getRoomPlayerData(roomPlayerWasIn) // ฟังก์ชันนี้ควรจะเตรียมข้อมูลผู้เล่นสำหรับส่งให้ client
        );
        console.log(
          `[Server] Updated playersData sent to room ${roomIdPlayerWasIn}`
        );
      }
    } // end if (roomPlayerWasIn && playerWhoLeft)
    else {
      console.log(
        `[Server] Disconnected socket ${socket.id} was not found in any active room.`
      );
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
