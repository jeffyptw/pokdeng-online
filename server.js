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
    }
    // Fall through to Rank 7 (Points Hand) for 2 cards not Pok
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
        tieBreakerValue: numericValues, // This is an array of [J, Q, K] numeric values, e.g., [13,12,11]
        isPok: false,
        isDeng: false,
        dengType: null,
      };
    }
    // Fall through to Rank 7 (Points Hand) for 3 cards not special
  }

  // Rank 7: Points Hand (2 cards not Pok, or 3 cards not special)
  handDetails.rank = 7; // Default rank for points hand
  if (numCards === 3) {
    const isAllSameSuitForThreeCards = new Set(cardSuits).size === 1;
    if (isAllSameSuitForThreeCards) {
      // Should not be Straight Flush (already checked)
      handDetails.name = `${score} สามเด้ง`;
      handDetails.multiplier = 3;
      handDetails.isDeng = true;
      handDetails.dengType = "สามเด้ง";
    } else {
      if (score === 9) handDetails.name = "9 หลัง";
      else if (score === 8) handDetails.name = "8 หลัง";
      else handDetails.name = `${score} แต้ม`;
      handDetails.multiplier = 1;
    }
  } else if (numCards === 2) {
    // Normal 2 cards (not Pok)
    const isSameSuitTwoCards = cardSuits[0] === cardSuits[1];
    const isPairTwoCards = cardValues[0] === cardValues[1]; // Assuming A,A is a pair for "Deng" purpose
    if (isSameSuitTwoCards || isPairTwoCards) {
      // Check for Song Deng (suit or pair)
      handDetails.name = `${score} สองเด้ง`;
      handDetails.multiplier = 2;
      handDetails.isDeng = true;
      handDetails.dengType = "สองเด้ง";
    } else {
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
    role: isDealer ? "เจ้ามือ" : "ขา", // Will be updated by getRoomPlayerData
    actionTakenThisTurn: false,
    disconnectedMidGame: false,
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
    // Don't mutate p.role directly here, return new object with updated role
    return {
      id: p.id,
      name: p.name,
      balance: p.balance,
      role: displayRole,
      isDealer: p.isDealer,
      hasStayed: p.hasStayed,
      hasPok: p.hasPok, // Send hasPok status
      // Include other necessary fields for client display
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
  const dealer = room.players.find((p) => p.isDealer && !p.disconnectedMidGame);
  if (!dealer) {
    console.error(
      `[Server] CRITICAL: Active dealer not found in performResultCalculation for room: ${room.id}`
    );
    if (io && room && room.id) {
      io.to(room.id).emit("errorMessage", {
        // Can also be gameError or a more specific event
        text: "เกิดข้อผิดพลาด: ไม่พบเจ้ามือ (Active) ขณะคำนวณผล",
      });
    }
    return null;
  }

  if (!dealer.handDetails) dealer.handDetails = getHandRank(dealer.cards);

  if (!dealer.handDetails) {
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
      return;
    }

    if (!player.handDetails) player.handDetails = getHandRank(player.cards);

    if (!player.handDetails) {
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
    const playerHand = player.handDetails;
    const dealerHand = dealer.handDetails;

    if (playerHand.isPok && dealerHand.isPok) {
      // Both Pok
      if (playerHand.rank < dealerHand.rank) {
        // Player Pok better (P9 vs D8)
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (playerHand.rank > dealerHand.rank) {
        // Dealer Pok better (P8 vs D9)
        outcome = "แพ้";
        moneyChange = -(betAmount * dealerHand.multiplier);
      } else {
        // Same Pok (P9 vs P9 or P8 vs P8) -> Tie
        outcome = "เสมอ";
        moneyChange = 0;
      }
    } else if (dealerHand.isPok) {
      // Dealer Pok, Player not
      outcome = "แพ้";
      moneyChange = -(betAmount * dealerHand.multiplier);
    } else if (playerHand.isPok) {
      // Player Pok, Dealer not
      outcome = "ชนะ";
      moneyChange = betAmount * playerHand.multiplier;
    } else {
      // No one Pok, compare ranks
      if (playerHand.rank < dealerHand.rank) {
        // Player hand rank better
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (playerHand.rank > dealerHand.rank) {
        // Dealer hand rank better
        outcome = "แพ้";
        moneyChange = -(betAmount * dealerHand.multiplier);
      } else {
        // Same rank (not Pok), compare tieBreaker or score
        if (playerHand.rank <= 6) {
          // Special hands (Tong, Straight Flush, Straight, Sian)
          let playerWinsByTieBreaker = false;
          if (playerHand.rank === 6) {
            // Sian (tieBreakerValue is an array)
            for (let i = 0; i < playerHand.tieBreakerValue.length; i++) {
              if (
                playerHand.tieBreakerValue[i] > dealerHand.tieBreakerValue[i]
              ) {
                playerWinsByTieBreaker = true;
                break;
              }
              if (playerHand.tieBreakerValue[i] < dealerHand.tieBreakerValue[i])
                break;
            }
            if (
              JSON.stringify(playerHand.tieBreakerValue) ===
              JSON.stringify(dealerHand.tieBreakerValue)
            ) {
              outcome = "เสมอ";
              moneyChange = 0;
            } else if (playerWinsByTieBreaker) {
              outcome = "ชนะ";
              moneyChange = betAmount * playerHand.multiplier;
            } else {
              outcome = "แพ้";
              moneyChange = -(betAmount * dealerHand.multiplier);
            }
          } else {
            // Other special hands (tieBreakerValue is a number)
            if (playerHand.tieBreakerValue > dealerHand.tieBreakerValue) {
              playerWinsByTieBreaker = true;
            }
            if (playerHand.tieBreakerValue === dealerHand.tieBreakerValue) {
              outcome = "เสมอ";
              moneyChange = 0;
            } else if (playerWinsByTieBreaker) {
              outcome = "ชนะ";
              moneyChange = betAmount * playerHand.multiplier;
            } else {
              outcome = "แพ้";
              moneyChange = -(betAmount * dealerHand.multiplier);
            }
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
            // Same score -> Tie (Deng only matters for win multiplier)
            outcome = "เสมอ";
            moneyChange = 0;
          }
        }
      }
    }

    // Handle disconnected players losing their bet if they didn't win outright before disconnecting
    if (player.disconnectedMidGame && outcome !== "ชนะ") {
      outcome = "ขาดการเชื่อมต่อ";
      moneyChange = player.balance >= betAmount ? -betAmount : -player.balance;
    }

    if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
      moneyChange = -player.balance; // Cannot lose more than current balance
    }
    player.balance += moneyChange;
    dealerNetChangeTotal -= moneyChange; // Dealer's gain is player's loss, and vice-versa

    roundResults.push({
      id: player.id,
      name: player.name,
      role: player.role, // Use the role updated by getRoomPlayerData
      cardsDisplay: (playerHand.cards || []).map(getCardDisplay).join(" "),
      score: playerHand.score,
      specialType: playerHand.name,
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

  // Sort results by role for consistent display
  const finalSortedResults = [...roundResults].sort((a, b) => {
    const getRoleOrder = (roleStr) => {
      if (roleStr === "เจ้ามือ") return 0;
      const match = roleStr.match(/ขาที่ (\d+)/);
      if (match) return parseInt(match[1]);
      return Infinity; // Should not happen if roles are assigned correctly
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
  // No need for resultsCache if we always calculate fresh, which is safer
  // if (room.resultsCache) { ... }

  clearTurnTimer(room);
  const roundResults = performResultCalculation(room);
  if (roundResults) {
    room.resultsCache = roundResults; // Store for auditing or if needed later
    io.to(roomId).emit("result", roundResults);
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update balance display
  } else {
    io.to(roomId).emit("errorMessage", {
      text: "เกิดข้อผิดพลาดในการคำนวณผลลัพธ์ของรอบ",
    });
  }

  room.gameStarted = false; // Round over
  room.currentTurnPlayerId = null;
  io.to(roomId).emit("currentTurn", {
    id: null,
    name: "",
    role: "",
    timeLeft: 0,
  });
  if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false);
  // Client can now be enabled to start new game or dealer to end game
}

function startPlayerTurnTimer(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  if (
    !room ||
    !player ||
    player.hasStayed ||
    player.disconnectedMidGame ||
    player.hasPok
  ) {
    clearTurnTimer(room);
    // No need to call advanceTurn here if the calling context (like startPlayerTurn) handles it
    return;
  }

  clearTurnTimer(room);
  let timeLeft = DEFAULT_TURN_DURATION;
  player.actionTakenThisTurn = false; // Reset for the new turn

  room.turnTimerInterval = setInterval(() => {
    if (
      !rooms[room.id] ||
      room.players.find((p) => p.id === playerId)?.hasStayed ||
      room.players.find((p) => p.id === playerId)?.hasPok
    ) {
      clearInterval(room.turnTimerInterval);
      return;
    }
    io.to(room.id).emit("turnTimerUpdate", { playerId: player.id, timeLeft });
    timeLeft--;
    // Timeout is handled by room.turnTimeout
  }, 1000);

  room.turnTimeout = setTimeout(() => {
    if (
      rooms[room.id] &&
      room.currentTurnPlayerId === player.id &&
      !player.actionTakenThisTurn &&
      !player.hasStayed &&
      !player.hasPok
    ) {
      io.to(room.id).emit("message", {
        text: `${player.role || player.name} หมดเวลา, หมอบอัตโนมัติ.`,
      });
      player.hasStayed = true;
      player.actionTakenThisTurn = true;
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      advanceTurn(room.id);
    }
  }, DEFAULT_TURN_DURATION * 1000 + 500); // Add a slight buffer
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
    currentPlayer.disconnectedMidGame ||
    currentPlayer.hasPok
  ) {
    // Added hasPok check
    advanceTurn(roomId);
    return;
  }

  const playerRoleForMessage =
    getRoomPlayerData(room).find((p) => p.id === currentPlayer.id)?.role ||
    currentPlayer.name;

  io.to(roomId).emit("message", { text: `ตาของ ${playerRoleForMessage}.` });
  io.to(roomId).emit("currentTurn", {
    id: currentPlayer.id,
    name: currentPlayer.name,
    role: playerRoleForMessage,
    timeLeft: DEFAULT_TURN_DURATION,
  });
  startPlayerTurnTimer(room, currentPlayer.id);
}

function advanceTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearTurnTimer(room);

  if (!room.gameStarted) {
    // If game has ended (results shown) or not started
    if (room.resultsCache && room.dealerId) {
      // Round just ended
      io.to(room.dealerId).emit("enableShowResult", false); // Ensure show result is hidden
      // Dealer can now choose to start a new game or end the session
      io.to(room.dealerId).emit("roundOverDealerOptions", true); // Example event
    }
    return;
  }

  // Find next player in playerActionOrder
  let nextActivePlayerFound = false;
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
      // Added hasPok check
      room.currentTurnPlayerId = nextPlayer.id;
      startPlayerTurn(roomId);
      nextActivePlayerFound = true;
      return;
    }
  }

  // If loop completes, all players (including dealer if in order) have stayed, pok'd, or disconnected
  if (!nextActivePlayerFound) {
    room.currentTurnPlayerId = null;
    io.to(roomId).emit("currentTurn", {
      id: null,
      name: "",
      role: "",
      timeLeft: 0,
    });

    // Check if all players (non-dealers) are done and dealer had Pok. This was handled in startGame
    // This section is for when all players have taken their turns.
    const dealer = room.players.find(
      (p) => p.isDealer && !p.disconnectedMidGame
    );
    if (dealer) {
      // If dealer is still active
      // At this point, all other active players should have hasStayed = true or hasPok = true
      // If the dealer hasn't Pok'd and hasn't stayed, it might be their turn if they were last in order (handled above)
      // If the dealer also stayed/pok'd or it's simply time to show results
      const allPlayersDone = room.players
        .filter((p) => !p.isDealer && !p.disconnectedMidGame)
        .every((p) => p.hasStayed || p.hasPok);

      if (
        allPlayersDone &&
        (dealer.hasStayed ||
          dealer.hasPok ||
          room.playerActionOrder.indexOf(dealer.id) ===
            -1) /* dealer not in action order to draw */
      ) {
        io.to(room.dealerId).emit("enableShowResult", true);
        io.to(roomId).emit("message", {
          text: "ผู้เล่นทุกคนดำเนินการเสร็จสิ้น เจ้ามือสามารถเปิดไพ่ได้",
        });
      } else if (
        allPlayersDone &&
        !dealer.hasStayed &&
        !dealer.hasPok &&
        room.playerActionOrder.includes(dealer.id) &&
        room.playerActionOrder.indexOf(dealer.id) >
          room.currentPlayerIndexInOrder
      ) {
        // This case should ideally be caught by the loop if dealer is in playerActionOrder and hasn't played
        // This means it's dealer's turn to decide to draw/stay IF they are part of playerActionOrder
      } else {
        // Fallback or if dealer doesn't take a turn (e.g. always stays with 2 cards unless players hit)
        io.to(room.dealerId).emit("enableShowResult", true);
        io.to(roomId).emit("message", {
          text: "ผู้เล่นทุกคนดำเนินการเสร็จสิ้น เจ้ามือสามารถเปิดไพ่ได้",
        });
      }
    } else {
      // No active dealer, something went wrong or game should end.
      console.log(
        `[AvT] No active dealer in room ${roomId} when trying to enable show result.`
      );
      // calculateAndEmitResults(roomId); // Or handle error, maybe auto-calculate if possible
    }
  }
}

// --- Socket.IO Connection Handler ---
io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("createRoom", ({ playerName, initialBalance }) => {
    try {
      if (!playerName || playerName.trim() === "")
        return socket.emit("createRoomError", {
          message: "กรุณาใส่ชื่อของคุณ",
        }); // Use specific error event
      const bal = parseInt(initialBalance);
      // Sync with client's min="50" for consistency
      if (isNaN(bal) || bal < 50 || (bal % 10 !== 0 && bal % 5 !== 0))
        return socket.emit("createRoomError", {
          message: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 50, ลงท้าย 0 หรือ 5)",
        });

      const roomId = uuidv4().slice(0, 5).toUpperCase();
      const dealer = initializePlayer(socket.id, playerName.trim(), bal, true);
      rooms[roomId] = {
        id: roomId,
        dealerId: socket.id,
        dealerName: playerName.trim(),
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
        // Client expects this
        roomId: roomId,
        players: getRoomPlayerData(rooms[roomId]), // Send initial player data
        yourId: socket.id,
        dealerName: playerName.trim(), // Keep for potential use
        betAmount: DEFAULT_BET_AMOUNT, // Keep for potential use
      });
      // io.to(roomId).emit("playersData", getRoomPlayerData(rooms[roomId])); // roomCreated sends players now
      io.to(roomId).emit("message", {
        text: `${dealer.role} (${playerName.trim()}) ได้สร้างห้อง.`,
      });
      console.log(
        `[Server] Room ${roomId} created by ${playerName.trim()} (${socket.id})`
      );
    } catch (error) {
      console.error("[Server] Error creating room:", error);
      socket.emit("createRoomError", {
        message: "เกิดข้อผิดพลาดในการสร้างห้อง",
      });
    }
  });

  socket.on("joinRoom", ({ roomId, playerName, initialBalance }) => {
    try {
      const room = rooms[roomId];
      const trimmedPlayerName = playerName.trim(); // Trim player name

      if (!room)
        return socket.emit("joinRoomError", {
          message: "ไม่พบห้องนี้ กรุณาตรวจสอบรหัสห้องอีกครั้ง",
        });
      if (room.isLocked && !room.gameStarted)
        return socket.emit("joinRoomError", {
          message: "ห้องนี้ถูกล็อคโดยเจ้ามือ",
        });
      if (room.gameStarted)
        return socket.emit("joinRoomError", {
          message: "เกมในห้องนี้เริ่มไปแล้ว ไม่สามารถเข้าร่วมได้",
        });
      if (room.players.length >= 17)
        return socket.emit("joinRoomError", {
          message: "ห้องเต็มแล้ว (สูงสุด 17 คน)",
        }); // 1 dealer + 16 players
      if (room.players.find((p) => p.id === socket.id))
        return socket.emit("joinRoomError", {
          message: "คุณอยู่ในห้องนี้แล้ว",
        });
      if (!trimmedPlayerName)
        return socket.emit("joinRoomError", { message: "กรุณาใส่ชื่อของคุณ" });

      // --- CHECK FOR DUPLICATE NAME ---
      const isNameTaken = room.players.some(
        (p) => p.name.toLowerCase() === trimmedPlayerName.toLowerCase()
      );
      if (isNameTaken) {
        return socket.emit("joinRoomError", {
          message: "ชื่อผู้ใช้นี้ถูกใช้แล้วในห้องนี้ กรุณาเปลี่ยนชื่อ",
        });
      }
      // --- END DUPLICATE NAME CHECK ---

      const bal = parseInt(initialBalance);
      // Sync with client's min="50" for consistency.
      if (isNaN(bal) || bal < 50 || (bal % 10 !== 0 && bal % 5 !== 0))
        return socket.emit("joinRoomError", {
          message: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 50, ลงท้าย 0 หรือ 5)",
        });

      const player = initializePlayer(socket.id, trimmedPlayerName, bal, false);
      room.players.push(player);
      socket.join(roomId);

      // Send confirmation to the joining player, matching client expectation
      socket.emit("joinedRoom", {
        roomId: room.id,
        players: getRoomPlayerData(room), // Send current players in room
        yourId: socket.id, // Send client's own socket ID
        // Optional: other room details if needed by client upon joining
        // dealerName: room.dealerName,
        // betAmount: room.betAmount,
      });

      // Update all players in the room (including the new one via playersData)
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      const joinedPlayerRole =
        getRoomPlayerData(room).find((p) => p.id === player.id)?.role ||
        player.name;
      io.to(roomId).emit("message", {
        text: `${joinedPlayerRole} (${trimmedPlayerName}) ได้เข้าร่วมห้อง.`,
      });
      console.log(
        `[Server] ${trimmedPlayerName} (${socket.id}) joined room ${roomId}`
      );
    } catch (error) {
      console.error("[Server] Error joining room:", error);
      socket.emit("joinRoomError", {
        message: "เกิดข้อผิดพลาดในการเข้าร่วมห้อง",
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
        return socket.emit("dealerError", {
          // More specific error for dealer actions
          message: `เดิมพันต้อง >= ${DEFAULT_BET_AMOUNT}, และลงท้ายด้วย 0 หรือ 5`,
        });
      }
      room.betAmount = bet;
      io.to(roomId).emit("roomSettings", { betAmount: room.betAmount }); // Notify all about new bet amount
      io.to(roomId).emit("message", {
        text: `เจ้ามือตั้งค่าเดิมพันเป็น ${bet}`,
      });
    } catch (error) {
      console.error("[Server] Error setting bet amount:", error);
      socket.emit("dealerError", {
        message: "เกิดข้อผิดพลาดในการตั้งค่าเดิมพัน",
      });
    }
  });

  socket.on("lockRoom", ({ roomId, lock }) => {
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId) return;
      room.isLocked = lock;
      io.to(roomId).emit("lockRoomStatus", room.isLocked); // Send boolean status
      io.to(roomId).emit("message", {
        text: `ห้องถูก${lock ? "ล็อค" : "ปลดล็อค"}โดยเจ้ามือ`,
      });
    } catch (error) {
      console.error("[Server] Error locking room:", error);
      socket.emit("dealerError", {
        message: "เกิดข้อผิดพลาดในการล็อค/ปลดล็อคห้อง",
      });
    }
  });

  socket.on("startGame", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) return;
      if (room.betAmount <= 0)
        return socket.emit("dealerError", {
          message: "กรุณาตั้งค่าเดิมพันก่อนเริ่มเกม",
        });

      const activePlayersForGame = room.players.filter(
        (p) => !p.disconnectedMidGame
      );
      if (activePlayersForGame.length < 2)
        return socket.emit("dealerError", {
          message: "ต้องมีผู้เล่นอย่างน้อย 2 คน (รวมเจ้ามือ) จึงจะเริ่มเกมได้",
        });

      for (const player of activePlayersForGame) {
        if (!player.isDealer && player.balance < room.betAmount) {
          const playerDisplayRole =
            getRoomPlayerData(room).find((p) => p.id === player.id)?.role ||
            player.name;
          return io.to(roomId).emit("gameMessage", {
            // General game message, not error just for dealer
            text: `${playerDisplayRole} (${player.name}) มีเงินไม่พอสำหรับเดิมพันนี้ (${room.betAmount})`,
            type: "warning", // Add a type for styling on client
          });
        }
      }

      room.gameStarted = true;
      room.gameRound++;
      room.resultsCache = null;
      room.deck = shuffleDeck(createDeck());
      io.to(room.dealerId).emit("enableShowResult", false); // Disable for dealer until round ends

      // Reset players for the new round
      activePlayersForGame.forEach((player) => {
        player.cards = [];
        player.handDetails = null;
        player.hasStayed = false;
        player.actionTakenThisTurn = false;
        player.hasPok = false; // Reset Pok status
        // disconnectedMidGame is not reset here, it persists
      });

      // Deal 2 cards to each active player
      for (let i = 0; i < 2; i++) {
        activePlayersForGame.forEach((player) => {
          if (room.deck.length > 0) {
            player.cards.push(room.deck.pop());
          }
        });
      }

      // Calculate initial hand details and check for Pok
      activePlayersForGame.forEach((player) => {
        if (player.cards.length === 2) {
          player.handDetails = getHandRank(player.cards);
          if (player.handDetails) {
            // Ensure handDetails is not null
            player.hasPok = player.handDetails.isPok;
          }
        } else {
          player.handDetails = getHandRank([]); // Handle case of no cards properly
          player.hasPok = false;
        }
        io.to(player.id).emit("yourCards", {
          cards: player.cards,
          handDetails: player.handDetails,
        });
      });

      io.to(roomId).emit("gameStarted", {
        betAmount: room.betAmount,
        round: room.gameRound,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Send updated player data (with cards hidden for others)
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่มแล้ว! เดิมพัน: ${room.betAmount}`,
      });

      const dealer = activePlayersForGame.find((p) => p.isDealer);
      if (dealer && dealer.hasPok) {
        io.to(roomId).emit("message", {
          text: `${dealer.role} (${dealer.name}) ได้ ${dealer.handDetails.name}! เปิดไพ่ทันที!`,
        });
        activePlayersForGame.forEach((p) => {
          if (!p.isDealer) {
            p.hasStayed = true;
            p.actionTakenThisTurn = true; // Other players are forced to stay
          }
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        calculateAndEmitResults(roomId);
        return;
      }

      let playerPokMessageSent = false;
      activePlayersForGame.forEach((player) => {
        if (!player.isDealer && player.hasPok) {
          player.hasStayed = true;
          player.actionTakenThisTurn = true;
          const playerDisplayRole =
            getRoomPlayerData(room).find((pData) => pData.id === player.id)
              ?.role || player.name;
          io.to(roomId).emit("message", {
            text: `${playerDisplayRole} (${player.name}) ได้ ${player.handDetails.name}! (รอเปิดไพ่)`,
          });
          // Optionally reveal Pok to everyone immediately:
          io.to(roomId).emit("player_revealed_pok", {
            playerId: player.id,
            // name: player.name, // Role is better
            role: playerDisplayRole,
            cards: player.cards, // For public reveal
            handDetails: player.handDetails,
          });
          playerPokMessageSent = true;
        }
      });
      if (playerPokMessageSent) {
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update if any player Pok'd
      }

      // Setup player action order: non-dealers first, then dealer (if dealer needs to act)
      room.playerActionOrder = activePlayersForGame
        .filter((p) => !p.isDealer) // Non-dealers
        .map((p) => p.id);

      // Decide if dealer needs to be in action order (e.g. if they can hit)
      // For Pok Deng, dealer usually only acts after all players. So, dealer might not be in this specific actionOrder for hitting/staying.
      // If dealer can hit, add them:
      // if (dealer) { room.playerActionOrder.push(dealer.id); }

      room.currentPlayerIndexInOrder = -1;
      advanceTurn(roomId);
    } catch (error) {
      console.error("[Server] Error starting game:", error);
      socket.emit("dealerError", { message: "เกิดข้อผิดพลาดในการเริ่มเกม" });
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
        player.hasPok
      )
        return; // Added hasPok
      if (player.cards.length >= 3)
        return socket.emit("gameError", {
          message: "มีไพ่ 3 ใบบนมือแล้ว ไม่สามารถจั่วเพิ่มได้",
        });

      clearTurnTimer(room);
      if (room.deck.length > 0) {
        player.cards.push(room.deck.pop());
      } else {
        return socket.emit("gameError", { message: "ไพ่ในกองหมดแล้ว!" });
      }
      player.handDetails = getHandRank(player.cards);
      player.actionTakenThisTurn = true;

      if (player.cards.length === 3) {
        player.hasStayed = true; // Automatically stay after 3 cards
      }
      // Check for "Pok Lang" (Pok 8 or 9 with 3 cards), usually means auto-stay.
      // getHandRank already sets isPok. If they hit to a Pok with 3 cards, they auto-stay.
      if (
        player.handDetails &&
        player.handDetails.isPok &&
        player.cards.length === 3
      ) {
        player.hasStayed = true;
        player.hasPok = true; // Update hasPok status
      }

      io.to(player.id).emit("yourCards", {
        cards: player.cards,
        handDetails: player.handDetails,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      const playerRoleForMessage =
        getRoomPlayerData(room).find((p) => p.id === player.id)?.role ||
        player.name;
      io.to(roomId).emit("message", {
        text: `${playerRoleForMessage} (${player.name}) จั่วไพ่.`,
      });

      if (player.hasStayed) {
        // If auto-stayed (3 cards or Pok Lang)
        advanceTurn(roomId);
      } else {
        startPlayerTurnTimer(room, player.id); // Restart timer if they can still act (should not happen if 3 cards logic is strict)
      }
    } catch (error) {
      console.error("[Server] Error drawing card:", error);
      socket.emit("gameError", { message: "เกิดข้อผิดพลาดในการจั่วไพ่" });
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
        player.hasPok
      )
        return; // Added hasPok check

      clearTurnTimer(room); // Clear timer since action is taken
      player.hasStayed = true;
      player.actionTakenThisTurn = true;

      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update player status
      const playerRoleForMessage =
        getRoomPlayerData(room).find((p) => p.id === player.id)?.role ||
        player.name;
      io.to(roomId).emit("message", {
        text: `${playerRoleForMessage} (${player.name}) ขออยู่.`,
      });
      advanceTurn(roomId);
    } catch (error) {
      console.error("[Server] Error on stay:", error);
      socket.emit("gameError", { message: "เกิดข้อผิดพลาดในการขออยู่" });
    }
  });

  socket.on("showResult", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("dealerError", { message: "ไม่พบห้อง" });
      if (socket.id !== room.dealerId)
        return socket.emit("gameError", {
          message: "เฉพาะเจ้ามือเท่านั้นที่สามารถเปิดไพ่ได้",
        });
      if (room.gameStarted && room.currentTurnPlayerId !== null) {
        // Check if all players (non-dealers) are done
        const nonDealers = room.players.filter(
          (p) => !p.isDealer && !p.disconnectedMidGame
        );
        const allNonDealersDone = nonDealers.every(
          (p) => p.hasStayed || p.hasPok
        );
        if (!allNonDealersDone) {
          return socket.emit("dealerError", {
            text: "ยังมีผู้เล่นบางคนยังไม่ได้ตัดสินใจ (จั่ว/อยู่)",
          });
        }
      }
      // If dealer is part of turn order and hasn't played, they should "stay" first.
      const dealerPlayer = room.players.find(
        (p) => p.id === room.dealerId && !p.disconnectedMidGame
      );
      if (dealerPlayer && !dealerPlayer.hasStayed && !dealerPlayer.hasPok) {
        // This implies dealer needs to make a decision or is automatically staying.
        // For Pok Deng, dealer usually reveals after everyone.
        // If dealer could hit, they should have had a turn.
        // For simplicity, if dealer clicks "Show Result", assume they are staying with their current hand.
        dealerPlayer.hasStayed = true;
        dealerPlayer.actionTakenThisTurn = true;
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
      }

      calculateAndEmitResults(roomId);
    } catch (error) {
      console.error("[Server] Error showing results:", error);
      socket.emit("dealerError", { message: "เกิดข้อผิดพลาดในการแสดงผลลัพธ์" });
    }
  });

  socket.on("resetGame", (roomId) => {
    // Typically used by dealer between rounds if needed
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) return; // Can only reset if game not in progress

      // Reset player states but keep balances and disconnectedMidGame status
      room.players.forEach((p) => {
        p.cards = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.actionTakenThisTurn = false;
        p.hasPok = false;
        // p.initialBalance is kept, p.balance is from previous round
      });
      room.deck = [];
      room.currentTurnPlayerId = null;
      room.currentPlayerIndexInOrder = -1;
      room.resultsCache = null; // Clear previous round results

      io.to(roomId).emit("gameResetSignal"); // A signal for clients to clear their views for a new round
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Send player data (empty hands)
      io.to(roomId).emit("message", {
        text: "เจ้ามือรีเซ็ตเกม (ยังไม่เริ่มรอบใหม่)",
      });
      io.to(room.dealerId).emit("enableShowResult", false);
      // Dealer can now click "Start Game" again.
    } catch (error) {
      console.error("[Server] Error resetting game:", error);
      socket.emit("dealerError", { message: "เกิดข้อผิดพลาดในการรีเซ็ตเกม" });
    }
  });

  socket.on("endGame", (roomId) => {
    // Dealer ends the entire session
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId) return;

      // Calculate final summary based on initial and final balances
      const gameSummary = room.players.map((player) => {
        const playerDisplayRole =
          getRoomPlayerData(room).find((pData) => pData.id === player.id)
            ?.role || player.name;
        return {
          id: player.id,
          name: player.name,
          role: playerDisplayRole, // Use current role
          initialBalance: player.initialBalance,
          finalBalance: player.balance,
          netChange: player.balance - player.initialBalance,
          disconnectedMidGame: player.disconnectedMidGame,
        };
      });

      io.to(roomId).emit("gameEnded", gameSummary); // Send summary to all in room
      io.to(roomId).emit("message", {
        text: `เจ้ามือ (${room.dealerName}) ได้จบเกมแล้ว ขอบคุณที่ร่วมสนุก!`,
      });

      // Clean up: make all sockets leave the room and delete room object
      const socketsInRoom = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      );
      socketsInRoom.forEach((socketIdInRoom) => {
        const clientSocket = io.sockets.sockets.get(socketIdInRoom);
        if (clientSocket) clientSocket.leave(roomId);
      });

      clearTurnTimer(room); // Clear any pending timers for the room
      delete rooms[roomId]; // Remove room from server memory
      console.log(
        `[Server] Room ${roomId} ended and deleted by dealer ${socket.id}`
      );
    } catch (error) {
      console.error("[Server] Error ending game:", error);
      socket.emit("dealerError", { message: "เกิดข้อผิดพลาดในการจบเกม" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[Server] User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        const playerDisplayRole =
          getRoomPlayerData(room).find((p) => p.id === player.id)?.role ||
          player.name; // Get role before potential removal

        io.to(roomId).emit("message", {
          text: `${playerDisplayRole} (${player.name}) ออกจากห้องแล้ว.`,
        });

        if (room.gameStarted && !player.disconnectedMidGame) {
          player.disconnectedMidGame = true;
          player.hasStayed = true; // Treat as stayed
          player.actionTakenThisTurn = true; // Action taken
          console.log(
            `[Server] ${playerDisplayRole} (${player.name}) marked as disconnected mid-game in room ${roomId}.`
          );
          if (room.currentTurnPlayerId === player.id) {
            clearTurnTimer(room);
            advanceTurn(roomId); // Move to next player if it was their turn
          }
        } else if (!room.gameStarted) {
          // If game not started, remove player from list
          room.players.splice(playerIndex, 1);
          console.log(
            `[Server] ${player.name} removed from room ${roomId} (game not started).`
          );
        }
        // Else (game started and player already marked disconnected), do nothing more with player object removal here.
        // They will be filtered out by getRoomPlayerData or handled in results.

        const activePlayersRemaining = room.players.filter(
          (p) => !p.disconnectedMidGame
        );

        if (activePlayersRemaining.length === 0) {
          console.log(`[Server] Room ${roomId} is empty. Deleting room.`);
          clearTurnTimer(room);
          delete rooms[roomId];
          break; // Exit loop since room is deleted
        } else {
          // Check if the disconnected player was the dealer
          if (player.isDealer) {
            console.log(
              `[Server] Dealer ${player.name} disconnected from room ${roomId}. Attempting to assign new dealer.`
            );
            // Attempt to assign a new dealer from remaining active players
            let newDealerAssigned = false;
            if (activePlayersRemaining.length > 0) {
              const newDealer = activePlayersRemaining[0]; // Assign first active player as new dealer
              newDealer.isDealer = true;
              newDealer.baseRole = "เจ้ามือ"; // Update baseRole as well
              // role will be updated by getRoomPlayerData
              room.dealerId = newDealer.id;
              room.dealerName = newDealer.name;
              newDealerAssigned = true;
              const newDealerDisplayRole =
                getRoomPlayerData(room).find((p) => p.id === newDealer.id)
                  ?.role || newDealer.name;
              io.to(roomId).emit("message", {
                text: `${newDealerDisplayRole} (${newDealer.name}) ได้เป็นเจ้ามือคนใหม่.`,
              });
              io.to(newDealer.id).emit("dealerPromotion"); // Notify the new dealer of their status
            }

            if (!newDealerAssigned) {
              // This should not happen if activePlayersRemaining.length > 0
              io.to(roomId).emit("message", {
                text: "เจ้ามือออกจากห้อง และไม่สามารถหาเจ้ามือใหม่ได้ ห้องจะถูกปิด.",
              });
              // Consider ending the game or deleting the room if no dealer can be assigned
              const socketsInRoom = Array.from(
                io.sockets.adapter.rooms.get(roomId) || []
              );
              socketsInRoom.forEach((socketIdInRoom) => {
                const clientSocket = io.sockets.sockets.get(socketIdInRoom);
                if (clientSocket) clientSocket.leave(roomId);
              });
              clearTurnTimer(room);
              delete rooms[roomId];
              console.log(
                `[Server] Room ${roomId} deleted due to no possible new dealer.`
              );
              break; // Exit loop as room is deleted
            }
          }
          // Update player data for remaining players in the room
          if (rooms[roomId]) {
            // Check if room still exists before emitting
            io.to(roomId).emit("playersData", getRoomPlayerData(room));
          }
        }
        break; // Player found and handled, exit loop
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
