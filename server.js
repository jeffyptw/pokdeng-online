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
      "https://pokdeng-online1.onrender.com", // Your deployed client
      "http://localhost:3000", // Common React dev port
      "http://localhost:3001", // If server and client on different local ports
      "http://localhost:5173", // Common Vite dev port
      "http://127.0.0.1:5173", // Another common Vite dev port
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const rooms = {};
const DEFAULT_BET_AMOUNT = 5; // ตามที่คุณตั้งไว้
const TURN_DURATION = 30;

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
  const parsedValue = parseInt(value);
  return isNaN(parsedValue) ? 0 : parsedValue; // Handle non-numeric like A,K,Q,J if not caught before
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
    .filter((val) => typeof val === "number")
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
      const highCardValue = isQKAStraight
        ? 13.5
        : sortedNumericalValues[2] || 0;
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
      const highCardValue = isQKAStraight
        ? 13.5
        : sortedNumericalValues[2] || 0;
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
  if (!room || !room.players) return;
  const activePlayerData = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    balance: p.balance,
    isDealer: p.id === room.dealerId,
  }));
  console.log(
    `[Server] Emitting 'playersData' for room ${roomId}:`,
    JSON.stringify(
      activePlayerData.map((p) => ({ name: p.name, role: p.role }))
    )
  );
  io.to(roomId).emit("playersData", activePlayerData);
}

function getOrderedGamePlayersWithDealerForTurns(participants, dealerId) {
  if (!participants || participants.length === 0) {
    console.log(
      "[Server] getOrderedGamePlayersWithDealerForTurns: No participants."
    );
    return [];
  }
  const nonDealers = participants.filter(
    (p) => p.id !== dealerId && !p.disconnectedMidGame
  );
  const dealer = participants.find(
    (p) => p.id === dealerId && !p.disconnectedMidGame
  );

  nonDealers.sort((a, b) => {
    const numA = parseInt(a.role.match(/\d+/)?.[0] || "999");
    const numB = parseInt(b.role.match(/\d+/)?.[0] || "999");
    return numA - numB;
  });

  let ordered = [...nonDealers];
  if (
    dealer &&
    dealer.cards &&
    dealer.cards.length === 2 &&
    getHandRank(dealer.cards).rank !== 1
  ) {
    // เจ้ามือจะได้เล่นถ้ายังไม่ป๊อกและมีไพ่ 2 ใบ
    ordered.push(dealer); // เพิ่มเจ้ามือเข้าไปในลำดับการเล่น (เป็นคนสุดท้าย)
  } else if (dealer) {
    // ถ้าเจ้ามือป๊อก หรือมีไพ่ไม่ครบ 2 ใบ (ซึ่งไม่ควรเกิด) หรือหลุดไปแล้ว ก็ไม่ต้องเพิ่มใน turn order
    // แต่ยังต้องอยู่ใน participantsInRound สำหรับการคำนวณผล
    console.log(
      `[Server] Dealer ${
        dealer?.name
      } will not take a turn (Pok/No Cards/Disconnected). Cards: ${JSON.stringify(
        dealer?.cards
      )}`
    );
    // ถ้าเจ้ามือป๊อก ให้ถือว่า hasStayed เพื่อให้ checkIfAllDone ทำงานถูก
    if (dealer && getHandRank(dealer.cards).rank === 1) dealer.hasStayed = true;
  }
  console.log(
    "[Server] Ordered players for turns (incl. dealer if eligible):",
    ordered.map((p) => ({ name: p.name, id: p.id }))
  );
  return ordered.map((p) => ({ id: p.id, name: p.name, role: p.role })); // ส่งแค่ข้อมูลที่จำเป็น
}

