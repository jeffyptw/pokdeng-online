const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://pokdeng-online1.onrender.com",
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

function getCardPoint(value) {
  if (["J", "Q", "K"].includes(value)) return 0;
  if (value === "A") return 1;
  return parseInt(value);
}

function calculateScore(cards) {
  return cards.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
}

function getHandRank(cards) {
  const values = cards.map((c) => c.value);
  const suits = cards.map((c) => c.suit);
  const score = calculateScore(cards);
  const sameSuit = suits.every((s) => s === suits[0]);
  const count = {};
  values.forEach((v) => (count[v] = (count[v] || 0) + 1));
  const allJQK = values.every((v) => ["J", "Q", "K"].includes(v));
  const sorted = cards
    .map((c) => ({ A: 1, J: 11, Q: 12, K: 13 }[c.value] || parseInt(c.value)))
    .sort((a, b) => a - b);
  const isQKA =
    cards.length === 3 &&
    sorted[0] === 1 &&
    sorted[1] === 12 &&
    sorted[2] === 13;
  const isStraight =
    cards.length === 3 &&
    ((sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1) || isQKA);

  if (cards.length === 2) {
    const isDouble =
      cards[0].suit === cards[1].suit || cards[0].value === cards[1].value;
    if (score === 9)
      return { rank: 1, type: isDouble ? "ป๊อก 9 สองเด้ง" : "ป๊อก 9", score };
    if (score === 8)
      return { rank: 1, type: isDouble ? "ป๊อก 8 สองเด้ง" : "ป๊อก 8", score };
  }

  if (cards.length === 3) {
    if (Object.values(count).includes(3))
      return { rank: 2, type: "ตอง", score };
    if (isStraight && sameSuit) return { rank: 3, type: "สเตรทฟลัช", score };
    if (isStraight) return { rank: 4, type: "เรียง", score };
    if (allJQK) return { rank: 5, type: "เซียน", score };
    if (sameSuit) return { rank: 6, type: "แต้มธรรมดา สามเด้ง", score };
  }

  if (
    cards.length === 2 &&
    (cards[0].suit === cards[1].suit || cards[0].value === cards[1].value)
  ) {
    return { rank: 6, type: "แต้มธรรมดา สองเด้ง", score };
  }

  return { rank: 6, type: "แต้มธรรมดา", score };
}

function createShuffledDeck() {
  const deck = [];
  for (let s of SUITS) for (let v of VALUES) deck.push({ suit: s, value: v });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

const rooms = {};
const turnTimers = {};

function clearTurnTimer(roomId) {
  if (turnTimers[roomId]) {
    clearTimeout(turnTimers[roomId]);
    delete turnTimers[roomId];
  }
}

function sendPlayers(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const list = room.players.map(
    (p) => `${p.name} (${p.role}) = ${p.balance} บาท`
  );
  io.to(roomId).emit("playersList", list);
}

function sendPlayersData(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const data = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    balance: p.balance,
    leftEarly: p.leftEarly || false,
  }));
  io.to(roomId).emit("playersData", data);
}

function sendUsersInRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const users = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
  }));
  io.to(roomId).emit("usersInRoom", users);
}

function sendSummary(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const summary = room.players.map((p) => ({
    name: `${p.name} (${p.role})`,
    balance: p.balance,
    net: p.balance - p.originalBalance,
    income: p.income,
    expense: p.expense,
  }));
  io.to(roomId).emit("summaryData", summary);
}

function handleResultOnly(roomId) {
  const room = rooms[roomId];
  const dealer = room?.players.find((p) => p.role === "เจ้ามือ");
  if (!room || !dealer) return;

  const dealerRank = getHandRank(dealer.cards);
  const payoutRate = {
    "ป๊อก 9 สองเด้ง": 2,
    "ป๊อก 8 สองเด้ง": 2,
    "ป๊อก 9": 1,
    "ป๊อก 8": 1,
    ตอง: 5,
    สเตรทฟลัช: 5,
    เรียง: 3,
    เซียน: 3,
    "แต้มธรรมดา สามเด้ง": 3,
    "แต้มธรรมดา สองเด้ง": 2,
    แต้มธรรมดา: 1,
  };
  const bet = 5;

  const results = room.players.map((p) => {
    const rank = getHandRank(p.cards);
    const result = {
      name: `${p.name} (${p.role})`,
      cards: p.cards.map((c) => `${c.value}${c.suit}`).join(", "),
      sum: calculateScore(p.cards),
      specialType: rank.type,
      outcome: "",
      moneyChange: 0,
    };

    if (p.role === "เจ้ามือ") {
      result.outcome = "dealer";
    } else {
      const payout = payoutRate[rank.type] || 1;
      const dealerPayout = payoutRate[dealerRank.type] || 1;

      if (
        rank.rank < dealerRank.rank ||
        (rank.rank === dealerRank.rank && rank.score > dealerRank.score)
      ) {
        result.outcome = "win";
        result.moneyChange = payout * bet;
        p.balance += result.moneyChange;
        dealer.balance -= result.moneyChange;
        p.income.push({ from: dealer.name, amount: result.moneyChange });
        dealer.expense.push({ to: p.name, amount: result.moneyChange });
      } else if (
        rank.rank > dealerRank.rank ||
        (rank.rank === dealerRank.rank && rank.score < dealerRank.score)
      ) {
        result.outcome = "lose";
        result.moneyChange = -dealerPayout * bet;
        p.balance += result.moneyChange;
        dealer.balance -= result.moneyChange;
        p.expense.push({ to: dealer.name, amount: -result.moneyChange });
        dealer.income.push({ from: p.name, amount: -result.moneyChange });
      } else {
        result.outcome = "draw";
      }
    }

    return result;
  });

  io.to(roomId).emit("result", results);
  sendPlayersData(roomId);
}

