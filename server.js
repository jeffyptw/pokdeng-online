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
const playerDisconnectTimers = {};

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
    }
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
      if (score === 9) {
        handDetails.name = "9 หลัง";
      } else if (score === 8) {
        handDetails.name = "8 หลัง";
      } else {
        handDetails.name = `${score} แต้ม`;
      }
      handDetails.multiplier = 1;
      handDetails.isDeng = false;
      handDetails.dengType = null;
    }
  } else if (numCards === 2) {
    const isSameSuitTwoCards = cardSuits[0] === cardSuits[1];
    const isPairTwoCards = cardValues[0] === cardValues[1];
    if (isSameSuitTwoCards) {
      handDetails.name = `${score} สองเด้ง`;
      handDetails.multiplier = 2;
      handDetails.isDeng = true;
      handDetails.dengType = "สองเด้ง";
    } else if (isPairTwoCards) {
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
    baseRole: isDealer ? "เจ้ามือ" : "ขา", // Store base role
    role: isDealer ? "เจ้ามือ" : "ขา",
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
    // Update the player's role in the main players array if it changed
    // This helps keep the .role property consistent.
    const playerInRoom = room.players.find((rp) => rp.id === p.id);
    if (playerInRoom) playerInRoom.role = displayRole;

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
  const dealer = room.players.find((p) => p.isDealer && !p.disconnectedMidGame);
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
      if (playerHand.rank <= 6) {
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

    // This disconnectedMidGame check was slightly problematic here.
    // If a player disconnected, their moneyChange should be based on their hand if the game continues.
    // The penalty for disconnection should be managed at the point of disconnection or as a fixed loss if they cannot "play".
    // For now, if they disconnected, they already `hasStayed`, so their hand is fixed.
    // The original code had:
    // if (player.disconnectedMidGame && outcome !== "ชนะ") {
    //   outcome = "ขาดการเชื่อมต่อ";
    //   moneyChange = player.balance >= betAmount ? -betAmount : -player.balance;
    // }
    // This logic is tricky. If their hand *would* have won, but they disconnected, do they still win?
    // Current game logic: if disconnectedMidGame, they are 'stayed'. Their hand is evaluated.
    // Let's keep the evaluation as is, disconnection means their hand stands.

    if (moneyChange < 0 && Math.abs(moneyChange) > player.balance) {
      moneyChange = -player.balance;
    }
    player.balance += moneyChange;
    dealerNetChangeTotal -= moneyChange;

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

  // Removed result caching from here to ensure fresh calculation
  // if (room.resultsCache) { ... }

  clearTurnTimer(room);
  const roundResults = performResultCalculation(room);

  if (roundResults) {
    room.resultsCache = roundResults; // Cache results for this specific round if needed by other logic

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
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Send updated player data
  } else {
    io.to(roomId).emit("errorMessage", {
      text: "เกิดข้อผิดพลาดในการคำนวณผลลัพธ์ของรอบ",
    });
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
  if (
    !room ||
    !player ||
    player.hasStayed ||
    player.disconnectedMidGame ||
    player.hasPok
  ) {
    clearTurnTimer(room);
    return;
  }

  clearTurnTimer(room);
  let timeLeft = DEFAULT_TURN_DURATION;
  player.actionTakenThisTurn = false;

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
        text: `${player.role || player.name} หมดเวลา, หมอบอัตโนมัติ.`,
      });
      player.hasStayed = true;
      player.actionTakenThisTurn = true;
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
    currentPlayer.disconnectedMidGame
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
  clearTurnTimer(room);

  if (!room.gameStarted && room.resultsCache) {
    io.to(room.dealerId).emit("enableShowResult", false);
    return;
  }
  if (!room.gameStarted) {
    return;
  }

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

    const dealer = room.players.find((p) => p.isDealer);
    if (
      dealer && // Check if dealer exists
      !dealer.disconnectedMidGame && // and is not disconnected
      dealer.handDetails &&
      (dealer.handDetails.rank === 1 || dealer.handDetails.rank === 2) && // Dealer has Pok
      !room.players.filter(
        (p) =>
          !p.isDealer && !p.disconnectedMidGame && !p.hasStayed && !p.hasPok
      ).length // All active players have acted
    ) {
      // This condition might be too restrictive or needs adjustment.
      // If dealer has Pok, it should have been handled at startGame or when dealer gets cards.
      // This part might be for cases where dealer draws to Pok.
      // The original logic here was to auto-show results if dealer got Pok.
      // Let's ensure this doesn't prematurely end if other players haven't acted.
      // The key is: IF dealer has Pok, game might end sooner.
      // For now, if all players (non-dealers) have stayed or Pok-ed, and dealer has Pok, then calculate.
      // This is now more about enabling showResult or auto-showing if dealer Poks *after* drawing.
    }

    // If all players have acted (stayed, pok, or disconnected)
    const allPlayersActed = room.players
      .filter((p) => !p.disconnectedMidGame) // Consider only active or mid-game disconnected players
      .every((p) => p.hasStayed || p.hasPok || p.isDealer); // Dealer's turn is last usually

    if (
      allPlayersActed ||
      room.players.filter(
        (p) =>
          !p.isDealer && !p.disconnectedMidGame && !p.hasStayed && !p.hasPok
      ).length === 0
    ) {
      if (room.dealerId) io.to(room.dealerId).emit("enableShowResult", true);
      io.to(roomId).emit("message", {
        text: "ผู้เล่นทุกคนดำเนินการเสร็จสิ้น เจ้ามือสามารถเปิดไพ่ได้",
      });
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
      const dealer = initializePlayer(socket.id, playerName, bal, true);

      rooms[roomId] = {
        id: roomId,
        dealerId: socket.id,
        dealerName: playerName,
        players: [dealer],
        allPlayersEver: [], // <<< MODIFIED: Initialize allPlayersEver
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

      // Add dealer to allPlayersEver
      rooms[roomId].allPlayersEver.push({
        id: dealer.id,
        name: dealer.name,
        initialBalance: dealer.initialBalance,
        currentBalance: dealer.balance,
        baseRole: dealer.baseRole,
        stillInRoom: true,
        // role: dealer.role // role can be dynamic, baseRole is fixed
      });

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

  // server.js - ในส่วน io.on('connection', (socket) => { ... })

  socket.on("joinRoom", (data) => {
    const { roomId, playerName, initialBalance } = data;
    let room = rooms[roomId]; // ใช้ let เพราะอาจจะมีการสร้างห้องใหม่ถ้าห้องเดิมหายไป

    if (!room) {
      // อาจจะเพิ่มเงื่อนไขว่าถ้าเคยมีห้องนี้แล้วผู้เล่นคนสุดท้ายหลุดไปแล้วห้องถูกลบ
      // ผู้เล่นคนแรกที่เข้ามาใหม่จะเป็นการสร้างห้องใหม่ไปเลยก็ได้
      // หรือจะแจ้งว่าห้องไม่พบเหมือนเดิมก็ได้ครับ
      socket.emit("errorMessage", { text: `ห้อง ${roomId} ไม่พบ!` });
      return;
    }

    // --- ส่วนจัดการการ Reconnect ---
    // พยายามหาผู้เล่นที่อาจจะหลุดไปแล้วใช้ชื่อเดียวกัน
    // นี่เป็นวิธีแบบง่าย อาจจะไม่สมบูรณ์ 100% ถ้ามีคนชื่อซ้ำกันมากๆ
    // วิธีที่ดีกว่าคือใช้ session ID ที่ client เก็บไว้แล้วส่งมาด้วย
    let reconnectedPlayer = null;
    let oldSocketIdToClearTimer = null;

    for (const p of room.players) {
      // เช็คว่ามีผู้เล่นชื่อนี้ และมี timer ค้างอยู่หรือไม่ (หมายถึงเพิ่งหลุดไป)
      if (p.name === playerName && playerDisconnectTimers[p.id]) {
        reconnectedPlayer = p;
        oldSocketIdToClearTimer = p.id;
        break;
      }
    }

    if (reconnectedPlayer && oldSocketIdToClearTimer) {
      console.log(
        `[Server] Player ${playerName} (${oldSocketIdToClearTimer}) is reconnecting to room ${roomId} with new socket ${socket.id}.`
      );
      clearTimeout(playerDisconnectTimers[oldSocketIdToClearTimer]); // ยกเลิก timer ที่จะเตะเขาออก
      delete playerDisconnectTimers[oldSocketIdToClearTimer]; // ลบออกจากรายการที่จดไว้

      // อัปเดต socket.id ของผู้เล่นคนนั้นเป็นอันใหม่
      reconnectedPlayer.id = socket.id;
      // reconnectedPlayer.status = "connected"; // ถ้ามีการใช้ status

      // ไม่ต้องอัปเดต balance จาก initialBalance เพราะเขากลับมาด้วย balance เดิม
      console.log(
        `[Server] ${playerName} reconnected. Balance remains ${reconnectedPlayer.balance}.`
      );

      socket.join(roomId); // ให้ socket ใหม่นี้ join room ID บน socket.io ด้วย
      socket.emit("joinedRoom", {
        roomId,
        dealerName: room.players.find((p) => p.isDealer)?.name || "N/A",
        betAmount: room.betAmount,
      });
      socket.emit("yourCards", reconnectedPlayer.cards); // ส่งไพ่ปัจจุบัน (ถ้ามี)
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดตข้อมูลผู้เล่นให้ทุกคน
      io.to(roomId).emit("message", {
        text: `${playerName} กลับเข้าสู่ห้องแล้ว!`,
      });
      return; // ออกจากการทำงานของ joinRoom เพราะจัดการผู้เล่นที่กลับมาแล้ว
    }
    // --- จบส่วนจัดการการ Reconnect ---

    // โค้ดเดิมสำหรับการ Join ของผู้เล่นใหม่ (ถ้าไม่ใช่การ Reconnect)
    if (room.gameStarted) {
      socket.emit("errorMessage", {
        text: "เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้",
      });
      return;
    }
    if (room.locked) {
      socket.emit("errorMessage", { text: "ห้องถูกล็อค ไม่สามารถเข้าร่วมได้" });
      return;
    }
    if (room.players.length >= 10) {
      // สมมติว่าจำกัดผู้เล่น 10 คน
      socket.emit("errorMessage", {
        text: "ห้องเต็มแล้ว ไม่สามารถเข้าร่วมได้",
      });
      return;
    }
    // ตรวจสอบว่ามีคนชื่อซ้ำในห้องหรือไม่ (ถ้าไม่ใช่การ reconnect)
    if (room.players.some((p) => p.name === playerName)) {
      socket.emit("errorMessage", {
        text: `มีผู้เล่นชื่อ "${playerName}" อยู่ในห้องแล้ว กรุณาใช้ชื่ออื่น`,
      });
      return;
    }

    const newPlayer = {
      id: socket.id,
      name: playerName,
      balance: parseInt(initialBalance),
      initialBalance: parseInt(initialBalance),
      cards: [],
      score: 0,
      isDealer: room.players.length === 0, // คนแรกที่เข้าห้อง (ถ้าห้องว่าง) จะเป็นเจ้ามือ
      hasStayed: false,
      // role จะถูกกำหนดใน getRoomPlayerData หรือตอนเริ่มเกม
    };
    if (newPlayer.isDealer) {
      newPlayer.role = "เจ้ามือ";
    } else {
      // หา role ขาไพ่ที่ยังไม่มีใครใช้
      let playerNumber = 1;
      while (
        room.players.some(
          (p) => p.role === `ขาไพ่ ${playerNumber}` && !p.isDealer
        )
      ) {
        playerNumber++;
      }
      newPlayer.role = `ขาไพ่ ${playerNumber}`;
    }

    room.players.push(newPlayer);
    socket.join(roomId); // ให้ socket นี้ join room ID บน socket.io ด้วย

    console.log(
      `[Server] New player ${newPlayer.name} (${socket.id}) joined room ${roomId}. Role: ${newPlayer.role}`
    );

    socket.emit("joinedRoom", {
      roomId,
      dealerName: room.players.find((p) => p.isDealer)?.name || "N/A",
      betAmount: room.betAmount,
      // playerRole: newPlayer.role // ส่ง role ให้ client โดยตรงเลยก็ได้
    });
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // อัปเดตข้อมูลผู้เล่นให้ทุกคน
    io.to(roomId).emit("message", {
      text: `${newPlayer.name} เข้าร่วมห้องแล้ว (${newPlayer.role})`,
    });
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
          text: "ต้องมีขาไพ่อย่างน้อย 2 คน (รวมเจ้ามือ)",
        });

      for (const player of room.players) {
        if (
          !player.isDealer &&
          !player.disconnectedMidGame &&
          player.balance < room.betAmount
        ) {
          return io.to(roomId).emit("errorMessage", {
            // Changed to io.to(roomId)
            text: `ขาไพ่ ${player.name} มีเงินไม่พอ (ต้องมี ${room.betAmount})`,
          });
        }
      }

      room.gameStarted = true;
      room.gameRound++;
      room.resultsCache = null; // Clear previous round's results cache
      room.deck = shuffleDeck(createDeck());
      io.to(roomId).emit("enableShowResult", false); // Disable show result button

      // Reset player states for the new round for players in room.players
      room.players.forEach((player) => {
        if (!player.disconnectedMidGame) {
          // Only reset active players
          player.cards = [];
          player.handDetails = null;
          player.hasStayed = false;
          player.actionTakenThisTurn = false;
          player.hasPok = false;
        }
      });

      // Deal cards to non-disconnected players
      const playersToDeal = room.players.filter((p) => !p.disconnectedMidGame);

      playersToDeal.forEach((player) => {
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
      });
      playersToDeal.forEach((player) => {
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
      });

      playersToDeal.forEach((player) => {
        if (player.cards.length === 2) {
          player.handDetails = getHandRank(player.cards);
          if (player.handDetails) {
            player.hasPok = player.handDetails.isPok;
          }
        } else {
          player.handDetails = getHandRank([]); // Should not happen if dealt 2 cards
          player.hasPok = false;
        }
        io.to(player.id).emit("yourCards", player.cards);
      });

      io.to(roomId).emit("gameStarted", {
        betAmount: room.betAmount,
        gameRound: room.gameRound,
      });
      const currentPlayersData = getRoomPlayerData(room); // Get updated roles
      io.to(roomId).emit("playersData", currentPlayersData);
      io.to(roomId).emit("message", {
        text: `เกมรอบที่ ${room.gameRound} เริ่ม! เดิมพัน: ${room.betAmount}`,
      });

      const dealer = room.players.find(
        (p) => p.isDealer && !p.disconnectedMidGame
      );
      if (dealer && dealer.handDetails && dealer.handDetails.isPok) {
        io.to(roomId).emit("message", {
          text: `${dealer.role} (${dealer.name}) ได้ ${dealer.handDetails.name}! เปิดไพ่ทันที!`,
        });
        room.players.forEach((p) => {
          if (!p.isDealer && !p.disconnectedMidGame) {
            p.hasStayed = true;
            p.actionTakenThisTurn = true;
          }
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        calculateAndEmitResults(roomId);
        return;
      }

      let playerPokMessageSent = false;
      playersToDeal.forEach((player) => {
        // Iterate only active players
        if (
          !player.isDealer &&
          player.handDetails &&
          player.handDetails.isPok
        ) {
          player.hasStayed = true;
          player.actionTakenThisTurn = true;
          // player.hasPok is already set
          const playerRoleForMessage =
            currentPlayersData.find((pd) => pd.id === player.id)?.role ||
            player.name;
          io.to(roomId).emit("message", {
            text: `${playerRoleForMessage} ได้ ${player.handDetails.name}! (ข้ามตา)`,
          });
          io.to(roomId).emit("player_revealed_pok", {
            playerId: player.id,
            name: player.name,
            role: playerRoleForMessage,
            cards: player.cards,
            handDetails: player.handDetails,
          });
          playerPokMessageSent = true;
        }
      });

      if (playerPokMessageSent) {
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
      }

      room.playerActionOrder = playersToDeal
        .filter((p) => !p.isDealer)
        .map((p) => p.id);
      if (dealer) {
        // ensure dealer is active
        room.playerActionOrder.push(dealer.id);
      }

      room.currentPlayerIndexInOrder = -1;
      advanceTurn(roomId);
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
        player.disconnectedMidGame
      )
        return;
      if (player.cards.length >= 3)
        return socket.emit("errorMessage", { text: "มีไพ่ 3 ใบแล้ว" });

      clearTurnTimer(room);
      if (room.deck.length > 0) {
        // Check if deck has cards
        player.cards.push(room.deck.pop());
      } else {
        // Handle empty deck scenario if necessary, though unlikely in Pok Deng usually
        io.to(player.id).emit("errorMessage", { text: "สำรับไพ่หมดแล้ว" });
        // Player might be forced to stay or other rule
        player.hasStayed = true; // Force stay if no cards
        player.actionTakenThisTurn = true;
        advanceTurn(roomId);
        return;
      }

      player.handDetails = getHandRank(player.cards);
      player.actionTakenThisTurn = true;
      if (player.cards.length === 3) {
        player.hasStayed = true;
      }
      // Pok with 3 cards is not standard Pok Deng "Pok", but a strong hand.
      // If their hand is a type of Pok (e.g. 9 points after draw) this is handled by hand rank.
      // hasPok is usually for 2-card Pok.
      // if (player.handDetails.isPok && player.cards.length === 3) { // This check might be confusing
      // player.hasStayed = true;
      // }

      io.to(player.id).emit("yourCards", player.cards);
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      const playerRoleForMessage =
        getRoomPlayerData(room).find((pd) => pd.id === player.id)?.role ||
        player.name;

      io.to(roomId).emit("message", {
        text: `${playerRoleForMessage} จั่วไพ่.`,
      });

      if (player.hasStayed) {
        advanceTurn(roomId);
      } else {
        startPlayerTurnTimer(room, player.id); // Restart timer for same player if they can draw again (not in this game) or for next action
        // Pok Deng usually only one draw. The logic above forces stay if 3 cards.
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
        // Added gameStarted check
        socket.emit("errorMessage", { text: "เกมยังไม่เริ่ม" });
        return;
      }

      const player = room.players.find((p) => p.id === socket.id);

      // Ensure it's the player's turn and they haven't stayed and are not disconnected
      if (
        !player ||
        player.id !== room.currentTurnPlayerId ||
        player.hasStayed ||
        player.disconnectedMidGame
      ) {
        // Optional: send an error message if needed, or just ignore
        // socket.emit("errorMessage", { text: "ไม่ใช่ตาของคุณ หรือคุณได้ตัดสินใจไปแล้ว" });
        return;
      }

      clearTurnTimer(room); // Clear timer as action is taken

      player.hasStayed = true;
      player.actionTakenThisTurn = true;

      const playerRoleForMessage =
        getRoomPlayerData(room).find((pd) => pd.id === player.id)?.role ||
        player.name;
      io.to(roomId).emit("message", {
        text: `${playerRoleForMessage} ขออยู่.`,
      });
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update player data for UI

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
          text: "เฉพาะเจ้ามือเท่านั้นที่เปิดไพ่ได้",
        }); // Corrected message
      if (!room.gameStarted && !room.resultsCache) {
        // If game not started AND no results from prev round, means nothing to show
        return socket.emit("errorMessage", {
          text: "ยังไม่มีผลลัพธ์ให้แสดง (เกมยังไม่เริ่ม/เล่น)",
        });
      }

      // Check if all active non-dealer players have stayed or are Pok or disconnected
      const allPlayersDone = room.players
        .filter((p) => !p.isDealer && !p.disconnectedMidGame)
        .every((p) => p.hasStayed || p.hasPok);

      const dealerPlayer = room.players.find(
        (p) => p.id === room.dealerId && !p.disconnectedMidGame
      );

      // Dealer must also "stay" or have Pok if they were in playerActionOrder.
      // If dealer was current turn and pressed "showResult", imply they stay.
      if (
        dealerPlayer &&
        room.currentTurnPlayerId === room.dealerId &&
        !dealerPlayer.hasStayed &&
        !dealerPlayer.hasPok
      ) {
        dealerPlayer.hasStayed = true;
        dealerPlayer.actionTakenThisTurn = true;
        io.to(roomId).emit("message", {
          text: `${dealerPlayer.role} (${dealerPlayer.name}) เปิดไพ่ (ถือว่า 'อยู่').`,
        });
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        clearTurnTimer(room); // Clear dealer's timer
      }

      if (!allPlayersDone && !(dealerPlayer && dealerPlayer.hasStayed)) {
        // Also check if dealer has stayed if they were supposed to act
        // Exception: if dealer has Pok, they can show results. This is handled earlier.
        // This check is for when dealer manually clicks "Show Result".
        const notDonePlayers = room.players
          .filter(
            (p) =>
              !p.isDealer && !p.disconnectedMidGame && !p.hasStayed && !p.hasPok
          )
          .map((p) => p.role || p.name)
          .join(", ");

        if (notDonePlayers) {
          return socket.emit("errorMessage", {
            text: `ผู้เล่น: ${notDonePlayers} ยังดำเนินการไม่เสร็จสิ้น`,
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
    //This resets the current hand/round, not the whole game scores
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId || room.gameStarted) {
        let msg = "เฉพาะเจ้ามือ & เมื่อเกมยังไม่เริ่มรอบใหม่";
        if (room && room.gameStarted)
          msg = "ไม่สามารถรีเซ็ตได้ระหว่างเกมกำลังดำเนินอยู่";
        if (room && socket.id !== room.dealerId) msg = "เฉพาะเจ้ามือเท่านั้น";
        return socket.emit("errorMessage", { text: msg });
      }

      // Reset players in room.players
      room.players.forEach((p) => {
        // No need to reset balance here as it's just resetting the hand
        p.cards = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.actionTakenThisTurn = false;
        p.hasPok = false;
        // p.disconnectedMidGame should persist if they were.
      });

      room.deck = []; // Deck will be recreated on startGame
      room.currentTurnPlayerId = null;
      room.currentPlayerIndexInOrder = -1;
      room.resultsCache = null; // Clear results of any previous round
      room.gameStarted = false; // Ensure game is marked as not started

      // Balances in allPlayersEver remain as they were. This is a round reset.
      // No change to gameRound counter yet, it increments on startGame.

      io.to(roomId).emit("resetGame"); // Inform clients to reset their UI for a new hand
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("message", {
        text: "เจ้ามือรีเซ็ตไพ่สำหรับรอบใหม่ (สับไพ่ใหม่เมื่อเริ่มเกม)",
      });
      io.to(roomId).emit("enableShowResult", false); // Disable show result button
      // Allow starting a new game
      if (room.dealerId === socket.id) {
        // Optional: emit something to dealer to re-enable start game button if it was disabled
      }
    } catch (error) {
      console.error("[Server] Error resetting game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการรีเซ็ตเกม" });
    }
  });

  socket.on("endGame", (roomId) => {
    // This is for ending the entire game session
    try {
      const room = rooms[roomId];
      if (!room || socket.id !== room.dealerId) {
        return socket.emit("errorMessage", {
          text: "เฉพาะเจ้ามือที่สามารถจบเกมได้",
        });
      }

      // <<< MODIFIED: Build gameSummary from allPlayersEver >>>
      const gameSummary = room.allPlayersEver.map((p_all) => {
        let displayRole = p_all.baseRole;
        if (p_all.baseRole !== "เจ้ามือ") {
          const nonDealersEver = room.allPlayersEver.filter(
            (player) => player.baseRole !== "เจ้ามือ"
          );
          const playerIndexAmongNonDealers = nonDealersEver.findIndex(
            (nd) => nd.id === p_all.id
          );
          if (playerIndexAmongNonDealers !== -1) {
            displayRole = `ขาที่ ${playerIndexAmongNonDealers + 1}`;
          } else {
            displayRole = "ขา"; // Fallback, should not ideally happen
          }
        }

        let statusText = "ออกจากห้อง"; // Default for not stillInRoom
        if (p_all.stillInRoom) {
          // Check if they are currently marked as disconnectedMidGame in the active players list
          const activePlayer = room.players.find((rp) => rp.id === p_all.id);
          if (activePlayer && activePlayer.disconnectedMidGame) {
            statusText = "หลุดระหว่างเกม";
          } else if (activePlayer) {
            // Still in room.players and not disconnectedMidGame
            statusText = "ยังอยู่ในห้อง";
          } else {
            // Was in allPlayersEver, stillInRoom=true, but not in room.players? (Should not happen if logic is correct)
            statusText = "ยังอยู่ในห้อง (สถานะไม่ชัดเจน)";
          }
        } else {
          // stillInRoom is false
          const originalPlayerInstance = room.players.find(
            (rp) => rp.id === p_all.id
          );
          if (
            originalPlayerInstance &&
            originalPlayerInstance.disconnectedMidGame
          ) {
            statusText = "หลุดระหว่างเกม";
          }
          // If not stillInRoom and not marked disconnectedMidGame (e.g. left before game, or between games cleanly)
          // "ออกจากห้อง" is appropriate.
        }

        return {
          id: p_all.id,
          name: p_all.name,
          role: displayRole,
          initialBalance: p_all.initialBalance,
          finalBalance: p_all.currentBalance, // Use the tracked currentBalance
          netChange: p_all.currentBalance - p_all.initialBalance,
          status: statusText,
        };
      });

      io.to(roomId).emit("gameEnded", gameSummary);
      io.to(roomId).emit("message", {
        text: `เจ้ามือ ${room.dealerName} ได้จบเกม.`,
      });

      // Clean up: remove all sockets from the room and delete the room
      const socketsInRoom = Array.from(
        io.sockets.adapter.rooms.get(roomId) || []
      );
      socketsInRoom.forEach((socketIdInRoom) => {
        // Renamed variable to avoid conflict
        const clientSocket = io.sockets.sockets.get(socketIdInRoom);
        if (clientSocket) clientSocket.leave(roomId);
      });

      clearTurnTimer(room); // Clear any pending timers for the room
      delete rooms[roomId]; // Delete the room from the server
      console.log(
        `[Server] Room ${roomId} ended and deleted by dealer ${socket.id}`
      );
    } catch (error) {
      console.error("[Server] Error ending game:", error);
      socket.emit("errorMessage", { text: "เกิดข้อผิดพลาดในการจบเกม" });
    }
  });

  // server.js - ในส่วน io.on('connection', (socket) => { ... })

  socket.on("disconnect", () => {
    const disconnectedSocketId = socket.id; // เก็บ socket.id ไว้ เพราะ socket object อาจจะใช้ไม่ได้แล้ว
    console.log(
      `[Server] Player ${disconnectedSocketId} has disconnected. Starting grace period...`
    );

    // ตั้งเวลารอ 30 วินาที (30000 มิลลิวินาที)
    const gracePeriod = 30000; // 30 วินาที

    // วนลูปหาห้องทั้งหมดที่ผู้เล่นคนนี้อาจจะอยู่
    // (ส่วนนี้ต้องทำนอก setTimeout เพราะเราต้องการหาข้อมูลผู้เล่นและห้องทันที)
    let roomIdOfDisconnectedPlayer = null;
    let playerNameToLog = "Unknown Player"; // ชื่อผู้เล่นสำหรับแสดงใน log

    for (const rId in rooms) {
      const room = rooms[rId];
      const player = room.players.find((p) => p.id === disconnectedSocketId);
      if (player) {
        roomIdOfDisconnectedPlayer = rId;
        playerNameToLog = player.name;
        // เราสามารถเพิ่มสถานะชั่วคราวให้ผู้เล่นได้ ถ้าต้องการให้ UI ฝั่ง client แสดงผลว่า "กำลังจะหลุด"
        // player.status = "disconnecting"; // ตัวอย่าง (ต้องไปแก้ getRoomPlayerData และฝั่ง client ด้วยถ้าจะใช้)
        // io.to(roomIdOfDisconnectedPlayer).emit("playersData", getRoomPlayerData(room));
        break;
      }
    }

    if (roomIdOfDisconnectedPlayer) {
      console.log(
        `[Server] Grace period started for ${playerNameToLog} (${disconnectedSocketId}) in room ${roomIdOfDisconnectedPlayer}.`
      );

      // ถ้ามี timer เก่าของผู้เล่นคนนี้อยู่ ให้เคลียร์ทิ้ง (อาจจะเกิดจากการ disconnect ซ้ำๆ)
      if (playerDisconnectTimers[disconnectedSocketId]) {
        clearTimeout(playerDisconnectTimers[disconnectedSocketId]);
      }

      playerDisconnectTimers[disconnectedSocketId] = setTimeout(() => {
        console.log(
          `[Server] Grace period for ${playerNameToLog} (${disconnectedSocketId}) in room ${roomIdOfDisconnectedPlayer} has ended. Proceeding with full disconnection.`
        );

        const room = rooms[roomIdOfDisconnectedPlayer];
        // ตรวจสอบอีกครั้งว่าห้องยังอยู่ และผู้เล่นยังอยู่ในห้อง (อาจจะกลับมาเชื่อมต่อใหม่แล้วก็ได้)
        if (room) {
          const playerIndex = room.players.findIndex(
            (p) => p.id === disconnectedSocketId
          );

          if (playerIndex !== -1) {
            // ถ้ายังเจอผู้เล่นคนนี้ (แปลว่ายังไม่ได้กลับมาเชื่อมต่อใหม่)
            const disconnectedPlayer = room.players.splice(playerIndex, 1)[0];
            console.log(
              `[Server] Player ${disconnectedPlayer.name} (${disconnectedSocketId}) fully removed from room ${roomIdOfDisconnectedPlayer}.`
            );

            // แจ้งผู้เล่นอื่นในห้อง
            io.to(roomIdOfDisconnectedPlayer).emit("playerLeft", {
              name: disconnectedPlayer.name,
              message: "ออกจากห้อง (หมดเวลาเชื่อมต่อ)", // เปลี่ยนข้อความนิดหน่อย
            });

            // ตรวจสอบถ้าคนหลุดเป็นเจ้ามือ (โค้ดส่วนนี้ยกมาจากของเดิม)
            if (disconnectedPlayer.isDealer) {
              if (room.players.length > 0) {
                let newDealer = room.players.find((p) => !p.isDealer); // หาผู้เล่นคนแรกที่ไม่ใช่เจ้ามือ
                if (!newDealer && room.players.length > 0)
                  newDealer = room.players[0]; // ถ้าทุกคนเคยเป็น (ซึ่งไม่ควร) หรือเหลือคนเดียว

                if (newDealer) {
                  newDealer.isDealer = true;
                  // ไม่จำเป็นต้องเปลี่ยน role เพราะ role คือ "ขาไพ่ 1", "เจ้ามือ" ไม่ใช่ boolean
                  // newDealer.role = "เจ้ามือ"; // Server จะกำหนด role ให้อยู่แล้ว
                  console.log(
                    `[Server] ${disconnectedPlayer.name} (Dealer) disconnected. ${newDealer.name} is the new dealer in room ${roomIdOfDisconnectedPlayer}.`
                  );
                  io.to(roomIdOfDisconnectedPlayer).emit("message", {
                    text: `${disconnectedPlayer.name} (เจ้ามือ) หลุดการเชื่อมต่อ. ${newDealer.name} เป็นเจ้ามือใหม่.`,
                  });
                } else {
                  io.to(roomIdOfDisconnectedPlayer).emit("message", {
                    text: "เจ้ามือหลุดการเชื่อมต่อ และไม่มีผู้เล่นอื่นเหลือที่จะเป็นเจ้ามือ. ห้องนี้อาจจะต้องปิด.",
                  });
                  // อาจจะลบห้องเลยก็ได้ถ้าไม่มีใครเป็นเจ้ามือได้แล้ว
                  // delete rooms[roomIdOfDisconnectedPlayer];
                  // console.log(`[Server] Room ${roomIdOfDisconnectedPlayer} deleted due to dealer disconnect and no replacement.`);
                  // return; // ออกจาก callback ของ setTimeout
                }
              } else {
                // เจ้ามือเป็นคนสุดท้ายที่หลุด ห้องก็ควรจะถูกลบ
                delete rooms[roomIdOfDisconnectedPlayer];
                console.log(
                  `[Server] Room ${roomIdOfDisconnectedPlayer} deleted as the last player (dealer) disconnected.`
                );
                // ไม่ต้องทำอะไรต่อ เพราะไม่มีใครในห้องแล้ว
              }
            }

            // ถ้าห้องว่างแล้วก็ลบห้องทิ้ง (ยกเว้นกรณีที่เพิ่งลบไปเพราะเจ้ามือหลุดและเป็นคนสุดท้าย)
            if (
              rooms[roomIdOfDisconnectedPlayer] &&
              room.players.length === 0
            ) {
              console.log(
                `[Server] Room ${roomIdOfDisconnectedPlayer} is now empty and will be deleted.`
              );
              delete rooms[roomIdOfDisconnectedPlayer];
            } else if (rooms[roomIdOfDisconnectedPlayer]) {
              // ถ้ายังมีคนอยู่ หรือห้องยังไม่ถูกลบ ก็อัปเดตข้อมูลผู้เล่นให้ทุกคน
              io.to(roomIdOfDisconnectedPlayer).emit(
                "playersData",
                getRoomPlayerData(room)
              );
            }
          } else {
            console.log(
              `[Server] Player ${playerNameToLog} (${disconnectedSocketId}) already reconnected or removed from room ${roomIdOfDisconnectedPlayer} before grace period ended.`
            );
          }
        } else {
          console.log(
            `[Server] Room ${roomIdOfDisconnectedPlayer} no longer exists. Cannot process full disconnect for ${playerNameToLog} (${disconnectedSocketId}).`
          );
        }

        delete playerDisconnectTimers[disconnectedSocketId]; // ลบ timer ออกจากที่จดไว้
      }, gracePeriod);
    } else {
      console.log(
        `[Server] Player ${disconnectedSocketId} disconnected but was not found in any active room.`
      );
    }
  });

  // การเริ่ม Server ให้รอรับการเชื่อมต่อ
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(
      `[Server] Pok Deng Server is running on port ${PORT} at ${new Date().toLocaleString()}`
    );
  });
});
