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
    origin: "https://pokdeng-online.onrender.com", // Your client's origin
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
const rooms = {};

// --- Game Logic Functions (Card Utils, Hand Ranking - Unchanged as per request) ---
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
    if (score === 9)
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
    if (score === 8)
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
  if (numCards === 3) {
    const isAllSameSuit = new Set(cardSuits).size === 1;
    const isTong = new Set(cardValues).size === 1;
    if (isTong)
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
    const isStraight = checkStraight(numericValues);
    if (isStraight && isAllSameSuit)
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
    if (isStraight)
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
    const isSian = cardValues.every((v) => ["J", "Q", "K"].includes(v));
    if (isSian)
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
  }
  handDetails.rank = 7;
  if (numCards === 3) {
    const isAllSameSuitForThreeCards = new Set(cardSuits).size === 1;
    if (isAllSameSuitForThreeCards) {
      handDetails.name = `${score} สามเด้ง`;
      handDetails.multiplier = 3;
      handDetails.isDeng = true;
      handDetails.dengType = "สามเด้ง";
    } else {
      if (score === 9) handDetails.name = "9 หลัง";
      else if (score === 8) handDetails.name = "8 หลัง";
      else handDetails.name = `${score} แต้ม`;
      handDetails.multiplier = 1;
      handDetails.isDeng = false;
      handDetails.dengType = null;
    }
  } else if (numCards === 2) {
    const isSameSuitTwoCards = cardSuits[0] === cardSuits[1];
    const isPairTwoCards = cardValues[0] === cardValues[1];
    if (isSameSuitTwoCards || isPairTwoCards) {
      // Simplified if either is true, it's 2 deng
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
  )
    handDetails.name = "บอด";
  return handDetails;
}

// --- Player and Room Initialization & Data Retrieval ---
function initializePlayer(
  id,
  name,
  initialBalance,
  isDealer = false,
  socketIdToStore
) {
  return {
    id, // This is typically the first socket.id a player connects with for this session
    socketId: socketIdToStore || id, // Current active socket.id for this player
    name,
    initialBalance: parseInt(initialBalance),
    balance: parseInt(initialBalance),
    cards: [], // Current cards in hand for UI display
    handDetails: null, // Result from getHandRank on current cards
    hasStayed: false,
    isDealer,
    baseRole: isDealer ? "เจ้ามือ" : "ผู้เล่น",
    role: isDealer ? "เจ้ามือ" : "ผู้เล่น",
    actionTakenThisTurn: false, // Has the player made a move this turn?
    hasPok: false, // Does current handDetails indicate Pok?

    // Fields for result logging and disconnected player management
    cardsDealtInRound: [], // All cards dealt/drawn by the player in the current round
    disconnectedMidGame: false, // Is the player disconnected during an active game round?
    gameOutcomeThisRound: null, // { score, handType, comparisonResult, amountChange, cards }
    hasPlayedThisRound: false, // Has player completed their play for the round (Stay, Pok, Bust)?
  };
}

function getRoomPlayerData(room) {
  if (!room || !room.players) return [];
  let playerNumber = 1;
  // Display all players, including disconnected ones, so client knows who was in the room
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
      hasPlayedThisRound: p.hasPlayedThisRound, // Send this status
      // Client might not need to see gameOutcomeThisRound for OTHERS until roundResults
    };
  });
}

// --- Turn Management ---
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
    // advanceTurn(room.id); // Let advanceTurn be called explicitly by the action that causes this state
    return;
  }
  clearTurnTimer(room);
  let timeLeft = DEFAULT_TURN_DURATION;
  player.actionTakenThisTurn = false;
  io.to(room.id).emit("currentTurn", {
    id: player.id,
    name: player.name,
    role: player.role,
    timeLeft,
  });

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
    if (timeLeft < 0) {
      clearInterval(room.turnTimerInterval);
    }
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
        text: `${player.role || player.name} หมดเวลา, อยู่ อัตโนมัติ.`,
      });
      player.hasStayed = true;
      player.actionTakenThisTurn = true;
      player.hasPlayedThisRound = true; // Player's turn ends due to timeout (stay)
      io.to(room.id).emit("playersData", getRoomPlayerData(room));
      advanceTurn(room.id);
    }
  }, DEFAULT_TURN_DURATION * 1000 + 500);
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
    advanceTurn(roomId);
    return;
  }
  io.to(room.id).emit("message", {
    text: `ตาของ ${currentPlayer.role || currentPlayer.name}.`,
  });
  startPlayerTurnTimer(room, currentPlayer.id);
}

function advanceTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  clearTurnTimer(room);

  if (!room.gameStarted && room.roundOver) {
    // If round is over (results shown)
    if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false); // Ensure button is hidden
    io.to(roomId).emit("message", {
      text: `รอบจบแล้ว, รอเจ้ามือ (${room.dealerName}) เริ่มเกมใหม่ หรือ จบเกม.`,
    });
    return;
  }
  if (!room.gameStarted) return;

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
      room.currentTurnPlayerId = nextPlayer.id;
      startPlayerTurn(roomId);
      nextActivePlayerFound = true;
      return;
    }
  }

  if (!nextActivePlayerFound) {
    // All players (including dealer if in order) have stayed/pok/disconnected
    room.currentTurnPlayerId = null;
    io.to(room.id).emit("currentTurn", {
      id: null,
      name: "",
      role: "",
      timeLeft: 0,
    });

    const activeDealer = room.players.find(
      (p) => p.isDealer && !p.disconnectedMidGame
    );
    if (activeDealer && activeDealer.hasPok && activeDealer.handDetails) {
      // If dealer had Pok, results should have been calculated already
      // This path might not be hit if dealer Pok is handled in startGame
      // But as a safeguard:
      // calculateAndEmitResults(roomId); // Already called if dealer pok
      return;
    }

    // All players done, enable dealer to show results if not already done
    // Or if it's dealer's turn and they are the last one and they choose to stay
    // This means it's time to calculate results.
    const allPlayersDone = room.players
      .filter((p) => !p.disconnectedMidGame || p.hasPlayedThisRound) // Include disconnected who played
      .every(
        (p) =>
          p.hasStayed ||
          p.hasPok ||
          (p.isDealer && p.id === room.currentTurnPlayerId)
      ); // or current turn is dealer

    if (
      allPlayersDone ||
      room.players
        .filter((p) => !p.disconnectedMidGame && !p.isDealer)
        .every((p) => p.hasStayed || p.hasPok)
    ) {
      // Check if the dealer needs to play or if it's time for results
      const dealerPlayer = room.players.find(
        (p) => p.isDealer && !p.disconnectedMidGame
      );
      if (dealerPlayer && !dealerPlayer.hasStayed && !dealerPlayer.hasPok) {
        // It's dealer's turn to decide (if they are in playerActionOrder and last)
        // This case is complex: if dealer is last, their "stay" or "hit" would trigger results.
        // For simplicity, if all others are done, we might prompt dealer or auto-calculate.
        // For now, this state means dealer can press "Show Result" (client-side button)
        // OR if dealer was last in `playerActionOrder` and their turn was skipped due to pok/stay, this path is hit.
        io.to(room.id).emit("message", {
          text: "ผู้เล่นทุกคนดำเนินการเสร็จสิ้น. เจ้ามือสามารถเปิดไพ่ หรือดำเนินการต่อ.",
        });
        if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", true);
      } else {
        // Dealer also done or pok/disconnected
        calculateAndEmitResults(roomId);
      }
    } else {
      if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", true); // Fallback
      io.to(room.id).emit("message", {
        text: "ผู้เล่นทุกคนดำเนินการเสร็จสิ้น. เจ้ามือสามารถเปิดไพ่.",
      });
    }
  }
}

