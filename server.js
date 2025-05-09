// server.js
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors()); // ใช้ cors middleware ทั่วไปก่อน
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: [
      "https://pokdeng-online1.onrender.com",
      "http://localhost:3000",
      "http://localhost:5173",
    ], // URL ของ Client ที่อนุญาต
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const rooms = {};
const DEFAULT_BET_AMOUNT = 10;
const TURN_DURATION = 30; // seconds

function generateRoomId() {
  return Math.random().toString(36).substring(2, 7).toLowerCase();
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
  if (["K", "Q", "J"].includes(value)) return 0; // 10, J, Q, K มีค่า 0 แต้มในป๊อกเด้ง (10 ก็ 0)
  if (value === "10") return 0;
  if (value === "A") return 1;
  return parseInt(value);
};

const calculateScore = (cards) => {
  if (!cards || cards.length === 0) return 0;
  return cards.reduce((sum, card) => sum + getCardPoint(card.value), 0) % 10;
};

function getHandRank(cards) {
  if (!cards || cards.length === 0) {
    return { rank: 7, type: "ไม่มีไพ่", score: 0, tieBreakingValue: 0 };
  }
  const values = cards.map((c) => c.value);
  const suits = cards.map((c) => c.suit);
  const score = calculateScore(cards);
  const sameSuit = suits.length > 0 && suits.every((s) => s === suits[0]);

  const count = {};
  values.forEach((v) => (count[v] = (count[v] || 0) + 1));

  const numericalValueMapping = {
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
  };
  const sortedNumericalValues = cards
    .map((c) => numericalValueMapping[c.value])
    .sort((a, b) => a - b);

  const isQKAStraight =
    cards.length === 3 &&
    sortedNumericalValues[0] === 1 &&
    sortedNumericalValues[1] === 12 &&
    sortedNumericalValues[2] === 13;
  const isNormalStraight =
    cards.length === 3 &&
    sortedNumericalValues.length === 3 && // Ensure 3 cards for straight
    sortedNumericalValues[0] + 1 === sortedNumericalValues[1] &&
    sortedNumericalValues[1] + 1 === sortedNumericalValues[2];
  const isStraight = isNormalStraight || isQKAStraight;
  const allJQK =
    cards.length === 3 && values.every((v) => ["J", "Q", "K"].includes(v));

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

  if (cards.length === 3) {
    if (Object.values(count).includes(3)) {
      // Tong
      const tongValue = numericalValueMapping[values[0]]; // Assuming all values are same for Tong
      return {
        rank: 2,
        type: "ตอง",
        score: tongValue,
        tieBreakingValue: 20 + tongValue,
      }; // Use actual card value for score/tieBreaking
    }
    if (isStraight && sameSuit) {
      // Straight Flush
      const highCardValue = isQKAStraight ? 14 : sortedNumericalValues[2]; // A in QKA is highest
      return {
        rank: 3,
        type: "สเตรทฟลัช",
        score: highCardValue,
        tieBreakingValue: 19 + highCardValue / 100,
      };
    }
    if (allJQK)
      return { rank: 4, type: "เซียน", score: 0, tieBreakingValue: 18 };
    if (isStraight) {
      // Straight
      const highCardValue = isQKAStraight ? 14 : sortedNumericalValues[2];
      return {
        rank: 5,
        type: "เรียง",
        score: highCardValue,
        tieBreakingValue: 17 + highCardValue / 100,
      };
    }
    if (sameSuit)
      return {
        rank: 6,
        type: "สี (สามเด้ง)",
        score,
        tieBreakingValue: score + 0.7,
      };
    return { rank: 6, type: "แต้มธรรมดา", score, tieBreakingValue: score };
  }
  return { rank: 6, type: "แต้มธรรมดา", score, tieBreakingValue: score }; // Default for other cases
}

function sendPlayersData(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const activePlayerData = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    balance: p.balance,
    isDealer: p.id === room.dealerId,
  }));
  console.log(
    `[Server] Emitting 'playersData' for room ${roomId}:`,
    JSON.stringify(activePlayerData)
  );
  io.to(roomId).emit("playersData", activePlayerData);
}

