// server.js
const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors()); // ควรระบุ origin ที่อนุญาตใน production
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://pokdeng-online1.onrender.com", // << ตรวจสอบและอัปเดตให้ตรงกับ Client ของคุณ
    // origin: "*", // สำหรับทดสอบ local หรือถ้า client อยู่บนหลาย domain
    methods: ["GET", "POST"],
  },
});

const SUITS_DISPLAY = ["♠️", "♥️", "♦️", "♣️"]; // ใช้สำหรับแสดงผล
const SUITS_INTERNAL = ["S", "H", "D", "C"]; // ใช้ภายในสำหรับการจัดการ suit

const VALUES_DISPLAY = [
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
const VALUES_INTERNAL = [
  // ใช้ภายในสำหรับการคำนวณค่า
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "T",
  "J",
  "Q",
  "K", // T for 10
];

const DEFAULT_TURN_DURATION = 30;
const DEFAULT_BET_AMOUNT = 5;

const rooms = {};

// --- Utility Functions ---
function getCardDisplay(card) {
  // card object เช่น { suit: '♥️', value: 'K' }
  if (card && card.value && card.suit) {
    return `${card.value}${card.suit}`;
  }
  console.warn("[Server] Invalid card object passed to getCardDisplay:", card);
  return "?";
}

// --- Game Logic Functions ---
function createDeck() {
  const deck = [];
  for (const suit of SUITS_DISPLAY) {
    // ใช้ SUITS_DISPLAY ในการสร้างไพ่ที่จะส่งให้ client
    for (const value of VALUES_DISPLAY) {
      deck.push({ suit, value });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// --- Hand Evaluation Logic ---
const cardValueMap = {
  // สำหรับแปลงค่าไพ่เป็นตัวเลขเพื่อง่ายต่อการคำนวณ rank และ subRank
  A: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 10,
  Q: 10,
  K: 10,
};
const cardRankValueMap = {
  // สำหรับเทียบความสูงของไพ่เดี่ยวๆ (A สูงสุดในบางกรณีเช่นเทียบตอง)
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  10: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function getHandRank(cards) {
  // cards เป็น array ของ object เช่น [{suit: '♥️', value: 'K'}, {suit: '♠️', value: 'A'}]
  if (!cards || cards.length === 0) {
    return {
      score: 0,
      type: "ไม่มีไพ่",
      rank: 9,
      multiplier: 1,
      cards: [],
      subRank: 0,
    };
  }

  const numCards = cards.length;
  const values = cards.map((c) => c.value);
  const suits = cards.map((c) => c.suit);

  let score = values.reduce((sum, val) => sum + cardValueMap[val], 0) % 10;
  let handDetails = {
    score,
    type: `${score} แต้ม`,
    rank: 8,
    multiplier: 1,
    cards,
    subRank: score,
  }; // Default to normal points

  // --- Helper function to check for "เด้ง" ---
  const checkDeng = (currentMultiplier) => {
    let newMultiplier = currentMultiplier;
    if (numCards === 2) {
      if (suits[0] === suits[1] || values[0] === values[1]) {
        // สีเดียวกัน หรือ ค่าเดียวกัน (สำหรับ 2 ใบ)
        newMultiplier = Math.max(newMultiplier, 2);
      }
    } else if (numCards === 3) {
      if (suits.every((s) => s === suits[0])) {
        // 3 ใบสีเดียวกัน (สามเด้ง)
        newMultiplier = Math.max(newMultiplier, 3);
      }
      // หมายเหตุ: กติกา "สามเด้ง" จากค่าไพ่ (เช่น 7-7-X) ไม่ได้ระบุไว้ชัดเจนในโจทย์ล่าสุด
      // หากต้องการเพิ่ม ต้องระบุ logic การตรวจสอบ
    }
    return newMultiplier;
  };

  // --- Rank 1: ป๊อก (Pok) (ไพ่ 2 ใบ) ---
  if (numCards === 2) {
    if (score === 9 || score === 8) {
      handDetails.rank = 1;
      handDetails.type = `ป๊อก ${score}`;
      handDetails.subRank = score; // ป๊อก 9 ชนะ ป๊อก 8
      handDetails.multiplier = checkDeng(1); // ตรวจสอบเด้งสำหรับป๊อก
      if (handDetails.multiplier > 1) {
        handDetails.type += ` สองเด้ง`;
      }
      return handDetails;
    }
  }

  // --- Convert card values to numerical ranks for straights/ sıralama ---
  const getNumericalValueForSort = (value) => cardRankValueMap[value] || 0;
  const sortedNumericalValues = values
    .map(getNumericalValueForSort)
    .sort((a, b) => a - b);

  // --- Rank 2: ตอง (Tong) (ไพ่ 3 ใบเหมือนกัน) ---
  if (numCards === 3) {
    const isTong = values.every((v) => v === values[0]);
    if (isTong) {
      handDetails.rank = 2;
      handDetails.type = `ตอง ${values[0]}`;
      handDetails.multiplier = 5;
      handDetails.subRank = getNumericalValueForSort(values[0]); // ใช้ค่าไพ่ของตองในการเทียบ (A สูงสุด)
      return handDetails;
    }
  }

  // --- Rank 3: สเตรทฟลัช (Straight Flush) ---
  // (3 ใบเรียงและสีเดียวกัน, ไม่นับ A-2-3, นับ Q-K-A)
  if (numCards === 3) {
    const isFlushCheck = suits.every((s) => s === suits[0]);
    if (isFlushCheck) {
      // Check for Q-K-A (12-13-14 in cardRankValueMap)
      const isQKACondition =
        sortedNumericalValues[0] === cardRankValueMap["A"] && // A
        sortedNumericalValues[1] === cardRankValueMap["Q"] && // Q
        sortedNumericalValues[2] === cardRankValueMap["K"]; // K
      // Re-sort for QKA as 12,13,14 -> Q=12, K=13, A=14 (Ace high for straight)
      const tempSortedForQKA = values
        .map((v) => cardRankValueMap[v])
        .sort((a, b) => a - b);

      let isStraightCheck = false;
      if (
        tempSortedForQKA[0] === cardRankValueMap["10"] &&
        tempSortedForQKA[1] === cardRankValueMap["J"] &&
        tempSortedForQKA[2] === cardRankValueMap["Q"]
      ) {
        // 10-J-Q for testing, should be dynamic
        isStraightCheck = true; // Example, needs proper logic
      } else if (
        tempSortedForQKA[0] === cardRankValueMap["J"] &&
        tempSortedForQKA[1] === cardRankValueMap["Q"] &&
        tempSortedForQKA[2] === cardRankValueMap["K"]
      ) {
        isStraightCheck = true;
      } else if (
        tempSortedForQKA[0] === cardRankValueMap["Q"] &&
        tempSortedForQKA[1] === cardRankValueMap["K"] &&
        tempSortedForQKA[2] === cardRankValueMap["A"]
      ) {
        // Q-K-A (Ace is 14)
        isStraightCheck = true;
      } else if (
        tempSortedForQKA[2] - tempSortedForQKA[1] === 1 &&
        tempSortedForQKA[1] - tempSortedForQKA[0] === 1 &&
        !(
          tempSortedForQKA[0] === cardRankValueMap["A"] &&
          tempSortedForQKA[1] === cardRankValueMap["2"] &&
          tempSortedForQKA[2] === cardRankValueMap["3"]
        ) // Not A-2-3
      ) {
        isStraightCheck = true;
      }

      if (isStraightCheck) {
        handDetails.rank = 3;
        handDetails.type = `สเตรทฟลัช (${values.map(getCardDisplay).join("")})`; // Improved display
        handDetails.multiplier = 5;
        handDetails.subRank = tempSortedForQKA[2]; // ไพ่สูงสุดในเรียงสี
        return handDetails;
      }
    }
  }

  // --- Rank 4: เซียน (Sian) (ไพ่ 3 ใบเป็น J, Q, K) ---
  if (numCards === 3) {
    const faceCards = ["J", "Q", "K"];
    const isSian =
      values.every((v) => faceCards.includes(v)) && new Set(values).size === 3; // J, Q, K อย่างละใบ
    if (isSian) {
      handDetails.rank = 4;
      handDetails.type = "เซียน";
      handDetails.multiplier = 3;
      // subRank for Sian can be the sum of their values or highest card if needed for tie-breaking (e.g. K > Q > J)
      // For simplicity, sum of cardRankValues (K+Q+J) or just K's value. Let's use K's value.
      handDetails.subRank = cardRankValueMap["K"];
      return handDetails;
    }
  }

  // --- Rank 5: เรียง (Straight) ---
  // (3 ใบเรียงกัน, ไม่นับ A-2-3, นับ Q-K-A, ไม่ใช่ JQK ที่เป็นเซียน, ไม่ใช่สเตรทฟลัช)
  if (numCards === 3) {
    // (Logic for isStraightCheck is the same as in Straight Flush, just without the flush condition)
    const tempSortedForQKA = values
      .map((v) => cardRankValueMap[v])
      .sort((a, b) => a - b);
    let isStraightCheck = false;
    if (
      tempSortedForQKA[0] === cardRankValueMap["10"] &&
      tempSortedForQKA[1] === cardRankValueMap["J"] &&
      tempSortedForQKA[2] === cardRankValueMap["Q"]
    ) {
      isStraightCheck = true;
    } else if (
      tempSortedForQKA[0] === cardRankValueMap["J"] &&
      tempSortedForQKA[1] === cardRankValueMap["Q"] &&
      tempSortedForQKA[2] === cardRankValueMap["K"]
    ) {
      isStraightCheck = true;
    } else if (
      tempSortedForQKA[0] === cardRankValueMap["Q"] &&
      tempSortedForQKA[1] === cardRankValueMap["K"] &&
      tempSortedForQKA[2] === cardRankValueMap["A"]
    ) {
      // Q-K-A
      isStraightCheck = true;
    } else if (
      tempSortedForQKA[2] - tempSortedForQKA[1] === 1 &&
      tempSortedForQKA[1] - tempSortedForQKA[0] === 1 &&
      !(
        tempSortedForQKA[0] === cardRankValueMap["A"] &&
        tempSortedForQKA[1] === cardRankValueMap["2"] &&
        tempSortedForQKA[2] === cardRankValueMap["3"]
      ) // Not A-2-3
    ) {
      isStraightCheck = true;
    }

    if (isStraightCheck) {
      handDetails.rank = 5;
      handDetails.type = `เรียง (${values.map(getCardDisplay).join("")})`;
      handDetails.multiplier = 3;
      handDetails.subRank = tempSortedForQKA[2]; // ไพ่สูงสุดในเรียง
      return handDetails;
    }
  }

  // --- Rank 6: สี (Flush) / สามเด้ง ---
  // (ไพ่ 3 ใบสีเดียวกัน, ไม่ใช่สเตรทฟลัช - ซึ่งถูกตรวจไปแล้ว)
  if (numCards === 3) {
    const isFlushCheck = suits.every((s) => s === suits[0]);
    if (isFlushCheck) {
      handDetails.rank = 6;
      handDetails.type = `สี (${score} แต้ม)`; // หรือ "สามเด้ง"
      handDetails.multiplier = 3;
      handDetails.subRank = score; // เทียบด้วยแต้มรวมของสี
      return handDetails;
    }
  }

  // --- Rank 7: สองเด้ง (Song Deng) (ไพ่ 2 ใบ, ไม่ใช่ป๊อก) ---
  // (เงื่อนไขป๊อกถูกตรวจสอบไปแล้ว ở Rank 1)
  if (numCards === 2) {
    // ไม่ป๊อก เพราะถ้าป๊อกจะ return ไปแล้ว
    if (suits[0] === suits[1] || values[0] === values[1]) {
      handDetails.rank = 7;
      handDetails.type = `${score} แต้ม สองเด้ง`;
      handDetails.multiplier = 2;
      handDetails.subRank = score; // เทียบด้วยแต้ม
      return handDetails;
    }
  }

  // --- Rank 8: แต้มธรรมดา (Normal Points) ---
  // (ถ้ามาถึงตรงนี้คือไม่เข้าพวกพิเศษทั้งหมด)
  handDetails.rank = 8;
  handDetails.multiplier = 1; // เด้งธรรมดา (1 เด้ง)
  handDetails.subRank = score; // แต้ม 0-9

  if (numCards === 3 && (score === 9 || score === 8)) {
    handDetails.type = `${score} หลัง`; // 9 หลัง, 8 หลัง
  } else {
    handDetails.type = `${score} แต้ม`;
  }
  // กรณี 2 ใบแต้มธรรมดา (ไม่ใช่ป๊อก ไม่ใช่สองเด้ง) จะถูกจับโดย default ของ handDetails ด้านบน

  // ตรวจสอบเด้งสำหรับแต้มธรรมดา (ถ้ามี 2 ใบ ค่าเหมือน/สีเหมือน ได้จัดการใน Rank 7 ไปแล้ว)
  // ถ้าเป็น 3 ใบ แล้วได้สีเดียวกัน จะถูกจับโดย Rank 6 ไปแล้ว
  // ดังนั้น แต้มธรรมดาที่นี่ส่วนใหญ่คือไม่มีเด้งพิเศษ นอกจากจะกำหนดกติกาเด้งอื่นๆ
  // หากไพ่ 2 ใบ ค่าเดียวกัน หรือสีเดียวกัน แต่ไม่ใช่ป๊อก จะเป็น Rank 7 (สองเด้ง)
  // หากไพ่ 3 ใบ สีเดียวกัน จะเป็น Rank 6 (สี/สามเด้ง)

  return handDetails;
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
      io.to(room.id).emit("errorMessage", {
        text: "เกิดข้อผิดพลาด: ไม่พบเจ้ามือขณะคำนวณผล",
      });
    }
    return null;
  }

  // คำนวณไพ่เจ้ามือก่อนเสมอ
  dealer.handDetails = getHandRank(dealer.cards);
  if (!dealer.handDetails) {
    console.error(
      `[Server] CRITICAL: Failed to get hand details for dealer in room: ${room.id}`
    );
    if (io && room && room.id) {
      io.to(room.id).emit("errorMessage", {
        text: "เกิดข้อผิดพลาด: ไม่สามารถคำนวณไพ่เจ้ามือ",
      });
    }
    return null;
  }
  console.log(
    `[Server] Dealer ${dealer.name} hand: ${JSON.stringify(dealer.handDetails)}`
  );

  const roundResults = [];
  let dealerNetChangeTotal = 0;
  const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

  room.players.forEach((player) => {
    if (player.isDealer) return; // ข้ามเจ้ามือใน loop นี้

    // คำนวณไพ่ผู้เล่น
    if (!player.disconnectedMidGame) {
      player.handDetails = getHandRank(player.cards);
    }
    if (!player.handDetails) {
      // กรณีผู้เล่นไม่มี handDetails (อาจจะ disconnected ก่อนได้ไพ่ หรือ error)
      player.handDetails = {
        score: 0,
        type: player.disconnectedMidGame ? "ขาดการเชื่อมต่อ" : "ไม่มีไพ่/Error",
        rank: 9, // rank ต่ำสุด
        multiplier: 1,
        cards: player.cards || [],
        subRank: 0,
      };
    }
    console.log(
      `[Server] Player ${player.name} hand: ${JSON.stringify(
        player.handDetails
      )}`
    );

    let outcome = "แพ้"; // Default outcome
    let moneyChange = 0;
    const playerHand = player.handDetails;
    const dealerHand = dealer.handDetails;

    if (player.disconnectedMidGame) {
      outcome = "ขาดการเชื่อมต่อ (เสีย)";
      moneyChange = player.balance >= betAmount ? -betAmount : -player.balance;
    } else {
      // --- Logic การเปรียบเทียบไพ่ ---
      if (playerHand.rank < dealerHand.rank) {
        // Rank ผู้เล่นดีกว่า (เลขน้อยกว่า)
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (playerHand.rank > dealerHand.rank) {
        // Rank เจ้ามือดีกว่า
        outcome = "แพ้";
        moneyChange = -betAmount * dealerHand.multiplier; // ผู้เล่นเสียตามเด้งของเจ้ามือ
      } else {
        // Rank เท่ากัน -> เทียบ subRank
        if (playerHand.subRank > dealerHand.subRank) {
          // subRank ผู้เล่นสูงกว่า
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.subRank < dealerHand.subRank) {
          // subRank เจ้ามือสูงกว่า
          outcome = "แพ้";
          moneyChange = -betAmount * dealerHand.multiplier;
        } else {
          // Rank และ subRank เท่ากัน -> เทียบ multiplier (เด้ง)
          if (playerHand.multiplier > dealerHand.multiplier) {
            outcome = "ชนะ (เด้งสูงกว่า)";
            // ชนะตามส่วนต่างเด้ง หรือ ชนะเต็มเด้งของผู้เล่น? กติกาป๊อกเด้งส่วนใหญ่คือได้ตามเด้งตัวเอง
            moneyChange = betAmount * playerHand.multiplier;
          } else if (playerHand.multiplier < dealerHand.multiplier) {
            outcome = "แพ้ (เด้งน้อยกว่า)";
            moneyChange = -betAmount * dealerHand.multiplier; // เสียตามเด้งเจ้ามือ
          } else {
            // ทุกอย่างเท่ากันหมด
            outcome = "เสมอ";
            moneyChange = 0;
          }
        }
      }
    }

    // ตรวจสอบว่าผู้เล่นมีเงินพอจ่ายหรือไม่
    if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
      moneyChange = -player.balance; // เสียเท่าที่มี
    }
    player.balance += moneyChange;
    dealerNetChangeTotal -= moneyChange; // เจ้ามือได้/เสีย ตรงข้ามกับผู้เล่น

    roundResults.push({
      id: player.id,
      name: player.name,
      role: player.role,
      cardsDisplay: (player.handDetails.cards || [])
        .map(getCardDisplay)
        .join(" "),
      score: player.handDetails.score, // แต้มหลัก
      specialType: player.handDetails.type, // ชื่อประเภทไพ่
      outcome: outcome,
      moneyChange: moneyChange,
      balance: player.balance,
      // Debug info (optional)
      // rank: playerHand.rank,
      // subRank: playerHand.subRank,
      // multiplier: playerHand.multiplier,
    });
  });

  // อัปเดตเงินเจ้ามือ
  // ตรวจสอบว่าเจ้ามือมีเงินพอจ่ายหรือไม่ (กรณีเจ้ามือเสียเยอะ)
  if (
    dealerNetChangeTotal < 0 &&
    Math.abs(dealerNetChangeTotal) > dealer.balance
  ) {
    console.warn(
      `[Server] Dealer ${dealer.name} in room ${room.id} might not have enough to cover losses: ${dealerNetChangeTotal}. Current balance: ${dealer.balance}`
    );
    // dealerNetChangeTotal = -dealer.balance; // เจ้ามือเสียเท่าที่มี - ต้องพิจารณากติกาเรื่องนี้
  }
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
    // Debug info (optional)
    // rank: dealer.handDetails.rank,
    // subRank: dealer.handDetails.subRank,
    // multiplier: dealer.handDetails.multiplier,
  });

  // --- Sorting results: Dealer first, then players by role number ---
  const dealerResultForSort = roundResults.find((r) => r.id === dealer.id);
  const sortedPlayerResultsForSort = roundResults
    .filter((r) => r.id !== dealer.id)
    .sort((a, b) => {
      const numA = parseInt(a.role?.replace(/[^0-9]/g, ""), 10);
      const numB = parseInt(b.role?.replace(/[^0-9]/g, ""), 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.name.localeCompare(b.name); // Fallback sort
    });

  const finalSortedResults = [];
  if (dealerResultForSort) {
    finalSortedResults.push(dealerResultForSort);
  }
  finalSortedResults.push(...sortedPlayerResultsForSort);

  return finalSortedResults.filter(Boolean);
}

// --- Socket.IO Connection Handler ---
// --- Socket.IO Event Handlers ---
// (ส่วนนี้เหมือนกับโค้ดที่คุณให้มา ผมจะใช้ส่วนนั้นเป็นหลัก
// แต่จะตรวจสอบและผสานการเปลี่ยนแปลงที่จำเป็นจากโค้ดที่ผมเคยให้ไปก่อนหน้านี้ หากมี)
// ... (นำโค้ดส่วน io.on('connection', ...) จากไฟล์ server.js ที่คุณอัปโหลดล่าสุดมาใส่ตรงนี้) ...
// --- START OF io.on('connection', ...) block from your uploaded server.js ---
io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("createRoom", ({ name, money }) => {
    const roomId = Math.floor(10000 + Math.random() * 90000).toString();
    const initialMoney = parseInt(money, 10) || 100;

    rooms[roomId] = {
      id: roomId,
      players: [],
      deck: [],
      gameStarted: false,
      currentTurnIndex: -1,
      betAmount: DEFAULT_BET_AMOUNT,
      turnTimerInterval: null,
      turnTimeout: null,
      dealerId: socket.id, // เจ้ามือคือผู้สร้างห้อง
      dealerName: name,
      hostId: socket.id,
      locked: false,
      roundSummary: {},
    };
    const room = rooms[roomId];
    const player = {
      id: socket.id,
      name: name,
      balance: initialMoney,
      cards: [],
      handDetails: null,
      isDealer: true,
      hasStayed: false,
      hasDrawn: false,
      role: "เจ้ามือ",
      baseRole: "เจ้ามือ",
      disconnectedMidGame: false,
    };
    room.players.push(player);
    room.roundSummary[player.id] = {
      name: player.name,
      totalChange: 0,
      roundsPlayed: 0,
    };

    socket.join(roomId);
    console.log(`[Server] Room ${roomId} created by ${name} (${socket.id})`);
    socket.emit("roomCreated", {
      roomId,
      playerId: socket.id,
      isDealer: true,
      initialMoney,
      players: getRoomPlayerData(room),
      betAmount: room.betAmount,
      roomLocked: room.locked,
    });
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
    io.to(roomId).emit("message", {
      type: "system",
      text: `${name} สร้างห้อง ${roomId} และเป็นเจ้ามือ.`,
    });
  });

  socket.on("joinRoom", ({ roomId, name, money }) => {
    const room = rooms[roomId];
    if (room) {
      if (room.locked && socket.id !== room.hostId) {
        socket.emit("errorMessage", {
          text: "ห้องถูกล็อค ไม่สามารถเข้าร่วมได้",
        });
        return;
      }
      if (room.players.find((p) => p.id === socket.id)) {
        // socket.emit("errorMessage", { text: "คุณอยู่ในห้องนี้แล้ว" });
        // ถ้าอยู่ในห้องแล้ว ให้ส่งข้อมูลห้องกลับไปอีกครั้ง เผื่อ client refresh
        const existingPlayer = room.players.find((p) => p.id === socket.id);
        socket.emit("joinedRoom", {
          roomId,
          playerId: socket.id,
          isDealer: existingPlayer.isDealer,
          initialMoney: existingPlayer.balance, // ส่ง balance ปัจจุบัน
          players: getRoomPlayerData(room),
          betAmount: room.betAmount,
          roomLocked: room.locked,
          gameStarted: room.gameStarted,
          myCards: existingPlayer.cards, // ส่งไพ่ปัจจุบัน (ถ้ามี)
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดตให้ทุกคน
        return;
      }
      if (room.gameStarted) {
        socket.emit("errorMessage", {
          text: "เกมในห้องนี้เริ่มไปแล้ว ไม่สามารถเข้าร่วมตอนนนี้",
        });
        return;
      }
      if (room.players.length >= 7) {
        // จำกัดจำนวนผู้เล่น (รวมเจ้ามือ)
        socket.emit("errorMessage", {
          text: "ห้องเต็มแล้ว (สูงสุด 7 คนรวมเจ้ามือ)",
        });
        return;
      }

      const initialMoney = parseInt(money, 10) || 50;
      const playerNumber = room.players.filter((p) => !p.isDealer).length + 1;
      const player = {
        id: socket.id,
        name,
        balance: initialMoney,
        cards: [],
        handDetails: null,
        isDealer: false,
        hasStayed: false,
        hasDrawn: false,
        role: `ผู้เล่นที่ ${playerNumber}`,
        baseRole: `ผู้เล่นที่ ${playerNumber}`,
        disconnectedMidGame: false,
      };
      room.players.push(player);
      if (!room.roundSummary[player.id]) {
        room.roundSummary[player.id] = {
          name: player.name,
          totalChange: 0,
          roundsPlayed: 0,
        };
      }

      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId,
        playerId: socket.id,
        isDealer: false,
        initialMoney,
        players: getRoomPlayerData(room),
        betAmount: room.betAmount,
        roomLocked: room.locked,
        gameStarted: room.gameStarted,
        myCards: [],
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        type: "system",
        text: `${name} เข้าร่วมห้อง.`,
      });
      console.log(`[Server] ${name} (${socket.id}) joined room ${roomId}`);
    } else {
      socket.emit("errorMessage", { text: "ไม่พบห้องที่คุณต้องการเข้าร่วม" });
    }
  });

  socket.on("setBetAmount", ({ roomId, amount }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);
    if (room && player?.isDealer && !room.gameStarted) {
      const newBetAmount = parseInt(amount, 10);
      if (newBetAmount > 0 && newBetAmount <= 1000) {
        // เพิ่ม max bet amount
        room.betAmount = newBetAmount;
        io.to(roomId).emit("roomSettings", {
          betAmount: room.betAmount,
          roomLocked: room.locked,
        });
        io.to(roomId).emit("message", {
          type: "system",
          text: `เจ้ามือเปลี่ยนยอดเดิมพันเป็น ${newBetAmount}`,
        });
      } else {
        socket.emit("errorMessage", {
          text: "ยอดเดิมพันต้องอยู่ระหว่าง 1 - 1000",
        });
      }
    } else if (room && room.gameStarted) {
      socket.emit("errorMessage", {
        text: "ไม่สามารถเปลี่ยนยอดเดิมพันระหว่างเกมได้",
      });
    } else if (room && !player?.isDealer) {
      socket.emit("errorMessage", {
        text: "เฉพาะเจ้ามือที่สามารถเปลี่ยนยอดเดิมพันได้",
      });
    }
  });

  socket.on("toggleLockRoom", ({ roomId }) => {
    const room = rooms[roomId];
    if (room && socket.id === room.hostId) {
      room.locked = !room.locked;
      io.to(roomId).emit("roomSettings", {
        betAmount: room.betAmount,
        roomLocked: room.locked,
      });
      io.to(roomId).emit("message", {
        type: "system",
        text: `ห้อง ${room.locked ? "ถูกล็อค" : "ถูกปลดล็อค"} โดย ${
          room.players.find((p) => p.id === socket.id)?.name
        }`,
      });
    } else if (room && socket.id !== room.hostId) {
      socket.emit("errorMessage", {
        text: "เฉพาะผู้สร้างห้องเท่านั้นที่สามารถล็อค/ปลดล็อคห้องได้",
      });
    }
  });

  socket.on("startGame", ({ roomId }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);

    if (room && player?.isDealer && !room.gameStarted) {
      if (room.players.length < 2) {
        socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 2 คน (รวมเจ้ามือ) เพื่อเริ่มเกม",
        });
        return;
      }

      room.gameStarted = true;
      room.deck = shuffleDeck(createDeck());
      room.players.forEach((p) => {
        // ใช้ p แทน player ใน forEach
        p.cards = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.hasDrawn = false;
        // p.role = p.baseRole; // ไม่ควรรีเซ็ต role ที่นี่ อาจจะทำให้ "เจ้ามือ" กลายเป็น "ผู้เล่นที่ X"
        p.disconnectedMidGame = false;
      });

      room.players.forEach((p) => {
        if (room.deck.length > 0) p.cards.push(room.deck.pop());
        if (room.deck.length > 0) p.cards.push(room.deck.pop());
        // คำนวณ handDetails ทันทีหลังแจกไพ่ 2 ใบ
        p.handDetails = getHandRank(p.cards);
        io.to(p.id).emit("yourCards", p.cards); // ส่งไพ่ให้เฉพาะเจ้าของ

        if (p.handDetails && p.handDetails.rank === 1) {
          // ถ้าป๊อก (Rank 1)
          p.hasStayed = true; // ป๊อกแล้วคืออยู่
          io.to(roomId).emit("playerRevealedPok", {
            playerId: p.id,
            playerName: p.name,
            cardsDisplay: p.cards.map(getCardDisplay).join(" "), // ใช้ getCardDisplay
            handType: p.handDetails.type,
          });
          io.to(roomId).emit("message", {
            type: "game",
            text: `${p.name} ได้ ${p.handDetails.type}!`,
          });
        }
      });

      io.to(roomId).emit("gameStarted", {
        players: getRoomPlayerData(room),
        dealerId: room.dealerId,
      });
      io.to(roomId).emit("message", {
        type: "game",
        text: "เกมเริ่มแล้ว! เจ้ามือกำลังแจกไพ่...",
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));

      room.currentTurnIndex = room.players.findIndex(
        (p) => !p.isDealer && !p.hasStayed && !p.disconnectedMidGame
      );
      if (room.currentTurnIndex !== -1) {
        startPlayerTurn(room, room.players[room.currentTurnIndex].id);
      } else {
        const dealerPlayer = room.players.find((p) => p.isDealer);
        if (
          dealerPlayer &&
          !dealerPlayer.hasStayed &&
          !dealerPlayer.disconnectedMidGame
        ) {
          room.currentTurnIndex = room.players.findIndex((p) => p.isDealer);
          startPlayerTurn(room, dealerPlayer.id);
        } else {
          calculateAndEmitResults(roomId);
        }
      }
    }
  });

  function startPlayerTurn(room, playerId) {
    clearTurnTimer(room);
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.hasStayed || player.disconnectedMidGame) {
      // ถ้าผู้เล่นอยู่แล้ว หรือหลุดไปแล้ว ให้ข้าม
      nextTurn(room.id);
      return;
    }

    io.to(room.id).emit("currentTurn", {
      playerId: player.id,
      playerName: player.name,
      isDealerTurn: player.isDealer,
      canDraw: player.cards.length < 3, // จั่วได้ถ้าไพ่น้อยกว่า 3 (ไม่สน hasStayed เพราะ check ไปแล้ว)
    });
    io.to(room.id).emit("message", {
      type: "turn",
      text: `ตาของ ${player.name}`,
    });

    const turnDuration = player.isDealer
      ? DEFAULT_TURN_DURATION * 1.5
      : DEFAULT_TURN_DURATION;
    let timeLeft = turnDuration;
    room.turnStartTime = Date.now();

    room.turnTimerInterval = setInterval(() => {
      timeLeft--;
      io.to(room.id).emit("turnTimerUpdate", { playerId: player.id, timeLeft });
      if (timeLeft <= 0) {
        clearInterval(room.turnTimerInterval);
        // Timeout logic is handled by room.turnTimeout
      }
    }, 1000);

    room.turnTimeout = setTimeout(() => {
      if (
        rooms[room.id] &&
        rooms[room.id].players.find((p) => p.id === playerId) &&
        !player.hasStayed &&
        !player.disconnectedMidGame
      ) {
        console.log(
          `[Server] Player ${player.name} (${player.id}) timed out. Auto-stay.`
        );
        io.to(room.id).emit("message", {
          type: "game",
          text: `${player.name} หมดเวลา (อยู่โดยอัตโนมัติ)`,
        });
        player.hasStayed = true;
        io.to(room.id).emit("playerAction", {
          playerId: player.id,
          action: "stay_timeout",
          name: player.name,
        });
        io.to(room.id).emit("playersData", getRoomPlayerData(room));
        nextTurn(room.id);
      }
    }, turnDuration * 1000);
  }

  function nextTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    clearTurnTimer(room);

    let nextPlayerFound = false;
    let initialIndex = room.currentTurnIndex; // ตำแหน่งปัจจุบัน
    if (initialIndex === -1) {
      // ถ้าเพิ่งเริ่ม หรือ currentTurnIndex ไม่ถูกต้อง
      initialIndex = room.players.findIndex((p) => p.isDealer); // เริ่มจากเจ้ามือ หรือคนแรกถ้าเจ้ามือคือคนสุดท้าย
    }

    for (let i = 1; i <= room.players.length; i++) {
      const playerToCheckIndex = (initialIndex + i) % room.players.length;
      const playerToCheck = room.players[playerToCheckIndex];

      if (
        !playerToCheck.isDealer &&
        !playerToCheck.hasStayed &&
        !playerToCheck.disconnectedMidGame
      ) {
        room.currentTurnIndex = playerToCheckIndex;
        startPlayerTurn(room, playerToCheck.id);
        nextPlayerFound = true;
        return; // ออกจาก nextTurn เมื่อเจอผู้เล่นคนถัดไป
      }
    }

    // ถ้าวนครบแล้วไม่เจอผู้เล่น (ที่ไม่ใช่เจ้ามือ) ที่ยังไม่ได้เล่น -> ตาเจ้ามือ
    const dealerPlayer = room.players.find((p) => p.isDealer);
    if (
      dealerPlayer &&
      !dealerPlayer.hasStayed &&
      !dealerPlayer.disconnectedMidGame
    ) {
      const dealerIndex = room.players.findIndex((p) => p.isDealer);
      // ตรวจสอบว่าเจ้ามือเคยเป็น currentTurn หรือยัง ถ้ายัง ให้เป็นตาเจ้ามือ
      // หรือถ้า currentTurnIndex คือคนสุดท้ายก่อนเจ้ามือ ก็ให้เป็นตาเจ้ามือ
      // Basic check: if no other player needs to play, it's dealer's turn if not stayed.
      if (room.currentTurnIndex !== dealerIndex || !nextPlayerFound) {
        // ป้องกันการเรียก startPlayerTurn ซ้ำถ้าเจ้ามือคือคนสุดท้ายที่เล่น
        room.currentTurnIndex = dealerIndex;
        startPlayerTurn(room, dealerPlayer.id);
        nextPlayerFound = true;
        return;
      }
    }

    // ถ้ามาถึงตรงนี้ คือทุกคน (รวมเจ้ามือ) เล่นครบแล้ว หรือ ป๊อกกันหมด หรือ หลุดกันหมด
    if (
      !nextPlayerFound ||
      room.players.every((p) => p.hasStayed || p.disconnectedMidGame)
    ) {
      calculateAndEmitResults(roomId);
    }
  }

  socket.on("drawCard", ({ roomId }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);

    if (
      room &&
      player &&
      room.gameStarted &&
      room.players[room.currentTurnIndex]?.id === player.id &&
      player.cards.length < 3 &&
      !player.hasStayed &&
      !player.disconnectedMidGame
    ) {
      if (room.deck.length > 0) {
        const newCard = room.deck.pop();
        player.cards.push(newCard);
        player.handDetails = getHandRank(player.cards);
        player.hasDrawn = true;
        player.hasStayed = true; // จั่วแล้วอยู่
        io.to(player.id).emit("yourCards", player.cards);
        io.to(roomId).emit("playerAction", {
          playerId: player.id,
          action: "draw",
          name: player.name,
          newCardDisplay: getCardDisplay(newCard),
        }); // แสดงไพ่ที่จั่วให้ทุกคน (ถ้าต้องการ)
        io.to(roomId).emit("message", {
          type: "game",
          text: `${player.name} จั่วไพ่.`,
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        nextTurn(roomId);
      } else {
        socket.emit("errorMessage", { text: "ไพ่ในกองหมดแล้ว" });
        player.hasStayed = true; // ถ้าไพ่หมดก็ถือว่าอยู่
        io.to(roomId).emit("playerAction", {
          playerId: player.id,
          action: "stay_no_cards",
          name: player.name,
        });
        nextTurn(roomId);
      }
    } else if (room && player && player.hasStayed) {
      socket.emit("errorMessage", { text: "คุณ 'อยู่' หรือดำเนินการไปแล้ว" });
    } else if (room && player && player.cards.length >= 3) {
      socket.emit("errorMessage", {
        text: "คุณมีไพ่ 3 ใบแล้ว ไม่สามารถจั่วเพิ่มได้",
      });
    } else if (room && room.players[room.currentTurnIndex]?.id !== player.id) {
      socket.emit("errorMessage", { text: "ยังไม่ถึงตาของคุณ" });
    }
  });

  socket.on("stay", ({ roomId }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);

    if (
      room &&
      player &&
      room.gameStarted &&
      room.players[room.currentTurnIndex]?.id === player.id &&
      !player.hasStayed &&
      !player.disconnectedMidGame
    ) {
      player.hasStayed = true;
      io.to(roomId).emit("playerAction", {
        playerId: player.id,
        action: "stay",
        name: player.name,
      });
      io.to(roomId).emit("message", {
        type: "game",
        text: `${player.name} อยู่.`,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      nextTurn(roomId);
    } else if (room && player && player.hasStayed) {
      socket.emit("errorMessage", { text: "คุณ 'อยู่' หรือดำเนินการไปแล้ว" });
    } else if (room && room.players[room.currentTurnIndex]?.id !== player.id) {
      socket.emit("errorMessage", { text: "ยังไม่ถึงตาของคุณ" });
    }
  });

  function calculateAndEmitResults(roomId) {
    const room = rooms[roomId];
    if (!room) {
      console.error(
        `[Server] Room ${roomId} not found in calculateAndEmitResults.`
      );
      return;
    }
    if (!room.gameStarted) {
      console.log(
        `[Server] Game in room ${roomId} not started, cannot calculate results.`
      );
      // อาจจะมีการเรียกซ้ำซ้อน ให้ตรวจสอบ
      return;
    }

    clearTurnTimer(room);
    console.log(
      `[Server] Calculating results for room ${roomId} at ${new Date().toLocaleTimeString()}`
    );
    const results = performResultCalculation(room);

    if (results) {
      io.to(roomId).emit("showResult", results);
      io.to(roomId).emit("message", {
        type: "result",
        text: "--- ผลลัพธ์ของรอบนี้ ---",
      });

      results.forEach((result) => {
        if (room.roundSummary[result.id]) {
          room.roundSummary[result.id].totalChange += result.moneyChange;
          room.roundSummary[result.id].roundsPlayed += 1;
        } else if (result.id) {
          room.roundSummary[result.id] = {
            name: result.name,
            totalChange: result.moneyChange,
            roundsPlayed: 1,
          };
        }
      });
    } else {
      io.to(roomId).emit("errorMessage", {
        text: "เกิดข้อผิดพลาดในการคำนวณผลลัพธ์",
      });
      console.error(
        `[Server] performResultCalculation returned null for room ${roomId}`
      );
    }
    // room.gameStarted = false; // <<< ย้ายไปตั้งใน resetGame เพื่อให้ผลค้างไว้
    room.currentTurnIndex = -1; // ตาจบแล้ว
    // ส่ง playersData อีกครั้งเพื่ออัปเดต balance หลังจบเกม
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
  }

  socket.on("showResult", ({ roomId }) => {
    // Client เจ้ามืออาจจะกดปุ่มนี้โดยตรง
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);
    if (room && player?.isDealer && room.gameStarted) {
      const allPlayersReady = room.players.every(
        (p) => p.hasStayed || p.disconnectedMidGame
      );
      if (allPlayersReady) {
        console.log(
          `[Server] Dealer ${player.name} manually triggered showResult for room ${roomId}`
        );
        calculateAndEmitResults(roomId);
      } else {
        socket.emit("errorMessage", {
          text: "ยังดำเนินการไม่ครบทุกคน ไม่สามารถแสดงผลได้",
        });
      }
    } else if (room && !player?.isDealer) {
      socket.emit("errorMessage", { text: "เฉพาะเจ้ามือที่สามารถกดแสดงผลได้" });
    }
  });

  socket.on("resetGame", ({ roomId }) => {
    // สำหรับเริ่มรอบใหม่
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);
    if (room && player?.isDealer) {
      // อนุญาตให้รีเซ็ตได้เสมอ หากเป็นเจ้ามือ เพื่อเริ่มตาใหม่
      // if (room.gameStarted && room.currentTurnIndex !== -1) {
      //    socket.emit("errorMessage", { text: "เกมยังดำเนินอยู่ ไม่สามารถรีเซ็ตได้จนกว่าจะแสดงผล" });
      //    return;
      // }

      room.gameStarted = false;
      room.currentTurnIndex = -1;
      room.deck = [];
      room.players.forEach((p) => {
        p.cards = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.hasDrawn = false;
        // p.role = p.baseRole; // ไม่ต้องรีเซ็ต role
        // p.disconnectedMidGame ไม่รีเซ็ต ผู้เล่นที่หลุดก็ยังหลุดอยู่
      });
      clearTurnTimer(room);

      io.to(roomId).emit("gameReset", { players: getRoomPlayerData(room) });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        type: "system",
        text: "เจ้ามือรีเซ็ตเกม เริ่มรอบใหม่ได้!",
      });
      console.log(
        `[Server] Game reset in room ${roomId} by dealer ${player.name}`
      );
    }
  });

  socket.on("endGameAndShowSummary", ({ roomId }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);
    if (room && player?.isDealer) {
      // ควรจะแสดงผลรอบสุดท้ายก่อน (ถ้ายังไม่ได้แสดง)
      if (
        room.gameStarted &&
        room.currentTurnIndex !== -1 &&
        !room.players.every((p) => p.hasStayed || p.disconnectedMidGame)
      ) {
        io.to(roomId).emit("message", {
          type: "system",
          text: "กรุณาเล่นรอบปัจจุบันให้จบ หรือรีเซ็ตตาก่อนจบเกม",
        });
        // calculateAndEmitResults(roomId); // หรือบังคับแสดงผล
        return;
      } else if (
        room.gameStarted &&
        room.currentTurnIndex === -1 &&
        !resultsAlreadyShownForThisRound(room)
      ) {
        // ตรวจสอบว่าผลรอบสุดท้ายแสดงหรือยัง
        calculateAndEmitResults(roomId); // แสดงผลรอบสุดท้ายก่อน
        // หน่วงเวลาเล็กน้อยให้ client รับผลก่อนส่ง summary
        setTimeout(() => {
          io.to(roomId).emit("gameSummary", {
            summary: Object.values(room.roundSummary).filter(
              (s) => s.roundsPlayed > 0
            ),
          });
          io.to(roomId).emit("message", {
            type: "system",
            text: "เจ้ามือจบเกมแล้ว กำลังแสดงสรุปยอด.",
          });
          console.log(
            `[Server] Game ended in room ${roomId}. Showing summary.`
          );
          // room.gameStarted = false; // เกมจบแล้ว
          // delete rooms[roomId]; // หรือจะลบห้องหลังจากนี้
        }, 1500); // หน่วง 1.5 วินาที
        return;
      }

      io.to(roomId).emit("gameSummary", {
        summary: Object.values(room.roundSummary).filter(
          (s) => s.roundsPlayed > 0
        ),
      });
      io.to(roomId).emit("message", {
        type: "system",
        text: "เจ้ามือจบเกมแล้ว กำลังแสดงสรุปยอด.",
      });
      console.log(`[Server] Game ended in room ${roomId}. Showing summary.`);
      // room.gameStarted = false;
      // delete rooms[roomId]; // ลบห้องหลังจากแสดง summary หรือให้ผู้เล่นกดออกเอง
    }
  });
  // Helper function (you might need a more robust way to track if results were shown)
  function resultsAlreadyShownForThisRound(room) {
    // This is a placeholder. You need a reliable way to know if results for the
    // very last actions have been emitted. For example, a flag in the room object.
    // For now, assume if currentTurnIndex is -1 and gameStarted is true,
    // results were likely shown or are about to be.
    return room.currentTurnIndex === -1;
  }

  socket.on("disconnect", (reason) => {
    console.log(`[Server] User disconnected: ${socket.id}, Reason: ${reason}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];
        console.log(
          `[Server] Player ${disconnectedPlayer.name} (${socket.id}) disconnected from room ${roomId}.`
        );
        io.to(roomId).emit("message", {
          type: "system",
          text: `${disconnectedPlayer.name} ออกจากห้อง (${reason})`,
        });

        if (room.gameStarted) {
          disconnectedPlayer.disconnectedMidGame = true;
          disconnectedPlayer.role = `${disconnectedPlayer.baseRole} (หลุด)`; // อัปเดต role
          io.to(roomId).emit("playerAction", {
            playerId: disconnectedPlayer.id,
            action: "disconnect",
            name: disconnectedPlayer.name,
          });

          if (
            room.players[room.currentTurnIndex]?.id === disconnectedPlayer.id
          ) {
            nextTurn(roomId); // ถ้าเป็นตาของผู้เล่นที่หลุด ให้ข้ามไป
          } else if (
            room.players.every((p) => p.hasStayed || p.disconnectedMidGame)
          ) {
            // ถ้าทุกคนที่เหลืออยู่ ได้ stay หรือหลุดหมดแล้ว ให้คำนวณผล
            calculateAndEmitResults(roomId);
          }
        } else {
          // เกมยังไม่เริ่ม: ลบผู้เล่นออกจากห้อง
          room.players.splice(playerIndex, 1);
          // Re-assign player numbers if needed (optional, can be complex)
          // room.players.filter(p => !p.isDealer).forEach((p, idx) => {
          //    p.role = `ผู้เล่นที่ ${idx + 1}`;
          //    p.baseRole = `ผู้เล่นที่ ${idx + 1}`;
          // });
        }

        // ตรวจสอบสถานะห้องหลังผู้เล่นออก
        const activePlayersRemaining = room.players.filter(
          (p) => !p.disconnectedMidGame || !room.gameStarted
        );

        if (activePlayersRemaining.length === 0) {
          console.log(
            `[Server] Room ${roomId} empty or all disconnected. Deleting room.`
          );
          clearTurnTimer(room);
          delete rooms[roomId];
        } else {
          // จัดการเรื่องเจ้ามือ ถ้าเจ้ามือคนปัจจุบันหลุด
          if (disconnectedPlayer.isDealer) {
            const newDealerCandidate =
              activePlayersRemaining.find(
                (p) => !p.isDealer && p.id !== disconnectedPlayer.id
              ) || // หาผู้เล่นอื่นที่ไม่ใช่เจ้ามือ
              activePlayersRemaining.find(
                (p) => p.id !== disconnectedPlayer.id
              ); // หรือเอาคนแรกที่เหลืออยู่ (ถ้าไม่มีคนที่ไม่ใช่เจ้ามือ)

            if (newDealerCandidate) {
              // เปลี่ยนผู้เล่นคนนั้นเป็นเจ้ามือ
              room.players.forEach((p) => {
                p.isDealer = p.id === newDealerCandidate.id;
              });
              newDealerCandidate.isDealer = true;
              newDealerCandidate.baseRole = "เจ้ามือ";
              newDealerCandidate.role = "เจ้ามือ";
              room.dealerId = newDealerCandidate.id;
              room.dealerName = newDealerCandidate.name;
              io.to(roomId).emit("message", {
                type: "system",
                text: `${newDealerCandidate.name} เป็นเจ้ามือใหม่.`,
              });
              // ถ้า host หลุดด้วย และ host คือเจ้ามือที่หลุด ให้ host ใหม่เป็นเจ้ามือคนใหม่
              if (socket.id === room.hostId) {
                room.hostId = newDealerCandidate.id;
                io.to(roomId).emit("message", {
                  type: "system",
                  text: `${newDealerCandidate.name} ได้เป็น Host ใหม่ของห้อง`,
                });
              }
            } else {
              // ไม่มีใครเหลือเป็นเจ้ามือได้ (อาจจะเหลือแต่คนที่ disconnectedMidGame)
              io.to(roomId).emit("message", {
                type: "system",
                text: "เกิดปัญหา: ไม่สามารถหาเจ้ามือใหม่ได้หลังเจ้ามือเดิมหลุด",
              });
              // อาจจะต้องบังคับจบเกม หรือปิดห้อง
              if (room.gameStarted) calculateAndEmitResults(roomId); // ลองคำนวณผล
              // delete rooms[roomId]; // หรือลบห้อง
            }
          } else if (
            socket.id === room.hostId &&
            activePlayersRemaining.length > 0
          ) {
            // ถ้า host (ที่ไม่ใช่เจ้ามือ) หลุด
            room.hostId = activePlayersRemaining[0].id; // โอน host ให้คนแรกที่เหลือ
            io.to(roomId).emit("message", {
              type: "system",
              text: `${activePlayersRemaining[0].name} ได้เป็น Host ใหม่ของห้อง`,
            });
          }

          if (rooms[roomId]) {
            // ตรวจสอบว่าห้องยังอยู่
            io.to(roomId).emit("playersData", getRoomPlayerData(room));
          }
        }
        break;
      }
    }
  });

  // Helper function to get player data for emission (ควรมีอยู่แล้ว)
  function getRoomPlayerData(room) {
    if (!room || !room.players) return [];
    return room.players.map((player) => ({
      id: player.id,
      name: player.name,
      money: player.balance,
      isDealer: player.isDealer,
      role: player.role,
      hasStayed: player.hasStayed,
      hasDrawn: player.hasDrawn,
      cardCount: player.cards.length,
      disconnectedMidGame: player.disconnectedMidGame,
      // ไม่ส่ง handDetails หรือ cards ของผู้เล่นอื่นไปให้ client อื่นโดยตรงเพื่อความปลอดภัย
      // ส่งเฉพาะ cardCount
    }));
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(
    `[Server] Pok Deng Server is running on port ${PORT} at ${new Date().toLocaleString()}`
  );
});
