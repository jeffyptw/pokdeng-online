const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://pokdeng-online1.onrender.com", // โปรดตรวจสอบว่าเป็น origin ที่ถูกต้อง
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

const DEFAULT_BET_AMOUNT = 5; // <--- เพิ่มค่าคงที่สำหรับ Bet Amount

function getCardPoint(value) {
  if (["J", "Q", "K"].includes(value)) return 0;
  if (value === "A") return 1;
  return parseInt(value);
}

function calculateScore(cards) {
  return cards.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
}

function getHandRank(cards) {
  if (!cards || cards.length === 0) {
    return { rank: 7, type: "ไม่มีไพ่", score: 0 }; // จัดการกรณีไม่มีไพ่
  }
  const values = cards.map((c) => c.value);
  const suits = cards.map((c) => c.suit);
  const score = calculateScore(cards);
  const sameSuit = suits.every((s) => s === suits[0]);
  const count = {};
  values.forEach((v) => (count[v] = (count[v] || 0) + 1));
  const allJQK = values.every((v) => ["J", "Q", "K"].includes(v));

  const sortedNumericalValues = cards
    .map((c) => ({ A: 1, J: 11, Q: 12, K: 13 }[c.value] || parseInt(c.value)))
    .sort((a, b) => a - b);

  const isQKA =
    cards.length === 3 &&
    sortedNumericalValues[0] === 1 &&
    sortedNumericalValues[1] === 12 &&
    sortedNumericalValues[2] === 13;

  const isStraight =
    cards.length === 3 &&
    ((sortedNumericalValues[1] === sortedNumericalValues[0] + 1 &&
      sortedNumericalValues[2] === sortedNumericalValues[1] + 1) ||
      isQKA);

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
    if (isStraight && sameSuit) return { rank: 3, type: "สเตรทฟลัช", score }; // แต้มของสเตรทฟลัชอาจไม่สำคัญเท่า rank
    if (isStraight) return { rank: 4, type: "เรียง", score }; // แต้มของเรียงอาจไม่สำคัญเท่า rank
    if (allJQK && cards.length === 3) return { rank: 5, type: "เซียน", score }; // เซียนคือ JQK 3 ใบ
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
  if (!room || !room.players) return; // เพิ่มการตรวจสอบ room.players
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

  if (!room || !dealer || !room.players) {
    // เพิ่มการตรวจสอบ room.players
    console.error(
      `Room or dealer not found for result handling in room ${roomId}`
    );
    return;
  }

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

  const bet = room.betAmount || DEFAULT_BET_AMOUNT; // <--- ใช้ค่า bet จาก room หรือ default

  const results = []; // สร้าง array results เปล่า

  for (const p of room.players) {
    //ใช้ for...of เพื่อให้แน่ใจว่า p ไม่ใช่ undefined
    if (!p || !p.cards) continue; // ข้ามถ้าผู้เล่นหรือไพ่ของผู้เล่นไม่มี

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
      const playerPayout = payoutRate[rank.type] || 1;
      const dealerPayout = payoutRate[dealerRank.type] || 1; // อัตราจ่ายของเจ้ามือเมื่อผู้เล่นแพ้

      // Player wins
      if (
        rank.rank < dealerRank.rank ||
        (rank.rank === dealerRank.rank && rank.score > dealerRank.score)
      ) {
        result.outcome = "win";
        result.moneyChange = playerPayout * bet;
        p.balance += result.moneyChange;
        dealer.balance -= result.moneyChange;
        p.income.push({ from: dealer.name, amount: result.moneyChange });
        dealer.expense.push({ to: p.name, amount: result.moneyChange });
      }
      // Player loses
      else if (
        rank.rank > dealerRank.rank ||
        (rank.rank === dealerRank.rank && rank.score < dealerRank.score)
      ) {
        result.outcome = "lose";
        // ผู้เล่นเสียตามอัตราจ่ายของมือเจ้ามือ (ถ้าเจ้ามือป๊อก ผู้เล่นเสียเด้งตามนั้น)
        // แต่ถ้าเกมทั่วไป ผู้เล่นเสียตามมือตัวเอง เช่น ผู้เล่น 2 เด้งแพ้เจ้ามือธรรมดา ก็เสีย 2 เด้ง
        // ตรรกะนี้อาจจะต้องซับซ้อนกว่านี้ ขึ้นอยู่กับกติกาละเอียดของป๊อกเด้งที่ใช้
        // แก้ไขเบื้องต้น: ให้ผู้เล่นเสียตาม bet * dealerPayout (ถ้าเจ้ามือมีมือพิเศษ) หรือ bet * playerPayout (ถ้าผู้เล่นมีมือพิเศษแต่แพ้)
        // หากต้องการให้ผู้เล่นเสียตาม "เด้ง" ของตัวเองเมื่อแพ้ อาจจะต้องใช้ playerPayout
        // แต่โดยทั่วไป ถ้าผู้เล่นแพ้เจ้ามือป๊อก ผู้เล่นจะเสีย x เท่าของป๊อกเจ้ามือ
        // สมมติว่าถ้าผู้เล่นแพ้ จะเสียตามค่า "เด้ง" ของตนเอง หรือขั้นต่ำคือ 1 เท่า
        const lossMultiplier = playerPayout; // เสียตามเด้งของตัวเอง
        result.moneyChange = -lossMultiplier * bet;

        p.balance += result.moneyChange; // p.balance จะลดลง
        dealer.balance -= result.moneyChange; // dealer.balance จะเพิ่มขึ้น

        p.expense.push({ to: dealer.name, amount: -result.moneyChange }); // expense ของ p คือจำนวนที่เสีย (ค่าบวก)
        dealer.income.push({ from: p.name, amount: -result.moneyChange }); // income ของ dealer คือจำนวนที่ได้ (ค่าบวก)
      }
      // Draw
      else {
        result.outcome = "draw";
      }
    }
    results.push(result);
  }
  io.to(roomId).emit("result", results);
}

