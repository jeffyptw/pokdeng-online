const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://pokdeng-online1.onrender.com", // ตรวจสอบ origin ของ client
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

const DEFAULT_BET_AMOUNT = 5;

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
    return { rank: 7, type: "ไม่มีไพ่", score: 0 };
  }
  const values = cards.map((c) => c.value);
  const suits = cards.map((c) => c.suit);
  const score = calculateScore(cards);
  const sameSuit = suits.every((s) => s === suits[0]);
  const count = {};
  values.forEach((v) => (count[v] = (count[v] || 0) + 1));
  const allJQK =
    cards.length === 3 && values.every((v) => ["J", "Q", "K"].includes(v)); // ตรวจสอบ 3 ใบ

  const sortedNumericalValues = cards
    .map((c) => ({ A: 1, J: 11, Q: 12, K: 13 }[c.value] || parseInt(c.value)))
    .sort((a, b) => a - b);

  const isQKA =
    cards.length === 3 &&
    sortedNumericalValues[0] === 1 && // A
    sortedNumericalValues[1] === 12 && // Q
    sortedNumericalValues[2] === 13; // K

  const isStraight =
    cards.length === 3 &&
    ((sortedNumericalValues[1] === sortedNumericalValues[0] + 1 &&
      sortedNumericalValues[2] === sortedNumericalValues[1] + 1) ||
      isQKA);

  if (cards.length === 2) {
    const isDouble =
      cards[0].value === cards[1].value || cards[0].suit === cards[1].suit; //เงื่อนไขเด้ง
    if (score === 9)
      return { rank: 1, type: isDouble ? "ป๊อก 9 สองเด้ง" : "ป๊อก 9", score };
    if (score === 8)
      return { rank: 1, type: isDouble ? "ป๊อก 8 สองเด้ง" : "ป๊อก 8", score };
  }

  if (cards.length === 3) {
    if (Object.values(count).includes(3))
      return { rank: 2, type: "ตอง", score }; // แต้มของตองคือแต้มไพ่ใบนั้นๆ ไม่ใช่ผลรวม % 10
    if (isStraight && sameSuit) return { rank: 3, type: "สเตรทฟลัช", score: 0 }; // สเตรทฟลัช ไม่คิดแต้ม score
    if (allJQK) return { rank: 4, type: "เซียน", score }; // เซียน (JQK 3 ใบ)
    if (isStraight) return { rank: 5, type: "เรียง", score: 0 }; // เรียง ไม่คิดแต้ม score
    if (sameSuit) return { rank: 6, type: "สี (สามเด้ง)", score }; // สี หรือดอกเดียวกัน 3 ใบ
  }
  // กรณี 2 ใบธรรมดาแต่เด้ง หรือ 3 ใบธรรมดา (ไม่ใช่สี)
  if (
    cards.length === 2 &&
    (cards[0].value === cards[1].value || cards[0].suit === cards[1].suit)
  ) {
    return { rank: 6, type: "แต้มธรรมดา สองเด้ง", score };
  }
  return { rank: 6, type: "แต้มธรรมดา", score }; // แต้มธรรมดา 1 เด้ง (2 หรือ 3 ใบ)
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
  if (!room || !room.players) return;
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
  if (!room || !room.players || room.players.length === 0) {
    console.error(
      `Room or players not found for result handling in room ${roomId}`
    );
    return;
  }
  const dealer = room.players.find((p) => p.id === room.dealerId); // ใช้ room.dealerId
  if (!dealer) {
    console.error(`Dealer not found for result handling in room ${roomId}`);
    return; // ถ้าไม่มีเจ้ามือ ก็ไม่ควรคำนวณผล
  }

  const dealerRank = getHandRank(dealer.cards);
  const bet = room.betAmount || DEFAULT_BET_AMOUNT;

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

  const results = [];

  for (const p of room.players) {
    if (!p || !p.cards || p.cards.length === 0) continue;

    const rank = getHandRank(p.cards);
    const result = {
      name: `${p.name} (${p.role})`,
      cards: p.cards.map((c) => `${c.value}${c.suit}`).join(", "),
      sum: rank.score, // ใช้ score จาก rank โดยตรง (getHandRank ปรับให้ score ของตอง เรียง สเตรทฟลัช ถูกต้อง)
      specialType: rank.type,
      outcome: "",
      moneyChange: 0,
    };

    if (p.id === dealer.id) {
      // เปรียบเทียบด้วย p.id กับ dealer.id
      result.outcome = "dealer";
    } else {
      const playerPayoutMultiplier = payoutRate[rank.type] || 1;
      const dealerPayoutMultiplier = payoutRate[dealerRank.type] || 1;

      // Player wins
      if (
        rank.rank < dealerRank.rank ||
        (rank.rank === dealerRank.rank && rank.score > dealerRank.score)
      ) {
        result.outcome = "win";
        result.moneyChange = playerPayoutMultiplier * bet;
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
        // ผู้เล่นเสียตามอัตราจ่ายของ "มือผู้เล่น" หรือ "มือเจ้ามือ" ขึ้นอยู่กับกติกา
        // โดยทั่วไป ถ้าเจ้ามือชนะด้วยมือพิเศษ (เช่น ป๊อกเด้ง) ผู้เล่นเสียตามเด้งของเจ้ามือ
        // ถ้าผู้เล่นแพ้มือธรรมดาของเจ้ามือ ผู้เล่นเสียตามเด้งของตนเอง
        let lossMultiplier = playerPayoutMultiplier; // เริ่มต้นให้เสียตามเด้งตัวเอง
        if (dealerRank.rank === 1) {
          // ถ้าเจ้ามือป๊อก
          lossMultiplier = dealerPayoutMultiplier; // ผู้เล่นเสียตามเด้งของเจ้ามือ
        }
        result.moneyChange = -lossMultiplier * bet;

        p.balance += result.moneyChange;
        dealer.balance -= result.moneyChange;

        p.expense.push({ to: dealer.name, amount: -result.moneyChange });
        dealer.income.push({ from: p.name, amount: -result.moneyChange });
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

function startNextTurn(roomId, turnIndex = 0) {
  const room = rooms[roomId];
  if (
    !room ||
    !room.isGameStarted ||
    !room.orderedGamePlayers ||
    room.orderedGamePlayers.length === 0
  ) {
    clearTurnTimer(roomId);
    return;
  }

  const orderedPlayers = room.orderedGamePlayers; // ใช้ลำดับผู้เล่นที่จัดเตรียมไว้

  if (turnIndex >= orderedPlayers.length) {
    const dealerInGame = orderedPlayers.find((p) => p.id === room.dealerId);
    if (dealerInGame) {
      io.to(dealerInGame.id).emit("enableShowResult");
    } else {
      console.error(
        `No dealer found in orderedGamePlayers for room ${roomId} at end of turns.`
      );
      // อาจจะจบเกมหรือ handle กรณีไม่มีเจ้ามือใน ordered list
    }
    return;
  }

  const currentPlayer = orderedPlayers[turnIndex];
  if (!currentPlayer) {
    // Safety net, should not happen if orderedPlayers is correct
    startNextTurn(roomId, turnIndex + 1);
    return;
  }

  room.currentTurnId = currentPlayer.id;
  io.to(roomId).emit("currentTurn", {
    id: currentPlayer.id,
    name: currentPlayer.name,
    role: currentPlayer.role,
  });
  sendPlayersData(roomId);

  const currentHand = getHandRank(currentPlayer.cards);
  // ผู้เล่นป๊อก (ที่ไม่ใช่เจ้ามือ) หรือ เจ้ามือที่มีไพ่ 3 ใบแล้ว หรือ เจ้ามือป๊อก จะถูกข้ามตา (ถือว่าอยู่)
  if (
    (currentPlayer.id !== room.dealerId &&
      currentHand.type.startsWith("ป๊อก")) ||
    (currentPlayer.id === room.dealerId &&
      (currentPlayer.cards.length === 3 || currentHand.type.startsWith("ป๊อก")))
  ) {
    currentPlayer.hasChosen = true;
    io.to(currentPlayer.id).emit("yourCards", {
      cards: currentPlayer.cards,
      handRank: currentHand,
    });
    clearTurnTimer(roomId);
    startNextTurn(roomId, turnIndex + 1);
    return;
  }
  // เจ้ามือที่ยังไม่ได้ป๊อกและมีไพ่ 2 ใบ จะไม่ได้รับ timer (รอผู้เล่นอื่นก่อน)
  if (
    currentPlayer.id === room.dealerId &&
    currentPlayer.cards.length === 2 &&
    !currentHand.type.startsWith("ป๊อก")
  ) {
    // ไม่เริ่ม timer ให้เจ้ามือ, เจ้ามือจะตัดสินใจตอนสุดท้าย (enableShowResult)
    // หรืออาจจะมี logic ให้เจ้ามือ "อยู่" หรือ "จั่ว" ที่นี่ถ้าต้องการให้ auto
    // ปัจจุบันคือรอให้ผู้เล่นอื่นเสร็จ แล้วเจ้ามือค่อยกด "เปิดไพ่" ซึ่งจะ handleResultOnly
    // หรือถ้าจะให้เจ้ามือมี action "จั่ว/อยู่" เหมือนผู้เล่น ก็ต้องปรับ logic ตรงนี้
    // For now, assume dealer turn means enableShowResult if all players are done
    // The current logic implies dealer doesn't take an explicit turn via this timer.
    // The `turnIndex >= orderedPlayers.length` handles enabling show result for dealer.
    // If dealer is the last one in `orderedPlayers`, this `startNextTurn` will be called for dealer.
    // We need to ensure dealer has a chance to act or the game proceeds.
    // If it's dealer's turn and they are not forced to stay, they should get options or game enables showResult.
    // Let's assume dealer's "turn" is simply the point where they can show results if others are done.
    // The `enableShowResult` handles this. This part might need more specific dealer action logic if dealer can draw.
    // For now, if it reaches dealer and they didn't auto-stay, it should wait for showResult.
    // Let's simplify: if it's dealer's turn, and they haven't auto-stayed, we just wait for their showResult action.
    // The `enableShowResult` in the `turnIndex >= orderedPlayers.length` handles this.
    // So, we might not need a specific timeout for dealer here. Or dealer makes decision after all players played.
    // The current logic in `startNextTurn` for dealer is: if they have 3 cards or pok, they auto-stay.
    // If they have 2 cards and not pok, they don't get a timer here.
    // The turn moves to next player, or if dealer is last, enableShowResult is emitted.
    // This seems okay. The dealer decides when to "showResult".
  } else {
    // ผู้เล่นธรรมดา (ไม่ใช่เจ้ามือ) ที่ยังไม่ป๊อก
    turnTimers[roomId] = setTimeout(() => {
      if (
        rooms[roomId] &&
        rooms[roomId].currentTurnId === currentPlayer.id &&
        !currentPlayer.hasChosen
      ) {
        currentPlayer.hasChosen = true;
        io.to(currentPlayer.id).emit("yourCards", {
          cards: currentPlayer.cards,
          handRank: getHandRank(currentPlayer.cards),
        });
        io.to(roomId).emit("playerAction", {
          playerId: currentPlayer.id,
          playerName: currentPlayer.name,
          action: "stay (timeout)",
        });
        startNextTurn(roomId, turnIndex + 1);
      }
    }, 15000);
  }
}

function forceStayAndReveal(player) {
  if (player && !player.hasChosen) {
    player.hasChosen = true;
    // No emit needed here, data will be used in handleResultOnly
    console.log(
      `Player ${player.name} (${player.id}) was forced to stay due to disconnect.`
    );
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, balance, betAmount }, cb) => {
    const roomId = Math.random().toString(36).substring(2, 7);
    rooms[roomId] = {
      id: roomId,
      players: [
        {
          id: socket.id,
          name,
          role: "เจ้ามือ",
          cards: [],
          hasChosen: false,
          balance: parseFloat(balance) || 1000,
          originalBalance: parseFloat(balance) || 1000,
          income: [],
          expense: [],
        },
      ],
      deck: [],
      dealerId: socket.id, // กำหนด dealerId ตอนสร้างห้อง
      isGameStarted: false,
      currentTurnId: null,
      betAmount: parseInt(betAmount) || DEFAULT_BET_AMOUNT,
      orderedGamePlayers: [], // สำหรับเก็บลำดับผู้เล่นในแต่ละรอบเกม
    };
    socket.join(roomId);
    cb({ roomId, success: true });
    sendPlayers(roomId);
    sendPlayersData(roomId);
    sendUsersInRoom(roomId);
    io.to(roomId).emit("roomSettings", { betAmount: rooms[roomId].betAmount });
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
    if (room.players.some((p) => p.name === name)) {
      return cb({ success: false, message: "ชื่อนี้มีคนใช้แล้วในห้องนี้" });
    }

    const playerRole = `ผู้เล่นที่ ${
      room.players.filter((p) => p.id !== room.dealerId).length + 1
    }`;
    room.players.push({
      id: socket.id,
      name,
      role: playerRole,
      cards: [],
      hasChosen: false,
      balance: parseFloat(balance) || 500,
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
      if (room)
        io.to(room.dealerId).emit("message", {
          text: "ผู้เล่นไม่พอที่จะเริ่มเกม (ต้องมีอย่างน้อย 1 ขาไพ่)",
        });
      return;
    }
    if (socket.id !== room.dealerId) {
      return socket.emit("message", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเริ่มเกมได้",
      });
    }

    room.isGameStarted = true;
    room.deck = createShuffledDeck();
    room.players.forEach((p) => {
      p.cards = [];
      p.hasChosen = false;
      p.originalBalance = p.balance; // รีเซ็ต originalBalance ทุกรอบ
      p.income = [];
      p.expense = [];
    });

    // --- START: จัดลำดับผู้เล่นและแจกไพ่ ---
    const dealer = room.players.find((p) => p.id === room.dealerId);
    const nonDealers = room.players.filter((p) => p.id !== room.dealerId);

    nonDealers.sort((a, b) => {
      const roleA = a.role.match(/ผู้เล่นที่ (\d+)/);
      const roleB = b.role.match(/ผู้เล่นที่ (\d+)/);
      const numA = roleA ? parseInt(roleA[1]) : Infinity;
      const numB = roleB ? parseInt(roleB[1]) : Infinity;
      return numA - numB;
    });

    room.orderedGamePlayers = [...nonDealers]; // ผู้เล่นอื่นเรียงตามหมายเลข
    if (dealer) {
      room.orderedGamePlayers.push(dealer); // เจ้ามืออยู่ท้ายสุด
    } else {
      console.error(
        "CRITICAL: Dealer not found during startGame player ordering!"
      );
      // Handle error, perhaps don't start game
      return;
    }

    // แจกไพ่ตามลำดับที่จัดใหม่
    for (let i = 0; i < 2; i++) {
      for (const player of room.orderedGamePlayers) {
        if (room.deck.length > 0) {
          player.cards.push(room.deck.pop());
        } else {
          console.warn("Deck ran out of cards during initial deal.");
          break; // ออกจาก loop แจกไพ่ถ้าไพ่หมด
        }
      }
      if (room.deck.length === 0 && i < 1) break; // ออกจาก loop หลักถ้าไพ่หมดก่อนแจกครบ
    }
    // --- END: จัดลำดับผู้เล่นและแจกไพ่ ---

    // ส่งข้อมูลไพ่ให้แต่ละคน (อาจจะวน room.players หรือ room.orderedGamePlayers ก็ได้เพราะทุกคนมีไพ่แล้ว)
    room.players.forEach((p) => {
      const handRank = getHandRank(p.cards);
      io.to(p.id).emit("yourCards", { cards: p.cards, handRank });
      io.to(p.id).emit("resetGame");
    });

    io.to(roomId).emit("gameStarted", { betAmount: room.betAmount });
    io.to(roomId).emit("lockRoom");
    sendPlayers(roomId); // ส่งข้อมูลผู้เล่นหลังแจกไพ่
    sendPlayersData(roomId);
    sendUsersInRoom(roomId); // อัปเดตสถานะ isGameStarted ใน client ด้วย
    startNextTurn(roomId, 0); // เริ่มเทิร์นแรกจาก "ผู้เล่นที่ 1" ใน orderedGamePlayers
  });

  socket.on("drawCard", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.isGameStarted || !room.orderedGamePlayers) return;
    const player = room.players.find((p) => p.id === socket.id);

    if (
      player &&
      room.currentTurnId === socket.id &&
      player.cards.length < 3 &&
      !player.hasChosen
    ) {
      if (room.deck.length > 0) {
        player.cards.push(room.deck.pop());
        player.hasChosen = true;
        const handRank = getHandRank(player.cards);
        io.to(socket.id).emit("yourCards", { cards: player.cards, handRank });
        io.to(roomId).emit("playerAction", {
          playerId: player.id,
          playerName: player.name,
          action: "draw",
        });

        const orderedPlayers = room.orderedGamePlayers;
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
    if (!room || !room.isGameStarted || !room.orderedGamePlayers) return;
    const player = room.players.find((p) => p.id === socket.id);

    if (player && room.currentTurnId === socket.id && !player.hasChosen) {
      player.hasChosen = true;
      io.to(roomId).emit("playerAction", {
        playerId: player.id,
        playerName: player.name,
        action: "stay",
      });

      const orderedPlayers = room.orderedGamePlayers;
      const currentIndex = orderedPlayers.findIndex((p) => p.id === socket.id);
      clearTurnTimer(roomId);
      startNextTurn(roomId, currentIndex + 1);
    }
  });

  socket.on("showResult", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.dealerId || !room.isGameStarted) {
      return socket.emit("message", {
        text: "เฉพาะเจ้ามือที่กำลังเล่นอยู่เท่านั้นที่สามารถเปิดไพ่ได้",
      });
    }
    // ตรวจสอบว่าผู้เล่นทุกคน (ใน orderedGamePlayers) ได้ทำการเลือก (hasChosen = true) หรือไพ่ครบแล้ว
    const allPlayersChosen = room.orderedGamePlayers.every(
      (p) =>
        p.hasChosen ||
        (p.id === room.dealerId && p.cards.length >= 2) || // เจ้ามือถือว่า chosen ถ้ามีไพ่ (รอเปิด)
        getHandRank(p.cards).type.startsWith("ป๊อก") || // คนที่ป๊อกถือว่า chosen
        p.cards.length === 0 ||
        p.cards.length === 3 // คนที่ไพ่หมดหรือ 3 ใบถือว่า chosen
    );

    if (!allPlayersChosen) {
      const notChosenPlayer = room.orderedGamePlayers.find(
        (p) =>
          !p.hasChosen &&
          p.cards.length < 3 &&
          !getHandRank(p.cards).type.startsWith("ป๊อก") &&
          p.id !== room.dealerId
      );
      return socket.emit("message", {
        text: `ยังดำเนินการไม่ครบทุกคน รอ ${
          notChosenPlayer ? notChosenPlayer.name : "ผู้เล่น"
        } ก่อน`,
      });
    }

    handleResultOnly(roomId);
  });

  socket.on("endGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || socket.id !== room.dealerId) {
      return socket.emit("message", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถจบเกมได้",
      });
    }

    room.isGameStarted = false;
    clearTurnTimer(roomId);
    io.to(roomId).emit("gameEnded");
    sendSummary(roomId);
    // sendUsersInRoom(roomId); // อาจไม่จำเป็นถ้า client จัดการดีแล้ว
    io.to(roomId).emit("unlockRoom");
    room.orderedGamePlayers = []; // เคลียร์ลำดับผู้เล่นสำหรับรอบใหม่
  });

  socket.on("requestSummary", ({ roomId }) => {
    // client อาจจะ request summary เองถ้าจำเป็น
    sendSummary(roomId);
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);

      if (playerIndex !== -1) {
        const disconnectedPlayer = { ...room.players[playerIndex] }; // Clone for safety
        console.log(
          `${disconnectedPlayer.name} (${disconnectedPlayer.id}) disconnected from room ${roomId}`
        );
        io.to(roomId).emit("playerLeft", {
          playerId: disconnectedPlayer.id,
          name: disconnectedPlayer.name,
          message: `${disconnectedPlayer.name} ออกจากห้องไปแล้ว`,
        });

        const wasDealer = disconnectedPlayer.id === room.dealerId;

        if (room.isGameStarted) {
          forceStayAndReveal(room.players[playerIndex]); // บังคับผู้เล่นที่หลุด (ใน array จริง) ให้อยู่

          if (wasDealer) {
            io.to(roomId).emit("message", {
              text: "เจ้ามือออกจากห้อง! เกมปัจจุบันจะถูกคำนวณผลและสิ้นสุดลง",
            });
            handleResultOnly(roomId);
            room.isGameStarted = false;
            sendSummary(roomId);
            io.to(roomId).emit("gameEnded");
            // ลบผู้เล่นออกหลังเกมจบ
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0) {
              clearTurnTimer(roomId);
              delete rooms[roomId];
              console.log(
                `Room ${roomId} closed as dealer disconnected mid-game and room became empty.`
              );
            } else {
              // ถ้ายังมีผู้เล่นเหลือ ให้แจ้งว่าเจ้ามือออกแล้ว และอาจจะต้องให้สร้างห้องใหม่
              io.to(roomId).emit("message", {
                text: "เจ้ามือออกจากห้องแล้ว โปรดให้ผู้เล่นคนอื่นสร้างห้องใหม่ หรือออกจากห้องปัจจุบัน",
              });
              // อาจจะ promote เจ้ามือใหม่ถ้าต้องการ แต่ซับซ้อน
            }
          } else {
            // ผู้เล่นธรรมดาหลุด
            room.players.splice(playerIndex, 1); // ลบผู้เล่นออกทันทีหลัง forceStay
            // อัปเดต orderedGamePlayers ถ้าเกมยังดำเนินอยู่
            if (room.orderedGamePlayers && room.orderedGamePlayers.length > 0) {
              const disconnectedPlayerIndexInOrder =
                room.orderedGamePlayers.findIndex(
                  (p) => p.id === disconnectedPlayer.id
                );
              if (disconnectedPlayerIndexInOrder !== -1) {
                room.orderedGamePlayers.splice(
                  disconnectedPlayerIndexInOrder,
                  1
                );
              }
            }

            if (room.currentTurnId === disconnectedPlayer.id) {
              // ถ้าเป็นตาของผู้เล่นที่หลุด
              clearTurnTimer(roomId);
              // หา index ของคนที่หลุดใน orderedGamePlayers *ก่อน* ลบออก เพื่อหาคนถัดไป
              // หรือใช้ turnIndex ที่ส่งมากับ startNextTurn
              // ตรงนี้ซับซ้อน ต้องแน่ใจว่า turnIndex ของ startNextTurn ถูกต้อง
              // วิธีที่ง่ายกว่าคือ ให้ startNextTurn หาคนถัดไปใน orderedGamePlayers ที่อัปเดตแล้ว
              // ถ้าคนปัจจุบันใน order หายไป ก็เริ่มจาก index เดิมของคนนั้น
              const currentActivePlayerIndex =
                room.orderedGamePlayers.findIndex(
                  (p) => p.id === room.currentTurnId
                ); // อาจจะไม่เจอถ้า currentTurnId คือคนที่หลุด
              startNextTurn(
                roomId,
                currentActivePlayerIndex !== -1 ? currentActivePlayerIndex : 0
              ); // ลองเริ่มใหม่จาก index ที่ควรจะเป็น หรือ 0
            }
          }
        } else {
          // เกมยังไม่เริ่ม, ลบผู้เล่นออกได้เลย
          room.players.splice(playerIndex, 1);
          if (wasDealer && room.players.length > 0) {
            // เจ้ามือออกก่อนเริ่มเกม และยังมีคนอยู่
            io.to(roomId).emit("message", {
              text: "เจ้ามือออกจากห้องแล้ว โปรดให้ผู้เล่นคนอื่นสร้างห้องใหม่ หรือออกจากห้องปัจจุบัน",
            });
            // อาจจะปิดห้องเลย หรือ promote เจ้ามือใหม่
            // delete rooms[roomId];
            // console.log(`Room ${roomId} closed as dealer left before game start.`);
          }
        }

        // ถ้าห้องว่างแล้ว ให้ลบห้องนั้นทิ้ง (กรณีผู้เล่นธรรมดาหลุด หรือเจ้ามือหลุดแล้วเกมจบ)
        if (room.players.length === 0) {
          clearTurnTimer(roomId);
          delete rooms[roomId];
          console.log(`Room ${roomId} was empty and has been deleted.`);
        } else {
          // อัปเดตรายชื่อผู้เล่นให้คนที่ยังอยู่ในห้อง
          sendPlayers(roomId);
          sendPlayersData(roomId);
          sendUsersInRoom(roomId);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`✅ Server started on port ${PORT}`));
