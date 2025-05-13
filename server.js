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
  if (!cards || cards.length === 0) return 0;
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
  function checkStraight(numericValues) {
    if (numericValues.length !== 3) return false;
    if (
      numericValues[0] === 14 &&
      numericValues[1] === 13 &&
      numericValues[2] === 12
    ) {
      // A, K, Q (เรียงใหญ่สุด)
      return true;
    }
    return (
      numericValues[0] - 1 === numericValues[1] &&
      numericValues[1] - 1 === numericValues[2]
    );
  }

  const cards = [...cardsInput];
  const numCards = cards.length;

  if (numCards === 0) {
    return {
      name: "ไม่มีไพ่",
      rank: 7, // Lowest rank
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
    rank: 7, // Default to lowest score if nothing special
    score: score,
    multiplier: 1,
    cards: sortedCardsByNumericValue,
    tieBreakerValue: null, // Used for comparing Tong, Straight, Straight Flush, Sian
    isPok: false,
    isDeng: false,
    dengType: null, // e.g., "ป๊อกเด้ง", "สามเด้ง", "สเตรทฟลัช"
  };

  // Check for Pok (2 cards only)
  if (numCards === 2) {
    const isSameSuit = cardSuits[0] === cardSuits[1];
    if (score === 9) {
      return {
        name: isSameSuit ? "ป๊อก9เด้ง" : "ป๊อก9",
        rank: 1, // Highest rank
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
        rank: 2, // Second highest
        score: 8,
        multiplier: isSameSuit ? 2 : 1,
        cards: sortedCardsByNumericValue,
        isPok: true,
        isDeng: isSameSuit,
        dengType: isSameSuit ? "ป๊อกเด้ง" : null,
      };
    }
  }

  // Check for 3-card special hands
  if (numCards === 3) {
    const isAllSameSuit = new Set(cardSuits).size === 1;
    const isTong = new Set(cardValues).size === 1; // e.g., A A A

    if (isTong) {
      return {
        name: `ตอง ${cardValues[0]}`, // e.g., "ตอง A"
        rank: 3, // Higher than Pok
        score: score, // Score doesn't matter as much as the Tong itself
        multiplier: 5,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0], // Highest card in Tong (all same)
        isPok: false,
        isDeng: false, // Tong is not a "deng" in the typical sense, but a high multiplier hand
        dengType: null,
      };
    }

    const isStraight = checkStraight(numericValues);

    if (isStraight && isAllSameSuit) {
      return {
        name: "สเตรทฟลัช",
        rank: 4, // Very high
        score: score,
        multiplier: 5,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0], // Highest card in straight
        isPok: false,
        isDeng: true, // Technically a type of "deng"
        dengType: "สเตรทฟลัช",
      };
    }
    if (isStraight) {
      return {
        name: "เรียง", // Straight
        rank: 5,
        score: score,
        multiplier: 3,
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues[0], // Highest card in straight
        isPok: false,
        isDeng: false,
        dengType: null,
      };
    }

    // เซียน (J, Q, K of any suit)
    const isSian = cardValues.every((v) => ["J", "Q", "K"].includes(v));
    if (isSian) {
      return {
        name: "เซียน",
        rank: 6, // Or sometimes called สามเหลือง
        score: score, // Score is 0
        multiplier: 3, // Multiplier for Sian
        cards: sortedCardsByNumericValue,
        tieBreakerValue: numericValues, // Array of [K,Q,J] or similar numeric values for tie-breaking
        isPok: false,
        isDeng: false,
        dengType: null,
      };
    }
  }

  // Default hand or simple score with deng for 2 or 3 cards
  handDetails.rank = 7; // Base rank for normal scores

  if (numCards === 3) {
    const isAllSameSuitForThreeCards = new Set(cardSuits).size === 1;
    if (isAllSameSuitForThreeCards) {
      handDetails.name = `${score} สามเด้ง`;
      handDetails.multiplier = 3;
      handDetails.isDeng = true;
      handDetails.dengType = "สามเด้ง";
    } else {
      // Regular 3 card score
      if (score === 9) {
        handDetails.name = "9 หลัง"; // 9 points with 3 cards
      } else if (score === 8) {
        handDetails.name = "8 หลัง"; // 8 points with 3 cards
      } else {
        handDetails.name = `${score} แต้ม`;
      }
      handDetails.multiplier = 1; // No multiplier unless specified
      handDetails.isDeng = false;
      handDetails.dengType = null;
    }
  } else if (numCards === 2) {
    // Already handled Pok8, Pok9. This is for non-Pok 2-card hands.
    const isSameSuitTwoCards = cardSuits[0] === cardSuits[1];
    const isPairTwoCards = cardValues[0] === cardValues[1]; // e.g. 7 7

    if (isSameSuitTwoCards) {
      handDetails.name = `${score} สองเด้ง`;
      handDetails.multiplier = 2;
      handDetails.isDeng = true;
      handDetails.dengType = "สองเด้ง";
    } else if (isPairTwoCards) {
      // Some rules count pairs as 2 deng, some don't or handle separately.
      // Assuming pairs of same value (not JQK) are 2 deng if suits differ.
      handDetails.name = `${score} สองเด้ง`; // Or specific name like "คู่"
      handDetails.multiplier = 2; // Often pairs pay 2x
      handDetails.isDeng = true;
      handDetails.dengType = "สองเด้ง"; // Representing a pair
    } else {
      handDetails.name = `${score} แต้ม`;
      handDetails.multiplier = 1;
    }
  }

  // Special name for Busted (0 points) if not other special hand
  if (
    score === 0 &&
    !handDetails.isDeng &&
    !handDetails.isPok &&
    handDetails.rank === 7 // Make sure it's not already a Sian (which is 0 points but rank 6)
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
    baseRole: isDealer ? "เจ้ามือ" : "ขา", // Store base role
    role: isDealer ? "เจ้ามือ" : "ขา", // Can be updated to "ขาที่ X"
    actionTakenThisTurn: false,
    disconnectedMidGame: false, // Track if player disconnected during an active game
    hasPok: false, // Specifically for 2-card Pok 8/9
  };
}