function startNextTurn(roomId, index = 0) {
  const room = rooms[roomId];
  if (!room || !room.players || room.players.length === 0) {
    // เพิ่มการตรวจสอบ
    clearTurnTimer(roomId); // Clear timer if room is gone or empty
    return;
  }

  // สร้าง turn order โดยผู้เล่นก่อน แล้วตามด้วยเจ้ามือ
  const playersOnly = room.players.filter((p) => p.role !== "เจ้ามือ");
  const dealer = room.players.find((p) => p.role === "เจ้ามือ");
  const orderedPlayers = [...playersOnly];
  if (dealer) {
    orderedPlayers.push(dealer); // เจ้ามือเล่นคนสุดท้าย (หรือเปิดไพ่)
  }

  if (index >= orderedPlayers.length) {
    // ทุกคนเล่นครบแล้ว (รวมถึงการตัดสินใจของเจ้ามือถ้ามี)
    if (dealer) {
      io.to(dealer.id).emit("enableShowResult"); // แจ้งให้เจ้ามือแสดงผล
    } else {
      // กรณีไม่มีเจ้ามือ อาจจะต้องมี logic เพิ่มเติม หรือเกมไม่ควรมาถึงจุดนี้ถ้าไม่มีเจ้ามือ
      console.error(`No dealer found in room ${roomId} at the end of turns.`);
    }
    return;
  }

  const currentPlayer = orderedPlayers[index];
  if (!currentPlayer) {
    //  ป้องกัน error ถ้า currentPlayer เป็น undefined
    startNextTurn(roomId, index + 1); // ข้ามไปคนถัดไป
    return;
  }

  room.currentTurnId = currentPlayer.id;
  io.to(roomId).emit("currentTurn", {
    id: currentPlayer.id,
    name: currentPlayer.name,
  }); // ส่งชื่อไปด้วยก็ดี
  sendPlayersData(roomId); // อัปเดตสถานะเผื่อมีการเปลี่ยนแปลง

  // ถ้าเป็นตาเจ้ามือ และเจ้ามือมีไพ่ครบแล้ว (เช่น ป๊อกตั้งแต่แรก หรือครบ 3 ใบ)
  // หรือถ้าเป็นผู้เล่นที่ป๊อกแล้ว ไม่ควรให้จั่วเพิ่ม
  const currentHand = getHandRank(currentPlayer.cards);
  if (
    (currentPlayer.role === "เจ้ามือ" &&
      (currentHand.type.startsWith("ป๊อก") ||
        currentPlayer.cards.length === 3)) ||
    (currentPlayer.role !== "เจ้ามือ" && currentHand.type.startsWith("ป๊อก"))
  ) {
    currentPlayer.hasChosen = true; // ถือว่าเลือกแล้ว (อยู่)
    io.to(currentPlayer.id).emit("yourCards", {
      cards: currentPlayer.cards,
      handRank: currentHand,
    }); // ส่ง rank ไปด้วยเลย
    clearTurnTimer(roomId); // ไม่ต้องรอ timeout
    startNextTurn(roomId, index + 1); // ไปคนถัดไปทันที
    return;
  }

  // สำหรับผู้เล่นที่ยังไม่ป๊อก หรือเจ้ามือที่ยังไม่ตัดสินใจ/ไพ่ไม่ครบ
  turnTimers[roomId] = setTimeout(() => {
    if (
      rooms[roomId] &&
      rooms[roomId].currentTurnId === currentPlayer.id &&
      !currentPlayer.hasChosen
    ) {
      // ตรวจสอบว่ายังเป็นตาของคนนี้และยังไม่ได้เลือก
      currentPlayer.hasChosen = true; // บังคับ "อยู่"
      io.to(currentPlayer.id).emit("yourCards", {
        cards: currentPlayer.cards,
        handRank: getHandRank(currentPlayer.cards),
      });
      io.to(roomId).emit("playerAction", {
        playerId: currentPlayer.id,
        action: "stay (timeout)",
      });
      startNextTurn(roomId, index + 1);
    }
  }, 15000); // 15 วินาที
}

