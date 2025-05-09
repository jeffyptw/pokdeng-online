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
    origin: [
      "https://pokdeng-online1.onrender.com",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
    ], // เพิ่ม Localhost สำหรับ Dev
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
    .filter((val) => typeof val === "number") // Ensure only numbers before sorting
    .sort((a, b) => a - b);

  const isQKAStraight =
    cards.length === 3 &&
    sortedNumericalValues.length === 3 &&
    sortedNumericalValues[0] === 1 &&
    sortedNumericalValues[1] === 12 &&
    sortedNumericalValues[2] === 13;
  const isNormalStraight =
    cards.length === 3 &&
    sortedNumericalValues.length === 3 &&
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
      const tongValue = numericalValueMapping[values[0]];
      return {
        rank: 2,
        type: "ตอง",
        score: tongValue,
        tieBreakingValue: 20 + tongValue,
      };
    }
    if (isStraight && sameSuit) {
      const highCardValue = isQKAStraight ? 14 : sortedNumericalValues[2] || 0;
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
      const highCardValue = isQKAStraight ? 14 : sortedNumericalValues[2] || 0;
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
  return { rank: 6, type: "แต้มธรรมดา", score, tieBreakingValue: score };
}

function sendPlayersData(roomId) {
  const room = rooms[roomId];
  if (!room || !room.players) return; // เพิ่มการตรวจสอบ room.players
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
  if (!participants || participants.length === 0) {
    console.log(
      "[Server] getOrderedGamePlayersForTurns: No participants to order."
    );
    return [];
  }
  const actualPlayers = participants.filter(
    (p) => p.id !== dealerId && !p.disconnectedMidGame
  );
  actualPlayers.sort((a, b) => {
    const numA = parseInt(a.role.match(/\d+/)?.[0] || "99");
    const numB = parseInt(b.role.match(/\d+/)?.[0] || "99");
    return numA - numB;
  });
  console.log(
    "[Server] Ordered players for turns (excluding dealer, disconnected):",
    actualPlayers.map((p) => p.name)
  );
  return actualPlayers.map((p) => ({ id: p.id, name: p.name, role: p.role }));
}

// ... (โค้ดส่วนที่เหลือของ server.js ที่ผมให้ไปก่อนหน้านี้ ซึ่งรวมการจัดการ startGame, disconnect, handleResultOnly, ฯลฯ โดยใช้ participantsInRound และ allPlayersEver) ...
// ... ให้แน่ใจว่าได้นำโค้ด server.js ทั้งหมดที่ผมปรับปรุงล่าสุดมาใส่ที่นี่ ...
// ผมจะยกส่วน socket.on("startGame", ...) มาปรับปรุงอีกครั้งให้ชัดเจน:

io.on("connection", (socket) => {
  console.log(`[Server] User connected: ${socket.id}`);

  // ... (โค้ดส่วน createRoom, joinRoom, setBetAmount, lockRoom) ...
  // (ควรใช้โค้ดเต็มจากที่ผมให้ไปก่อนหน้าสำหรับส่วนเหล่านี้)

  socket.on("startGame", (roomIdFromClient) => {
    const room = rooms[roomIdFromClient];
    console.log(
      `[Server] Received 'startGame' for room ${roomIdFromClient} from ${socket.id}. DealerId: ${room?.dealerId}. GameStarted: ${room?.gameStarted}`
    );
    if (room && room.dealerId === socket.id && !room.gameStarted) {
      if (room.players.length === 0) {
        // หรือ < 2 ถ้าต้องการผู้เล่นอื่นด้วย
        socket.emit("errorMessage", { text: "ไม่มีผู้เล่นในห้อง" });
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
        if (p.id !== room.dealerId) {
          p.role = `ผู้เล่นที่ ${playerCounter++}`;
        } else {
          p.role = "เจ้ามือ";
        }
        if (room.allPlayersEver && room.allPlayersEver[p.id])
          room.allPlayersEver[p.id].role = p.role;
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
          if (room.deck.length > 0) {
            participant.cards.push(room.deck.pop());
          } else {
            console.error("[Server] Deck ran out of cards during dealing!");
            break;
          }
        }
        // Sync cards to the actual player object in room.players if they are still there
        const activePlayer = room.players.find((p) => p.id === participant.id);
        if (activePlayer) {
          activePlayer.cards = [...participant.cards];
        }

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
          text: "ไม่มีผู้เล่นอื่นนอกจากเจ้ามือ หรือไม่มีผู้เล่นที่สามารถเล่นได้",
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

  // ... (โค้ดส่วน drawCard, stay, showResult, handleResultOnly, resetGame, endGame, calculateSummary, disconnect) ...
  // (ควรใช้โค้ดเต็มจากที่ผมให้ไปก่อนหน้าสำหรับส่วนเหล่านี้ โดยมีการเพิ่ม console.log ที่สำคัญ)
  // ตัวอย่างส่วน disconnect ที่ควรมี console.log และการจัดการที่ถูกต้อง
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
        // ... (ส่วนที่เหลือของการจัดการ disconnect ที่มี console.log และ logic ที่ถูกต้อง) ...
        // เช่น การ mark disconnectedMidGame, การ force stay, การ update UI, การจัดการเทิร์น
        // การลบผู้เล่นออกจาก active list, การจัดการถ้าเจ้ามือหลุด
        // ตรวจสอบให้แน่ใจว่าส่วนนี้ทำงานอย่างถูกต้องตามที่เราคุยกัน
        // ... (โค้ดเต็มของ disconnect handler)
        const playerMasterData = room.allPlayersEver[socket.id];
        if (playerMasterData) disconnectedPlayerName = playerMasterData.name;
        else if (participantFromRound)
          disconnectedPlayerName = participantFromRound.name;
        else if (
          playerIndexInActive !== -1 &&
          room.players[playerIndexInActive]
        )
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
            participantFromRound.hasStayed = true; // Force stay
            io.to(id_room).emit("playerAction", {
              name: disconnectedPlayerName,
              action: "อยู่ (หลุดจากห้อง)",
            });
          }
          if (playerIndexInActive !== -1) {
            room.players.splice(playerIndexInActive, 1); // Remove from active list
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
          /* Game not started or player not in current round's participants */
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
            /* Dealer disconnected (not mid-game for dealer) */
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