function getRoomPlayerData(room) {
  if (!room || !room.players) return [];
  let playerNumber = 1;
  // Filter out players who disconnected mid-game from role assignment perspective for "ขาที่ X"
  // but they should still be included in the playersData if they are in room.players
  const activePlayersForRoleAssignment = room.players.filter(
    (p) => !p.disconnectedMidGame
  ); // Or consider only currently connected if that's the desired display

  return room.players.map((p) => {
    // Iterate over all players in room.players to include disconnected ones
    let displayRole = p.baseRole;
    if (p.baseRole !== "เจ้ามือ") {
      // Find this player's order among *currently active* non-dealers for "ขาที่ X"
      const activeNonDealers = activePlayersForRoleAssignment.filter(
        (ap) => !ap.isDealer
      );
      const playerIndexInActiveNonDealers = activeNonDealers.findIndex(
        (ap) => ap.id === p.id
      );

      if (playerIndexInActiveNonDealers !== -1) {
        displayRole = `ขาที่ ${playerIndexInActiveNonDealers + 1}`;
      } else if (p.disconnectedMidGame) {
        // If disconnected mid-game and not found in active list, use a placeholder or last known role.
        // For simplicity, stick to baseRole or a "Disconnected" status if needed.
        // The current logic updates `p.role` below, so it should reflect this.
        // If p.role was already "ขาที่ X", it might be preserved.
        displayRole = p.role; // Use existing role if available, might already be "ขาที่ X"
      } else {
        // Should ideally not happen if player is in room.players and not dealer
        // Fallback to keep playerNumber incrementing for unhandled cases.
        displayRole = `ขาที่ ${playerNumber}`;
        playerNumber++;
      }
    }

    // Update the player's role in the main players array if it changed during this calculation
    // This helps keep the .role property consistent for other uses.
    // const playerInRoom = room.players.find(rp => rp.id === p.id); // p is already from room.players
    if (p) p.role = displayRole; // Update role on the player object directly

    return {
      id: p.id,
      name: p.name,
      balance: p.balance,
      role: displayRole,
      isDealer: p.isDealer,
      hasStayed: p.hasStayed, // Important for UI to show player status
      disconnectedMidGame: p.disconnectedMidGame, // UI might want to show this
      hasPok: p.hasPok, // For UI to indicate player got Pok
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
  const dealer = room.players.find((p) => p.isDealer && !p.disconnectedMidGame); // Ensure dealer is not disconnected mid-game

  if (!dealer) {
    console.error(
      `[Server] CRITICAL: Active dealer not found in performResultCalculation for room: ${room.id}`
    );
    if (io && room && room.id) {
      io.to(room.id).emit("errorMessage", {
        text: "เกิดข้อผิดพลาด: ไม่พบเจ้ามือ (Active) ขณะคำนวณผล",
      });
    }
    return null; // Cannot calculate results without an active dealer
  }

  // Ensure dealer's hand is evaluated if not already
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
    if (player.isDealer) {
      // Dealer is handled separately after all players
      return;
    }

    // If player disconnected mid-game, their hand still plays if cards were dealt
    // Their `hasStayed` would be true.
    if (!player.handDetails && player.cards && player.cards.length > 0) {
      player.handDetails = getHandRank(player.cards);
    } else if (!player.handDetails) {
      // If no cards (e.g. never joined game properly or error)
      player.handDetails = {
        name: "ไม่มีไพ่/ไม่ได้เล่น",
        rank: 7,
        score: 0,
        multiplier: 1,
        cards: player.cards || [],
        isPok: false,
        isDeng: false,
        dengType: null,
      };
    }

    let outcome = "แพ้"; // Default outcome for player
    let moneyChange = 0;
    const playerHand = player.handDetails;
    const dealerHand = dealer.handDetails;

    // Handle cases where player might not have a valid hand (e.g. error or disconnected before cards)
    if (!playerHand || playerHand.name === "ไม่มีไพ่/ไม่ได้เล่น") {
      outcome = player.disconnectedMidGame ? "ขาดการเชื่อมต่อ" : "ไม่ได้เล่น";
      moneyChange = player.disconnectedMidGame
        ? player.balance >= betAmount
          ? -betAmount
          : -player.balance
        : 0; // No change if just "not played" vs "disconnected penalty"
    } else if (playerHand.isPok && dealerHand.isPok) {
      // Both have Pok, compare ranks (Pok9 > Pok8)
      if (playerHand.rank < dealerHand.rank) {
        // Player's Pok is better (lower rank number means better hand)
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (playerHand.rank > dealerHand.rank) {
        // Dealer's Pok is better
        outcome = "แพ้";
        moneyChange = -(betAmount * dealerHand.multiplier);
      } else {
        // Same Pok rank (e.g., both Pok9 or both Pok8)
        outcome = "เสมอ";
        moneyChange = 0;
      }
    } else if (dealerHand.isPok) {
      // Dealer has Pok, player does not
      outcome = "แพ้";
      moneyChange = -(betAmount * dealerHand.multiplier);
    } else if (playerHand.isPok) {
      // Player has Pok, dealer does not
      outcome = "ชนะ";
      moneyChange = betAmount * playerHand.multiplier;
    }
    // Neither has Pok, compare ranks of special hands (Tong > SF > Straight > Sian > Normal)
    else if (playerHand.rank < dealerHand.rank) {
      outcome = "ชนะ";
      moneyChange = betAmount * playerHand.multiplier;
    } else if (playerHand.rank > dealerHand.rank) {
      outcome = "แพ้";
      moneyChange = -(betAmount * dealerHand.multiplier);
    } else {
      // Ranks are the same (e.g., both Tong, or both Straight, or both normal score)
      if (playerHand.rank <= 6) {
        // Special hands (Tong, SF, Straight, Sian) use tieBreakerValue
        let playerWinsByTieBreaker = false;
        if (
          playerHand.tieBreakerValue === null ||
          dealerHand.tieBreakerValue === null
        ) {
          // Fallback to score if tieBreaker is missing, though should be present for these ranks
          if (playerHand.score > dealerHand.score)
            playerWinsByTieBreaker = true;
        } else if (Array.isArray(playerHand.tieBreakerValue)) {
          // For Sian (array of card numeric values)
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
          (Array.isArray(playerHand.tieBreakerValue) &&
            JSON.stringify(playerHand.tieBreakerValue) ===
              JSON.stringify(dealerHand.tieBreakerValue)) ||
          playerHand.tieBreakerValue === dealerHand.tieBreakerValue
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
        // Both are normal scores (rank 7), compare points
        if (playerHand.score > dealerHand.score) {
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.score < dealerHand.score) {
          outcome = "แพ้";
          moneyChange = -(betAmount * dealerHand.multiplier);
        } else {
          // Same score, check for "deng" (multiplier)
          if (playerHand.multiplier > dealerHand.multiplier) {
            outcome = "ชนะ (เด้ง)";
            moneyChange = betAmount * playerHand.multiplier; // Player wins based on their higher deng
          } else if (playerHand.multiplier < dealerHand.multiplier) {
            outcome = "แพ้ (เด้ง)";
            moneyChange = -(betAmount * dealerHand.multiplier); // Dealer wins based on their higher deng
          } else {
            outcome = "เสมอ";
            moneyChange = 0;
          }
        }
      }
    }

    // Ensure player doesn't lose more than they have
    if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
      moneyChange = -player.balance;
    }
    player.balance += moneyChange;
    dealerNetChangeTotal -= moneyChange; // Dealer's gain/loss is opposite of player's

    roundResults.push({
      id: player.id,
      name: player.name,
      role: player.role,
      cardsDisplay: (playerHand.cards || []).map(getCardDisplay).join(" "),
      score: playerHand.score,
      specialType: playerHand.name,
      outcome: outcome,
      moneyChange: moneyChange,
      balance: player.balance,
      disconnectedMidGame: player.disconnectedMidGame, // Include this in results
    });
  });

  // Add dealer's result
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
    outcome: "เจ้ามือ", // Or derive based on net change, but "เจ้ามือ" is standard
    moneyChange: dealerNetChangeTotal,
    balance: dealer.balance,
    disconnectedMidGame: dealer.disconnectedMidGame,
  });

  // Sort results: Dealer first, then "ขาที่ 1", "ขาที่ 2", ...
  const finalSortedResults = [...roundResults].sort((a, b) => {
    const getRoleOrder = (roleStr) => {
      if (!roleStr) return Infinity; // Should not happen
      if (roleStr === "เจ้ามือ") return 0;
      const match = roleStr.match(/ขาที่ (\d+)/);
      if (match) return parseInt(match[1]);
      return Infinity; // Fallback for other roles or disconnected players without specific "ขาที่ X"
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

  // Clear any active turn timer as the round is ending.
  clearTurnTimer(room);

  // Always perform fresh calculation unless requirements change for caching.
  const roundResults = performResultCalculation(room);

  if (roundResults) {
    room.resultsCache = roundResults; // Cache results for this specific round

    // Update currentBalance in allPlayersEver for all players in room.players
    // room.players contains the most up-to-date balances after performResultCalculation
    room.players.forEach((currentPlayerInRoom) => {
      const playerInAllEver = room.allPlayersEver.find(
        (p) => p.id === currentPlayerInRoom.id
      );
      if (playerInAllEver) {
        playerInAllEver.currentBalance = currentPlayerInRoom.balance;
      }
    });

    io.to(roomId).emit("result", roundResults);
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Send updated player data including new balances
  } else {
    io.to(roomId).emit("errorMessage", {
      text: "เกิดข้อผิดพลาดในการคำนวณผลลัพธ์ของรอบ",
    });
    // Potentially need to reset game state or handle error more gracefully
  }

  // Mark game as ended for this round, waiting for dealer to start new or end game
  room.gameStarted = false;
  room.currentTurnPlayerId = null;
  io.to(roomId).emit("currentTurn", {
    id: null,
    name: "",
    role: "",
    timeLeft: 0,
  });
  if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false); // Disable button after results shown
}

function startPlayerTurnTimer(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  if (
    !room ||
    !player ||
    player.hasStayed ||
    player.disconnectedMidGame ||
    player.hasPok // Players with Pok already "stayed"
  ) {
    clearTurnTimer(room); // Ensure no old timer runs
    return;
  }

  clearTurnTimer(room); // Clear any existing timer first
  let timeLeft = DEFAULT_TURN_DURATION;
  player.actionTakenThisTurn = false; // Reset for the new turn

  room.turnTimerInterval = setInterval(() => {
    if (
      !rooms[room.id] || // Room might have been deleted
      room.players.find((p) => p.id === playerId)?.hasStayed || // Player might have stayed
      room.players.find((p) => p.id === playerId)?.hasPok || // Player might have Pok
      room.players.find((p) => p.id === playerId)?.disconnectedMidGame // Player disconnected
    ) {
      clearInterval(room.turnTimerInterval);
      return;
    }
    io.to(room.id).emit("turnTimerUpdate", { playerId: player.id, timeLeft });
    timeLeft--;
    if (timeLeft < 0) {
      clearInterval(room.turnTimerInterval);
      // Timeout action is handled by room.turnTimeout
    }
  }, 1000);

  room.turnTimeout = setTimeout(() => {
    if (
      rooms[room.id] && // Room still exists
      room.currentTurnPlayerId === player.id && // Still this player's turn
      !player.actionTakenThisTurn && // Player hasn't made a move
      !player.hasStayed &&
      !player.hasPok &&
      !player.disconnectedMidGame
    ) {
      io.to(room.id).emit("message", {
        text: `${player.role || player.name} หมดเวลา, หมอบอัตโนมัติ.`,
      });
      player.hasStayed = true; // Auto-stay on timeout
      player.actionTakenThisTurn = true;
      io.to(room.id).emit("playersData", getRoomPlayerData(room)); // Update UI
      advanceTurn(room.id);
    }
  }, DEFAULT_TURN_DURATION * 1000 + 500); // Add a small buffer
}

function startPlayerTurn(roomId) {
  const room = rooms[roomId];
  if (!room || !room.gameStarted || !room.currentTurnPlayerId) return;

  const currentPlayer = room.players.find(
    (p) => p.id === room.currentTurnPlayerId
  );

  // If current player cannot act (stayed, pok, disconnected), advance turn.
  if (
    !currentPlayer ||
    currentPlayer.hasStayed ||
    currentPlayer.disconnectedMidGame ||
    currentPlayer.hasPok // Players with Pok automatically stay their action
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
  startPlayerTurnTimer(room, currentPlayer.id);
}

function advanceTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  clearTurnTimer(room); // Clear timer for the player whose turn just ended

  // If game is not formally started (e.g., after results, before new game)
  // or if there's a cached result, it means round is over.
  if (!room.gameStarted && room.resultsCache) {
    if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false); // No results to show yet for a new round
    return;
  }
  if (!room.gameStarted) {
    // Game round hasn't begun or has concluded, no turns to advance.
    return;
  }

  let nextActivePlayerFound = false;
  // Loop through the playerActionOrder to find the next player
  for (let i = 0; i < room.playerActionOrder.length; i++) {
    room.currentPlayerIndexInOrder =
      (room.currentPlayerIndexInOrder + 1) % room.playerActionOrder.length;
    const nextPlayerId = room.playerActionOrder[room.currentPlayerIndexInOrder];
    const nextPlayer = room.players.find((p) => p.id === nextPlayerId);

    if (
      nextPlayer &&
      !nextPlayer.hasStayed && // Hasn't chosen to stay
      !nextPlayer.disconnectedMidGame && // Isn't disconnected
      !nextPlayer.hasPok // Doesn't have Pok (as Pok players auto-stay)
    ) {
      room.currentTurnPlayerId = nextPlayer.id;
      startPlayerTurn(roomId); // This will also emit currentTurn and start timer
      nextActivePlayerFound = true;
      return; // Found next player, turn advanced
    }
  }

  // If loop completes and no next active player is found (all remaining players have stayed, Pok, or disconnected)
  if (!nextActivePlayerFound) {
    room.currentTurnPlayerId = null; // No one's turn
    io.to(roomId).emit("currentTurn", {
      id: null,
      name: "",
      role: "",
      timeLeft: 0,
    });

    // At this point, all players who can act have acted.
    // The dealer might be the last one in playerActionOrder or might act implicitly by showing results.
    const dealer = room.players.find(
      (p) => p.isDealer && !p.disconnectedMidGame
    );

    // Check if all non-dealer active players have acted (stayed or Pok)
    const allNonDealersDone = room.players
      .filter((p) => !p.isDealer && !p.disconnectedMidGame)
      .every((p) => p.hasStayed || p.hasPok);

    if (allNonDealersDone) {
      if (dealer) {
        // If the dealer hasn't acted yet (e.g., needs to draw) and isn't Pok
        if (!dealer.hasStayed && !dealer.hasPok) {
          // It might become the dealer's turn if they are in playerActionOrder and conditions above missed them.
          // However, often the dealer's "action" is to show results.
          // If dealer is supposed to draw, playerActionOrder should include them and they'd get a turn.
          // For now, this logic assumes if all players are done, dealer can show.
        }
        // Enable dealer to show results
        if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", true);
        io.to(roomId).emit("message", {
          text: "ผู้เล่นทุกคนดำเนินการเสร็จสิ้น เจ้ามือสามารถเปิดไพ่ได้ หรือจั่วไพ่หากยังไม่ถึง 3 ใบและต้องการ",
        });
      } else {
        // No active dealer, game might be stuck. This case should be handled by dealer disconnect logic.
        io.to(roomId).emit("errorMessage", {
          text: "ไม่พบเจ้ามือที่สามารถดำเนินการต่อได้",
        });
      }
    } else {
      // This state implies there are still players who should act but were not found by the loop.
      // This could indicate a logic error in turn advancement or player state.
      // Or, it could be the dealer's turn if they are the only one left to act.
      // For simplicity, if dealer is the only one not stayed/pok, it will be their turn if they are in action order.
      // If the loop finishes, it means all in playerActionOrder are done.
      // If the dealer is not in playerActionOrder (e.g. only players draw), this is fine.
    }
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
      const dealer = initializePlayer(socket.id, playerName.trim(), bal, true);

      rooms[roomId] = {
        id: roomId,
        dealerId: socket.id,
        dealerName: playerName.trim(),
        players: [dealer], // Active players in the current game
        allPlayersEver: [], // <<< MODIFIED: Tracks all players who ever joined for summary
        betAmount: DEFAULT_BET_AMOUNT,
        isLocked: false,
        gameStarted: false,
        currentTurnPlayerId: null,
        currentPlayerIndexInOrder: -1, // Index in playerActionOrder
        deck: [],
        turnTimerInterval: null,
        turnTimeout: null,
        gameRound: 0,
        playerActionOrder: [], // Order of players taking turns (excluding dealer initially, or dealer last)
        resultsCache: null, // Store results of the last completed round
      };

      // Add dealer to allPlayersEver
      rooms[roomId].allPlayersEver.push({
        id: dealer.id,
        name: dealer.name,
        initialBalance: dealer.initialBalance,
        currentBalance: dealer.balance, // Initial and current are same at start
        baseRole: dealer.baseRole,
        stillInRoom: true, // Tracks if the player's socket is currently connected to this room
        // role: dealer.role // role can be dynamic like "ขาที่ X", baseRole is "เจ้ามือ" or "ขา"
      });

      socket.join(roomId);
      socket.emit("roomCreated", {
        roomId: roomId,
        dealerName: playerName.trim(),
        betAmount: DEFAULT_BET_AMOUNT,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(rooms[roomId]));
      io.to(roomId).emit("message", {
        text: `${dealer.role} (${playerName.trim()}) ได้สร้างห้อง.`,
      });
      console.log(
        `[Server] Room ${roomId} created by ${playerName.trim()} (${socket.id})`
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
        // Max 1 dealer + 16 players
        return socket.emit("errorMessage", { text: "ห้องเต็ม" });
      if (room.players.find((p) => p.id === socket.id))
        return socket.emit("errorMessage", { text: "คุณอยู่ในห้องนี้แล้ว" }); // Should not happen if UI manages state
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อขาไพ่" });
      if (room.players.find((p) => p.name === playerName.trim())) {
        return socket.emit("errorMessage", {
          text: "มีผู้เล่นอื่นใช้ชื่อนี้แล้ว กรุณาเปลี่ยนชื่อ",
        });
      }
      const bal = parseInt(initialBalance);
      if (isNaN(bal) || bal < 10 || (bal % 10 !== 0 && bal % 5 !== 0))
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 10, ลงท้าย 0 หรือ 5)",
        });

      const player = initializePlayer(socket.id, playerName.trim(), bal, false);
      room.players.push(player);

      // Add player to allPlayersEver or update if they reconnected (though usually new socket ID for reconnect)
      // For simplicity, assume new join = new entry in allPlayersEver if ID is new.
      // If implementing reconnect with same ID, logic here might need to find existing.
      const existingPlayerInAllEver = room.allPlayersEver.find(
        (p) => p.id === player.id
      );
      if (existingPlayerInAllEver) {
        existingPlayerInAllEver.stillInRoom = true;
        existingPlayerInAllEver.name = player.name; // Update name if changed
        // Balance update handled by game logic or if they are rejoining with persisted state.
      } else {
        room.allPlayersEver.push({
          id: player.id,
          name: player.name,
          initialBalance: player.initialBalance,
          currentBalance: player.balance,
          baseRole: player.baseRole,
          stillInRoom: true,
        });
      }

      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId: room.id,
        dealerName: room.dealerName,
        betAmount: room.betAmount,
      });
      const currentPlayersData = getRoomPlayerData(room); // Get roles like "ขาที่ X"
      io.to(roomId).emit("playersData", currentPlayersData);

      io.to(roomId).emit("message", {
        text: `${playerName.trim()} ได้เข้าร่วมห้อง.`, // Use playerName from input as role might not be set yet
      });
      console.log(
        `[Server] ${playerName.trim()} (${socket.id}) joined room ${roomId}`
      );
    } catch (error) {
      console.error("[Server] Error joining room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการเข้าร่วมห้อง" });
    }
  });

  socket.on("setBetAmount", ({ roomId, amount }) => {
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) return; // Only dealer, before game starts
      const bet = parseInt(amount);
      if (
        isNaN(bet) ||
        bet < DEFAULT_BET_AMOUNT || // Ensure at least default
        (bet % 10 !== 0 && bet % 5 !== 0)
      ) {
        return socket.emit("errorMessage", {
          text: `เดิมพันต้อง >= ${DEFAULT_BET_AMOUNT}, และลงท้ายด้วย 0 หรือ 5`,
        });
      }
      room.betAmount = bet;
      io.to(roomId).emit("roomSettings", { betAmount: room.betAmount }); // Inform all clients
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
      if (!room || socket.id !== room.dealerId) return; // Only dealer can lock/unlock
      room.isLocked = lock;
      io.to(roomId).emit("lockRoom", room.isLocked); // Inform all clients
      io.to(roomId).emit("message", {
        text: `ห้องถูก${lock ? "ล็อค" : "ปลดล็อค"}โดยเจ้ามือ.`,
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
        // Or use DEFAULT_BET_AMOUNT if not set
        return socket.emit("errorMessage", { text: "กรุณาตั้งค่าเดิมพันก่อน" });

      // Consider only players not marked as disconnectedMidGame from previous rounds
      const activePlayersCount = room.players.filter(
        (p) => !p.disconnectedMidGame
      ).length;
      if (activePlayersCount < 2)
        return socket.emit("errorMessage", {
          text: "ต้องมีขาไพ่อย่างน้อย 2 คน (รวมเจ้ามือ) ที่ยังอยู่ในห้องเพื่อเริ่มเกม",
        });

      // Check if all non-disconnected players can afford the bet
      for (const player of room.players) {
        if (
          !player.isDealer &&
          !player.disconnectedMidGame &&
          player.balance < room.betAmount
        ) {
          // Emit to room so all see, not just dealer
          return io.to(roomId).emit("errorMessage", {
            text: `ขาไพ่ ${player.name} มีเงินไม่พอสำหรับเดิมพันนี้ (ต้องการ ${room.betAmount})`,
          });
        }
      }

      room.gameStarted = true;
      room.gameRound++;
      room.resultsCache = null; // Clear any previous round's results
      room.deck = shuffleDeck(createDeck());
      if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false); // Disable show result at start

      // Reset player states for the new round FOR CURRENTLY ACTIVE PLAYERS
      room.players.forEach((player) => {
        if (!player.disconnectedMidGame) {
          // Only reset active players
          player.cards = [];
          player.handDetails = null;
          player.hasStayed = false;
          player.actionTakenThisTurn = false;
          player.hasPok = false;
          // player.role will be updated by getRoomPlayerData if needed
        } else {
          // For players marked as disconnectedMidGame, they don't participate in new round
          // Their state remains as is (disconnected). They might be cleaned up if they leave socket.
        }
      });

      // Deal cards only to non-disconnected players
      const playersToDeal = room.players.filter((p) => !p.disconnectedMidGame);

      // Deal 2 cards to each active player
      for (let i = 0; i < 2; i++) {
        playersToDeal.forEach((player) => {
          if (room.deck.length > 0) {
            player.cards.push(room.deck.pop());
          }
        });
      }

      // Evaluate initial 2-card hands and check for Pok
      playersToDeal.forEach((player) => {
        if (player.cards.length === 2) {
          player.handDetails = getHandRank(player.cards);
          if (player.handDetails) {
            player.hasPok = player.handDetails.isPok; // Mark if Pok
          }
        } else {
          // Should not happen if dealing logic is correct
          player.handDetails = getHandRank([]); // Empty hand
          player.hasPok = false;
        }
        io.to(player.id).emit("yourCards", player.cards); // Send cards to each player
      });

      io.to(roomId).emit("gameStarted", {
        betAmount: room.betAmount,
        gameRound: room.gameRound,
      });
      const currentPlayersData = getRoomPlayerData(room); // Get updated roles after reset/deal
      io.to(roomId).emit("playersData", currentPlayersData);
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่มแล้ว! เดิมพัน: ${room.betAmount}`,
      });

      const dealer = playersToDeal.find((p) => p.isDealer); // Dealer must be in playersToDeal
      if (dealer && dealer.hasPok) {
        io.to(roomId).emit("message", {
          text: `${dealer.role || dealer.name} ได้ ${
            dealer.handDetails.name
          }! เปิดไพ่ทันที!`,
        });
        // All other players automatically "stay" if dealer Poks on deal
        playersToDeal.forEach((p) => {
          if (!p.isDealer) {
            p.hasStayed = true;
            p.actionTakenThisTurn = true; // Considered action taken
          }
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update UI
        calculateAndEmitResults(roomId); // Game ends immediately
        return;
      }

      // Check if any player has Pok
      let playerPokMessageSent = false;
      playersToDeal.forEach((player) => {
        if (!player.isDealer && player.hasPok) {
          player.hasStayed = true; // Player with Pok automatically stays
          player.actionTakenThisTurn = true;
          const playerRoleForMessage =
            currentPlayersData.find((pd) => pd.id === player.id)?.role ||
            player.name;
          io.to(roomId).emit("message", {
            text: `${playerRoleForMessage} ได้ ${player.handDetails.name}! (รอเจ้ามือ)`,
          });
          // Reveal Pok to everyone
          io.to(roomId).emit("player_revealed_pok", {
            playerId: player.id,
            name: player.name, // Or use playerRoleForMessage
            role: playerRoleForMessage,
            cards: player.cards, // Show their cards
            handDetails: player.handDetails,
          });
          playerPokMessageSent = true;
        }
      });

      if (playerPokMessageSent) {
        io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update hasStayed status
      }

      // Determine action order: non-dealers first, then dealer if they draw
      room.playerActionOrder = playersToDeal
        .filter((p) => !p.isDealer) // All non-dealers
        .map((p) => p.id);
      // Dealer might draw later if not Pok and players draw.
      // For now, playerActionOrder is just for players. Dealer's turn is handled by "showResult" or if they need to draw.
      // If dealer also follows normal turn order for drawing, add them:
      if (dealer) {
        // dealer should exist
        room.playerActionOrder.push(dealer.id); // Dealer acts last if drawing
      }

      room.currentPlayerIndexInOrder = -1; // Start before the first player
      advanceTurn(roomId); // Start the first player's turn
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
        player.disconnectedMidGame ||
        player.hasPok // Pok players can't draw
      )
        return; // Not their turn, or already acted/disconnected/Pok

      if (player.cards.length >= 3)
        return socket.emit("errorMessage", {
          text: "มีไพ่ครบ 3 ใบแล้ว ไม่สามารถจั่วได้อีก",
        });

      clearTurnTimer(room); // Player is taking an action

      if (room.deck.length > 0) {
        player.cards.push(room.deck.pop());
      } else {
        io.to(player.id).emit("errorMessage", { text: "สำรับไพ่หมด!" });
        // Force stay if deck is empty, though very unlikely in Pok Deng
        player.hasStayed = true;
        player.actionTakenThisTurn = true;
        io.to(player.id).emit("yourCards", player.cards); // Show current cards
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        advanceTurn(roomId);
        return;
      }

      player.handDetails = getHandRank(player.cards);
      player.actionTakenThisTurn = true; // Mark action taken

      if (player.cards.length === 3) {
        player.hasStayed = true; // Automatically stay after drawing 3rd card
      }
      // Check for Pok after drawing (not standard "Pok" but high hand)
      // 'hasPok' is primarily for 2-card natural Pok. 3-card hands are evaluated by getHandRank.

      io.to(player.id).emit("yourCards", player.cards); // Update player's own cards
      // Do NOT broadcast all cards to room here, only to player.
      // Player data update will show they have more cards (implicitly) or have stayed.
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update hasStayed status for all

      const playerRoleForMessage =
        getRoomPlayerData(room).find((pd) => pd.id === player.id)?.role ||
        player.name;

      io.to(roomId).emit("message", {
        text: `${playerRoleForMessage} จั่วไพ่.`,
      });

      if (player.hasStayed) {
        advanceTurn(roomId); // Move to next player if auto-stayed (3 cards)
      } else {
        // This case (can draw again) is not typical for Pok Deng.
        // If it were, restart timer: startPlayerTurnTimer(room, player.id);
        // But since drawing 3rd card makes hasStayed=true, advanceTurn is called.
        // If a game allows multiple draws before 3 cards, this logic would need adjustment.
        // For Pok Deng, one draw is typical.
        advanceTurn(roomId); // Should effectively move to next as current player hasStayed or needs to stay.
      }
    } catch (error) {
      console.error("[Server] Error drawing card:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการจั่วไพ่" });
    }
  });

  socket.on("stay", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room || !room.gameStarted) {
        // socket.emit("errorMessage", { text: "เกมยังไม่เริ่ม หรือจบไปแล้ว" });
        return;
      }

      const player = room.players.find((p) => p.id === socket.id);

      if (
        !player ||
        player.id !== room.currentTurnPlayerId || // Must be their turn
        player.hasStayed || // Already stayed
        player.disconnectedMidGame || // Disconnected
        player.hasPok // Pok players auto-stay
      ) {
        // socket.emit("errorMessage", { text: "ไม่ใช่ตาของคุณ หรือคุณได้ตัดสินใจไปแล้ว" });
        return;
      }

      clearTurnTimer(room); // Player is taking an action

      player.hasStayed = true;
      player.actionTakenThisTurn = true;

      const playerRoleForMessage =
        getRoomPlayerData(room).find((pd) => pd.id === player.id)?.role ||
        player.name;
      io.to(roomId).emit("message", {
        text: `${playerRoleForMessage} ขออยู่.`,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update UI for all

      advanceTurn(roomId);
    } catch (error) {
      console.error("[Server] Error on stay:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการ 'อยู่'" });
    }
  });

  socket.on("showResult", (roomId) => {
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
      if (socket.id !== room.dealerId)
        return socket.emit("errorMessage", {
          text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเปิดไพ่เพื่อคำนวณผลได้",
        });

      // If game isn't "started" but there are cached results (from previous round), show them again.
      // This is not typical. Usually "showResult" is for an active game round.
      // The button `enableShowResult` should control this.
      // If gameStarted is false, it means round ended. Dealer might be starting new one.
      // This is more for ending current round.

      // Ensure all active non-dealer players have taken their action (stayed, Pok, or disconnected)
      const allPlayersDone = room.players
        .filter((p) => !p.isDealer && !p.disconnectedMidGame)
        .every((p) => p.hasStayed || p.hasPok);

      const dealerPlayer = room.players.find(
        (p) => p.id === room.dealerId && !p.disconnectedMidGame
      );

      // If it was dealer's turn and they click "Show Result", they implicitly "stay" with their cards.
      if (
        dealerPlayer &&
        room.currentTurnPlayerId === room.dealerId && // Was it dealer's turn?
        !dealerPlayer.hasStayed && // And they haven't stayed/Pok-ed yet
        !dealerPlayer.hasPok
      ) {
        // If dealer has less than 3 cards and opts to show results, they stay with current hand
        dealerPlayer.hasStayed = true;
        dealerPlayer.actionTakenThisTurn = true;
        if (!dealerPlayer.handDetails)
          dealerPlayer.handDetails = getHandRank(dealerPlayer.cards); // Ensure hand is evaluated

        io.to(roomId).emit("message", {
          text: `${dealerPlayer.role} (${dealerPlayer.name}) เปิดไพ่ (ถือว่า 'อยู่' ด้วยไพ่ปัจจุบัน).`,
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        clearTurnTimer(room); // Clear dealer's turn timer if it was running
        // No need to advanceTurn, as showResult will proceed to calculation.
      } else if (dealerPlayer && !dealerPlayer.handDetails) {
        // If dealer's hand wasn't evaluated for some reason (e.g. they never took a formal "turn" but game proceeded)
        dealerPlayer.handDetails = getHandRank(dealerPlayer.cards);
      }

      if (!allPlayersDone) {
        const notDonePlayers = room.players
          .filter(
            (p) =>
              !p.isDealer && !p.disconnectedMidGame && !p.hasStayed && !p.hasPok
          )
          .map((p) => p.role || p.name)
          .join(", ");

        if (notDonePlayers) {
          return socket.emit("errorMessage", {
            text: `ยังไม่สามารถเปิดไพ่ได้ ผู้เล่น: ${notDonePlayers} ยังดำเนินการไม่เสร็จสิ้น`,
          });
        }
      }

      // If all players (and dealer, if they had a turn) are done, calculate.
      calculateAndEmitResults(roomId);
    } catch (error) {
      console.error("[Server] Error showing results:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการแสดงผลลัพธ์" });
    }
  });

  socket.on("resetGame", (roomId) => {
    //This "resets" the current hand/round, allowing dealer to start a fresh hand
    // without ending the whole game session or affecting cumulative scores in allPlayersEver yet.
    try {
      const room = rooms[roomId];
      let msg = "";
      if (!room) msg = "ไม่พบห้อง";
      else if (socket.id !== room.dealerId)
        msg = "เฉพาะเจ้ามือเท่านั้นที่รีเซ็ตได้";
      else if (room.gameStarted)
        msg = "ไม่สามารถรีเซ็ตได้ระหว่างเกมกำลังดำเนินอยู่ (ให้จบผลรอบนี้ก่อน)";

      if (msg) return socket.emit("errorMessage", { text: msg });

      // Reset states for players currently in the room for a new hand
      room.players.forEach((p) => {
        // Balances are preserved. This is just resetting for a new hand.
        p.cards = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.actionTakenThisTurn = false;
        p.hasPok = false;
        // p.disconnectedMidGame status should persist if they were.
        // Or, if reset means re-include disconnected players, this would change.
        // Current: disconnectedMidGame persists, they won't participate until reconnect.
      });

      room.deck = []; // Will be recreated on next startGame
      room.currentTurnPlayerId = null;
      room.currentPlayerIndexInOrder = -1;
      room.resultsCache = null; // Clear any displayed results
      room.gameStarted = false; // Mark game as not started, ready for new deal
      // room.gameRound does not reset, it increments with each startGame

      // Balances in allPlayersEver remain as they were. This is a round reset.
      // No change to gameRound counter yet, it increments on startGame.

      io.to(roomId).emit("resetGame"); // Inform clients to reset their UI for a new hand/round
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Send cleaned player data
      io.to(roomId).emit("message", {
        text: "เจ้ามือได้รีเซ็ตเกมสำหรับรอบใหม่ (ไพ่จะถูกสับใหม่เมื่อกดเริ่มเกมรอบใหม่)",
      });
      if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false); // Disable show result button
      // The "Start Game" button should become available again for the dealer.
    } catch (error) {
      console.error("[Server] Error resetting game (hand):", error);
      socket.emit("errorMessage", {
        text: "เกิดข้อผิดพลาดในการรีเซ็ตเกม (รอบปัจจุบัน)",
      });
    }
  });

  socket.on("endGame", (roomId) => {
    // This is for ending the entire game session and showing final summary
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId) {
        return socket.emit("errorMessage", {
          text: "เฉพาะเจ้ามือเท่านั้นที่สามารถจบเกมทั้งหมดได้",
        });
      }

      // Build gameSummary from allPlayersEver
      // Role assignment here should be based on their initial role or a consistent numbering
      let playerNumberForSummary = 1;
      const gameSummary = room.allPlayersEver.map((p_all) => {
        let displayRole = p_all.baseRole;
        if (p_all.baseRole !== "เจ้ามือ") {
          // Attempt to find their "ขาที่ X" based on order of joining or consistent ID sort
          // This is simpler than trying to reconstruct dynamic roles from multiple rounds.
          // For simplicity, let's use a sequential number for non-dealers in the summary
          // Or better, derive from the *first time* roles were assigned.
          // The `getRoomPlayerData` gives dynamic roles. For summary, `baseRole` plus an order is fine.
          // Find this player's original "ขาที่ X" if possible, or assign one.
          // The nonDealersEver approach for displayRole here.
          const nonDealersEver = room.allPlayersEver.filter(
            (player) => player.baseRole !== "เจ้ามือ"
          );
          // Sort nonDealersEver by some consistent criteria if available (e.g., join time, or ID for fallback)
          // For now, using their order in allPlayersEver:
          const playerIndexAmongNonDealers = nonDealersEver.findIndex(
            (nd) => nd.id === p_all.id
          );
          if (playerIndexAmongNonDealers !== -1) {
            displayRole = `ขาที่ ${playerIndexAmongNonDealers + 1}`;
          } else {
            displayRole = "ขา"; // Fallback
          }
        }

        let statusText = "ออกจากห้องแล้ว"; // Default if not stillInRoom
        if (p_all.stillInRoom) {
          const activePlayer = room.players.find((rp) => rp.id === p_all.id);
          if (activePlayer && activePlayer.disconnectedMidGame) {
            statusText = "หลุดระหว่างเกมล่าสุด";
          } else if (activePlayer) {
            statusText = "ยังอยู่ในห้อง";
          } else {
            // stillInRoom=true but not in room.players. Might happen if endgame is called after some left.
            statusText = "สถานะไม่ชัดเจน (อาจยังเชื่อมต่อ)";
          }
        } else {
          // stillInRoom is false. Check if they were marked disconnectedMidGame in their *final* active game.
          // This requires checking their state in room.players IF they were part of it when they left.
          // The allPlayersEver doesn't store disconnectedMidGame.
          // If they are not stillInRoom, they "left". If their last state in room.players was disconnectedMidGame, use that.
          // This detail is tricky; for now, "ออกจากห้องแล้ว" is the primary status for !stillInRoom.
          // We can augment if we stored last known 'disconnectedMidGame' status in allPlayersEver.
        }

        return {
          id: p_all.id,
          name: p_all.name,
          role: displayRole, // Use the derived role for summary
          initialBalance: p_all.initialBalance,
          finalBalance: p_all.currentBalance, // This should be the latest balance
          netChange: p_all.currentBalance - p_all.initialBalance,
          status: statusText,
        };
      });

      io.to(roomId).emit("gameEnded", gameSummary); // Send summary to all in room
      io.to(roomId).emit("message", {
        text: `เจ้ามือ ${room.dealerName} ได้จบเกมทั้งหมดแล้ว. ขอบคุณที่ร่วมเล่น!`,
      });

      // Clean up: remove all sockets from the room and delete the room
      const socketsInRoom = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      );
      socketsInRoom.forEach((socketIdInRoom) => {
        const clientSocket = io.sockets.sockets.get(socketIdInRoom);
        if (clientSocket) {
          clientSocket.leave(roomId);
          // Optionally, force client to main screen: clientSocket.emit('forceLeaveRoom');
        }
      });

      clearTurnTimer(room); // Clear any pending timers for the room
      delete rooms[roomId]; // Delete the room from the server's active list
      console.log(
        `[Server] Room ${roomId} ended and deleted by dealer ${socket.id}`
      );
    } catch (error) {
      console.error("[Server] Error ending game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการจบเกมทั้งหมด" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[Server] User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      const playerInAllEver = room.allPlayersEver.find(
        (p) => p.id === socket.id
      );

      if (playerInAllEver) {
        // Player was part of this room at some point
        playerInAllEver.stillInRoom = false; // Mark them as no longer connected

        let playerNameForLog = playerInAllEver.name;

        if (playerIndex !== -1) {
          // If they were in the active player list for the room
          const player = room.players[playerIndex];
          playerNameForLog = player.name; // Use name from active list if available

          io.to(roomId).emit("playerLeft", {
            playerId: player.id,
            name: player.name,
            message: `${
              player.role || player.name
            } ออกจากห้องหรือหลุดการเชื่อมต่อ.`,
          });

          if (room.gameStarted && !player.disconnectedMidGame) {
            player.disconnectedMidGame = true;
            player.hasStayed = true; // Force them to "stay" with their current hand/state
            player.actionTakenThisTurn = true; // Considered action taken

            // Balance is handled by performResultCalculation if game ends.
            // If they had Pok, their cards are revealed by player_revealed_pok earlier.
            // No immediate penalty here, their hand plays out.

            if (room.currentTurnPlayerId === player.id) {
              clearTurnTimer(room); // Clear their turn timer
              advanceTurn(roomId); // Move to the next player
            }
          } else if (!room.gameStarted) {
            // If game hasn't started, simply remove them from active players.
            // They remain in allPlayersEver.
            room.players.splice(playerIndex, 1);
          }
          // If player.disconnectedMidGame was already true, no state change needed for that.
        }
        console.log(
          `[Server] Player ${playerNameForLog} (ID: ${socket.id}) disconnected from room ${roomId}. Current status in allPlayersEver: stillInRoom = false.`
        );

        // Check room status after player leaves/disconnects
        const activePlayersRemaining = room.players.filter(
          (p) => !p.disconnectedMidGame
        );

        if (activePlayersRemaining.length === 0) {
          if (!room.gameStarted) {
            // No active players and game not started
            console.log(
              `[Server] Room ${roomId} is empty (no active players, game not started). Deleting.`
            );
            clearTurnTimer(room);
            delete rooms[roomId];
            return; // Exit since room is deleted
          } else {
            // Game was started, but no active players left (all disconnected)
            console.log(
              `[Server] Room ${roomId} has no active players left mid-game. Game might be stuck unless dealer (if also disconnected) was handled or an admin intervenes. Room not auto-deleted yet.`
            );
            // The game is effectively paused. If dealer was among the disconnected, new dealer logic runs.
            // If all disconnected, including dealer, game might need manual end or timeout.
          }
        }

        // Handle dealer disconnection:
        // This check is if the *current* dealer (room.dealerId) is the one who disconnected.
        if (socket.id === room.dealerId) {
          // The dealer disconnected.
          playerInAllEver.baseRole = "ขา (อดีตเจ้ามือ)"; // Mark in allPlayersEver

          const newDealerCandidate = activePlayersRemaining.find(
            (p) => p.id !== room.dealerId // Find any *other* active player
          );

          if (newDealerCandidate) {
            // Promote newDealerCandidate
            const oldDealerObjectInPlayers = room.players.find(
              (p) => p.id === room.dealerId
            );
            if (oldDealerObjectInPlayers)
              oldDealerObjectInPlayers.isDealer = false; // Demote in current players list

            newDealerCandidate.isDealer = true;
            newDealerCandidate.baseRole = "เจ้ามือ";
            newDealerCandidate.role = "เจ้ามือ"; // Update their role display
            room.dealerId = newDealerCandidate.id;
            room.dealerName = newDealerCandidate.name;

            const newDealerInAllEver = room.allPlayersEver.find(
              (p) => p.id === newDealerCandidate.id
            );
            if (newDealerInAllEver) newDealerInAllEver.baseRole = "เจ้ามือ";

            io.to(roomId).emit("dealerChanged", {
              dealerId: newDealerCandidate.id,
              dealerName: newDealerCandidate.name,
            });
            io.to(roomId).emit("message", {
              text: `${playerNameForLog} (เจ้ามือเดิม) หลุดการเชื่อมต่อ. ${newDealerCandidate.name} เป็นเจ้ามือคนใหม่.`,
            });
          } else {
            // No other active player to become dealer.
            io.to(roomId).emit("message", {
              text: "เจ้ามือหลุดการเชื่อมต่อ และไม่มีผู้เล่นอื่นเหลือที่จะเป็นเจ้ามือ. ห้องนี้อาจจะต้องปิดโดยอัตโนมัติหรือรอผู้เล่นใหม่.",
            });
            // If game was started, it's now stuck without a dealer.
            // If not started, and no players, it would have been deleted above.
            // Consider auto-ending and deleting the room if critical.
            if (room.gameStarted && activePlayersRemaining.length === 0) {
              // Double check if this condition is met
              console.log(
                `[Server] Room ${roomId} has no dealer and no players after dealer disconnect. Deleting room.`
              );
              // Could emit a final "game ended due to no players" message.
              clearTurnTimer(room);
              delete rooms[roomId];
              return; // Room deleted
            }
          }
        }

        // Ensure we don't operate on a deleted room
        if (rooms[roomId]) {
          io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update player list for everyone
        }
        break; // Player found and handled for this room, exit loop for 'roomId in rooms'
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