// --- Result Calculation (Preserving User's Core Comparison Logic) ---
function performResultCalculation(room) {
  const activeDealer = room.players.find(
    (p) => p.isDealer && !p.disconnectedMidGame
  );

  if (!activeDealer) {
    console.error(
      `[Server] CRITICAL: Active dealer not found for result calculation in room: ${room.id}`
    );
    io.to(room.id).emit("errorMessage", {
      text: "เกิดข้อผิดพลาด: ไม่พบเจ้ามือ (Active) ขณะคำนวณผล",
    });
    return null;
  }
  if (!activeDealer.handDetails)
    activeDealer.handDetails = getHandRank(
      activeDealer.cardsDealtInRound.length > 0
        ? activeDealer.cardsDealtInRound
        : activeDealer.cards
    ); // Use dealt cards
  if (!activeDealer.handDetails) {
    console.error(
      `[Server] CRITICAL: Failed to get hand details for dealer in room: ${room.id}`
    );
    io.to(room.id).emit("errorMessage", {
      text: "เกิดข้อผิดพลาด: ไม่สามารถคำนวณไพ่เจ้ามือ",
    });
    return null;
  }
  // Ensure dealer's cardsDealtInRound is populated if not already from startGame/hit
  if (
    activeDealer.cardsDealtInRound.length === 0 &&
    activeDealer.cards.length > 0
  ) {
    activeDealer.cardsDealtInRound = [...activeDealer.cards];
  }

  const resultsForClient = [];
  let dealerNetChangeTotal = 0;
  const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

  // Initialize dealer's outcome for this round
  activeDealer.gameOutcomeThisRound = {
    score: activeDealer.handDetails.score,
    handType: activeDealer.handDetails.name,
    comparisonResult: "DEALER",
    amountChange: 0, // Will be accumulated
    cards: [...activeDealer.cardsDealtInRound],
  };

  room.players.forEach((player) => {
    if (player.id === activeDealer.id) return; // Skip dealer for now

    // Ensure handDetails are based on cardsDealtInRound for consistency if player played
    if (
      player.hasPlayedThisRound &&
      (!player.handDetails ||
        player.handDetails.cards.length !== player.cardsDealtInRound.length)
    ) {
      player.handDetails = getHandRank(player.cardsDealtInRound);
    } else if (!player.hasPlayedThisRound && !player.disconnectedMidGame) {
      // Player was active but didn't complete their turn (e.g. game ended by dealer)
      player.handDetails = getHandRank(
        player.cardsDealtInRound.length > 0
          ? player.cardsDealtInRound
          : player.cards
      ); // Calculate from dealt/current cards
    } else if (player.disconnectedMidGame && !player.hasPlayedThisRound) {
      // Player disconnected before playing this round
      player.gameOutcomeThisRound = {
        score: 0,
        handType: "ไม่ได้เล่น (หลุด)",
        comparisonResult: "DISCONNECTED_NO_PLAY",
        amountChange: 0,
        cards: [],
      };
      resultsForClient.push({
        id: player.id,
        name: player.name,
        role: player.role,
        cardsDisplay: "",
        score: 0,
        specialType: "ไม่ได้เล่น (หลุด)",
        outcome: "ไม่ได้เล่น",
        moneyChange: 0,
        balance: player.balance,
        disconnectedMidGame: true,
        gameOutcome: player.gameOutcomeThisRound,
      });
      return; // Skip comparison for this player
    }

    if (!player.handDetails) {
      // Fallback if handDetails still missing (e.g. no cards)
      player.handDetails = {
        name: "ไม่มีไพ่",
        rank: 7,
        score: 0,
        multiplier: 1,
        cards: [],
      };
    }
    // Ensure cardsDealtInRound is populated for players who played
    if (
      player.hasPlayedThisRound &&
      player.cardsDealtInRound.length === 0 &&
      player.cards.length > 0
    ) {
      player.cardsDealtInRound = [...player.cards];
    }

    let outcome = "แพ้"; // Default outcome for player
    let moneyChange = 0;
    const playerHand = player.handDetails;
    const dealerHand = activeDealer.handDetails;

    // --- Start of User's Core Comparison Logic (preserved as much as possible) ---
    if (playerHand.isPok && dealerHand.isPok) {
      if (playerHand.rank < dealerHand.rank) {
        outcome = "ชนะ";
        moneyChange = betAmount * playerHand.multiplier;
      } else if (playerHand.rank > dealerHand.rank) {
        outcome = "แพ้";
        moneyChange = -(betAmount * dealerHand.multiplier);
      } else {
        outcome = "เสมอ";
        moneyChange = 0;
      }
    } else if (dealerHand.isPok) {
      outcome = "แพ้";
      moneyChange = -(betAmount * dealerHand.multiplier);
    } else if (playerHand.isPok) {
      outcome = "ชนะ";
      moneyChange = betAmount * playerHand.multiplier;
    } else if (playerHand.rank < dealerHand.rank) {
      outcome = "ชนะ";
      moneyChange = betAmount * playerHand.multiplier;
    } else if (playerHand.rank > dealerHand.rank) {
      outcome = "แพ้";
      moneyChange = -(betAmount * dealerHand.multiplier);
    } else {
      // Same rank, not Pok
      if (playerHand.rank <= 6) {
        // Special hands
        let playerWinsByTieBreaker = false;
        if (Array.isArray(playerHand.tieBreakerValue)) {
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
          playerHand.tieBreakerValue === dealerHand.tieBreakerValue ||
          (Array.isArray(playerHand.tieBreakerValue) &&
            JSON.stringify(playerHand.tieBreakerValue) ===
              JSON.stringify(dealerHand.tieBreakerValue))
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
        // Rank 7 (Points Hand)
        if (playerHand.score > dealerHand.score) {
          outcome = "ชนะ";
          moneyChange = betAmount * playerHand.multiplier;
        } else if (playerHand.score < dealerHand.score) {
          outcome = "แพ้";
          moneyChange = -(betAmount * dealerHand.multiplier);
        } else {
          outcome = "เสมอ";
          moneyChange = 0;
        }
      }
    }
    // --- End of User's Core Comparison Logic ---

    // Override if player disconnected mid-game AFTER playing, and didn't win
    if (
      player.disconnectedMidGame &&
      player.hasPlayedThisRound &&
      outcome !== "ชนะ"
    ) {
      outcome = "ขาดการเชื่อมต่อ (หลังเล่น)";
      // moneyChange should reflect the outcome determined above if they played
      // If the rule is they forfeit winnings if they disconnect, adjust here.
      // For now, let's assume the calculated moneyChange stands if they played.
      // If strict forfeit: moneyChange = -betAmount;
    } else if (player.disconnectedMidGame && !player.hasPlayedThisRound) {
      // This case is handled above, moneyChange should be 0.
    }

    // Ensure player doesn't lose more than their balance
    if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
      moneyChange = -player.balance;
    }
    player.balance += moneyChange;
    dealerNetChangeTotal -= moneyChange; // dealer gets opposite of player's change

    player.gameOutcomeThisRound = {
      score: playerHand.score,
      handType: playerHand.name,
      comparisonResult: outcome,
      amountChange: moneyChange,
      cards: [...player.cardsDealtInRound],
    };

    resultsForClient.push({
      id: player.id,
      name: player.name,
      role: player.role,
      cardsDisplay: player.cardsDealtInRound.map(getCardDisplay).join(" "), // Use cardsDealtInRound
      score: playerHand.score,
      specialType: playerHand.name,
      outcome: outcome,
      moneyChange: moneyChange,
      balance: player.balance,
      disconnectedMidGame: player.disconnectedMidGame,
      gameOutcome: player.gameOutcomeThisRound,
    });
  });

  activeDealer.balance += dealerNetChangeTotal;
  activeDealer.gameOutcomeThisRound.amountChange = dealerNetChangeTotal; // Final net change for dealer this round

  // Add dealer to resultsForClient for emitting
  resultsForClient.push({
    id: activeDealer.id,
    name: activeDealer.name,
    role: activeDealer.role,
    cardsDisplay: activeDealer.cardsDealtInRound.map(getCardDisplay).join(" "),
    score: activeDealer.handDetails.score,
    specialType: activeDealer.handDetails.name,
    outcome: "เจ้ามือ",
    moneyChange: dealerNetChangeTotal,
    balance: activeDealer.balance,
    disconnectedMidGame: activeDealer.disconnectedMidGame, // Should be false for activeDealer
    gameOutcome: activeDealer.gameOutcomeThisRound,
  });

  // Sort for consistent display order
  return resultsForClient.sort((a, b) => {
    const getRoleOrder = (roleStr) => {
      if (roleStr === "เจ้ามือ") return 0;
      const match = roleStr ? roleStr.match(/ขาที่ (\d+)/) : null;
      if (match) return parseInt(match[1]);
      return Infinity;
    };
    return getRoleOrder(a.role) - getRoleOrder(b.role);
  });
}

