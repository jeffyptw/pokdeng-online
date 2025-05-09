// server.js
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "https://pokdeng-online1.onrender.com",
    methods: ["GET", "POST"],
  },
});

const rooms = {};
const DEFAULT_BET_AMOUNT = 10;
const TURN_DURATION = 30; // seconds

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7);
}

function createDeck() {
  const suits = ["♠️", "♥️", "♣️", "♦️"];
  const values = [
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
  let deck = [];
  for (let suit of suits) {
    for (let value of values) {
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

const getCardPoint = (value) => {
  if (["K", "Q", "J", "10"].includes(value)) return 0;
  if (value === "A") return 1;
  return parseInt(value);
};

const calculateScore = (cards) => {
  if (!cards || cards.length === 0) return 0;
  return cards.reduce((sum, card) => sum + getCardPoint(card.value), 0) % 10;
};

function getHandRank(cards) {
  if (!cards || cards.length === 0) {
    return { rank: 7, type: "ไม่มีไพ่", score: 0 };
  }
  const values = cards.map((c) => c.value);
  const suits = cards.map((c) => c.suit);
  const score = calculateScore(cards);
  const sameSuit = suits.length > 0 && suits.every((s) => s === suits[0]);

  const count = {};
  values.forEach((v) => (count[v] = (count[v] || 0) + 1));

  // Numerical values for sorting (A=1, J=11, Q=12, K=13)
  const sortedNumericalValues = cards
    .map(
      (c) =>
        ({
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
          J: 11,
          Q: 12,
          K: 13,
        }[c.value])
    )
    .sort((a, b) => a - b);

  const isQKAStraight =
    cards.length === 3 &&
    sortedNumericalValues[0] === 1 &&
    sortedNumericalValues[1] === 12 &&
    sortedNumericalValues[2] === 13; // A, Q, K
  const isNormalStraight =
    cards.length === 3 &&
    sortedNumericalValues[0] + 1 === sortedNumericalValues[1] &&
    sortedNumericalValues[1] + 1 === sortedNumericalValues[2];
  const isStraight = isNormalStraight || isQKAStraight;
  const allJQK =
    cards.length === 3 && values.every((v) => ["J", "Q", "K"].includes(v));

  // 2-card hands
  if (cards.length === 2) {
    const isDouble =
      cards[0].value === cards[1].value || cards[0].suit === cards[1].suit;
    if (score === 9)
      return {
        rank: 1,
        type: isDouble ? "ป๊อก 9 สองเด้ง" : "ป๊อก 9",
        score,
        tieBreakingValue: 9 + (isDouble ? 0.5 : 0),
      };
    if (score === 8)
      return {
        rank: 1,
        type: isDouble ? "ป๊อก 8 สองเด้ง" : "ป๊อก 8",
        score,
        tieBreakingValue: 8 + (isDouble ? 0.5 : 0),
      };
    if (isDouble)
      return {
        rank: 6,
        type: "แต้มธรรมดา สองเด้ง",
        score,
        tieBreakingValue: score + 0.5,
      };
    return { rank: 6, type: "แต้มธรรมดา", score, tieBreakingValue: score };
  }

  // 3-card hands
  if (cards.length === 3) {
    // Tong (Three of a Kind)
    if (Object.values(count).includes(3)) {
      const tongValue = sortedNumericalValues[0]; // Value of the card in Tong
      return { rank: 2, type: "ตอง", score, tieBreakingValue: tongValue }; // Tie-break by card value of Tong
    }
    // Straight Flush
    if (isStraight && sameSuit) {
      const highCard = isQKAStraight ? 13.5 : sortedNumericalValues[2]; // A in QKA is highest
      return { rank: 3, type: "สเตรทฟลัช", score, tieBreakingValue: highCard };
    }
    // Sian (J, Q, K)
    if (allJQK) return { rank: 4, type: "เซียน", score, tieBreakingValue: 0 }; // Sian is specific, no card value tie-break typically
    // Straight
    if (isStraight) {
      const highCard = isQKAStraight ? 13.5 : sortedNumericalValues[2];
      return { rank: 5, type: "เรียง", score, tieBreakingValue: highCard };
    }
    // Flush (Si - Same suit, 3 cards, also called Sam Deng if it's just a flush)
    if (sameSuit)
      return {
        rank: 6,
        type: "สี (สามเด้ง)",
        score,
        tieBreakingValue: score + 0.7,
      }; // Higher than normal deng
    return { rank: 6, type: "แต้มธรรมดา", score, tieBreakingValue: score };
  }
  // Fallback for unusual card counts, treat as lowest normal hand
  return { rank: 6, type: "แต้มธรรมดา", score, tieBreakingValue: score };
}

function sendPlayersData(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const activePlayerData = room.players.map((p) => ({
    // Send data of currently *active* players
    id: p.id,
    name: p.name,
    role: p.role,
    balance: p.balance,
    isDealer: p.id === room.dealerId,
  }));
  io.to(roomId).emit("playersData", activePlayerData);
}

// Gets player turn order (excluding dealer, as dealer doesn't take turns like players)
function getOrderedGamePlayersForTurns(participants, dealerId) {
  if (!participants || participants.length === 0) return [];

  const actualPlayers = participants.filter(
    (p) => p.id !== dealerId && !p.disconnectedMidGame
  ); // Filter out dealer and disconnected for turn sequence

  const player1 = actualPlayers.find((p) => p.role === "ผู้เล่นที่ 1");
  const otherPlayers = actualPlayers.filter(
    (p) => !player1 || p.id !== player1.id
  ); // All others not P1

  let ordered = [];
  if (player1) ordered.push(player1); // P1 comes first
  ordered = ordered.concat(otherPlayers); // Then others

  return ordered.map((p) => ({ id: p.id, name: p.name, role: p.role })); // Return only essential info for order list
}

function clearTurnTimer(roomId) {
  const room = rooms[roomId];
  if (room) {
    if (room.turnTimer) clearInterval(room.turnTimer);
    if (room.turnTimeout) clearTimeout(room.turnTimeout); // Just in case
    room.turnTimer = null;
    room.turnTimeout = null; // Just in case
  }
}

function startNextTurn(roomId, previousPlayerOrderIndex) {
  const room = rooms[roomId];
  if (
    !room ||
    !room.gameStarted ||
    !room.orderedGamePlayers ||
    room.orderedGamePlayers.length === 0
  ) {
    checkIfAllPlayersDone(roomId);
    return;
  }
  clearTurnTimer(roomId);

  let nextPlayerIndexToTry =
    previousPlayerOrderIndex === -1 ? 0 : previousPlayerOrderIndex + 1;
  let attempts = 0;
  let foundNextPlayer = false;

  while (attempts < room.orderedGamePlayers.length) {
    const playerInfoFromOrder =
      room.orderedGamePlayers[
        nextPlayerIndexToTry % room.orderedGamePlayers.length
      ];
    if (!playerInfoFromOrder) {
      // Should not happen
      attempts++;
      nextPlayerIndexToTry++;
      continue;
    }

    const participant = room.participantsInRound.find(
      (p) => p.id === playerInfoFromOrder.id
    );

    // Check if this participant is eligible to play
    if (
      participant &&
      !participant.disconnectedMidGame &&
      !participant.hasStayed &&
      participant.cards.length < 3
    ) {
      room.currentTurnId = participant.id;
      let timeLeft = TURN_DURATION;
      io.to(roomId).emit("currentTurn", {
        id: participant.id,
        name: participant.name,
        role: participant.role,
        timeLeft,
      });

      room.turnTimer = setInterval(() => {
        timeLeft--;
        io.to(roomId).emit("turnTimerUpdate", {
          playerId: participant.id,
          timeLeft,
        });
        if (timeLeft <= 0) {
          clearInterval(room.turnTimer);
          const playerTimedOut = room.participantsInRound.find(
            (p) => p.id === room.currentTurnId
          ); // Re-fetch, state might change
          if (
            playerTimedOut &&
            !playerTimedOut.hasStayed &&
            !playerTimedOut.disconnectedMidGame
          ) {
            playerTimedOut.hasStayed = true;
            // playerTimedOut.choicesMade = playerTimedOut.cards.length; // Not strictly needed
            io.to(roomId).emit("playerAction", {
              name: playerTimedOut.name,
              action: "อยู่ (หมดเวลา)",
            });
            io.to(playerTimedOut.id).emit("message", {
              text: "หมดเวลา! ระบบให้คุณ 'อยู่' โดยอัตโนมัติ",
            });

            const currentTimedOutPlayerOrderIndex =
              room.orderedGamePlayers.findIndex(
                (pInfo) => pInfo.id === room.currentTurnId
              );
            startNextTurn(roomId, currentTimedOutPlayerOrderIndex);
          }
        }
      }, 1000);
      foundNextPlayer = true;
      break;
    }
    attempts++;
    nextPlayerIndexToTry++;
  }

  if (!foundNextPlayer) {
    // No more players eligible to play
    room.currentTurnId = null;
    io.to(roomId).emit("currentTurn", {
      id: null,
      name: "รอเจ้ามือเปิดไพ่",
      role: "",
      timeLeft: 0,
    });
    checkIfAllPlayersDone(roomId);
  }
}

function checkIfAllPlayersDone(roomId) {
  const room = rooms[roomId];
  if (!room || !room.gameStarted || !room.participantsInRound) return;

  // Consider only players who are not the dealer for "done playing their turn"
  const playersToCheck = room.participantsInRound.filter(
    (p) => p.id !== room.dealerId
  );

  const allDone = playersToCheck.every(
    (p) => p.hasStayed || p.cards.length >= 3 || p.disconnectedMidGame
  );

  if (allDone && room.dealerId) {
    // Ensure dealer exists
    clearTurnTimer(roomId);
    io.to(roomId).emit("currentTurn", {
      id: null,
      name: "รอเจ้ามือเปิดไพ่",
      role: "",
      timeLeft: 0,
    });
    const dealerSocket = io.sockets.sockets.get(room.dealerId);
    if (dealerSocket) {
      // Check if dealer is actually connected
      dealerSocket.emit("enableShowResult", true);
    }
    io.to(roomId).emit("message", {
      text: "ผู้เล่นทุกคนทำการตัดสินใจแล้ว เจ้ามือสามารถเปิดไพ่ได้",
    });
  }
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("createRoom", ({ playerName, initialBalance }) => {
    const roomId = generateRoomId();
    const balance = parseInt(initialBalance) || 1000;
    const player = {
      id: socket.id,
      name: playerName,
      balance: balance,
      initialRoomBalance: balance,
      role: "เจ้ามือ",
      cards: [],
      income: [],
      expense: [],
    };
    rooms[roomId] = {
      id: roomId,
      players: [player],
      participantsInRound: [],
      orderedGamePlayers: [],
      dealerId: socket.id,
      gameStarted: false,
      deck: [],
      betAmount: DEFAULT_BET_AMOUNT,
      turnTimeout: null,
      turnTimer: null,
      currentTurnId: null,
      isLocked: false,
      allPlayersEver: {
        [socket.id]: {
          name: playerName,
          initialBalance: balance,
          currentBalance: balance,
        },
      },
    };
    socket.join(roomId);
    socket.emit("roomCreated", {
      roomId,
      playersList: rooms[roomId].players.map((p) => `${p.name} (${p.role})`),
      dealerName: player.name,
    });
    socket.emit("roomSettings", { betAmount: rooms[roomId].betAmount });
    sendPlayersData(roomId);
    console.log(`Room ${roomId} created by ${playerName} (ID: ${socket.id})`);
  });

  socket.on("joinRoom", ({ roomId, playerName, initialBalance }) => {
    const room = rooms[roomId];
    if (room) {
      if (room.isLocked || room.gameStarted) {
        socket.emit("errorMessage", {
          text: `ไม่สามารถเข้าร่วมห้องได้: ${
            room.gameStarted ? "เกมเริ่มไปแล้ว" : "ห้องถูกล็อค"
          }`,
        });
        return;
      }
      if (room.players.length >= 8) {
        socket.emit("errorMessage", { text: "ห้องเต็มแล้ว" });
        return;
      }
      const balance = parseInt(initialBalance) || 1000;
      const player = {
        id: socket.id,
        name: playerName,
        balance: balance,
        initialRoomBalance: balance,
        role: "ผู้เล่น",
        cards: [],
        income: [],
        expense: [],
      };
      room.players.push(player);

      if (!room.allPlayersEver[socket.id]) {
        room.allPlayersEver[socket.id] = {
          name: playerName,
          initialBalance: balance,
          currentBalance: balance,
        };
      } else {
        room.allPlayersEver[socket.id].currentBalance = balance; // Reset if rejoining
        room.allPlayersEver[socket.id].initialBalance = balance;
      }

      // Re-assign player roles (Player 1, Player 2, etc.)
      let playerCounter = 1;
      room.players.forEach((p) => {
        if (p.id !== room.dealerId) {
          p.role = `ผู้เล่นที่ ${playerCounter}`;
          playerCounter++;
        } else {
          p.role = "เจ้ามือ"; // Ensure dealer role is correct
        }
      });

      socket.join(roomId);
      socket.emit("joinedRoom", {
        roomId,
        playersList: room.players.map((p) => `${p.name} (${p.role})`),
        dealerName: room.players.find((p) => p.id === room.dealerId)?.name,
      });
      io.to(roomId).emit("message", { text: `${playerName} ได้เข้าร่วมห้อง` });
      sendPlayersData(roomId);
      socket.emit("roomSettings", { betAmount: room.betAmount });
    } else {
      socket.emit("errorMessage", { text: "ไม่พบห้องนี้" });
    }
  });

  socket.on("setBetAmount", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id && !room.gameStarted) {
      const bet = parseInt(amount);
      if (bet > 0) {
        room.betAmount = bet;
        io.to(roomId).emit("roomSettings", { betAmount: room.betAmount });
        io.to(roomId).emit("message", {
          text: `เจ้ามือตั้งค่าเดิมพันเป็น ${bet} บาท`,
        });
      } else {
        socket.emit("errorMessage", { text: "จำนวนเงินเดิมพันไม่ถูกต้อง" });
      }
    } else if (room && room.gameStarted) {
      socket.emit("errorMessage", {
        text: "ไม่สามารถเปลี่ยนค่าเดิมพันระหว่างเกมได้",
      });
    }
  });

  socket.on("lockRoom", ({ roomId, lock }) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id && !room.gameStarted) {
      room.isLocked = lock;
      io.to(roomId).emit("lockRoom", lock);
      io.to(roomId).emit("message", {
        text: `ห้อง${lock ? "ถูกล็อค" : "ถูกปลดล็อค"}โดยเจ้ามือ`,
      });
    }
  });

  socket.on("startGame", (roomId) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id && !room.gameStarted) {
      if (room.players.length < 1) {
        // Allow dealer to play alone for testing, or change to 2
        socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 1 คน (เจ้ามือ) เพื่อเริ่มเกม",
        }); // หรือ 2 คน
        return;
      }
      room.gameStarted = true;
      room.isLocked = true;
      io.to(roomId).emit("lockRoom", true);
      room.deck = shuffleDeck(createDeck());

      // Create participantsInRound from *current active* players, reset round-specific states
      room.participantsInRound = JSON.parse(JSON.stringify(room.players)).map(
        (p) => ({
          ...p,
          cards: [],
          hasStayed: false,
          hasDrawn: false,
          choicesMade: 0,
          disconnectedMidGame: false,
          income: [],
          expense: [],
        })
      );

      // Re-assign roles for participants to ensure correctness for the round
      let playerCounter = 1;
      room.participantsInRound.forEach((p) => {
        if (p.id !== room.dealerId) {
          p.role = `ผู้เล่นที่ ${playerCounter++}`;
        } else {
          p.role = "เจ้ามือ";
        }
      });

      // orderedGamePlayers is for player turns (excluding dealer)
      room.orderedGamePlayers = getOrderedGamePlayersForTurns(
        room.participantsInRound,
        room.dealerId
      );

      room.participantsInRound.forEach((participant) => {
        for (let i = 0; i < 2; i++) {
          if (room.deck.length > 0) participant.cards.push(room.deck.pop());
        }
        const activePlayer = room.players.find((p) => p.id === participant.id);
        if (activePlayer) activePlayer.cards = [...participant.cards]; // Sync to active player

        const playerSocket = io.sockets.sockets.get(participant.id);
        if (playerSocket) {
          // --- เพิ่ม Console Log เพื่อตรวจสอบ ---
          console.log(
            `[Server] Emitting 'yourCards' to ${participant.name} (ID: ${
              participant.id
            }). Cards: ${JSON.stringify(participant.cards)}`
          );
          if (participant.cards && Array.isArray(participant.cards)) {
            // ตรวจสอบว่า cards เป็น array
            playerSocket.emit("yourCards", participant.cards); // Server ส่ง participant.cards (array ของไพ่) โดยตรง
          } else {
            console.error(
              `[Server] ERROR: participant.cards is not a valid array for ${participant.name}. Cards:`,
              participant.cards
            );
            playerSocket.emit("yourCards", []); // ส่ง array ว่างไปแทนถ้ามีปัญหา
          }
        } else {
          console.warn(
            `[Server] Socket not found for participant ${participant.name} (ID: ${participant.id}) when trying to emit 'yourCards'. Player might have disconnected already.`
          );
        }
      });

      io.to(roomId).emit("gameStarted", { betAmount: room.betAmount });
      sendPlayersData(roomId);
      io.to(roomId).emit("message", {
        text: `เกมเริ่มแล้ว! เดิมพัน: ${room.betAmount} บาท`,
      });

      if (room.orderedGamePlayers.length > 0) {
        startNextTurn(roomId, -1);
      } else {
        // Only dealer, or no players eligible for turns
        io.to(roomId).emit("message", {
          text: "ไม่มีผู้เล่นที่ต้องทำการตัดสินใจ เจ้ามือสามารถเปิดไพ่ได้",
        });
        checkIfAllPlayersDone(roomId); // Should enable dealer's showResult button
      }
    } else if (room && room.gameStarted) {
      socket.emit("errorMessage", { text: "เกมเริ่มไปแล้ว" });
    } else if (room && room.dealerId !== socket.id) {
      socket.emit("errorMessage", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเริ่มเกมได้",
      });
    }
  });

  socket.on("drawCard", (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.currentTurnId !== socket.id) return;

    const participant = room.participantsInRound.find(
      (p) => p.id === socket.id
    );
    if (
      participant &&
      !participant.hasStayed &&
      participant.cards.length < 3 &&
      !participant.disconnectedMidGame
    ) {
      if (room.deck.length > 0) {
        const newCard = room.deck.pop();
        participant.cards.push(newCard);
        participant.hasDrawn = true;
        // participant.choicesMade++; // Not really used

        const activePlayer = room.players.find((p) => p.id === socket.id);
        if (activePlayer) activePlayer.cards = [...participant.cards];

        socket.emit("yourCards", participant.cards);
        io.to(roomId).emit("playerAction", {
          name: participant.name,
          action: "จั่ว",
        });

        if (participant.cards.length >= 3) participant.hasStayed = true;

        clearTurnTimer(roomId);
        const currentPlayerOrderIndex = room.orderedGamePlayers.findIndex(
          (pInfo) => pInfo.id === socket.id
        );
        startNextTurn(roomId, currentPlayerOrderIndex);
      } else {
        socket.emit("errorMessage", { text: "ไพ่ในสำรับหมดแล้ว" });
      }
    }
  });

  socket.on("stay", (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.currentTurnId !== socket.id) return;

    const participant = room.participantsInRound.find(
      (p) => p.id === socket.id
    );
    if (
      participant &&
      !participant.hasStayed &&
      !participant.disconnectedMidGame
    ) {
      participant.hasStayed = true;
      // participant.choicesMade = participant.cards.length; // Not really used
      io.to(roomId).emit("playerAction", {
        name: participant.name,
        action: "อยู่",
      });

      clearTurnTimer(roomId);
      const currentPlayerOrderIndex = room.orderedGamePlayers.findIndex(
        (pInfo) => pInfo.id === socket.id
      );
      startNextTurn(roomId, currentPlayerOrderIndex);
    }
  });

  socket.on("showResult", (roomId) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id && room.gameStarted) {
      const playersToCheck = room.participantsInRound.filter(
        (p) => p.id !== room.dealerId
      );
      const allDone = playersToCheck.every(
        (p) => p.hasStayed || p.cards.length >= 3 || p.disconnectedMidGame
      );
      if (!allDone && playersToCheck.length > 0) {
        // Only check if there are players other than dealer
        socket.emit("errorMessage", {
          text: "ยังมีผู้เล่นบางคนยังไม่ได้ทำการตัดสินใจ",
        });
        return;
      }
      handleResultOnly(roomId);
      // Game is not "ended" here, just round results shown. gameStarted becomes false.
      room.gameStarted = false; // Mark round as over for result display purposes.
      // Next round will set it to true again.
      const dealerSocket = io.sockets.sockets.get(room.dealerId);
      if (dealerSocket) dealerSocket.emit("enableShowResult", false); // Disable button after showing
    } else if (room && room.dealerId !== socket.id) {
      socket.emit("errorMessage", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเปิดไพ่ได้",
      });
    }
  });

  function handleResultOnly(roomId) {
    const room = rooms[roomId];
    if (
      !room ||
      !room.participantsInRound ||
      room.participantsInRound.length === 0
    ) {
      console.error(
        `Room or participantsInRound not found for result handling in room ${roomId}`
      );
      return;
    }
    const dealerParticipant = room.participantsInRound.find(
      (p) => p.id === room.dealerId
    );
    if (!dealerParticipant) {
      console.error(
        `CRITICAL: Dealer not found in participantsInRound for room ${roomId}`
      );
      io.to(roomId).emit("errorMessage", {
        text: "เกิดข้อผิดพลาดร้ายแรง: ไม่พบข้อมูลเจ้ามือสำหรับรอบนี้",
      });
      return; // Cannot proceed without dealer data for the round
    }
    if (!dealerParticipant.cards) dealerParticipant.cards = []; // Ensure cards array exists

    const dealerRank = getHandRank(dealerParticipant.cards);
    const bet = room.betAmount || DEFAULT_BET_AMOUNT;
    const results = [];
    const payoutRate = {
      "ป๊อก 9 สองเด้ง": 2,
      "ป๊อก 8 สองเด้ง": 2,
      "ป๊อก 9": 1,
      "ป๊อก 8": 1,
      ตอง: 5,
      สเตรทฟลัช: 5,
      เซียน: 3,
      เรียง: 3,
      "สี (สามเด้ง)": 3,
      "แต้มธรรมดา สองเด้ง": 2,
      แต้มธรรมดา: 1,
    };

    for (const participant of room.participantsInRound) {
      if (!participant.cards) participant.cards = []; // Ensure cards array for safety

      const rank = getHandRank(participant.cards);
      const resultEntry = {
        name: `${participant.name} (${participant.role}) ${
          participant.disconnectedMidGame ? "(หลุด)" : ""
        }`,
        cardsDisplay: participant.cards
          .map((c) => `${c.value}${c.suit}`)
          .join(", "),
        score: rank.score,
        specialType: rank.type,
        outcome: "",
        moneyChange: 0,
      };

      if (participant.id === dealerParticipant.id) {
        resultEntry.outcome = "เจ้ามือ";
      } else {
        const playerPayoutMultiplier = payoutRate[rank.type] || 1;
        const dealerPayoutMultiplier = payoutRate[dealerRank.type] || 1;

        if (participant.disconnectedMidGame && participant.cards.length === 0) {
          resultEntry.outcome = "lose"; // Auto-lose if disconnected with no cards
          resultEntry.moneyChange = -bet;
        } else if (
          rank.rank < dealerRank.rank ||
          (rank.rank === dealerRank.rank &&
            rank.tieBreakingValue > dealerRank.tieBreakingValue)
        ) {
          resultEntry.outcome = "win";
          resultEntry.moneyChange = playerPayoutMultiplier * bet;
        } else if (
          rank.rank > dealerRank.rank ||
          (rank.rank === dealerRank.rank &&
            rank.tieBreakingValue < dealerRank.tieBreakingValue)
        ) {
          resultEntry.outcome = "lose";
          let lossMultiplier = playerPayoutMultiplier;
          if (dealerRank.rank === 1) {
            // If dealer has Pok
            lossMultiplier = dealerPayoutMultiplier;
          }
          resultEntry.moneyChange = -lossMultiplier * bet;
        } else {
          // rank.rank === dealerRank.rank && rank.tieBreakingValue === dealerRank.tieBreakingValue
          resultEntry.outcome = "draw";
        }

        participant.balance += resultEntry.moneyChange;
        dealerParticipant.balance -= resultEntry.moneyChange;

        if (resultEntry.moneyChange > 0)
          participant.income.push({
            from: dealerParticipant.name,
            amount: resultEntry.moneyChange,
          });
        else if (resultEntry.moneyChange < 0)
          participant.expense.push({
            to: dealerParticipant.name,
            amount: -resultEntry.moneyChange,
          });

        if (resultEntry.moneyChange < 0)
          dealerParticipant.income.push({
            from: participant.name,
            amount: -resultEntry.moneyChange,
          });
        else if (resultEntry.moneyChange > 0)
          dealerParticipant.expense.push({
            to: participant.name,
            amount: resultEntry.moneyChange,
          });
      }
      results.push(resultEntry);

      if (room.allPlayersEver && room.allPlayersEver[participant.id]) {
        room.allPlayersEver[participant.id].currentBalance =
          participant.balance;
      }
    }
    io.to(roomId).emit("result", results);

    room.players.forEach((activePlayer) => {
      const correspondingParticipant = room.participantsInRound.find(
        (p) => p.id === activePlayer.id
      );
      if (correspondingParticipant) {
        activePlayer.balance = correspondingParticipant.balance;
      }
    });
    sendPlayersData(roomId);
    room.gameStarted = false; // Mark round as over
  }

  socket.on("resetGame", (roomId) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id) {
      room.gameStarted = false;
      room.deck = [];
      room.currentTurnId = null;
      clearTurnTimer(roomId);
      room.participantsInRound = [];
      room.orderedGamePlayers = [];

      room.players.forEach((p) => {
        // Reset active players for next round display
        p.cards = [];
        p.income = [];
        p.expense = [];
      });

      io.to(roomId).emit("resetGame");
      sendPlayersData(roomId);
      io.to(roomId).emit("message", {
        text: "เจ้ามือรีเซ็ตเกม พร้อมเริ่มรอบใหม่",
      });
      const dealerSocket = io.sockets.sockets.get(room.dealerId);
      if (dealerSocket) dealerSocket.emit("enableShowResult", false);
    }
  });

  socket.on("endGame", (roomId) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id) {
      const summary = calculateSummary(roomId);
      io.to(roomId).emit("gameEnded", summary);
      io.to(roomId).emit("message", { text: "เจ้ามือจบเกมแล้ว ดูสรุปยอดเงิน" });
      // Room still exists, players can see summary. Dealer can start new game or players can leave.
    }
  });

  function calculateSummary(roomId) {
    const room = rooms[roomId];
    if (!room || !room.allPlayersEver) return [];
    const summaryData = [];

    for (const playerId in room.allPlayersEver) {
      const playerRecord = room.allPlayersEver[playerId];
      // Try to find the player in current participants or active players for role, fallback if not found
      const playerRoleInfo =
        room.participantsInRound.find((p) => p.id === playerId) ||
        room.players.find((p) => p.id === playerId);
      const role = playerRoleInfo ? playerRoleInfo.role : "ผู้เล่น (ออกไปแล้ว)";

      summaryData.push({
        name: playerRecord.name,
        role: role,
        initialBalance: playerRecord.initialBalance,
        finalBalance: playerRecord.currentBalance,
        netChange: playerRecord.currentBalance - playerRecord.initialBalance,
      });
    }
    return summaryData;
  }

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    let roomIdFound = null;
    let disconnectedPlayerName = "ผู้เล่น"; // Default name

    for (const id_room in rooms) {
      // Changed variable name to avoid conflict
      const room = rooms[id_room];
      const playerIndexInActive = room.players.findIndex(
        (p) => p.id === socket.id
      );
      const participantInCurrentRound = room.participantsInRound
        ? room.participantsInRound.find((p) => p.id === socket.id)
        : null;

      if (playerIndexInActive !== -1 || participantInCurrentRound) {
        // Player was either active or part of current round
        roomIdFound = id_room;
        const playerMasterData = room.allPlayersEver[socket.id]; // Get name from persistent record
        if (playerMasterData) disconnectedPlayerName = playerMasterData.name;
        else if (participantInCurrentRound)
          disconnectedPlayerName = participantInCurrentRound.name;
        else if (playerIndexInActive !== -1)
          disconnectedPlayerName = room.players[playerIndexInActive].name;

        if (room.gameStarted && participantInCurrentRound) {
          participantInCurrentRound.disconnectedMidGame = true;
          console.log(
            `${disconnectedPlayerName} (ID: ${socket.id}) disconnected mid-game from room ${id_room}.`
          );

          if (!participantInCurrentRound.hasStayed) {
            // Force stay
            participantInCurrentRound.hasStayed = true;
            io.to(id_room).emit("playerAction", {
              name: disconnectedPlayerName,
              action: "อยู่ (หลุดจากห้อง)",
            });
          }
          // Remove from *active* players list, but keep in participantsInRound
          if (playerIndexInActive !== -1) {
            room.players.splice(playerIndexInActive, 1);
          }
          io.to(id_room).emit("playerLeft", {
            name: disconnectedPlayerName,
            message: "ได้ออกจากห้องระหว่างเกม",
          });
          sendPlayersData(id_room); // Update active player list for clients

          if (room.currentTurnId === socket.id) {
            clearTurnTimer(id_room);
            const currentOrderIndex = room.orderedGamePlayers.findIndex(
              (pInfo) => pInfo.id === socket.id
            );
            startNextTurn(id_room, currentOrderIndex);
          } else {
            checkIfAllPlayersDone(id_room); // Check if this disconnect completes all player turns
          }
        } else {
          // Game not started, or player disconnected who wasn't in current round's active participants
          console.log(
            `${disconnectedPlayerName} (ID: ${socket.id}) disconnected from room ${id_room}.`
          );
          if (playerIndexInActive !== -1) {
            room.players.splice(playerIndexInActive, 1);
          }
          const orderedPlayerIndexGlobal = room.orderedGamePlayers.findIndex(
            (pInfo) => pInfo.id === socket.id
          );
          if (orderedPlayerIndexGlobal !== -1 && !room.gameStarted) {
            // Remove if game not started
            room.orderedGamePlayers.splice(orderedPlayerIndexGlobal, 1);
          }

          io.to(id_room).emit("playerLeft", {
            name: disconnectedPlayerName,
            message: "ได้ออกจากห้อง",
          });
          sendPlayersData(id_room);

          if (room.players.length === 0) {
            console.log(`Room ${id_room} is empty, deleting.`);
            clearTurnTimer(id_room);
            delete rooms[id_room];
          } else if (room.dealerId === socket.id) {
            // Dealer disconnected (not mid-game for dealer)
            if (room.players.length > 0) {
              room.dealerId = room.players[0].id; // Promote first active player
              const newDealer = room.players.find(
                (p) => p.id === room.dealerId
              );
              if (newDealer) newDealer.role = "เจ้ามือ";

              let playerCounter = 1; // Re-assign roles
              room.players.forEach((p) => {
                if (p.id !== room.dealerId)
                  p.role = `ผู้เล่นที่ ${playerCounter++}`;
              });
              io.to(id_room).emit("message", {
                text: `${disconnectedPlayerName} (เจ้ามือ) ออกจากห้อง. ${
                  newDealer ? newDealer.name : ""
                } เป็นเจ้ามือคนใหม่.`,
              });
              sendPlayersData(id_room);
            }
          }
        }
        break;
      }
    }
    // No roomIdFound means user was connected but not in any tracked room state.
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