function getOrderedGamePlayersForTurns(participants, dealerId) {
  if (!participants || participants.length === 0) return [];
  const actualPlayers = participants.filter(
    (p) => p.id !== dealerId && !p.disconnectedMidGame
  );

  // Sort by role "ผู้เล่นที่ X"
  actualPlayers.sort((a, b) => {
    const numA = parseInt(a.role.match(/\d+/)?.[0] || "99");
    const numB = parseInt(b.role.match(/\d+/)?.[0] || "99");
    return numA - numB;
  });
  return actualPlayers.map((p) => ({ id: p.id, name: p.name, role: p.role }));
}

function clearTurnTimer(roomId) {
  const room = rooms[roomId];
  if (room) {
    if (room.turnTimer) clearInterval(room.turnTimer);
    room.turnTimer = null;
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
    console.log(
      `[Server] startNextTurn: Conditions not met or no players to play in room ${roomId}. Checking if all done.`
    );
    checkIfAllPlayersDone(roomId);
    return;
  }
  clearTurnTimer(roomId);

  let nextPlayerOrderIdx =
    previousPlayerOrderIndex === -1 ? 0 : previousPlayerOrderIndex + 1;
  let attempts = 0;
  let foundNextPlayer = false;

  console.log(
    `[Server] startNextTurn: Starting search for next player from index ${nextPlayerOrderIdx} in orderedGamePlayers of length ${room.orderedGamePlayers.length}`
  );

  while (attempts < room.orderedGamePlayers.length) {
    if (nextPlayerOrderIdx >= room.orderedGamePlayers.length) {
      console.log(
        "[Server] startNextTurn: Reached end of orderedGamePlayers. All players taken their turn or skipped."
      );
      break; // Reached end of list
    }
    const playerInfoFromOrder = room.orderedGamePlayers[nextPlayerOrderIdx];
    if (!playerInfoFromOrder) {
      // Should not happen if logic is correct
      console.warn(
        "[Server] startNextTurn: playerInfoFromOrder is undefined at index",
        nextPlayerOrderIdx
      );
      attempts++;
      nextPlayerOrderIdx++;
      continue;
    }

    const participant = room.participantsInRound.find(
      (p) => p.id === playerInfoFromOrder.id
    );

    console.log(
      `[Server] startNextTurn: Trying player ${
        participant ? participant.name : "N/A"
      } (ID: ${
        playerInfoFromOrder.id
      }) at order index ${nextPlayerOrderIdx}. Disconnected: ${
        participant?.disconnectedMidGame
      }, Stayed: ${participant?.hasStayed}, Cards: ${
        participant?.cards?.length
      }`
    );

    if (
      participant &&
      !participant.disconnectedMidGame &&
      !participant.hasStayed &&
      participant.cards.length < 3
    ) {
      room.currentTurnId = participant.id;
      let timeLeft = TURN_DURATION;
      console.log(
        `[Server] Current turn for ${participant.name} (ID: ${participant.id}), timeLeft: ${timeLeft}`
      );
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
          );
          if (
            playerTimedOut &&
            !playerTimedOut.hasStayed &&
            !playerTimedOut.disconnectedMidGame
          ) {
            playerTimedOut.hasStayed = true;
            console.log(
              `[Server] Player ${playerTimedOut.name} timed out and auto-stayed.`
            );
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
    nextPlayerOrderIdx++;
  }

  if (!foundNextPlayer) {
    console.log(
      `[Server] startNextTurn: No more eligible players found in room ${roomId}.`
    );
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
  if (!room || !room.gameStarted || !room.participantsInRound) {
    console.log(
      `[Server] checkIfAllPlayersDone: Room ${roomId} not started or no participants.`
    );
    return;
  }

  const playersToCheck = room.participantsInRound.filter(
    (p) => p.id !== room.dealerId
  );
  const allDone = playersToCheck.every(
    (p) => p.hasStayed || p.cards.length >= 3 || p.disconnectedMidGame
  );

  console.log(
    `[Server] checkIfAllPlayersDone for room ${roomId}: All players done? ${allDone}`
  );
  if (allDone && room.dealerId) {
    clearTurnTimer(roomId);
    io.to(roomId).emit("currentTurn", {
      id: null,
      name: "รอเจ้ามือเปิดไพ่",
      role: "",
      timeLeft: 0,
    });
    const dealerSocket = io.sockets.sockets.get(room.dealerId);
    if (dealerSocket) {
      console.log(
        `[Server] Enabling ShowResult for dealer ${room.dealerId} in room ${roomId}`
      );
      dealerSocket.emit("enableShowResult", true);
    } else {
      console.warn(
        `[Server] Dealer socket ${room.dealerId} not found to enableShowResult in room ${roomId}`
      );
    }
    io.to(roomId).emit("message", {
      text: "ผู้เล่นทุกคนทำการตัดสินใจแล้ว เจ้ามือสามารถเปิดไพ่ได้",
    });
  }
}

// Socket.IO connection
io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

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
          role: "เจ้ามือ",
        },
      }, // Store role
    };
    socket.join(roomId);
    console.log(
      `[Server] Room ${roomId} created by ${playerName} (ID: ${socket.id})`
    );
    socket.emit("roomCreated", {
      roomId,
      // playersList is deprecated, playersData is better
      dealerName: player.name,
      betAmount: rooms[roomId].betAmount, // Send initial betAmount
    });
    // socket.emit("roomSettings", { betAmount: rooms[roomId].betAmount }); // Redundant if sent in roomCreated
    sendPlayersData(roomId);
  });

  socket.on("joinRoom", ({ roomId, playerName, initialBalance }) => {
    const room = rooms[roomId];
    console.log(`[Server] Attempt to join room ${roomId} by ${playerName}`);
    if (room) {
      if (room.isLocked || room.gameStarted) {
        const reason = room.gameStarted ? "เกมเริ่มไปแล้ว" : "ห้องถูกล็อค";
        console.log(`[Server] Join failed for ${playerName}: ${reason}`);
        socket.emit("errorMessage", {
          text: `ไม่สามารถเข้าร่วมห้องได้: ${reason}`,
        });
        return;
      }
      if (room.players.length >= 8) {
        // Max players
        console.log(
          `[Server] Join failed for ${playerName}: Room ${roomId} is full.`
        );
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
        expense: [], // Role will be assigned below
      };
      room.players.push(player);

      if (!room.allPlayersEver[socket.id]) {
        room.allPlayersEver[socket.id] = {
          name: playerName,
          initialBalance: balance,
          currentBalance: balance,
          role: player.role,
        };
      } else {
        room.allPlayersEver[socket.id].currentBalance = balance;
        room.allPlayersEver[socket.id].initialBalance = balance; // Reset if rejoining
        room.allPlayersEver[socket.id].role = player.role;
      }

      let playerCounter = 1;
      room.players.forEach((p) => {
        // Assign roles to all active players
        if (p.id !== room.dealerId) {
          p.role = `ผู้เล่นที่ ${playerCounter++}`;
          if (room.allPlayersEver[p.id])
            room.allPlayersEver[p.id].role = p.role; // Update role in allPlayersEver too
        } else {
          p.role = "เจ้ามือ";
          if (room.allPlayersEver[p.id])
            room.allPlayersEver[p.id].role = p.role;
        }
      });

      socket.join(roomId);
      console.log(
        `[Server] ${playerName} (ID: ${socket.id}) joined room ${roomId}`
      );
      socket.emit("joinedRoom", {
        roomId,
        // playersList deprecated
        dealerName: room.players.find((p) => p.id === room.dealerId)?.name,
        betAmount: room.betAmount, // Send current betAmount
      });
      io.to(roomId).emit("message", { text: `${playerName} ได้เข้าร่วมห้อง` });
      sendPlayersData(roomId); // This will send updated roles
      // socket.emit("roomSettings", { betAmount: room.betAmount }); // Redundant
    } else {
      console.log(
        `[Server] Join failed for ${playerName}: Room ${roomId} not found.`
      );
      socket.emit("errorMessage", { text: "ไม่พบห้องนี้" });
    }
  });

  socket.on("setBetAmount", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id && !room.gameStarted) {
      const bet = parseInt(amount);
      if (bet > 0 && bet % 10 === 0) {
        // Added divisible by 10 check as per client
        room.betAmount = bet;
        io.to(roomId).emit("roomSettings", { betAmount: room.betAmount });
        io.to(roomId).emit("message", {
          text: `เจ้ามือตั้งค่าเดิมพันเป็น ${bet} บาท`,
        });
      } else {
        socket.emit("errorMessage", {
          text: "จำนวนเงินเดิมพันต้องมากกว่า 0 และลงท้ายด้วย 0",
        });
      }
    } else if (room && room.gameStarted) {
      socket.emit("errorMessage", {
        text: "ไม่สามารถเปลี่ยนค่าเดิมพันระหว่างเกมได้",
      });
    } else if (room && room.dealerId !== socket.id) {
      socket.emit("errorMessage", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถตั้งค่าเดิมพันได้",
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

  socket.on("startGame", (roomIdFromClient) => {
    // Renamed to avoid conflict with outer scope roomId
    const room = rooms[roomIdFromClient];
    console.log(
      `[Server] Received 'startGame' for room ${roomIdFromClient} from ${socket.id}. DealerId: ${room?.dealerId}`
    );
    if (room && room.dealerId === socket.id && !room.gameStarted) {
      if (room.players.length < 1 && room.dealerId !== room.players[0]?.id) {
        // Require at least one non-dealer or just dealer
        socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 2 คน (รวมเจ้ามือ) เพื่อเริ่มเกม หรือเจ้ามือเท่านั้น",
        });
        return;
      }
      room.gameStarted = true;
      room.isLocked = true;
      io.to(roomIdFromClient).emit("lockRoom", true);
      room.deck = shuffleDeck(createDeck());

      room.participantsInRound = JSON.parse(JSON.stringify(room.players)).map(
        (p) => ({
          ...p,
          cards: [],
          hasStayed: false,
          hasDrawn: false,
          disconnectedMidGame: false,
          income: [],
          expense: [],
        })
      );

      let playerCounter = 1;
      room.participantsInRound.forEach((p) => {
        // Assign roles for this round's participants
        if (p.id !== room.dealerId) {
          p.role = `ผู้เล่นที่ ${playerCounter++}`;
        } else {
          p.role = "เจ้ามือ";
        }
        // Update role in allPlayersEver as well for summary consistency
        if (room.allPlayersEver[p.id]) room.allPlayersEver[p.id].role = p.role;
      });

      room.orderedGamePlayers = getOrderedGamePlayersForTurns(
        room.participantsInRound,
        room.dealerId
      );
      console.log(
        `[Server] Game starting in room ${roomIdFromClient}. Ordered players for turns: ${JSON.stringify(
          room.orderedGamePlayers.map((p) => p.name)
        )}`
      );

      room.participantsInRound.forEach((participant) => {
        for (let i = 0; i < 2; i++) {
          if (room.deck.length > 0) participant.cards.push(room.deck.pop());
        }
        const activePlayer = room.players.find((p) => p.id === participant.id);
        if (activePlayer) activePlayer.cards = [...participant.cards];

        // Use io.to(socketId) for direct emit
        console.log(
          `[Server] Emitting 'yourCards' to ${participant.name} (ID: ${
            participant.id
          }). Cards: ${JSON.stringify(participant.cards)}`
        );
        io.to(participant.id).emit("yourCards", participant.cards);
      });

      io.to(roomIdFromClient).emit("gameStarted", {
        betAmount: room.betAmount,
      });
      sendPlayersData(roomIdFromClient);
      io.to(roomIdFromClient).emit("message", {
        text: `เกมเริ่มแล้ว! เดิมพัน: ${room.betAmount} บาท`,
      });

      if (room.orderedGamePlayers.length > 0) {
        startNextTurn(roomIdFromClient, -1);
      } else {
        io.to(roomIdFromClient).emit("message", {
          text: "ไม่มีผู้เล่นที่ต้องทำการตัดสินใจ เจ้ามือสามารถเปิดไพ่ได้",
        });
        checkIfAllPlayersDone(roomIdFromClient);
      }
    } else if (room && room.gameStarted) {
      socket.emit("errorMessage", { text: "เกมเริ่มไปแล้ว" });
    } else if (room && room.dealerId !== socket.id) {
      socket.emit("errorMessage", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเริ่มเกมได้",
      });
    } else if (!room) {
      console.error(`[Server] startGame: Room ${roomIdFromClient} not found.`);
      socket.emit("errorMessage", { text: `ไม่พบห้อง ${roomIdFromClient}` });
    }
  });

  socket.on("drawCard", (roomId) => {
    const room = rooms[roomId];
    console.log(
      `[Server] Received 'drawCard' from ${socket.id} for room ${roomId}. Current turn: ${room?.currentTurnId}`
    );
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
        console.log(
          `[Server] ${participant.name} drew a card. New hand: ${JSON.stringify(
            participant.cards
          )}`
        );

        const activePlayer = room.players.find((p) => p.id === socket.id);
        if (activePlayer) activePlayer.cards = [...participant.cards];

        socket.emit("yourCards", participant.cards); // Send updated cards only to the player
        io.to(roomId).emit("playerAction", {
          name: participant.name,
          action: "จั่ว",
        });

        if (participant.cards.length >= 3) participant.hasStayed = true; // Auto-stay if 3 cards

        clearTurnTimer(roomId);
        const currentPlayerOrderIndex = room.orderedGamePlayers.findIndex(
          (pInfo) => pInfo.id === socket.id
        );
        startNextTurn(roomId, currentPlayerOrderIndex);
      } else {
        socket.emit("errorMessage", { text: "ไพ่ในสำรับหมดแล้ว" });
      }
    } else {
      console.log(
        `[Server] Draw denied for ${socket.id}. Stayed: ${participant?.hasStayed}, Cards: ${participant?.cards?.length}, Disconnected: ${participant?.disconnectedMidGame}`
      );
    }
  });

  socket.on("stay", (roomId) => {
    const room = rooms[roomId];
    console.log(
      `[Server] Received 'stay' from ${socket.id} for room ${roomId}. Current turn: ${room?.currentTurnId}`
    );
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
      console.log(`[Server] ${participant.name} chose to stay.`);
      io.to(roomId).emit("playerAction", {
        name: participant.name,
        action: "อยู่",
      });

      clearTurnTimer(roomId);
      const currentPlayerOrderIndex = room.orderedGamePlayers.findIndex(
        (pInfo) => pInfo.id === socket.id
      );
      startNextTurn(roomId, currentPlayerOrderIndex);
    } else {
      console.log(
        `[Server] Stay denied for ${socket.id}. Stayed: ${participant?.hasStayed}, Disconnected: ${participant?.disconnectedMidGame}`
      );
    }
  });

  socket.on("showResult", (roomId) => {
    const room = rooms[roomId];
    console.log(
      `[Server] Received 'showResult' from ${socket.id} for room ${roomId}. Dealer: ${room?.dealerId}`
    );
    if (room && room.dealerId === socket.id && room.gameStarted) {
      // gameStarted might be false if already handled a round
      // Check if all non-dealer participants are done
      const playersToCheck = room.participantsInRound.filter(
        (p) => p.id !== room.dealerId
      );
      const allDone = playersToCheck.every(
        (p) => p.hasStayed || p.cards.length >= 3 || p.disconnectedMidGame
      );
      if (!allDone && playersToCheck.length > 0) {
        socket.emit("errorMessage", {
          text: "ยังมีผู้เล่นบางคนยังไม่ได้ทำการตัดสินใจ",
        });
        return;
      }
      console.log(
        `[Server] Dealer ${socket.id} is showing results for room ${roomId}`
      );
      handleResultOnly(roomId);
      const dealerSocket = io.sockets.sockets.get(room.dealerId); // Re-fetch to ensure it's current
      if (dealerSocket) dealerSocket.emit("enableShowResult", false);
    } else if (room && room.dealerId !== socket.id) {
      socket.emit("errorMessage", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเปิดไพ่ได้",
      });
    } else if (
      room &&
      !room.gameStarted &&
      room.results &&
      room.results.length > 0
    ) {
      // Game ended, results already shown
      socket.emit("message", { text: "ผลลัพธ์ของรอบนี้ถูกแสดงไปแล้ว" });
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
        `[Server] handleResultOnly: Room or participantsInRound not found for room ${roomId}`
      );
      return;
    }
    const dealerParticipant = room.participantsInRound.find(
      (p) => p.id === room.dealerId
    );
    if (!dealerParticipant) {
      console.error(
        `[Server] handleResultOnly: CRITICAL - Dealer not found in participantsInRound for room ${roomId}`
      );
      io.to(roomId).emit("errorMessage", {
        text: "เกิดข้อผิดพลาด: ไม่พบข้อมูลเจ้ามือสำหรับรอบนี้",
      });
      return;
    }
    if (!dealerParticipant.cards) dealerParticipant.cards = [];

    console.log(
      `[Server] handleResultOnly: Calculating results for room ${roomId}. Dealer: ${dealerParticipant.name}`
    );

    const dealerRank = getHandRank(dealerParticipant.cards);
    const bet = room.betAmount || DEFAULT_BET_AMOUNT;
    const resultsForClient = []; // Changed variable name
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
      if (!participant.cards) participant.cards = [];

      const rank = getHandRank(participant.cards);
      const resultEntry = {
        id: participant.id, // Include ID for client-side keying and identification
        name: `${participant.name} (${participant.role}) ${
          participant.disconnectedMidGame ? "(หลุด)" : ""
        }`,
        cardsDisplay: participant.cards
          .map((c) => `${c.value}${c.suit}`)
          .join(", "),
        score: rank.score, // This is the modulo 10 score, or special score for Tong/Straight etc from getHandRank
        specialType: rank.type,
        outcome: "",
        moneyChange: 0,
        balance: participant.balance, // Send the balance *after* change
        disconnectedMidGame: participant.disconnectedMidGame || false,
      };

      if (participant.id === dealerParticipant.id) {
        resultEntry.outcome = "เจ้ามือ";
      } else {
        const playerPayoutMultiplier = payoutRate[rank.type] || 1;
        const dealerPayoutMultiplier = payoutRate[dealerRank.type] || 1;

        if (participant.disconnectedMidGame && participant.cards.length === 0) {
          resultEntry.outcome = "แพ้ (หลุด)";
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
            lossMultiplier = dealerPayoutMultiplier;
          }
          resultEntry.moneyChange = -lossMultiplier * bet;
        } else {
          resultEntry.outcome = "draw";
        }

        participant.balance += resultEntry.moneyChange;
        dealerParticipant.balance -= resultEntry.moneyChange; // Dealer's balance updated based on each participant

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
      resultEntry.balance = participant.balance; // Update balance in resultEntry
      resultsForClient.push(resultEntry);

      if (room.allPlayersEver && room.allPlayersEver[participant.id]) {
        room.allPlayersEver[participant.id].currentBalance =
          participant.balance;
      }
    }
    console.log(
      `[Server] Emitting 'result' for room ${roomId}:`,
      JSON.stringify(resultsForClient)
    );
    io.to(roomId).emit("result", resultsForClient);
    room.results = resultsForClient; // Store results in room object if needed later

    room.players.forEach((activePlayer) => {
      // Sync balance for active players
      const correspondingParticipant = room.participantsInRound.find(
        (p) => p.id === activePlayer.id
      );
      if (correspondingParticipant) {
        activePlayer.balance = correspondingParticipant.balance;
      }
    });
    sendPlayersData(roomId);
    room.gameStarted = false; // Mark round as over. Client handles UI changes.
    clearTurnTimer(roomId); // Clear any pending turn timers
  }

  socket.on("resetGame", (roomId) => {
    const room = rooms[roomId];
    console.log(
      `[Server] Received 'resetGame' from ${socket.id} for room ${roomId}`
    );
    if (room && room.dealerId === socket.id) {
      room.gameStarted = false;
      room.deck = [];
      room.currentTurnId = null;
      clearTurnTimer(roomId);
      room.participantsInRound = [];
      room.orderedGamePlayers = [];
      room.results = null; // Clear previous round results from room state

      room.players.forEach((p) => {
        p.cards = [];
        p.income = [];
        p.expense = [];
        // Do not reset p.balance here, it's persistent. Reset initialRoomBalance if joining new "session"
        // p.initialRoomBalance = p.balance; // if reset means new session for summary
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
    console.log(
      `[Server] Received 'endGame' from ${socket.id} for room ${roomId}`
    );
    if (room && room.dealerId === socket.id) {
      const summary = calculateSummary(roomId);
      io.to(roomId).emit("gameEnded", summary);
      io.to(roomId).emit("message", { text: "เจ้ามือจบเกมแล้ว ดูสรุปยอดเงิน" });
    }
  });

  function calculateSummary(roomId) {
    const room = rooms[roomId];
    if (!room || !room.allPlayersEver) return [];
    const summaryData = [];
    console.log(
      `[Server] Calculating summary for room ${roomId}. AllPlayersEver:`,
      JSON.stringify(room.allPlayersEver)
    );

    for (const playerId in room.allPlayersEver) {
      const playerRecord = room.allPlayersEver[playerId];
      summaryData.push({
        id: playerId, // Include ID for client
        name: playerRecord.name,
        role: playerRecord.role || "ผู้เล่น (ไม่ทราบสถานะ)", // Use stored role
        initialBalance: playerRecord.initialBalance,
        finalBalance: playerRecord.currentBalance,
        netChange: playerRecord.currentBalance - playerRecord.initialBalance,
      });
    }
    return summaryData;
  }

  socket.on("disconnect", () => {
    console.log(`[Server] User disconnected: ${socket.id}`);
    let roomIdFound = null;
    let disconnectedPlayerName = "ผู้เล่น";

    for (const id_room in rooms) {
      const room = rooms[id_room];
      const playerIndexInActive = room.players.findIndex(
        (p) => p.id === socket.id
      );
      const participantFromRound = room.participantsInRound
        ? room.participantsInRound.find((p) => p.id === socket.id)
        : null;

      if (playerIndexInActive !== -1 || participantFromRound) {
        roomIdFound = id_room;
        const playerMasterData = room.allPlayersEver[socket.id];
        if (playerMasterData) disconnectedPlayerName = playerMasterData.name;
        else if (participantFromRound)
          disconnectedPlayerName = participantFromRound.name;
        else if (playerIndexInActive !== -1)
          disconnectedPlayerName = room.players[playerIndexInActive].name;

        console.log(
          `[Server] ${disconnectedPlayerName} (ID: ${socket.id}) disconnecting from room ${id_room}. Game started: ${room.gameStarted}`
        );

        if (room.gameStarted && participantFromRound) {
          participantFromRound.disconnectedMidGame = true;
          console.log(
            `[Server] Marking ${disconnectedPlayerName} as disconnectedMidGame.`
          );

          if (!participantFromRound.hasStayed) {
            participantFromRound.hasStayed = true;
            io.to(id_room).emit("playerAction", {
              name: disconnectedPlayerName,
              action: "อยู่ (หลุดจากห้อง)",
            });
          }
          if (playerIndexInActive !== -1) {
            // Remove from active list only
            room.players.splice(playerIndexInActive, 1);
          }
          io.to(id_room).emit("playerLeft", {
            name: disconnectedPlayerName,
            message: "ได้ออกจากห้องระหว่างเกม",
          });
          sendPlayersData(id_room);

          if (room.currentTurnId === socket.id) {
            clearTurnTimer(id_room);
            const currentOrderIndex = room.orderedGamePlayers.findIndex(
              (pInfo) => pInfo.id === socket.id
            );
            console.log(
              `[Server] Disconnected player ${disconnectedPlayerName} was current turn. Advancing turn from index ${currentOrderIndex}.`
            );
            startNextTurn(id_room, currentOrderIndex);
          } else {
            checkIfAllPlayersDone(id_room);
          }
        } else {
          console.log(
            `[Server] ${disconnectedPlayerName} disconnected (game not started or not in current participants).`
          );
          if (playerIndexInActive !== -1) {
            room.players.splice(playerIndexInActive, 1);
          }
          const orderedPlayerIndexGlobal = room.orderedGamePlayers.findIndex(
            (pInfo) => pInfo.id === socket.id
          );
          if (orderedPlayerIndexGlobal !== -1 && !room.gameStarted) {
            room.orderedGamePlayers.splice(orderedPlayerIndexGlobal, 1);
          }

          io.to(id_room).emit("playerLeft", {
            name: disconnectedPlayerName,
            message: "ได้ออกจากห้อง",
          });
          sendPlayersData(id_room);

          if (room.players.length === 0) {
            console.log(`[Server] Room ${id_room} is empty, deleting.`);
            clearTurnTimer(id_room);
            delete rooms[id_room];
          } else if (room.dealerId === socket.id) {
            if (room.players.length > 0) {
              room.dealerId = room.players[0].id;
              const newDealer = room.players.find(
                (p) => p.id === room.dealerId
              );
              if (newDealer) {
                newDealer.role = "เจ้ามือ";
                if (room.allPlayersEver[newDealer.id])
                  room.allPlayersEver[newDealer.id].role = "เจ้ามือ";
              }

              let playerCounter = 1;
              room.players.forEach((p) => {
                if (p.id !== room.dealerId) {
                  p.role = `ผู้เล่นที่ ${playerCounter++}`;
                  if (room.allPlayersEver[p.id])
                    room.allPlayersEver[p.id].role = p.role;
                }
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
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`[Server] Listening on port ${PORT}`));