function forceStayAndReveal(player) {
  if (player && !player.hasChosen) {
    // ตรวจสอบ player
    player.hasChosen = true;
    // ไม่ควร emit 'yourCards' ที่นี่ถ้าไม่ต้องการให้ผู้เล่นอื่นเห็นไพ่ก่อนเวลา
    // การเปิดไพ่ควรจะเกิดขึ้นพร้อมกันตอน showResult
    // แต่ถ้าต้องการให้ client ของผู้เล่นนั้นรู้ว่าถูกบังคับ stay ก็อาจจะส่ง event เฉพาะได้
    console.log(`Player ${player.name} was forced to stay.`);
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, balance, betAmount }, cb) => {
    // รับ betAmount ตอนสร้างห้อง
    const roomId = Math.random().toString(36).substring(2, 7); // roomId ยาวขึ้นหน่อย
    rooms[roomId] = {
      id: roomId,
      players: [
        {
          id: socket.id,
          name,
          role: "เจ้ามือ",
          cards: [],
          hasChosen: false,
          balance: parseFloat(balance) || 1000, // เพิ่ม parseFloat และ default balance
          originalBalance: parseFloat(balance) || 1000,
          income: [],
          expense: [],
        },
      ],
      deck: [],
      dealerId: socket.id,
      isGameStarted: false,
      currentTurnId: null,
      betAmount: parseInt(betAmount) || DEFAULT_BET_AMOUNT, // <--- เก็บ bet amount ของห้อง
    };
    socket.join(roomId);
    cb({ roomId, success: true });
    sendPlayers(roomId);
    sendPlayersData(roomId);
    sendUsersInRoom(roomId);
    io.to(roomId).emit("roomSettings", { betAmount: rooms[roomId].betAmount }); // แจ้ง betAmount ให้ทุกคนในห้อง
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

    // ตรวจสอบว่าชื่อซ้ำหรือไม่
    if (room.players.some((p) => p.name === name)) {
      return cb({ success: false, message: "ชื่อนี้มีคนใช้แล้วในห้องนี้" });
    }

    room.players.push({
      id: socket.id,
      name,
      role: `ผู้เล่นที่ ${
        room.players.filter((p) => p.role !== "เจ้ามือ").length + 1
      }`, // ปรับการตั้งชื่อ role
      cards: [],
      hasChosen: false,
      balance: parseFloat(balance) || 500, // เพิ่ม parseFloat และ default balance
      originalBalance: parseFloat(balance) || 500,
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
    if (!room || room.players.length < 2) {
      // ต้องมีผู้เล่นอย่างน้อย 2 คน (รวมเจ้ามือ)
      if (room)
        io.to(room.dealerId).emit("message", {
          text: "ผู้เล่นไม่พอที่จะเริ่มเกม (ต้องมีอย่างน้อย 1 ขาไพ่)",
        });
      return;
    }
    if (socket.id !== room.dealerId) {
      // ตรวจสอบว่าเป็นเจ้ามือหรือไม่
      return socket.emit("message", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเริ่มเกมได้",
      });
    }

    room.isGameStarted = true;
    room.deck = createShuffledDeck();
    room.players.forEach((p) => {
      p.cards = [];
      p.hasChosen = false;
      // รีเซ็ต income/expense ของรอบก่อน ถ้าต้องการ
      // p.income = [];
      // p.expense = [];
      // p.originalBalance = p.balance; // ตั้ง originalBalance ใหม่ทุกรอบ
    });

    for (let i = 0; i < 2; i++) {
      room.players.forEach((p) => {
        if (room.deck.length > 0) {
          // ตรวจสอบว่ามีไพ่ในสำรับพอ
          p.cards.push(room.deck.pop());
        }
      });
    }

    room.players.forEach((p) => {
      const handRank = getHandRank(p.cards);
      io.to(p.id).emit("yourCards", { cards: p.cards, handRank }); // ส่ง rank ไปด้วย
      io.to(p.id).emit("resetGame"); // Client ควร reset UI ของตัวเอง
    });

    io.to(roomId).emit("gameStarted", { betAmount: room.betAmount }); // แจ้งว่าเกมเริ่มแล้ว พร้อม bet amount
    io.to(roomId).emit("lockRoom"); // อาจจะใช้เพื่อล็อคไม่ให้คนเข้าเพิ่ม
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
      if (room.deck.length > 0) {
        player.cards.push(room.deck.pop());
        player.hasChosen = true; // เมื่อจั่วแล้ว ถือว่าตัดสินใจแล้วสำหรับ turn นี้
        const handRank = getHandRank(player.cards);
        io.to(socket.id).emit("yourCards", { cards: player.cards, handRank });
        io.to(roomId).emit("playerAction", {
          playerId: player.id,
          playerName: player.name,
          action: "draw",
        });

        const orderedPlayers = [
          ...room.players.filter((p) => p.role !== "เจ้ามือ"),
          room.players.find((p) => p.role === "เจ้ามือ"),
        ].filter(Boolean); // filter(Boolean) เพื่อกรอง undefined ออกกรณีไม่มีเจ้ามือ (ซึ่งไม่ควรเกิด)

        const currentIndex = orderedPlayers.findIndex(
          (p) => p.id === socket.id
        );
        clearTurnTimer(roomId);
        startNextTurn(roomId, currentIndex + 1);
      } else {
        socket.emit("message", { text: "ไพ่ในสำรับหมดแล้ว" });
      }
    }
  });

  socket.on("stay", ({ roomId }) => {
    const room = rooms[roomId];
    const player = room?.players.find((p) => p.id === socket.id);

    if (player && room.currentTurnId === socket.id && !player.hasChosen) {
      player.hasChosen = true;
      io.to(roomId).emit("playerAction", {
        playerId: player.id,
        playerName: player.name,
        action: "stay",
      });

      const orderedPlayers = [
        ...room.players.filter((p) => p.role !== "เจ้ามือ"),
        room.players.find((p) => p.role === "เจ้ามือ"),
      ].filter(Boolean);

      const currentIndex = orderedPlayers.findIndex((p) => p.id === socket.id);
      clearTurnTimer(roomId);
      startNextTurn(roomId, currentIndex + 1);
    }
  });

  socket.on("showResult", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.dealerId || !room.isGameStarted) {
      // ตรวจสอบว่าเป็นเจ้ามือ และเกมเริ่มแล้ว
      return;
    }
    // ตรวจสอบว่าผู้เล่นทุกคนได้ทำการเลือก (hasChosen = true)
    const allPlayersChosen = room.players.every(
      (p) => p.hasChosen || p.cards.length === 0
    ); // หรือไม่มีไพ่เลย
    if (!allPlayersChosen) {
      return socket.emit("message", {
        text: "ยังดำเนินการไม่ครบทุกคน รอสักครู่",
      });
    }

    handleResultOnly(roomId);
    // sendPlayers(roomId); // handleResultOnly จะมีการ update balance แล้วค่อย emit result ซึ่ง client ควรอัพเดทจาก result
    // การส่ง sendPlayers อีกครั้งอาจไม่จำเป็น หรือถ้าจะส่งก็ควรส่งหลัง handleResultOnly เสร็จสิ้นสมบูรณ์
    // โดยปกติหลัง handleResultOnly จะมีการ emit 'result' ซึ่งมีข้อมูลครบถ้วนอยู่แล้ว
  });

  socket.on("endGame", ({ roomId }) => {
    // เจ้ามือเป็นคนสั่งจบเกม (เช่น จบรอบและจะเริ่มรอบใหม่ หรือปิดห้อง)
    const room = rooms[roomId];
    if (!room || socket.id !== room.dealerId) return; // เฉพาะเจ้ามือ

    room.isGameStarted = false;
    clearTurnTimer(roomId);
    io.to(roomId).emit("gameEnded"); // แจ้งทุกคนว่าเกมจบแล้ว
    sendSummary(roomId); // ส่งสรุปผล
    sendUsersInRoom(roomId); // อัปเดตรายชื่อผู้ใช้ (อาจจะมีคนเข้า/ออกระหว่างนี้)
    io.to(roomId).emit("unlockRoom"); // ถ้ามีการล็อคห้องตอนเริ่มเกม
    // อาจจะ reset ข้อมูลบางอย่างใน room object เพื่อเตรียมสำหรับเกมใหม่ถ้าไม่ปิดห้อง
  });

  socket.on("requestSummary", ({ roomId }) => {
    sendSummary(roomId);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];
        console.log(
          `${disconnectedPlayer.name} disconnected from room ${roomId}`
        );
        io.to(roomId).emit("playerLeft", {
          playerId: disconnectedPlayer.id,
          name: disconnectedPlayer.name,
          message: `${disconnectedPlayer.name} ออกจากห้องไปแล้ว`,
        });

        if (room.isGameStarted) {
          if (disconnectedPlayer.role === "เจ้ามือ") {
            io.to(roomId).emit("message", {
              text: "เจ้ามือออกจากห้อง! เกมปัจจุบันจะถูกคำนวณผลและสิ้นสุดลง",
            });
            handleResultOnly(roomId); // คำนวณผลจากสถานะปัจจุบัน
            room.isGameStarted = false; // สิ้นสุดเกม
            sendSummary(roomId);
            io.to(roomId).emit("gameEnded");
            // อาจจะต้องลบห้องเลย หรือให้ผู้เล่นอื่นออกจากห้อง
            // clearTurnTimer(roomId);
            // delete rooms[roomId];
            // console.log(`Room ${roomId} closed as dealer disconnected mid-game.`);
            // return; // ออกจาก loop for...in rooms
          } else {
            // ผู้เล่นธรรมดาหลุด
            forceStayAndReveal(disconnectedPlayer); // บังคับ stay ผู้เล่นที่หลุด
            // ตรวจสอบว่าผู้เล่นทุกคนที่เหลือ (ที่ไม่ใช่คนที่เพิ่งหลุด) ได้ทำการตัดสินใจหรือยัง
            // ถ้าทุกคนตัดสินใจแล้ว และ currentTurn เป็นของคนที่หลุด หรือผ่านไปแล้ว อาจจะ trigger ให้เจ้ามือ showResult ได้
            const remainingPlayers = room.players.filter(
              (p) => p.id !== disconnectedPlayer.id
            );
            const allOthersChosen = remainingPlayers.every(
              (p) => p.hasChosen || p.role === "เจ้ามือ"
            ); // เจ้ามืออาจจะยังไม่ได้ hasChosen ถ้าเป็นตาสุดท้าย
            if (
              allOthersChosen &&
              room.players.find((p) => p.role === "เจ้ามือ")
            ) {
              //ถ้าเหลือแต่เจ้ามือ หรือทุกคนเล่นแล้ว
              //และถ้า currentTurnId ไม่ใช่ของเจ้ามือ หรือเป็นของคนที่หลุดไป
              //อาจจะเลื่อน turn หรือให้เจ้ามือสรุปผล
              if (room.currentTurnId === disconnectedPlayer.id) {
                clearTurnTimer(roomId);
                const ordered = [
                  ...room.players.filter(
                    (p) =>
                      p.role !== "เจ้ามือ" && p.id !== disconnectedPlayer.id
                  ), //เอาคนออกไปแล้ว
                  room.players.find((p) => p.role === "เจ้ามือ"),
                ].filter(Boolean);
                const nextPlayerIndex = ordered.findIndex((p) => !p.hasChosen); //หาคนถัดไปที่ยังไม่เลือก
                if (nextPlayerIndex !== -1) {
                  startNextTurn(roomId, nextPlayerIndex);
                } else if (room.players.find((p) => p.role === "เจ้ามือ")) {
                  io.to(room.dealerId).emit("enableShowResult");
                }
              }
            }
          }
        }

        // ลบผู้เล่นออกจากอาร์เรย์ players
        room.players.splice(playerIndex, 1);

        // ถ้าห้องว่างแล้ว ให้ลบห้องนั้นทิ้ง
        if (room.players.length === 0) {
          clearTurnTimer(roomId);
          delete rooms[roomId];
          console.log(`Room ${roomId} was empty and has been deleted.`);
        } else {
          // ถ้าเจ้ามือคนปัจจุบันเป็นคนที่เพิ่งหลุด และยังมีผู้เล่นเหลืออยู่ แต่เกมยังไม่เริ่ม
          // อาจจะต้องมีการเลือกเจ้ามือใหม่ หรือปิดห้อง (ตรงนี้โค้ดเดิมไม่ได้จัดการเรื่องการเปลี่ยนเจ้ามือ)
          if (
            room.dealerId === disconnectedPlayer.id &&
            !room.isGameStarted &&
            room.players.length > 0
          ) {
            io.to(roomId).emit("message", {
              text: "เจ้ามือออกจากห้องแล้ว โปรดให้ผู้เล่นคนอื่นสร้างห้องใหม่",
            });
            // หรือจะ promote ผู้เล่นคนถัดไปเป็นเจ้ามือ (ซับซ้อนขึ้น)
            // rooms[roomId].dealerId = room.players[0].id;
            // room.players[0].role = "เจ้ามือ";
            // io.to(roomId).emit("newDealer", { playerId: room.players[0].id, name: room.players[0].name });
          }
          // อัปเดตรายชื่อผู้เล่นให้คนที่ยังอยู่ในห้อง
          sendPlayers(roomId);
          sendPlayersData(roomId);
          sendUsersInRoom(roomId);
        }
        break; // ออกจาก loop for...in rooms เมื่อเจอและจัดการผู้เล่นที่หลุดแล้ว
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