function calculateAndEmitResults(roomId) {
  const room = rooms[roomId];
  if (!room) {
    console.log(`[CalcResults] Room ${roomId} not found.`);
    return;
  }

  if (room.resultsCache && room.roundOver) {
    // Check roundOver for cache validity
    io.to(roomId).emit("result", room.resultsCache);
    io.to(roomId).emit("playersData", getRoomPlayerData(room));
    if (room.dealerId) {
      const dealerSocket = io.sockets.sockets.get(room.dealerId);
      if (dealerSocket) dealerSocket.emit("enableShowResult", false);
    }
    return;
  }

  clearTurnTimer(room);
  const roundResultsPayload = performResultCalculation(room);

  if (roundResultsPayload) {
    room.resultsCache = roundResultsPayload;
    // Emitting structured payload containing individual outcomes and cards
    io.to(roomId).emit("roundResults", roundResultsPayload); // Changed event name for clarity
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Balances are updated by performResultCalculation
  } else {
    io.to(roomId).emit("errorMessage", {
      text: "เกิดข้อผิดพลาดในการคำนวณผลลัพธ์ของรอบ",
    });
  }

  room.gameStarted = false; // Current round play is over
  room.roundOver = true; // Explicitly mark round as over
  room.currentTurnPlayerId = null;
  io.to(roomId).emit("currentTurn", {
    id: null,
    name: "",
    role: "",
    timeLeft: 0,
  });

  if (room.dealerId) {
    const dealerSocket = io.sockets.sockets.get(room.dealerId);
    if (dealerSocket) dealerSocket.emit("enableShowResult", false);
  }
  console.log(`[Server] Round ended for room ${roomId}. Results emitted.`);
}