function startNextTurn(roomId, index = 0) {
  const room = rooms[roomId];
  if (!room) return;

  const ordered = [...room.players.filter((p) => p.role !== "เจ้ามือ")];
  const dealer = room.players.find((p) => p.role === "เจ้ามือ");
  if (dealer) ordered.push(dealer);

  if (index >= ordered.length) {
    io.to(dealer.id).emit("enableShowResult");
    return;
  }

  const player = ordered[index];
  if (!player) return;

  room.currentTurnId = player.id;
  io.to(roomId).emit("currentTurn", { id: player.id });
  sendPlayersData(roomId);

  turnTimers[roomId] = setTimeout(() => {
    player.hasChosen = true;
    io.to(player.id).emit("yourCards", { cards: player.cards });
    startNextTurn(roomId, index + 1);
  }, 15000);
}

function forceStayAndReveal(player) {
  if (!player.hasChosen) {
    player.hasChosen = true;
    io.to(player.id).emit("yourCards", { cards: player.cards });
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, balance }, cb) => {
    const roomId = Math.random().toString(36).substring(2, 6);
    rooms[roomId] = {
      players: [
        {
          id: socket.id,
          name,
          role: "เจ้ามือ",
          cards: [],
          hasChosen: false,
          balance,
          originalBalance: balance,
          income: [],
          expense: [],
        },
      ],
      deck: [],
      dealerId: socket.id,
      isGameStarted: false,
      currentTurnId: null,
    };
    socket.join(roomId);
    cb({ roomId });
    sendPlayers(roomId);
    sendPlayersData(roomId);
    sendUsersInRoom(roomId);
  });

  socket.on("joinRoom", ({ roomId, name, balance }, cb) => {
    const room = rooms[roomId];
    if (!room) return cb({ success: false, message: "ไม่พบห้อง" });
    if (room.isGameStarted)
      return cb({
        success: false,
        message: "เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้",
      });
    if (room.players.length >= 10)
      return cb({ success: false, message: "ห้องเต็มแล้ว" });

    room.players.push({
      id: socket.id,
      name,
      role: `ขาไพ่ที่ ${room.players.length}`,
      cards: [],
      hasChosen: false,
      balance,
      originalBalance: balance,
      income: [],
      expense: [],
    });
    socket.join(roomId);
    cb({ success: true });
    sendPlayers(roomId);
    sendPlayersData(roomId);
    sendUsersInRoom(roomId);
  });

  socket.on("startGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.isGameStarted = true;
    room.deck = createShuffledDeck();
    room.players.forEach((p) => {
      p.cards = [];
      p.hasChosen = false;
    });
    for (let i = 0; i < 2; i++) {
      room.players.forEach((p) => p.cards.push(room.deck.pop()));
    }
    room.players.forEach((p) => {
      io.to(p.id).emit("yourCards", { cards: p.cards });
      io.to(p.id).emit("resetGame");
    });
    io.to(roomId).emit("lockRoom");
    sendPlayers(roomId);
    sendPlayersData(roomId);
    sendUsersInRoom(roomId);
    startNextTurn(roomId, 0);
  });

  socket.on("drawCard", ({ roomId }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);
    if (
      player &&
      room.currentTurnId === socket.id &&
      player.cards.length < 3 &&
      !player.hasChosen
    ) {
      player.cards.push(room.deck.pop());
      player.hasChosen = true;
      io.to(socket.id).emit("yourCards", { cards: player.cards });
      const ordered = [
        ...room.players.filter((p) => p.role !== "เจ้ามือ"),
        room.players.find((p) => p.role === "เจ้ามือ"),
      ];
      const nextIndex = ordered.findIndex((p) => p.id === socket.id) + 1;
      clearTurnTimer(roomId);
      startNextTurn(roomId, nextIndex);
    }
  });

  socket.on("stay", ({ roomId }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);
    if (player && room.currentTurnId === socket.id && !player.hasChosen) {
      player.hasChosen = true;
      const ordered = [
        ...room.players.filter((p) => p.role !== "เจ้ามือ"),
        room.players.find((p) => p.role === "เจ้ามือ"),
      ];
      const nextIndex = ordered.findIndex((p) => p.id === socket.id) + 1;
      clearTurnTimer(roomId);
      startNextTurn(roomId, nextIndex);
    }
  });

  socket.on("showResult", ({ roomId }) => {
    handleResultOnly(roomId);
    sendPlayers(roomId);
  });

  socket.on("endGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    room.isGameStarted = false;
    clearTurnTimer(roomId);
    io.to(roomId).emit("gameEnded");
    sendSummary(roomId);
    sendUsersInRoom(roomId);
  });

  socket.on("requestSummary", ({ roomId }) => {
    sendSummary(roomId);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        const player = room.players[index];

        // ถ้าเจ้ามือออกกลางเกม ให้ปิดเกม
        if (player.role === "เจ้ามือ" && room.isGameStarted) {
          handleResultOnly(roomId);
          io.to(roomId).emit("gameEnded");
          sendSummary(roomId);
        }

        // ถ้าไม่ใช่เจ้ามือ เปิดไพ่เพื่อใช้คำนวณ
        if (player.role !== "เจ้ามือ" && room.isGameStarted) {
          forceStayAndReveal(player);
        }

        room.players[index].leftEarly = true;
        sendPlayers(roomId);
        sendPlayersData(roomId);
        sendUsersInRoom(roomId);

        if (room.players.length === 0) {
          clearTurnTimer(roomId);
          delete rooms[roomId];
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
