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

// server.js
// ... (ส่วน import และตัวแปร SUITS, VALUES, etc. ด้านบนคงเดิม) ...

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
  // K-A-2 is not a straight, A-2-3 is not a straight. Smallest is 2-3-4.
  // General case: 5-4-3, 4-3-2 etc.
  return (
    numericValues[0] - 1 === numericValues[1] &&
    numericValues[1] - 1 === numericValues[2]
  );
}

// ฟังก์ชัน helper สำหรับหาค่าตัวเลขของไพ่เพื่อใช้ใน subRank (A สูง)
function getCardNumericValue(value) {
  if (value === "A") return 14;
  if (value === "K") return 13;
  if (value === "Q") return 12;
  if (value === "J") return 11;
  if (value === "10") return 10;
  return parseInt(value, 10);
}

function getHandRank(cardsInput) {
  const cards = [...cardsInput]; // ทำสำเนาเพื่อป้องกันการแก้ไข original array
  const numCards = cards.length;
  const score = calculateScore(cards);

  const cardValues = cards.map((c) => c.value);
  const cardSuits = cards.map((c) => c.suit);

  // เรียงไพ่ตามค่าตัวเลขจากมากไปน้อยสำหรับใช้ในการตัดสิน tie-breaker และตรวจสอบเรียง
  const sortedCardsByNumericValue = cards
    .slice()
    .sort(
      (a, b) => getCardNumericValue(b.value) - getCardNumericValue(a.value)
    );
  const numericValues = sortedCardsByNumericValue.map((c) =>
    getCardNumericValue(c.value)
  ); // ค่าตัวเลขที่เรียงแล้ว

  let handDetails = {
    name: "",
    rank: 7, // Default to Points Hand
    score: score,
    multiplier: 1,
    cards: sortedCardsByNumericValue,
    tieBreakerValue: null,
    isPok: false,
    isDeng: false,
    dengType: null,
  };

  // 1. ตรวจสอบป๊อก (ไพ่ 2 ใบเท่านั้น)
  if (numCards === 2) {
    const isSameSuit = cardSuits[0] === cardSuits[1];
    if (score === 9) {
      handDetails = {
        name: isSameSuit ? "Pok 9 Deng" : "Pok 9",
        rank: 1, // Rank for Pok 9
        score: 9,
        multiplier: isSameSuit ? 2 : 1,
        cards: sortedCardsByNumericValue,
        isPok: true,
        isDeng: isSameSuit,
        dengType: isSameSuit ? "pok_deng" : null,
      };
      return handDetails;
    }
    if (score === 8) {
      handDetails = {
        name: isSameSuit ? "Pok 8 Deng" : "Pok 8",
        rank: 2, // Rank for Pok 8
        score: 8,
        multiplier: isSameSuit ? 2 : 1,
        cards: sortedCardsByNumericValue,
        isPok: true,
        isDeng: isSameSuit,
        dengType: isSameSuit ? "pok_deng" : null,
      };
      return handDetails;
    }
    // ถ้าไม่ใช่ป๊อก 8 หรือ 9 (ไพ่ 2 ใบ) จะเป็นแต้มธรรมดา หรือ สองเด้ง
    // (จะถูกจัดการด้านล่างในส่วนของ "Points Hand")
  }

  // 2. ตรวจสอบไพ่พิเศษ 3 ใบ
  if (numCards === 3) {
    const isAllSameSuit = new Set(cardSuits).size === 1;

    // 2.1 ตอง (Tong)
    const isTong = new Set(cardValues).size === 1;
    if (isTong) {
      handDetails = {
        name: `Tong ${cardValues[0]}`,
        rank: 3,
        score: score, // แต้มของตอง (เช่น KKK = 0 แต้ม)
        multiplier: 5,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0], // ค่าตัวเลขของไพ่ที่ทำตอง
        isPok: false,
        isDeng: false, // ตองไม่นับเป็นเด้งในความหมายทั่วไปของแต้มเด้ง
        dengType: null,
      };
      return handDetails;
    }

    // 2.2 สเตรทฟลัช (Straight Flush)
    const isStraight = checkStraight(numericValues);
    if (isStraight && isAllSameSuit) {
      handDetails = {
        name: "Straight Flush",
        rank: 4,
        score: score,
        multiplier: 5,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0], // ไพ่สูงสุดในเรียง
        isPok: false,
        isDeng: true, // ถือว่าเป็นลักษณะพิเศษของดอกเดียวกัน
        dengType: "straight_flush", // แม้จะดอกเดียวกัน แต่ไม่ใช่ "สามเด้ง" แบบแต้มธรรมดา
      };
      return handDetails;
    }

    // 2.3 เรียง (Straight)
    // (ต้องไม่ใช่ สเตรทฟลัช ซึ่งถูกตรวจสอบไปแล้ว)
    if (isStraight) {
      handDetails = {
        name: "Rieng", // เรียง หรือ สเตรท
        rank: 5,
        score: score,
        multiplier: 3,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0], // ไพ่สูงสุดในเรียง
        isPok: false,
        isDeng: false,
        dengType: null,
      };
      return handDetails;
    }

    // 2.4 เซียน (Sian - J, Q, K)
    const isSian = cardValues.every((v) => ["J", "Q", "K"].includes(v));
    if (isSian) {
      handDetails = {
        name: "Sian",
        rank: 6,
        score: score, // แต้มของเซียน (เช่น JQK = 0 แต้ม)
        multiplier: 3,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues, // อาร์เรย์ของค่าตัวเลขที่เรียงแล้ว [K, Q, J] สำหรับ tie-break
        isPok: false,
        isDeng: false, // เซียนไม่นับเป็นเด้ง
        dengType: null,
      };
      return handDetails;
    }
    // ถ้าไม่ใช่ไพ่พิเศษ 3 ใบ ด้านบน จะเป็น แต้มสามเด้ง หรือ แต้มธรรมดา 3 ใบ
    // (จะถูกจัดการด้านล่างในส่วนของ "Points Hand")
  }

  // 3. Hands แต้มธรรมดา (Rank 7)
  // (สำหรับไพ่ 2 ใบที่ไม่ใช่ป๊อก หรือ ไพ่ 3 ใบที่ไม่ใช่ไพ่พิเศษ)
  handDetails.rank = 7; // rank สำหรับ Points Hand ทั้งหมด

  if (numCards === 3) {
    const isAllSameSuitForThreeCards = new Set(cardSuits).size === 1;
    // (ต้องไม่เป็น Straight Flush ซึ่งเช็คไปแล้ว)
    if (isAllSameSuitForThreeCards) {
      handDetails.name = `${score} Points Sam Deng`;
      handDetails.multiplier = 3;
      handDetails.isDeng = true;
      handDetails.dengType = "sam_deng";
    } else {
      handDetails.name = `${score} Points`;
      handDetails.multiplier = 1;
      handDetails.isDeng = false;
      handDetails.dengType = null;
    }
  } else if (numCards === 2) {
    // ไพ่ 2 ใบที่ไม่ใช่ป๊อก
    const isSameSuitTwoCards = cardSuits[0] === cardSuits[1];
    const isPairTwoCards = cardValues[0] === cardValues[1]; // หรือ numericValues[0] === numericValues[1]

    if (isSameSuitTwoCards) {
      handDetails.name = `${score} Points Song Deng`;
      handDetails.multiplier = 2;
      handDetails.isDeng = true;
      handDetails.dengType = "song_deng_suit";
    } else if (isPairTwoCards) {
      // "สองเด้ง คือ ไพ่ 2 ใบ ดอกเดียวกัน หรือตัวเลขเหมือนกัน"
      handDetails.name = `${score} Points Song Deng (Pair)`;
      handDetails.multiplier = 2;
      handDetails.isDeng = true;
      handDetails.dengType = "song_deng_pair";
    } else {
      handDetails.name = `${score} Points`;
      handDetails.multiplier = 1;
      handDetails.isDeng = false;
      handDetails.dengType = null;
    }
  }

  // หากไม่มีการ return ในเงื่อนไขพิเศษด้านบน จะ return handDetails ที่เป็น default (Points Hand)
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