// --- Socket.IO Event Handlers ---
io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  socket.on("createRoom", ({ playerName, initialBalance }) => {
    try {
      if (!playerName || playerName.trim() === "")
        return socket.emit("errorMessage", { text: "กรุณาใส่ชื่อผู้เล่น" });
      const bal = parseInt(initialBalance);
      if (isNaN(bal) || bal < 10 || (bal % 10 !== 0 && bal % 5 !== 0))
        return socket.emit("errorMessage", {
          text: "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 10, ลงท้าย 0 หรือ 5)",
        });

      const roomId = uuidv4().slice(0, 5).toUpperCase();
      // Pass socket.id to initializePlayer to store it
      const dealer = initializePlayer(
        socket.id,
        playerName.trim(),
        bal,
        true,
        socket.id
      );

      rooms[roomId] = {
        id: roomId,
        dealerId: socket.id, // Store dealer's current socket.id
        dealerName: dealer.name,
        players: [dealer],
        betAmount: DEFAULT_BET_AMOUNT,
        isLocked: false,
        gameStarted: false,
        roundOver: false, // <--- Initialize
        summarySent: false, // <--- Initialize
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
        dealerName: dealer.name,
        betAmount: rooms[roomId].betAmount,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(rooms[roomId]));
      io.to(roomId).emit("message", {
        text: `${dealer.role} (${dealer.name}) ได้สร้างห้อง.`,
      });
      console.log(
        `[Server] Room ${roomId} created by ${dealer.name} (${socket.id})`
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

      const player = initializePlayer(
        socket.id,
        playerName.trim(),
        bal,
        false,
        socket.id
      );
      room.players.push(player);
      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId: room.id,
        dealerName: room.dealerName,
        betAmount: room.betAmount,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: `${player.name} ได้เข้าร่วมห้อง.`,
      });
      console.log(
        `[Server] ${player.name} (${socket.id}) joined room ${roomId}`
      );
    } catch (error) {
      console.error("[Server] Error joining room:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการเข้าร่วมห้อง" });
    }
  });

  socket.on("startGame", (roomIdInput) => {
    // Changed param name for clarity
    const roomId =
      typeof roomIdInput === "object" ? roomIdInput.roomId : roomIdInput; // Handle if object is passed
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
      if (socket.id !== room.dealerId)
        return socket.emit("errorMessage", { text: "คุณไม่ใช่เจ้ามือ" });
      // Allow starting new round if previous round is over or summary sent
      if (room.gameStarted && !room.roundOver && !room.summarySent)
        return socket.emit("errorMessage", { text: "เกมยังไม่จบ" });

      if (room.betAmount <= 0)
        return socket.emit("errorMessage", { text: "กรุณาตั้งค่าเดิมพัน" });

      const activePlayersForStart = room.players.filter(
        (p) => !p.disconnectedMidGame && p.socketId
      ); // Must have active socketId
      if (activePlayersForStart.length < 2)
        return socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 2 คน (ที่ยังเชื่อมต่ออยู่) เพื่อเริ่มเกม",
        });

      for (const player of activePlayersForStart) {
        if (!player.isDealer && player.balance < room.betAmount) {
          return io
            .to(roomId)
            .emit("errorMessage", {
              text: `ผู้เล่น ${player.name} มีเงินไม่พอ (ต้องการ ${room.betAmount}, มี ${player.balance})`,
            });
        }
      }

      room.gameStarted = true;
      room.roundOver = false; // <--- Round starts
      room.summarySent = false; // <--- New game session potentially, summary not sent for this
      room.gameRound++;
      room.resultsCache = null;
      room.deck = shuffleDeck(createDeck());
      io.to(roomId).emit("enableShowResult", false);

      const dealOrderPlayers = [];
      const nonDealersForDeal = activePlayersForStart.filter(
        (p) => !p.isDealer
      );
      const dealerForDeal = activePlayersForStart.find((p) => p.isDealer);
      dealOrderPlayers.push(...nonDealersForDeal);
      if (dealerForDeal) dealOrderPlayers.push(dealerForDeal);

      dealOrderPlayers.forEach((player) => {
        player.cards = [];
        player.hasStayed = false;
        player.actionTakenThisTurn = false;
        player.cardsDealtInRound = [];
        player.gameOutcomeThisRound = null;
        player.hasPlayedThisRound = false;
        player.hasPok = false; // Reset Pok status
        // If a player was disconnected and rejoined, reset their disconnectedMidGame status
        if (player.socketId) player.disconnectedMidGame = false;
      });

      for (let i = 0; i < 2; i++) {
        // Deal 2 cards
        dealOrderPlayers.forEach((player) => {
          if (room.deck.length > 0) player.cards.push(room.deck.pop());
        });
      }

      activePlayersForStart.forEach((player) => {
        player.cardsDealtInRound = [...player.cards]; // Store dealt cards
        if (player.cards.length === 2) {
          player.handDetails = getHandRank(player.cards);
          if (player.handDetails) player.hasPok = player.handDetails.isPok;
        } else {
          player.handDetails = getHandRank([]);
          player.hasPok = false;
        }
        if (player.socketId)
          io.to(player.socketId).emit("yourCards", player.cards);
      });

      io.to(roomId).emit("gameStarted", { betAmount: room.betAmount });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่ม! เดิมพัน: ${room.betAmount}`,
      });

      if (
        dealerForDeal &&
        dealerForDeal.handDetails &&
        dealerForDeal.handDetails.isPok
      ) {
        io.to(roomId).emit("message", {
          text: `${dealerForDeal.role} (${dealerForDeal.name}) ได้ ${dealerForDeal.handDetails.name}! เปิดไพ่ทันที!`,
        });
        activePlayersForStart.forEach((p) => {
          if (!p.isDealer) {
            p.hasStayed = true;
            p.actionTakenThisTurn = true;
            p.hasPlayedThisRound = true;
          }
        });
        dealerForDeal.hasPlayedThisRound = true;
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        calculateAndEmitResults(roomId);
        return;
      }

      let playerPokMessageSent = false;
      activePlayersForStart.forEach((player) => {
        if (
          !player.isDealer &&
          player.handDetails &&
          player.handDetails.isPok
        ) {
          player.hasStayed = true;
          player.actionTakenThisTurn = true;
          player.hasPlayedThisRound = true;
          io.to(roomId).emit("message", {
            text: `${player.role || player.name} ได้ ${
              player.handDetails.name
            }! (ข้ามตา)`,
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
      if (playerPokMessageSent)
        io.to(roomId).emit("playersData", getRoomPlayerData(room));

      room.playerActionOrder = dealOrderPlayers.map((p) => p.id); // Use the already filtered and ordered list
      room.currentPlayerIndexInOrder = -1;
      advanceTurn(roomId);
    } catch (error) {
      console.error("[Server] Error starting game:", error);
      const targetRoomId =
        typeof roomIdInput === "object" ? roomIdInput.roomId : roomIdInput;
      if (rooms[targetRoomId] && socket.id) {
        io.to(socket.id).emit("errorMessage", {
          text: "เกิดข้อผิดพลาดในการเริ่มเกมบนเซิร์ฟเวอร์",
        });
      } else {
        console.error(
          "[Server] Undetermined socket/room for startGame error message."
        );
      }
    }
  });

  socket.on("drawCard", ({ roomId }) => {
    // Assume roomId is passed in object
    try {
      const room = rooms[roomId];
      if (!room || !room.gameStarted || room.roundOver) return;
      const player = room.players.find((p) => p.socketId === socket.id); // Find by current socketId
      if (
        !player ||
        player.id !== room.currentTurnPlayerId ||
        player.hasStayed ||
        player.disconnectedMidGame
      )
        return;
      if (player.cards.length >= 3)
        return socket.emit("errorMessage", {
          text: "มีไพ่ 3 ใบแล้ว, ไม่สามารถจั่วเพิ่ม",
        });

      clearTurnTimer(room);
      if (room.deck.length > 0) {
        const newCard = room.deck.pop();
        player.cards.push(newCard);
        player.cardsDealtInRound.push(newCard); // <--- Record drawn card
        player.handDetails = getHandRank(player.cards);
        player.actionTakenThisTurn = true;

        // Check for bust (Assuming PokDeng doesn't typically bust on draw, but as an example)
        // For PokDeng, usually just drawing to 3 cards ends the turn.
        if (
          player.cards.length === 3 ||
          (player.handDetails && player.handDetails.score > 21)
        ) {
          // Example bust condition
          player.hasStayed = true; // Turn ends
          player.hasPlayedThisRound = true; // Player has completed their play

          if (player.handDetails && player.handDetails.score > 21) {
            // Actual Bust
            const betAmount = room.betAmount;
            player.balance -= betAmount;
            const dealer = room.players.find(
              (p) => p.isDealer && !p.disconnectedMidGame
            );
            if (dealer) dealer.balance += betAmount;
            player.gameOutcomeThisRound = {
              score: player.handDetails.score,
              handType: player.handDetails.name || "Bust",
              comparisonResult: "LOSE_BUST",
              amountChange: -betAmount,
              cards: [...player.cardsDealtInRound],
            };
            io.to(roomId).emit("message", {
              text: `${player.name} ไพ่แตก (Bust)!`,
            });
          }
        }
        if (player.socketId)
          io.to(player.socketId).emit("yourCards", player.cards);
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        io.to(roomId).emit("message", {
          text: `${player.role || player.name} จั่วไพ่.`,
        });

        if (player.hasStayed) {
          advanceTurn(roomId);
        } else {
          startPlayerTurnTimer(room, player.id); // Restart timer if turn not over
        }
      } else {
        socket.emit("errorMessage", { text: "ไพ่ในกองหมดแล้ว!" });
      }
    } catch (error) {
      console.error("[Server] Error drawing card:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการจั่วไพ่" });
    }
  });

  socket.on("stay", ({ roomId }) => {
    // Assume roomId is passed in object
    try {
      const room = rooms[roomId];
      if (!room || !room.gameStarted || room.roundOver) return;
      const player = room.players.find((p) => p.socketId === socket.id); // Find by current socketId
      if (
        !player ||
        player.id !== room.currentTurnPlayerId ||
        player.hasStayed ||
        player.disconnectedMidGame
      )
        return;

      player.hasStayed = true;
      player.actionTakenThisTurn = true;
      player.hasPlayedThisRound = true; // <--- Player has completed their play

      // Recalculate handDetails based on final cards in cardsDealtInRound if it wasn't set before
      if (
        !player.handDetails ||
        player.cardsDealtInRound.length !== player.handDetails.cards.length
      ) {
        player.handDetails = getHandRank(player.cardsDealtInRound);
      }

      io.to(roomId).emit("message", {
        text: `${player.role || player.name} ขออยู่.`,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      clearTurnTimer(room); // Clear timer as action is taken
      advanceTurn(roomId);
    } catch (error) {
      console.error("[Server] Error staying:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการ 'อยู่'" });
    }
  });

  socket.on("showResult", ({ roomId }) => {
    // Assume roomId is passed in object
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
      if (socket.id !== room.dealerId)
        return socket.emit("errorMessage", { text: "เฉพาะเจ้ามือเท่านั้น" });
      if (!room.gameStarted && !room.roundOver)
        return socket.emit("errorMessage", {
          text: "เกมยังไม่เริ่ม หรือรอบยังไม่จบ",
        });

      // Ensure all active players (or those who played and disconnected) have 'hasStayed' or 'hasPok'
      // or if it's dealer's turn, the dealer also needs to have 'stayed'
      const dealerPlayer = room.players.find((p) => p.id === room.dealerId);
      if (
        dealerPlayer &&
        room.currentTurnPlayerId === room.dealerId &&
        !dealerPlayer.hasStayed &&
        !dealerPlayer.hasPok
      ) {
        dealerPlayer.hasStayed = true; // Dealer chooses to stay by showing results
        dealerPlayer.actionTakenThisTurn = true;
        dealerPlayer.hasPlayedThisRound = true;
        // Update handDetails for dealer if they stayed now
        if (
          !dealerPlayer.handDetails ||
          dealerPlayer.cardsDealtInRound.length !==
            dealerPlayer.handDetails.cards.length
        ) {
          dealerPlayer.handDetails = getHandRank(
            dealerPlayer.cardsDealtInRound
          );
        }
      }

      const allPlayersDecided = room.players
        .filter((p) => !p.disconnectedMidGame || p.hasPlayedThisRound) // Consider players who played then DC'd
        .every((p) => p.hasStayed || p.hasPok || p.isDealer); // Dealer is implicitly "stayed" when they call showResult

      if (!allPlayersDecided && !room.roundOver) {
        // If round isn't marked as over by other means
        // Check if only dealer is left to act
        const pendingPlayers = room.players.filter(
          (p) =>
            !p.isDealer &&
            (!p.disconnectedMidGame || p.hasPlayedThisRound) &&
            !p.hasStayed &&
            !p.hasPok
        );
        if (pendingPlayers.length > 0) {
          return socket.emit("errorMessage", {
            text: `ยังมีผู้เล่น (${pendingPlayers
              .map((p) => p.name)
              .join(", ")}) ยังดำเนินการไม่ครบ`,
          });
        }
      }
      // If all checks pass, or if round is already marked over (e.g. by advanceTurn), calculate
      calculateAndEmitResults(roomId);
    } catch (error) {
      console.error("[Server] Error showing results:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการแสดงผล" });
    }
  });

  socket.on("endGame", ({ roomId }) => {
    try {
      const room = rooms[roomId];
      if (!room) return socket.emit("errorMessage", { text: "ไม่พบห้อง" });
      if (socket.id !== room.dealerId)
        return socket.emit("errorMessage", {
          text: "เฉพาะเจ้ามือเท่านั้นที่สามารถจบเกมได้",
        });

      const gameSummary = room.players.map((player) => {
        const netChange = player.balance - player.initialBalance;
        return {
          id: player.id,
          name: player.name,
          role: player.role,
          initialBalance: player.initialBalance,
          finalBalance: player.balance,
          netChange: netChange,
          disconnectedMidGame: player.disconnectedMidGame,
          isDealer: player.id === room.dealerId,
        };
      });

      room.summarySent = true;
      room.gameStarted = false;
      room.roundOver = true;

      io.to(roomId).emit("showGameSummary", gameSummary);
      const dealer = room.players.find((p) => p.id === socket.id);
      io.to(roomId).emit("message", {
        text: `--- เกมจบลงแล้ว เจ้ามือ (${
          dealer ? dealer.name : room.dealerName
        }) สรุปยอด ---`,
        type: "system",
      });
      console.log(
        `[Server] Game session ended in room ${roomId} by dealer ${socket.id}. Summary sent.`
      );
    } catch (error) {
      console.error(`[Server] Error ending game in room ${roomId}:`, error);
      socket.emit("errorMessage", {
        text: "เกิดข้อผิดพลาดในการจบเกมและสรุปยอด",
      });
    }
  });

  socket.on("resetGame", ({ roomId }) => {
    // For dealer to reset before a new game round if stuck, NOT for mid-game reset.
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId)
        return socket.emit("errorMessage", { text: "เฉพาะเจ้ามือ" });
      if (room.gameStarted && !room.roundOver && !room.summarySent)
        return socket.emit("errorMessage", {
          text: "ไม่สามารถรีเซ็ตระหว่างเกม",
        });

      // Reset general room state for a new game (balances are kept)
      room.deck = [];
      room.currentTurnPlayerId = null;
      room.currentPlayerIndexInOrder = -1;
      room.resultsCache = null;
      room.gameStarted = false;
      room.roundOver = false;
      room.summarySent = false; // New session effectively
      room.gameRound = 0; // Or keep incrementing, depends on desired behavior

      // Reset player states for a new game session (cards, outcomes, etc.)
      room.players.forEach((p) => {
        p.cards = [];
        p.cardsDealtInRound = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.actionTakenThisTurn = false;
        p.hasPlayedThisRound = false;
        p.gameOutcomeThisRound = null;
        p.hasPok = false;
        // p.disconnectedMidGame = false; // Keep this as is unless they reconnect
        // p.initialBalance = p.balance; // Option: current balance becomes new initial for next session
      });

      io.to(roomId).emit("gameReset"); // Client should reset its UI
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: "เจ้ามือได้รีเซ็ตห้องและสำรับไพ่ใหม่. สามารถเริ่มเกมใหม่ได้.",
      });
      if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", false);
    } catch (error) {
      console.error("[Server] Error resetting game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการรีเซ็ตเกม" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[Server] User disconnected: ${socket.id}`);
    let roomIdPlayerWasIn = null;
    let playerWhoLeft = null;
    let roomPlayerWasIn = null;
    let playerIndexInRoom = -1;

    for (const id in rooms) {
      const room = rooms[id];
      // Find player by their current socketId
      const pIndex = room.players.findIndex((p) => p.socketId === socket.id);
      if (pIndex !== -1) {
        roomIdPlayerWasIn = id;
        roomPlayerWasIn = room;
        playerWhoLeft = room.players[pIndex];
        playerIndexInRoom = pIndex;
        break;
      }
    }

    if (roomPlayerWasIn && playerWhoLeft) {
      io.to(roomIdPlayerWasIn).emit("playerLeft", {
        name: playerWhoLeft.name,
        message: "ได้ออกจากห้องแล้ว.",
      });
      console.log(
        `[Server] ${playerWhoLeft.role} (${playerWhoLeft.name}, id: ${playerWhoLeft.id}, socket: ${socket.id}) disconnected from room ${roomIdPlayerWasIn}.`
      );

      if (
        roomPlayerWasIn.gameStarted &&
        !roomPlayerWasIn.summarySent &&
        !playerWhoLeft.disconnectedMidGame
      ) {
        playerWhoLeft.disconnectedMidGame = true;
        // playerWhoLeft.hasStayed = true; // Mark as stayed to advance turn if it was their turn
        // playerWhoLeft.actionTakenThisTurn = true;
        // playerWhoLeft.hasPlayedThisRound = playerWhoLeft.hasPlayedThisRound || false; // Keep if already played

        console.log(
          `[Server] Player ${playerWhoLeft.name} marked as disconnectedMidGame.`
        );

        // If it was the disconnected player's turn, try to advance it.
        // But only if they haven't already effectively "stayed" by disconnecting.
        // advanceTurn logic will skip them if disconnectedMidGame is true.
        if (roomPlayerWasIn.currentTurnPlayerId === playerWhoLeft.id) {
          io.to(roomIdPlayerWasIn).emit("message", {
            text: `${playerWhoLeft.name} หลุดการเชื่อมต่อระหว่างตาของตนเอง.`,
          });
          clearTurnTimer(roomPlayerWasIn);
          advanceTurn(roomIdPlayerWasIn);
        }
      } else if (!roomPlayerWasIn.gameStarted || roomPlayerWasIn.summarySent) {
        // Game not started, or summary already sent, so remove player from list
        roomPlayerWasIn.players.splice(playerIndexInRoom, 1);
        console.log(
          `[Server] Player ${playerWhoLeft.name} removed from room ${roomIdPlayerWasIn}.`
        );
      }
      // Do not clear socketId here if you plan for reconnect functionality based on player.id
      // playerWhoLeft.socketId = null; // Or clear it if no reconnect planned for THIS socket

      const activePlayersWithSockets = roomPlayerWasIn.players.filter(
        (p) => p.socketId && !p.disconnectedMidGame
      );

      if (activePlayersWithSockets.length === 0) {
        // If no players with active sockets are left
        if (
          !roomPlayerWasIn.gameStarted ||
          roomPlayerWasIn.summarySent ||
          roomPlayerWasIn.players.every((p) => p.disconnectedMidGame)
        ) {
          // And game is not in a state that needs to preserve disconnected players for results
          console.log(
            `[Server] Room ${roomIdPlayerWasIn} has no active players and game is over/not started/all DC. Deleting room.`
          );
          clearTurnTimer(roomPlayerWasIn);
          delete rooms[roomIdPlayerWasIn];
          return; // Exit, room deleted
        } else {
          console.log(
            `[Server] Room ${roomIdPlayerWasIn} has no active players, but game was in progress and not summarized. Keeping room state.`
          );
        }
      } else {
        // Still active players or disconnected players whose data is needed
        // Check for dealer change if the disconnected player was the dealer
        if (
          playerWhoLeft.isDealer &&
          playerWhoLeft.socketId === roomPlayerWasIn.dealerId
        ) {
          // Check if it was the CURRENT dealer socket
          const newDealerCandidate = activePlayersWithSockets.find(
            (p) => p.id !== playerWhoLeft.id
          ); // Find another active player
          if (newDealerCandidate) {
            playerWhoLeft.isDealer = false; // Old dealer is no longer dealer

            newDealerCandidate.isDealer = true;
            newDealerCandidate.baseRole = "เจ้ามือ";
            newDealerCandidate.role = "เจ้ามือ";
            roomPlayerWasIn.dealerId = newDealerCandidate.socketId; // New dealer's current socketId
            roomPlayerWasIn.dealerName = newDealerCandidate.name;
            io.to(roomIdPlayerWasIn).emit("message", {
              text: `${newDealerCandidate.name} เป็นเจ้ามือใหม่.`,
            });
            io.to(roomIdPlayerWasIn).emit("dealerChanged", {
              dealerId: newDealerCandidate.id,
              dealerName: newDealerCandidate.name,
            }); // Inform client about new dealer by player ID
          } else {
            // No other active player to become dealer.
            // If all remaining are disconnectedMidGame, the room might eventually be cleaned up or game ends.
            io.to(roomIdPlayerWasIn).emit("message", {
              text: "เจ้ามือหลุด และไม่สามารถหาเจ้ามือใหม่จากผู้เล่นที่ยังเชื่อมต่อได้.",
            });
            // Consider auto-ending the game or other logic here if no dealer possible
          }
        }
      }
      // Always emit updated player data if room still exists
      if (rooms[roomIdPlayerWasIn]) {
        io.to(roomIdPlayerWasIn).emit(
          "playersData",
          getRoomPlayerData(roomPlayerWasIn)
        );
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