function clearTurnTimer(roomId) {
  const room = rooms[roomId];
  if (room) {
    if (room.turnTimer) {
      clearInterval(room.turnTimer);
      room.turnTimer = null;
    }
    console.log(`[Server] Cleared turn timer for room ${roomId}`);
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
    checkIfAllPlayersDone(roomId); // อาจจะไม่มีใครต้องเล่นแล้ว
    return;
  }
  clearTurnTimer(roomId);

  let nextPlayerOrderIdx =
    previousPlayerOrderIndex === -1 ? 0 : previousPlayerOrderIndex + 1;
  let attempts = 0;
  let foundNextPlayer = false;

  console.log(
    `[Server] startNextTurn: Room ${roomId}. PrevIdx: ${previousPlayerOrderIndex}. Trying next from orderIdx: ${nextPlayerOrderIdx}. Total ordered: ${room.orderedGamePlayers.length}`
  );

  while (attempts < room.orderedGamePlayers.length) {
    if (nextPlayerOrderIdx >= room.orderedGamePlayers.length) {
      console.log(
        `[Server] startNextTurn: Room ${roomId}. Reached end of orderedGamePlayers for turns.`
      );
      break;
    }
    const playerInfoFromOrder = room.orderedGamePlayers[nextPlayerOrderIdx];
    if (!playerInfoFromOrder) {
      attempts++;
      nextPlayerOrderIdx++;
      continue;
    }

    const participant = room.participantsInRound.find(
      (p) => p.id === playerInfoFromOrder.id
    );
    console.log(
      `[Server] startNextTurn: Room ${roomId}. Trying player ${participant?.name} (ID: ${playerInfoFromOrder.id}). Disconnected: ${participant?.disconnectedMidGame}, Stayed: ${participant?.hasStayed}, Cards: ${participant?.cards?.length}`
    );

    // เงื่อนไขการให้เทิร์น: ไม่หลุด, ยังไม่ Stay, และมีไพ่ < 3 ใบ (ผู้เล่น)
    // หรือถ้าเป็นเจ้ามือ: ไม่หลุด, ยังไม่ Stay (เจ้ามือจะ Stay อัตโนมัติถ้าไม่จั่ว), และมีไพ่ 2 ใบ (ยังไม่ป๊อก)
    const isEligiblePlayer =
      participant &&
      !participant.disconnectedMidGame &&
      !participant.hasStayed &&
      participant.cards.length < 3 &&
      participant.id !== room.dealerId;
    const isEligibleDealer =
      participant &&
      participant.id === room.dealerId &&
      !participant.disconnectedMidGame &&
      !participant.hasStayed &&
      participant.cards.length === 2 &&
      getHandRank(participant.cards).rank !== 1;

    if (isEligiblePlayer || isEligibleDealer) {
      room.currentTurnId = participant.id;
      let timeLeft = TURN_DURATION;
      console.log(
        `[Server] Current turn for ${participant.name} (ID: ${participant.id}) in room ${roomId}, timeLeft: ${timeLeft}`
      );
      io.to(roomId).emit("currentTurn", {
        id: participant.id,
        name: participant.name,
        role: participant.role,
        timeLeft,
      });

      room.turnTimer = setInterval(() => {
        /* ... โค้ด timeout เหมือนเดิม ... */
      }, 1000);
      foundNextPlayer = true;
      break;
    }
    attempts++;
    nextPlayerOrderIdx++;
  }

  if (!foundNextPlayer) {
    console.log(
      `[Server] startNextTurn: No more eligible players (incl. dealer) found in room ${roomId}.`
    );
    room.currentTurnId = null;
    io.to(roomId).emit("currentTurn", {
      id: null,
      name: "คำนวณผลลัพธ์...",
      role: "",
      timeLeft: 0,
    });
    checkIfAllPlayersDone(roomId); // <--- อาจจะเรียก handleResultOnly โดยตรงจากที่นี่ได้เลย
  }
}

function checkIfAllPlayersDone(roomId) {
  const room = rooms[roomId];
  if (!room || !room.participantsInRound) return;
  if (!room.dealerId) {
    console.warn(
      `[Server] checkIfAllPlayersDone: Room ${roomId} has no dealerId.`
    );
    return;
  }

  // ตรวจสอบผู้เล่นทุกคนใน orderedGamePlayers (ซึ่งตอนนี้รวมเจ้ามือที่ eligible ด้วย)
  const allParticipantsInTurnOrder = room.orderedGamePlayers
    .map((pInfo) => room.participantsInRound.find((p) => p.id === pInfo.id))
    .filter(Boolean);

  const allDone = allParticipantsInTurnOrder.every(
    (p) =>
      p.hasStayed ||
      p.cards.length >= 3 ||
      p.disconnectedMidGame ||
      (p.id === room.dealerId && getHandRank(p.cards).rank === 1) // เจ้ามือป๊อกก็ถือว่า done
  );

  console.log(
    `[Server] checkIfAllPlayersDone for room ${roomId}: All participants in turn order done? ${allDone}. Participants in turn order: ${allParticipantsInTurnOrder.length}`
  );

  if (allDone && room.gameStarted) {
    // gameStarted ควรยังเป็น true
    clearTurnTimer(roomId);
    console.log(
      `[Server] All players and dealer (if applicable) are done in room ${roomId}. Proceeding to handleResultOnly.`
    );
    io.to(roomId).emit("message", {
      text: "ทุกคนตัดสินใจครบแล้ว กำลังคำนวณผล...",
    });
    handleResultOnly(roomId); // <--- เรียก handleResultOnly โดยอัตโนมัติ
  } else if (allDone && !room.gameStarted && room.results) {
    // ผลออกไปแล้ว และอาจจะมีการเรียกซ้ำ
    console.log(
      `[Server] checkIfAllPlayersDone: Results already processed for room ${roomId}.`
    );
  }
}