function startNewRoundAndDealInitialCards(roomId) {
  // ... (โค้ดส่วนแจกไพ่ 2 ใบให้ผู้เล่นและเจ้ามือ) ...

  const room = rooms[roomId];
  const playerIds = Object.keys(room.players); // รวมเจ้ามือด้วยถ้าโครงสร้างเป็นแบบนั้น

  // ตรวจสอบป๊อกสำหรับผู้เล่นทุกคน (รวมถึงเจ้ามือ) ทันทีหลังจากแจก 2 ใบ
  let dealerPokDetails = null;
  if (room.players[room.dealer]) {
    const dealerHand = getHandRank(room.players[room.dealer].cards);
    room.players[room.dealer].handDetails = dealerHand;
    if (dealerHand.isPok) {
      room.players[room.dealer].hasPok = true;
      room.players[room.dealer].finishedAction = true; // เจ้ามือป๊อก ไม่ต้องทำอะไรเพิ่ม
      dealerPokDetails = dealerHand; // เก็บรายละเอียดป๊อกของเจ้ามือ

      // ส่ง event บอกทุกคนว่าเจ้ามือป๊อก และแสดงไพ่เจ้ามือ
      io.to(roomId).emit("playerActionEvent", {
        playerId: player.id,
        action: "revealPok",
        cards: player.cards,
        handName: handResult.name, // ควรส่ง 'name' จาก getHandRank
        score: handResult.score,
        // อาจจะส่ง handDetails ทั้งหมดถ้า Client ต้องการใช้มากกว่านี้
        // handDetails: handResult
      });
      console.log(`Dealer ${room.dealer} has ${dealerHand.name}!`);
    }
  }

  for (const playerId of playerIds) {
    if (playerId === room.dealer && dealerPokDetails) continue; // เจ้ามือตรวจสอบไปแล้ว

    const player = room.players[playerId];
    if (player.cards.length === 2) {
      // ตรวจสอบเฉพาะผู้ที่มีไพ่ 2 ใบ
      const handResult = getHandRank(player.cards);
      player.handDetails = handResult;

      if (handResult.isPok) {
        player.hasPok = true;
        player.finishedAction = true; // ผู้เล่นป๊อก ไม่ต้องจั่วเพิ่ม

        if (handResult.isPok) {
          player.hasPok = true;
          player.finishedAction = true;

          // ส่ง event ชื่อ "player_revealed_pok"
          io.to(roomId).emit("player_revealed_pok", {
            playerId: player.id,
            name: player.name, // Client ต้องการ player.name
            role: player.role, // Client ต้องการ player.role
            cards: player.cards,
            handDetails: handResult, // ส่ง object handResult ทั้งหมดที่ได้จาก getHandRank
            // App.js จะใช้ data.handDetails.type (ซึ่งควรเป็น data.handDetails.name จาก server)
          });
          console.log(
            `Player <span class="math-inline">\{player\.id\} \(</span>{player.name}) has ${handResult.name}! Their turn for drawing is skipped.`
          );

          // 1. ส่ง event บอกทุกคนว่าผู้เล่นคนนี้ป๊อก และแสดงไพ่
          io.to(roomId).emit("playerActionEvent", {
            playerId: player.id,
            action: "revealPok", // สร้าง event ชื่อนี้ หรือชื่อที่คุณต้องการ
            cards: player.cards,
            handName: handResult.name,
            score: handResult.score,
          });
          console.log(
            `Player ${player.id} has ${handResult.name}! Their turn for drawing is skipped.`
          );
        } else {
          // ถ้าผู้เล่นไม่ป๊อก และเจ้ามือไม่ได้ป๊อก (หรือป๊อกแต่ต่ำกว่า)
          // ผู้เล่นมีสิทธิ์จั่วใบที่ 3 (ถ้าเกมยังไม่จบเพราะเจ้ามือป๊อกสูงกว่า)
          // ตรรกะนี้จะซับซ้อนขึ้นถ้าต้องพิจารณาเจ้ามือป๊อกทันที
          // "ถ้าเจ้าป๊อก ผู้เล่นจะไม่มีสิทธิ์จั่วไพ่ใบที่ 3"
          if (dealerPokDetails) {
            player.finishedAction = true; // เจ้ามือป๊อก ผู้เล่นคนนี้ไม่ได้ป๊อก => ไม่ได้จั่ว
            console.log(`Dealer has Pok. Player ${player.id} cannot draw.`);
          } else {
            // ถ้าเจ้ามือไม่ป๊อก ผู้เล่นคนนี้ก็ไม่ป๊อก => รอตาจั่วไพ่
            console.log(
              `Player ${player.id} has ${handResult.score} points. Will wait for their turn to draw.`
            );
          }
        }
      }
    }

    // หลังจากตรวจสอบป๊อกทุกคนแล้ว จึงเริ่มตาการจั่วของผู้เล่นคนแรกที่ไม่ป๊อก (ถ้ามี)
    // หรือถ้าเจ้ามือป๊อก และ/หรือผู้เล่นทุกคนป๊อก หรือจบการกระทำแล้ว ก็อาจจะเข้าสู่การเทียบไพ่
    proceedToNextAction(roomId); // ฟังก์ชันที่คุณจะสร้างเพื่อจัดการลำดับถัดไป
  }

  // ฟังก์ชันจัดการเมื่อผู้เล่นเลือก "จั่ว" (Hit) หรือ "อยู่" (Stand)
  // function playerHits(playerId, roomId) { ... }
  // function playerStands(playerId, roomId) { ... }

  function proceedToNextAction(roomId) {
    const room = rooms[roomId];
    // หาผู้เล่นคนถัดไปที่ยังไม่ได้ `finishedAction` และยังไม่ได้ `hasPok` (ถ้ายังไม่เปิดไพ่)
    // หรือถ้าทุกคน `finishedAction` แล้ว ก็ให้เจ้ามือเล่น (ถ้าเจ้ามือยังไม่ป๊อก) หรือเทียบไพ่
    // ตรรกะส่วนนี้จะซับซ้อนและขึ้นอยู่กับโครงสร้างเกมของคุณ
    // ตัวอย่างง่ายๆ:
    let nextPlayerId = findNextPlayerToAct(roomId);

    if (nextPlayerId) {
      room.currentPlayerTurn = nextPlayerId;
      const nextPlayer = room.players[nextPlayerId];
      if (nextPlayer.hasPok || nextPlayer.finishedAction) {
        // ถ้าผู้เล่นคนถัดไปก็ป๊อกไปแล้ว หรือจบการกระทำแล้ว (เช่น กรณีเจ้ามือป๊อกก่อน)
        // ให้ข้ามไปอีก หรือวนหาใหม่
        console.log(
          `Player ${nextPlayerId} already Pok'd or finished action. Finding next.`
        );
        proceedToNextAction(roomId); // อาจจะต้องมี logic ป้องกันการวนลูปไม่สิ้นสุด
      } else {
        // ส่งสัญญาณให้ผู้เล่นคนนี้ตัดสินใจ (จั่ว/อยู่)
        io.to(room.players[nextPlayerId].socketId).emit("yourTurnToDraw", {
          /* ข้อมูลที่จำเป็น */
        });
        console.log(`It's player ${nextPlayerId}'s turn to decide to draw.`);
      }
    } else {
      // ไม่มีผู้เล่นเหลือให้จั่วแล้ว (ทุกคนป๊อก หรือ อยู่ หรือจบการกระทำ)
      // อาจจะถึงตาเจ้ามือเล่น (ถ้าเจ้ามือยังไม่ได้ป๊อกและยังไม่ได้เล่น)
      // หรือเข้าสู่การเปรียบเทียบไพ่
      console.log(
        "All players have finished their actions or Pok'd. Proceeding to dealer's turn or comparison."
      );
      // handleDealerTurnOrComparison(roomId);
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

  // ... (ภายใน server.js) ...

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

    const roundResults = [];
    let dealerNetChangeTotal = 0;
    const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

    room.players.forEach((player) => {
      if (player.isDealer) return;

      if (!player.disconnectedMidGame) {
        player.handDetails = getHandRank(player.cards);
      }
      if (!player.handDetails) {
        player.handDetails = {
          rank: 9,
          type: player.disconnectedMidGame ? "ขาดการเชื่อมต่อ" : "ไม่มีไพ่",
          score: 0,
          subRank: 0,
          multiplier: 1,
          cards: player.cards || [],
        };
      }

      let outcome = "แพ้"; // กำหนดค่าเริ่มต้น
      let moneyChange = 0;
      let effectiveDealerMultiplier = dealer.handDetails.multiplier; // ตัวคูณของเจ้ามือที่จะใช้
      let effectivePlayerMultiplier = player.handDetails.multiplier; // ตัวคูณของผู้เล่นที่จะใช้

      if (player.disconnectedMidGame) {
        outcome = "ขาดการเชื่อมต่อ";
        moneyChange =
          player.balance >= betAmount ? -betAmount : -player.balance;
      } else {
        const playerHand = player.handDetails;
        const dealerHand = dealer.handDetails;

        if (!playerHand || !dealerHand) {
          outcome = "Error/แพ้";
          moneyChange = -(betAmount * effectiveDealerMultiplier);
        } else if (playerHand.rank < dealerHand.rank) {
          // ผู้เล่น Rank ดีกว่า
          outcome = "ชนะ";
          moneyChange = betAmount * effectivePlayerMultiplier;
        } else if (playerHand.rank > dealerHand.rank) {
          // ผู้เล่น Rank แย่กว่า
          outcome = "แพ้";
          moneyChange = -(betAmount * effectiveDealerMultiplier);
        } else {
          // playerHand.rank === dealerHand.rank (Rank เท่ากัน)
          // กรณีป๊อกชนป๊อก และแต้มเท่ากัน -> เสมอ
          if (
            playerHand.rank === 1 &&
            dealerHand.rank === 1 &&
            playerHand.score === dealerHand.score
          ) {
            outcome = "เสมอ";
            moneyChange = 0;
          }
          // กรณีตองชนตอง (Rank 2), สเตรทฟลัชชนสเตรทฟลัช (Rank 3), เซียนชนเซียน (Rank 4), เรียงชนเรียง (Rank 5)
          // หรือ สีชนสี (Rank 8 ที่ multiplier=3), สองเด้งชนสองเด้ง (Rank 8 ที่ multiplier=2)
          // ให้ใช้ subRank เปรียบเทียบก่อน ถ้ามี
          else if (
            playerHand.subRank !== undefined &&
            dealerHand.subRank !== undefined &&
            playerHand.subRank !== dealerHand.subRank
          ) {
            if (playerHand.subRank > dealerHand.subRank) {
              outcome = "ชนะ";
              moneyChange = betAmount * effectivePlayerMultiplier;
            } else {
              // playerHand.subRank < dealerHand.subRank
              outcome = "แพ้";
              moneyChange = -(betAmount * effectiveDealerMultiplier);
            }
          }
          // ถ้า subRank เท่ากัน หรือไม่มี subRank ให้เทียบแต้ม (score % 10)
          // (subRank ของแต้มธรรมดาคือ score % 10 อยู่แล้ว)
          else if (playerHand.score > dealerHand.score) {
            outcome = "ชนะ";
            moneyChange = betAmount * effectivePlayerMultiplier;
          } else if (playerHand.score < dealerHand.score) {
            outcome = "แพ้";
            moneyChange = -(betAmount * effectiveDealerMultiplier);
          } else {
            // แต้มก็ยังเท่ากันอีก, ให้เทียบ Multiplier (เด้ง)
            // *** ยกเว้นกรณีป๊อกชนป๊อกแต้มเท่า ซึ่งจัดการไปแล้วว่าเสมอ ***
            // ดังนั้นเงื่อนไขนี้จะใช้สำหรับ Rank อื่นๆ ที่ไม่ใช่ป๊อกแล้วแต้มเท่ากัน
            if (playerHand.rank !== 1) {
              // ตรวจสอบอีกครั้งว่าไม่ใช่ป๊อก (ควรจะไม่ใช่แล้วจากเงื่อนไขบนๆ)
              if (effectivePlayerMultiplier > effectiveDealerMultiplier) {
                outcome = "ชนะ";
                moneyChange = betAmount * effectivePlayerMultiplier;
              } else if (
                effectivePlayerMultiplier < effectiveDealerMultiplier
              ) {
                outcome = "แพ้";
                moneyChange = -(betAmount * effectiveDealerMultiplier);
              } else {
                // Multiplier ก็เท่ากัน
                outcome = "เสมอ";
                moneyChange = 0;
              }
            } else {
              // ควรจะเป็นกรณีป๊อกชนป๊อกแต้มเท่า และ multiplier เท่ากัน (ซึ่งก็คือเสมอ)
              outcome = "เสมอ";
              moneyChange = 0;
            }
          }
        }
      }
      // การปรับปรุงเงิน
      if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
        moneyChange = -player.balance;
      }
      player.balance += moneyChange;
      dealerNetChangeTotal -= moneyChange;

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

  // ... (ส่วนที่เหลือของ server.js เช่น calculateAndEmitResults, Socket.IO handlers, etc. คงเดิม) ...

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
        socket.emit("errorMessage", {
          text: "เกิดข้อผิดพลาดในการเข้าร่วมห้อง",
        });
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
        const nonDealersForDeal = activePlayersForDeal.filter(
          (p) => !p.isDealer
        );
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
        if (
          !player ||
          player.id !== room.currentTurnPlayerId ||
          player.hasStayed
        )
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
        if (
          !player ||
          player.id !== room.currentTurnPlayerId ||
          player.hasStayed
        )
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
}