function dealerDecisionAndDrawLogic(roomId) {
  const room = rooms[roomId];
  if (!room || !room.participantsInRound) {
    console.warn(
      `[Server] dealerDecisionAndDrawLogic: Room ${roomId} or participantsInRound not found.`
    );
    return false; // Indicate no draw occurred or error
  }

  const dealerParticipant = room.participantsInRound.find(
    (p) => p.id === room.dealerId
  );
  if (!dealerParticipant || !dealerParticipant.cards) {
    console.error(
      `[Server] dealerDecisionAndDrawLogic: Dealer or dealer cards not found in room ${roomId}`
    );
    return false;
  }

  if (dealerParticipant.cards.length === 2) {
    const dealerHand = getHandRank(dealerParticipant.cards);
    if (dealerHand.rank === 1) {
      // เจ้ามือป๊อกแล้ว ไม่ต้องจั่ว
      console.log(
        `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}) has Pok (${dealerHand.type}). No draw.`
      );
      return false;
    }

    // ตรวจสอบว่ามีผู้เล่นที่ยัง "สู้" หรือไม่
    const activeChallengers = room.participantsInRound.filter(
      (p) =>
        p.id !== room.dealerId &&
        !p.disconnectedMidGame &&
        p.cards &&
        p.cards.length > 0 &&
        getHandRank(p.cards).rank !== 7 // ไม่ใช่ผู้เล่นที่ไม่มีไพ่
    );

    if (activeChallengers.length === 0) {
      console.log(
        `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}): No active challengers. No draw.`
      );
      return false;
    }

    const dealerScore = calculateScore(dealerParticipant.cards); // แต้ม 2 ใบแรกของเจ้ามือ
    let dealerShouldDraw = false;

    // --- กฎการจั่วของเจ้ามือ (ปรับแก้ตามกติกาที่คุณต้องการ) ---
    if (dealerScore <= 3) {
      // 0-3 แต้ม: บังคับจั่วเสมอถ้ามีคนสู้
      dealerShouldDraw = true;
      console.log(
        `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}) has ${dealerScore} points. Must draw.`
      );
    } else if (dealerScore === 4 || dealerScore === 5) {
      // แต้ม 4, 5: อาจจะเลือกได้ หรือมีกฎบังคับ (เช่น ถ้ามีผู้เล่นแต้มสูงกว่า หรือผู้เล่นมี 3 ใบ)
      // ตัวอย่าง: ถ้ามีผู้เล่นคนใดคนหนึ่งมี 3 ใบ หรือมีแต้มสูงกว่า 5 เจ้ามือควรจั่ว
      if (
        activeChallengers.some(
          (p) => p.cards.length === 3 || calculateScore(p.cards) > 5
        )
      ) {
        dealerShouldDraw = true;
        console.log(
          `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}) has ${dealerScore} points. Challenger has 3 cards or higher score. Drawing.`
        );
      } else {
        console.log(
          `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}) has ${dealerScore} points. Staying (no pressing challenger).`
        );
      }
    } else {
      // 6, 7 แต้ม: บังคับอยู่
      console.log(
        `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}) has ${dealerScore} points. Must stay.`
      );
    }
    // --- จบกฎการจั่ว ---

    if (dealerShouldDraw) {
      if (room.deck.length > 0) {
        const newCard = room.deck.pop();
        dealerParticipant.cards.push(newCard);
        console.log(
          `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}) drew: ${
            newCard.value
          }${newCard.suit}. New hand: ${JSON.stringify(
            dealerParticipant.cards
          )}`
        );

        const activeDealer = room.players.find((p) => p.id === room.dealerId);
        if (activeDealer) activeDealer.cards = [...dealerParticipant.cards];

        io.to(roomId).emit("message", {
          text: `เจ้ามือ (${dealerParticipant.name}) จั่วไพ่เพิ่ม!`,
        });
        // ส่งข้อมูลผู้เล่นที่อัปเดต (รวมไพ่เจ้ามือ) ให้ Client ทุกคนเห็นทันที
        sendPlayersData(roomId); // <--- เพิ่มตรงนี้เพื่อให้ Client เห็นไพ่เจ้ามือที่อัปเดต (ถ้า UI รองรับ)
        return true; // Indicate that dealer drew
      } else {
        console.warn(
          `[Server] Room ${roomId} deck is empty. Dealer ${dealerParticipant.name} cannot draw.`
        );
        io.to(roomId).emit("message", {
          text: `ไพ่ในสำรับหมด เจ้ามือไม่สามารถจั่วเพิ่มได้`,
        });
      }
    }
  } else {
    console.log(
      `[Server] Dealer ${dealerParticipant.name} (Room ${roomId}) already has ${dealerParticipant.cards.length} cards. No draw decision needed.`
    );
  }
  return false; // Indicate no draw occurred or decision made to stay
}

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
      results: null,
      allPlayersEver: {
        [socket.id]: {
          name: playerName,
          initialBalance: balance,
          currentBalance: balance,
          role: "เจ้ามือ",
        },
      },
    };
    socket.join(roomId);
    console.log(
      `[Server] Room ${roomId} created by ${playerName} (ID: ${socket.id})`
    );
    socket.emit("roomCreated", {
      roomId,
      dealerName: player.name,
      betAmount: rooms[roomId].betAmount,
    });
    sendPlayersData(roomId);
  });

  socket.on("joinRoom", ({ roomId, playerName, initialBalance }) => {
    const room = rooms[roomId];
    console.log(
      `[Server] Attempt to join room ${roomId} by ${playerName} (ID: ${socket.id})`
    );
    if (room) {
      if (room.isLocked || room.gameStarted) {
        const reason = room.gameStarted ? "เกมเริ่มไปแล้ว" : "ห้องถูกล็อค";
        console.log(
          `[Server] Join failed for ${playerName} in room ${roomId}: ${reason}`
        );
        socket.emit("errorMessage", {
          text: `ไม่สามารถเข้าร่วมห้องได้: ${reason}`,
        });
        return;
      }
      if (room.players.length >= 8) {
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
        expense: [],
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
        room.allPlayersEver[socket.id].initialBalance = balance;
        room.allPlayersEver[socket.id].role = player.role;
      }

      let playerCounter = 1;
      room.players.forEach((p) => {
        if (p.id !== room.dealerId) {
          p.role = `ผู้เล่นที่ ${playerCounter++}`;
        } else {
          p.role = "เจ้ามือ";
        }
        if (room.allPlayersEver[p.id]) room.allPlayersEver[p.id].role = p.role;
      });

      socket.join(roomId);
      console.log(
        `[Server] ${playerName} (ID: ${socket.id}) joined room ${roomId}`
      );
      socket.emit("joinedRoom", {
        roomId,
        dealerName: room.players.find((p) => p.id === room.dealerId)?.name,
        betAmount: room.betAmount,
      });
      io.to(roomId).emit("message", { text: `${playerName} ได้เข้าร่วมห้อง` });
      sendPlayersData(roomId);
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
      if (bet >= 5 && (bet % 10 === 0 || bet % 5 === 0)) {
        // Adjusted condition based on client
        room.betAmount = bet;
        io.to(roomId).emit("roomSettings", { betAmount: room.betAmount });
        io.to(roomId).emit("message", {
          text: `เจ้ามือตั้งค่าเดิมพันเป็น ${bet} บาท`,
        });
      } else {
        socket.emit("errorMessage", {
          text: "จำนวนเงินเดิมพันต้องไม่น้อยกว่า 5 และลงท้ายด้วย 0 หรือ 5",
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
    const room = rooms[roomIdFromClient];
    console.log(
      `[Server] Received 'startGame' for room ${roomIdFromClient} from ${socket.id}. DealerId: ${room?.dealerId}. GameStarted: ${room?.gameStarted}`
    );
    if (room && room.dealerId === socket.id && !room.gameStarted) {
      if (
        room.players.length > 0 &&
        room.players.length < 2 &&
        room.players[0]?.id === room.dealerId
      ) {
        // Only dealer in room, prevent start if no other players (unless you want dealer to play alone)
        socket.emit("errorMessage", {
          text: "ต้องมีผู้เล่นอย่างน้อย 2 คน (รวมเจ้ามือ) เพื่อเริ่มเกม",
        });
        return;
      }
      if (room.players.length === 0) {
        // Should not happen if dealer is always a player
        socket.emit("errorMessage", {
          text: "ไม่มีผู้เล่นในห้องเพื่อเริ่มเกม",
        });
        return;
      }

      room.gameStarted = true;
      room.isLocked = true;
      io.to(roomIdFromClient).emit("lockRoom", true);
      room.deck = shuffleDeck(createDeck());
      room.results = null; // Clear previous round results

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
        if (room.allPlayersEver[p.id]) room.allPlayersEver[p.id].role = p.role;
      });

      room.orderedGamePlayers = getOrderedGamePlayersForTurns(
        room.participantsInRound,
        room.dealerId
      );
      console.log(
        `[Server] Game starting in room ${roomIdFromClient}. Participants: ${
          room.participantsInRound.length
        }. Ordered for turns: ${JSON.stringify(
          room.orderedGamePlayers.map((p) => p.name)
        )}`
      );

      room.participantsInRound.forEach((participant) => {
        for (let i = 0; i < 2; i++) {
          if (room.deck.length > 0) {
            participant.cards.push(room.deck.pop());
          } else {
            console.error(
              "[Server] Deck ran out of cards during dealing for " +
                participant.name
            );
            break;
          }
        }
        const activePlayer = room.players.find((p) => p.id === participant.id);
        if (activePlayer) activePlayer.cards = [...participant.cards];

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
          text: "ไม่มีผู้เล่นอื่นนอกจากเจ้ามือ เจ้ามือสามารถเปิดไพ่ได้",
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
      `[Server] Received 'showResult' from ${socket.id} for room ${roomId}. DealerId: ${room?.dealerId}`
    );

    if (room && room.dealerId === socket.id) {
      if (!room.gameStarted && room.results && room.results.length > 0) {
        console.log(`[Server] Results already shown for room ${roomId}.`);
        socket.emit("message", { text: "ผลลัพธ์ของรอบนี้ถูกแสดงไปแล้ว" });
        return;
      }
      const playersToCheck = room.participantsInRound
        ? room.participantsInRound.filter(
            (p) => p.id !== room.dealerId && !p.disconnectedMidGame
          )
        : [];
      const allNonDealersDone = playersToCheck.every(
        (p) => p.hasStayed || p.cards.length >= 3
      );

      if (!allNonDealersDone && playersToCheck.length > 0) {
        const notDonePlayer = playersToCheck.find(
          (p) => !(p.hasStayed || p.cards.length >= 3)
        );
        console.log(
          `[Server] ShowResult denied in room ${roomId}: Player ${notDonePlayer?.name} not done yet.`
        );
        socket.emit("errorMessage", {
          text: `ยังมีผู้เล่น (${
            notDonePlayer?.name || "บางคน"
          }) ยังไม่ได้ทำการตัดสินใจ`,
        });
        return;
      }

      console.log(
        `[Server] Dealer ${socket.id} is processing 'showResult' for room ${roomId}. Performing dealer draw logic...`
      );
      handleResultOnly(roomId);

      const dealerSocket = io.sockets.sockets.get(room.dealerId);
      if (dealerSocket) dealerSocket.emit("enableShowResult", false); // ปิดปุ่มหลังจากแสดงผล
      // room.gameStarted จะถูกตั้งเป็น false ใน handleResultOnly
    } else if (room && room.dealerId !== socket.id) {
      socket.emit("errorMessage", {
        text: "เฉพาะเจ้ามือเท่านั้นที่สามารถเปิดไพ่ได้",
      });
    } else if (!room) {
      socket.emit("errorMessage", { text: `ไม่พบห้อง ${roomId}` });
    } else {
      socket.emit("errorMessage", { text: "ไม่สามารถแสดงผลได้ในขณะนี้" });
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
