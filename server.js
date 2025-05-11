const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = new require("cors");
const { v4: uuidv4 } = require("uuid");
const axios = require('axios'); // ★★★ เพิ่ม axios สำหรับเรียก API ภายนอก

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://pokdeng-online.onrender.com", //  หรือ  "*" เพื่ออนุญาตทั้งหมดในช่วงพัฒนา
    methods: ["GET", "POST"],
  },
});

// ===================================================================================
// ★★★ START: ส่วนที่เพิ่มเข้ามาสำหรับการเรียก API คำนวณไพ่ ★★★
// ===================================================================================

// ★★★  URL ของ API  ★★★
const CARD_API_ENDPOINT = "https://pokdeng-api.onrender.com/api/pokdeng/calculate-hand";


/**
 * เรียก API ภายนอกเพื่อคำนวณรายละเอียดของไพ่ในมือ
 * @param {Array} cards - อาร์เรย์ของไพ่ในมือผู้เล่น, e.g., [{ suit: "♠️", value: "A" }, ...]
 * @returns {Promise<Object>} Promise ที่จะ resolve เป็น object รายละเอียดไพ่จาก API
 * หรือ object เริ่มต้นหากเกิดข้อผิดพลาด/ไม่มีไพ่
 */
async function getHandDetailsFromAPI(cards) {
  if (!cards || cards.length === 0) {
    return {
      rank: 9, // อันดับต่ำสุด (บอด)
      type: "ไม่มีไพ่",
      score: 0,
      subRank: 0,
      multiplier: 1,
      cards: cards || [],
    };
  }

  try {
    console.log(`[API Call] Requesting hand details for cards:`, cards);
    const response = await axios.post(CARD_API_ENDPOINT, { cards: cards });
    console.log(`[API Call] Response received:`, response.data);
    // ตรวจสอบว่า response.data มีโครงสร้างที่ถูกต้องตามที่คาดหวัง
    if (typeof response.data.rank !== 'number' || typeof response.data.type !== 'string') {
        console.error("[API Call] Invalid response structure from API:", response.data);
        throw new Error("Invalid response structure from API");
    }
    return response.data;
  } catch (error) {
    console.error("เกิดข้อผิดพลาดในการเรียก API คำนวณไพ่:", error.message);
    // ในกรณีที่ API มีปัญหา, คืนค่าไพ่ที่แย่ที่สุดเพื่อให้เกมดำเนินต่อไปได้ (หรือจัดการตามความเหมาะสม)
    return {
      rank: 9,
      type: "ข้อผิดพลาด (API)",
      score: 0,
      subRank: 0,
      multiplier: 1,
      cards: cards,
    };
  }
}

// ===================================================================================
// ★★★ END: ส่วนที่เพิ่มเข้ามาสำหรับการเรียก API คำนวณไพ่ ★★★
// ===================================================================================


// ===================================================================================
// ★★★ ส่วนคำนวณไพ่เดิม (getCardPoint, calculateScore, getCardNumericValue, getHandRank) ★★★
// ★★★ ถูกลบออกไปแล้ว และจะใช้ getHandDetailsFromAPI แทน ★★★
// ===================================================================================


const SUITS = ["♠️", "♣️", "♥️", "♦️"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DEFAULT_TURN_DURATION = 20; // วินาที
const DEFAULT_BET_AMOUNT = 100;

let rooms = {}; // { roomId: { id: string, players: [], deck: [], ... } }

function createDeck() {
  let deck = [];
  for (let suit of SUITS) {
    for (let value of VALUES) {
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

function getCardDisplay(card) {
  if (!card || !card.value || !card.suit) return "";
  return `${card.value}${card.suit}`;
}


function initializePlayer(id, name, money) {
  // ★★★ handDetails จะถูกตั้งค่าอย่างถูกต้องใน startGame ผ่าน API ★★★
  // เราสามารถตั้งเป็น null หรือ object เริ่มต้นแบบง่ายๆ ที่นี่
  return {
    id: id,
    name: name,
    money: money,
    cards: [],
    handDetails: { rank: 9, type: "ยังไม่มีไพ่", score: 0, subRank: 0, multiplier: 1, cards: [] }, // ค่าเริ่มต้นชั่วคราว
    isDealer: false,
    hasStayed: false,
    betAmountMultiplier: 1, // สำหรับเด้ง
    currentBet: 0,
    result: null, // 'WIN', 'LOSE', 'TIE'
    payout: 0,
    role: null, // e.g., "เจ้ามือ", "ขา 1"
    disconnectedMidGame: false, // New flag
    actionTakenThisTurn: false, // To prevent multiple actions in one turn
  };
}

function getRoomPlayerData(room) {
    if (!room || !room.players) return [];
    let legCounter = 1;
    return room.players.map(player => {
        let role = player.isDealer ? "เจ้ามือ" : `ขา ${legCounter}`;
        if (!player.isDealer) {
            legCounter++;
        }
        return {
            id: player.id,
            name: player.name,
            money: player.money,
            isDealer: player.isDealer,
            hasStayed: player.hasStayed,
            role: role,
            // handDetails ไม่ควรส่งไปทั้งหมด อาจจะส่งแค่ type หรือ score ถ้าจำเป็น
            // แต่โดยทั่วไป client จะเห็นไพ่ตัวเอง และผลลัพธ์ตอนท้าย
            disconnectedMidGame: player.disconnectedMidGame,
            // เพิ่มข้อมูลที่จำเป็นสำหรับ UI อื่นๆ
            isCurrentTurn: room.currentTurnPlayerId === player.id && room.gameStarted && !room.showingResult,
        };
    });
}

// ★★★ เปลี่ยน performResultCalculation เป็น async function ★★★
async function performResultCalculation(room) {
    const dealer = room.players.find((p) => p.isDealer);
    if (!dealer) {
        console.error(`[PerformResult] No dealer found in room ${room.id}`);
        return null;
    }

    // คำนวณ handDetails ของเจ้ามือผ่าน API (ถ้ายังไม่มี หรือถ้าจำเป็นต้องคำนวณใหม่)
    // โดยทั่วไปถ้า dealer.hasStayed แล้ว handDetails ควรถือว่า final
    // แต่ถ้าตรรกะเกมอนุญาตให้ showResult ก่อน dealer stay ก็ต้องคำนวณใหม่
    if (!dealer.handDetails || dealer.cards.length > 0 ) { // สมมติว่าคำนวณใหม่เสมอถ้ายังไม่ stay (หรือถ้า handDetails เป็นค่าเริ่มต้น)
        console.log(`[PerformResult] Calculating dealer hand via API for room: ${room.id}`);
        dealer.handDetails = await getHandDetailsFromAPI(dealer.cards);
    }
    if (!dealer.handDetails || typeof dealer.handDetails.rank !== 'number') { // ตรวจสอบว่าได้ object ที่ถูกต้องจาก API
        console.error(`[PerformResult] CRITICAL: Dealer handDetails invalid after API call for room ${room.id}. Details:`, dealer.handDetails);
        // อาจจะต้องตั้งค่า default ที่แย่ที่สุดให้เจ้ามือถ้า API fail หนัก
        dealer.handDetails = { rank: 9, type: "Error API", score: 0, subRank: 0, multiplier: 1, cards: dealer.cards };
    }


    const finalResults = [];
    let dealerNetChangeTotal = 0;
    const betAmount = room.betAmount || DEFAULT_BET_AMOUNT;

    for (const player of room.players) {
        if (player.isDealer) continue;

        player.currentBet = betAmount; // Assume fixed bet for now

        if (player.disconnectedMidGame) {
            player.handDetails = { // ผู้เล่นที่หลุดกลางเกมจะถูกตัดสินเป็นแพ้โดยอัตโนมัติ
                rank: 10, // ให้ rank สูงกว่า (แย่กว่า) rank ปกติ
                type: "ขาดการเชื่อมต่อ",
                score: 0,
                subRank: -1, // ให้ subRank ต่ำมาก
                multiplier: 1,
                cards: player.cards || [],
            };
            player.result = 'LOSE_DISCONNECTED';
            player.payout = -player.currentBet;
        } else {
            // คำนวณ handDetails ของผู้เล่นผ่าน API (ถ้ายังไม่มี หรือถ้าจำเป็นต้องคำนวณใหม่)
            // ปกติควรมีแล้วจาก startGame/drawCard
            if (!player.handDetails || player.cards.length > 0 ) { // คำนวณใหม่ถ้ายังไม่ stay หรือ handDetails เป็นค่าเริ่มต้น
                console.log(`[PerformResult] Calculating player ${player.name} hand via API for room: ${room.id}`);
                player.handDetails = await getHandDetailsFromAPI(player.cards);
            }
             if (!player.handDetails || typeof player.handDetails.rank !== 'number') {
                console.error(`[PerformResult] CRITICAL: Player ${player.name} handDetails invalid after API call for room ${room.id}. Details:`, player.handDetails);
                player.handDetails = { rank: 9, type: "Error API", score: 0, subRank: 0, multiplier: 1, cards: player.cards };
            }


            // เปรียบเทียบกับเจ้ามือ (ตรรกะนี้อิงตาม rank, subRank, score, multiplier จาก API)
            const dealerHand = dealer.handDetails;
            const playerHand = player.handDetails;

            let playerWin = false;
            let isTie = false;

            // 1. เจ้ามือป๊อก (Rank 1)
            if (dealerHand.rank === 1) {
                if (playerHand.rank === 1) { //ผู้เล่นก็ป๊อก
                    if (playerHand.score > dealerHand.score) playerWin = true;
                    else if (playerHand.score < dealerHand.score) playerWin = false;
                    else { // ป๊อกแต้มเท่ากัน
                        if (playerHand.multiplier > dealerHand.multiplier) playerWin = true; // ป๊อกเด้งสูงกว่าชนะ
                        else if (playerHand.multiplier < dealerHand.multiplier) playerWin = false;
                        else isTie = true; // ป๊อกแต้มเท่า เด้งเท่า เสมอ
                    }
                } else { // ผู้เล่นไม่ป๊อก, เจ้ามือป๊อก -> ผู้เล่นแพ้
                    playerWin = false;
                }
            }
            // 2. ผู้เล่นป๊อก (Rank 1), เจ้ามือไม่ป๊อก
            else if (playerHand.rank === 1) {
                playerWin = true; // ผู้เล่นป๊อก เจ้ามือไม่ป๊อก -> ผู้เล่นชนะ
            }
            // 3. ไม่มีใครป๊อก: เทียบ rank -> subRank -> score -> multiplier
            else {
                if (playerHand.rank < dealerHand.rank) playerWin = true;
                else if (playerHand.rank > dealerHand.rank) playerWin = false;
                else { // rank เท่ากัน
                    if (playerHand.subRank > dealerHand.subRank) playerWin = true;
                    else if (playerHand.subRank < dealerHand.subRank) playerWin = false;
                    else { // rank และ subRank เท่ากัน
                        if (playerHand.score > dealerHand.score) playerWin = true;
                        else if (playerHand.score < dealerHand.score) playerWin = false;
                        else { // rank, subRank, score เท่ากัน (เช่น แต้มเท่ากันหมด)
                           if (playerHand.multiplier > dealerHand.multiplier) playerWin = true; // เด้งสูงกว่าชนะ
                           else if (playerHand.multiplier < dealerHand.multiplier) playerWin = false;
                           else isTie = true; // เสมอ
                        }
                    }
                }
            }

            if (isTie) {
                player.result = 'TIE';
                player.payout = 0;
            } else if (playerWin) {
                player.result = 'WIN';
                player.payout = player.currentBet * playerHand.multiplier;
            } else {
                player.result = 'LOSE';
                player.payout = -player.currentBet * dealerHand.multiplier; // ผู้เล่นเสียตามเด้งของเจ้ามือ
            }
        }

        player.money += player.payout;
        dealerNetChangeTotal -= player.payout; // เงินที่เจ้ามือได้/เสีย จากผู้เล่นคนนี้

        finalResults.push({
            playerId: player.id,
            name: player.name,
            cards: player.cards,
            handType: player.handDetails.type,
            handScore: player.handDetails.score,
            result: player.result,
            payout: player.payout,
            moneyAfterRound: player.money,
            isDealer: false,
            cardsDisplay: player.cards.map(getCardDisplay).join(", ")
        });
    }

    dealer.money += dealerNetChangeTotal;
    finalResults.push({
        playerId: dealer.id,
        name: dealer.name,
        cards: dealer.cards,
        handType: dealer.handDetails.type,
        handScore: dealer.handDetails.score,
        result: 'DEALER',
        payout: dealerNetChangeTotal,
        moneyAfterRound: dealer.money,
        isDealer: true,
        cardsDisplay: dealer.cards.map(getCardDisplay).join(", ")
    });
    
    // เรียงผลลัพธ์ให้เจ้ามืออยู่ท้ายสุด หรือตามลำดับที่ต้องการ
    const sortedResults = finalResults.sort((a,b) => {
        if (a.isDealer) return 1;
        if (b.isDealer) return -1;
        // You might want to sort players by their original join order or role order if needed
        const playerAOrder = room.players.findIndex(p => p.id === a.playerId);
        const playerBOrder = room.players.findIndex(p => p.id === b.playerId);
        return playerAOrder - playerBOrder;
    });

    return sortedResults;
}


// ★★★ เปลี่ยน calculateAndEmitResults เป็น async function ★★★
async function calculateAndEmitResults(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    console.log(`[Game Flow] Calculating results for room ${roomId}`);
    room.showingResult = true; // Flag to indicate results are being shown

    // ★★★ เพิ่ม await เพราะ performResultCalculation เป็น async ★★★
    const roundResults = await performResultCalculation(room);
    if(!roundResults) {
        console.error(`[Game Flow] Failed to calculate results for room ${roomId}`);
        io.to(roomId).emit("errorMessage", "เกิดข้อผิดพลาดในการคำนวณผลลัพธ์");
        // อาจจะต้องรีเซ็ตบางสถานะของห้อง
        room.showingResult = false;
        room.gameStarted = false; // Allow game to restart
        io.to(roomId).emit("gameReset", { message: "เกมถูกรีเซ็ตเนื่องจากข้อผิดพลาดในการคำนวณผล" });
        return;
    }


    room.gameHistory.push({ timestamp: new Date().toISOString(), results: roundResults });
    io.to(roomId).emit("result", roundResults);
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // ส่งข้อมูลผู้เล่นที่อัปเดตแล้ว (รวมเงิน)

    // Reset for next round, but keep players and settings
    room.deck = shuffleDeck(createDeck());
    room.players.forEach(p => {
        p.cards = [];
        p.handDetails = { rank: 9, type: "ยังไม่มีไพ่", score: 0, subRank: 0, multiplier: 1, cards: [] }; // Reset hand details
        p.hasStayed = false;
        p.currentBet = 0;
        p.payout = 0;
        p.result = null;
        // p.disconnectedMidGame should persist or be reset based on game rules for rejoining.
        // For now, let's assume they stay disconnected for the next round unless they reconnect.
    });
    room.currentTurnPlayerId = null;
    room.currentPlayerIndexInOrder = -1;
    room.playerActionOrder = [];
    room.gameStarted = false; // Game is over, ready for new "startGame"
    room.showingResult = false;
    room.turnTimer = null; // Clear any existing turn timer visually on client
    io.to(roomId).emit("turnTimerUpdate", { remainingTime: 0, duration: DEFAULT_TURN_DURATION });


    console.log(`[Game Flow] Room ${roomId} ready for a new round.`);
    io.to(roomId).emit("roundOver", { message: "รอบปัจจุบันสิ้นสุดลงแล้ว เจ้ามือสามารถเริ่มรอบใหม่ได้" });
    // Allow dealer to start a new game
    const dealer = room.players.find(p => p.isDealer);
    if (dealer) {
        io.to(dealer.id).emit("enableStartGame"); // Or a general game state update
    }
}

function advanceTurn(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.showingResult) return;

    clearTurnTimer(roomId); // Clear previous timer

    if (room.currentPlayerIndexInOrder >= room.playerActionOrder.length -1) { // Check if it was the last player's turn (dealer)
         // All players (including dealer if they were last) have taken their turn
        console.log(`[Game Flow] All players have taken their turn in room ${roomId}. Enabling show results for dealer.`);
        const dealer = room.players.find(p => p.isDealer);
        if (dealer) {
            io.to(dealer.id).emit("enableShowResult");
            // Emit to all that it's time for dealer to show results
            io.to(roomId).emit("gameMessage", "ผู้เล่นทุกคนดำเนินการแล้ว รอเจ้ามือเปิดผลลัพธ์");
        }
        return; // No more turns to advance
    }

    room.currentPlayerIndexInOrder++;
    const nextPlayerId = room.playerActionOrder[room.currentPlayerIndexInOrder];
    const nextPlayer = room.players.find(p => p.id === nextPlayerId);

    if (!nextPlayer) {
        console.error(`[Turn Error] Next player not found in room ${roomId} with ID ${nextPlayerId}. Advancing again.`);
        advanceTurn(roomId); // Try to advance past this error
        return;
    }
    
    if (nextPlayer.hasStayed || nextPlayer.disconnectedMidGame) {
        console.log(`[Game Flow] Player ${nextPlayer.name} has stayed or disconnected. Skipping turn.`);
        advanceTurn(roomId); // Skip this player
        return;
    }

    room.currentTurnPlayerId = nextPlayer.id;
    console.log(`[Game Flow] Advancing turn to ${nextPlayer.name} in room ${roomId}`);
    io.to(roomId).emit("currentTurn", nextPlayer.id);
    io.to(nextPlayer.id).emit("yourTurn"); // Notify player it's their turn
    startPlayerTurnTimer(roomId, nextPlayer.id);
}

function startPlayerTurnTimer(roomId, playerId) {
    const room = rooms[roomId];
    if (!room || room.turnTimer) return; // Don't start if one is already running for the room

    let timeLeft = room.turnDuration || DEFAULT_TURN_DURATION;
    io.to(roomId).emit("turnTimerUpdate", { remainingTime: timeLeft, duration: room.turnDuration || DEFAULT_TURN_DURATION, forPlayerId: playerId });


    room.turnTimer = setInterval(async () => { // ★★★ Make interval callback async for potential API calls ★★★
        timeLeft--;
        io.to(roomId).emit("turnTimerUpdate", { remainingTime: timeLeft, duration: room.turnDuration || DEFAULT_TURN_DURATION, forPlayerId: playerId });

        if (timeLeft <= 0) {
            clearTurnTimer(roomId);
            const currentPlayer = room.players.find(p => p.id === playerId);
            if (currentPlayer && !currentPlayer.hasStayed && room.currentTurnPlayerId === playerId) {
                console.log(`[Game Flow] Player ${currentPlayer.name} timed out in room ${roomId}. Forcing STAY.`);
                currentPlayer.hasStayed = true;
                io.to(roomId).emit("playerActed", { playerId: currentPlayer.id, action: "stay", auto: true });
                io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update UI for hasStayed status
                
                // ★★★ If an API call were needed on auto-stay, it would go here. ★★★
                // ★★★ For Pok Deng, staying doesn't change cards, so handDetails likely don't need update ★★★
                // currentPlayer.handDetails = await getHandDetailsFromAPI(currentPlayer.cards); // Example if needed
                
                advanceTurn(roomId);
            }
        }
    }, 1000);
}

function clearTurnTimer(roomId) {
    const room = rooms[roomId];
    if (room && room.turnTimer) {
        clearInterval(room.turnTimer);
        room.turnTimer = null;
    }
}


io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("createRoom", ({ name, money }) => {
    const roomId = uuidv4().substring(0, 6); // Shorter room ID
    const player = initializePlayer(socket.id, name, parseInt(money, 10) || 1000);
    player.isDealer = true;
    player.role = "เจ้ามือ";

    rooms[roomId] = {
      id: roomId,
      players: [player],
      deck: shuffleDeck(createDeck()),
      gameStarted: false,
      showingResult: false,
      currentTurnPlayerId: null,
      currentPlayerIndexInOrder: -1,
      playerActionOrder: [], // player IDs in order of play
      betAmount: DEFAULT_BET_AMOUNT,
      turnDuration: DEFAULT_TURN_DURATION,
      locked: false,
      gameHistory: [], // To store results of each round
      dealerId: socket.id,
      turnTimer: null, // Stores the interval ID for the turn timer
    };
    socket.join(roomId);
    socket.emit("roomCreated", { roomId, playersData: getRoomPlayerData(rooms[roomId]) });
    io.to(roomId).emit("playersData", getRoomPlayerData(rooms[roomId]));
    console.log(`Room created: ${roomId} by ${name}`);
  });

  socket.on("joinRoom", ({ roomId, name, money }) => {
    const room = rooms[roomId];
    if (room) {
      if (room.locked) {
        socket.emit("errorMessage", "ห้องถูกล็อคแล้ว ไม่สามารถเข้าร่วมได้");
        return;
      }
      if (room.players.length >= 8) { // Max players (1 dealer + 7 legs)
        socket.emit("errorMessage", "ห้องเต็มแล้ว");
        return;
      }
      if (room.gameStarted) {
        socket.emit("errorMessage", "เกมเริ่มไปแล้ว ไม่สามารถเข้าร่วมได้ในขณะนี้");
        return;
      }
      if (room.players.find(p => p.id === socket.id)){
        socket.emit("errorMessage", "คุณอยู่ในห้องนี้แล้ว");
        return;
      }

      const player = initializePlayer(socket.id, name, parseInt(money, 10) || 1000);
      room.players.push(player);
      socket.join(roomId);
      socket.emit("joinedRoom", { roomId, playersData: getRoomPlayerData(room), roomSettings: { betAmount: room.betAmount, turnDuration: room.turnDuration, locked: room.locked } });
      io.to(roomId).emit("playersData", getRoomPlayerData(room));
      io.to(roomId).emit("gameMessage", `${name} ได้เข้าร่วมห้อง`);
      console.log(`${name} joined room: ${roomId}`);
    } else {
      socket.emit("errorMessage", "ไม่พบห้องดังกล่าว");
    }
  });

  socket.on("setBetAmount", ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id && !room.gameStarted) {
        const bet = parseInt(amount, 10);
        if (bet > 0) {
            room.betAmount = bet;
            io.to(roomId).emit("betAmountChanged", bet);
            io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update data if needed
            console.log(`Room ${roomId} bet amount set to ${bet} by dealer ${socket.id}`);
        } else {
            socket.emit("errorMessage", "จำนวนเงินเดิมพันไม่ถูกต้อง");
        }
    } else if (room && room.dealerId !== socket.id) {
        socket.emit("errorMessage", "เฉพาะเจ้ามือเท่านั้นที่สามารถตั้งค่าเดิมพันได้");
    } else if (room && room.gameStarted) {
        socket.emit("errorMessage", "ไม่สามารถเปลี่ยนค่าเดิมพันขณะเกมกำลังเล่นอยู่");
    }
  });

  socket.on("lockRoom", ({ roomId, lock }) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id) {
        room.locked = lock;
        io.to(roomId).emit("roomLockChanged", lock);
        io.to(roomId).emit("gameMessage", `ห้องถูก ${lock ? "ล็อค" : "ปลดล็อค"} โดยเจ้ามือ`);
        console.log(`Room ${roomId} lock status set to ${lock} by dealer ${socket.id}`);
    } else {
        socket.emit("errorMessage", "เฉพาะเจ้ามือเท่านั้นที่สามารถล็อค/ปลดล็อคห้องได้");
    }
  });

  // ★★★ เปลี่ยน startGame handler เป็น async ★★★
  socket.on("startGame", async ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.dealerId !== socket.id) {
        socket.emit("errorMessage", "เฉพาะเจ้ามือเท่านั้นที่สามารถเริ่มเกมได้");
        return;
    }
    if (room.gameStarted) {
        socket.emit("errorMessage", "เกมได้เริ่มไปแล้ว");
        return;
    }
    if (room.players.length < 2) {
        socket.emit("errorMessage", "ผู้เล่นไม่เพียงพอสำหรับเริ่มเกม (อย่างน้อย 2 คน)");
        return;
    }
    if (!room.betAmount || room.betAmount <= 0) {
        socket.emit("errorMessage", "กรุณาตั้งค่าเดิมพันก่อนเริ่มเกม");
        return;
    }
    // Check if all players have enough money for the bet
    const insufficientMoneyPlayer = room.players.find(p => !p.isDealer && p.money < room.betAmount);
    if (insufficientMoneyPlayer) {
        socket.emit("errorMessage", `ผู้เล่น ${insufficientMoneyPlayer.name} มีเงินไม่พอสำหรับเดิมพันนี้`);
        return;
    }


    console.log(`[Game Flow] Starting game in room ${roomId}`);
    room.gameStarted = true;
    room.showingResult = false;
    room.deck = shuffleDeck(createDeck());
    room.playerActionOrder = []; // Reset action order
    room.currentPlayerIndexInOrder = -1;
    room.currentTurnPlayerId = null;
    clearTurnTimer(roomId); // Clear any previous timer

    // Reset player states for the new round, keep disconnectedMidGame status
    room.players.forEach(p => {
        p.cards = [];
        // p.handDetails is reset here, will be set by API call
        p.handDetails = { rank: 9, type: "ยังไม่มีไพ่", score: 0, subRank: 0, multiplier: 1, cards: [] };
        p.hasStayed = false;
        // p.disconnectedMidGame is not reset here, it persists unless player reconnects and state is cleared
    });

    // Deal 2 cards to each active player
    const dealOrderPlayers = room.players.filter(p => !p.disconnectedMidGame);
    dealOrderPlayers.forEach(player => {
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
        if (room.deck.length > 0) player.cards.push(room.deck.pop());
    });

    // ★★★ คำนวณ handDetails สำหรับผู้เล่นทุกคนผ่าน API ★★★
    for (const player of dealOrderPlayers) {
        if (player.cards.length > 0) { // Ensure player has cards before calling API
            player.handDetails = await getHandDetailsFromAPI(player.cards);
        } else { // Handle cases where player might not have received cards (should not happen in normal flow)
             player.handDetails = await getHandDetailsFromAPI([]); // API handles empty array
        }
        io.to(player.id).emit("yourCards", player.cards); // Send cards to individual player
    }
    
    io.to(roomId).emit("gameStarted", { playersData: getRoomPlayerData(room) });
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update all player data displays

    // Check for dealer Pok8/Pok9
    const dealer = room.players.find(p => p.isDealer);
    if (dealer && dealer.handDetails && dealer.handDetails.rank === 1) { // Rank 1 means Pok
        io.to(roomId).emit("gameMessage", `เจ้ามือ (${dealer.name}) ได้ ${dealer.handDetails.type}! ทำการคำนวณผลทันที...`);
        console.log(`[Game Flow] Dealer has Pok in room ${roomId}. Ending round.`);
        // ★★★ เพิ่ม await เพราะ calculateAndEmitResults เป็น async ★★★
        await calculateAndEmitResults(roomId);
        return; // Game ends immediately
    }

    // Check for other players' Pok8/Pok9 - they auto-stay
    let allPlayersPokOrDealerPok = true; // Assume true initially
    for (const player of dealOrderPlayers) {
        if (player.isDealer) continue;
        if (player.handDetails && player.handDetails.rank === 1) { // Player has Pok
            player.hasStayed = true; // Auto-stay if Pok
            io.to(roomId).emit("player_revealed_pok", { playerId: player.id, handType: player.handDetails.type });
            io.to(roomId).emit("gameMessage", `${player.name} ได้ ${player.handDetails.type}! (ป๊อก)`);
        } else {
            allPlayersPokOrDealerPok = false; // At least one non-dealer player doesn't have Pok
        }
    }
    
    // If all non-dealer players have Pok, game ends
    if (allPlayersPokOrDealerPok && dealOrderPlayers.filter(p => !p.isDealer).length > 0) {
        io.to(roomId).emit("gameMessage", "ผู้เล่นทุกคน (ขา) ได้ป๊อก! ทำการคำนวณผลทันที...");
        console.log(`[Game Flow] All non-dealer players have Pok in room ${roomId}. Ending round.`);
        // ★★★ เพิ่ม await ★★★
        await calculateAndEmitResults(roomId);
        return;
    }
    
    // Determine play order (ขา first, then dealer)
    // Legs that are not disconnected and have not auto-stayed (due to Pok)
    room.playerActionOrder = [
        ...dealOrderPlayers.filter(p => !p.isDealer && !p.hasStayed).map(p => p.id),
        dealer.id // Dealer always last among those who act
    ].filter(id => { // Filter out anyone who might have auto-stayed (like dealer if they also had pok and game didn't end)
        const p = room.players.find(player => player.id === id);
        return p && !p.hasStayed && !p.disconnectedMidGame;
    });


    if (room.playerActionOrder.length === 0) { // All players (legs + dealer) might have Pok or disconnected
        io.to(roomId).emit("gameMessage", "ไม่มีผู้เล่นที่ต้องดำเนินการต่อ คำนวณผล...");
        console.log(`[Game Flow] No players left in action order for room ${roomId}. Ending round.`);
        // ★★★ เพิ่ม await ★★★
        await calculateAndEmitResults(roomId);
        return;
    }
    
    advanceTurn(roomId);
  });

  // ★★★ เปลี่ยน drawCard handler เป็น async ★★★
  socket.on("drawCard", async ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.currentTurnPlayerId !== socket.id || room.showingResult) {
      socket.emit("errorMessage", "ไม่ใช่ตาของคุณ หรือไม่สามารถจั่วไพ่ได้ในขณะนี้");
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasStayed || player.cards.length >= 3) {
      socket.emit("errorMessage", "ไม่สามารถจั่วไพ่ได้ (อาจจะหมอบแล้ว หรือไพ่เต็มมือ)");
      return;
    }
    if (player.actionTakenThisTurn) {
        socket.emit("errorMessage", "คุณได้ดำเนินการในตานี้ไปแล้ว");
        return;
    }

    if (room.deck.length > 0) {
      const drawnCard = room.deck.pop();
      player.cards.push(drawnCard);
      player.actionTakenThisTurn = true;
      clearTurnTimer(roomId); // Clear timer as action is taken

      console.log(`[Game Flow] Player ${player.name} drew a card: ${getCardDisplay(drawnCard)} in room ${roomId}`);
      socket.emit("cardDrawn", { card: drawnCard, newHand: player.cards });

      // ★★★ คำนวณ handDetails ใหม่ผ่าน API ★★★
      player.handDetails = await getHandDetailsFromAPI(player.cards);
      socket.emit("yourCards", player.cards); // Resend all cards to player, client can update display of hand type
      io.to(roomId).emit("playerActed", { playerId: player.id, action: "draw", newCardValue: getCardDisplay(drawnCard) });


      if (player.cards.length >= 3) {
        player.hasStayed = true; // Auto-stay if 3 cards
        io.to(roomId).emit("gameMessage", `${player.name} มีไพ่ 3 ใบแล้ว (หมอบอัตโนมัติ)`);
        io.to(roomId).emit("playerActed", { playerId: player.id, action: "stay_auto_3cards" });
      }
      
      io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update all players data

      if (player.hasStayed) { // If auto-stayed due to 3 cards
          advanceTurn(roomId);
      } else { // Player drew but still has < 3 cards, their turn continues (or timer restarts for them if applicable)
          // For Pok Deng, turn usually ends after one draw. If multiple draws allowed, timer logic would be different.
          // Assuming one action per turn (draw or stay).
          // Since they drew, their turn is over.
          advanceTurn(roomId);
      }

    } else {
      socket.emit("errorMessage", "ไพ่ในสำรับหมดแล้ว");
      // This case should ideally not happen with a standard deck and player limit
    }
  });

  socket.on("stay", async ({ roomId }) => { // ★★★ Made async just in case any future logic in stay needs await ★★★
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.currentTurnPlayerId !== socket.id || room.showingResult) {
      socket.emit("errorMessage", "ไม่ใช่ตาของคุณ หรือไม่สามารถหมอบได้ในขณะนี้");
      return;
    }

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hasStayed) {
      socket.emit("errorMessage", "ไม่สามารถหมอบได้ (อาจจะหมอบไปแล้ว)");
      return;
    }
    if (player.actionTakenThisTurn && player.cards.length < 3) { // If they drew and didn't hit 3 cards, they can't stay again.
                                                              // This logic depends on game rules (can draw then stay vs. draw or stay)
                                                              // Current logic assumes one action, draw moves to next player or auto-stays.
                                                              // So, if they can click stay, it means they haven't drawn yet.
        // socket.emit("errorMessage", "คุณได้ดำเนินการในตานี้ไปแล้ว");
        // return;
    }


    player.hasStayed = true;
    player.actionTakenThisTurn = true; // Mark action taken
    clearTurnTimer(roomId); // Clear timer as action is taken

    console.log(`[Game Flow] Player ${player.name} chose to STAY in room ${roomId}`);
    io.to(roomId).emit("playerActed", { playerId: player.id, action: "stay" });
    io.to(roomId).emit("playersData", getRoomPlayerData(room)); // Update all players data

    // ★★★ If staying needed to re-evaluate hand via API (e.g. some special stay bonus rule) ★★★
    // ★★★ For standard Pok Deng, staying doesn't change cards, so handDetails already calculated should be fine. ★★★
    // player.handDetails = await getHandDetailsFromAPI(player.cards); // Example if needed

    advanceTurn(roomId);
  });

  // ★★★ เปลี่ยน showResult handler เป็น async ★★★
  socket.on("showResult", async ({ roomId }) => {
    const room = rooms[roomId];
    if (!room || room.dealerId !== socket.id || !room.gameStarted || room.showingResult) {
        socket.emit("errorMessage", "ไม่สามารถแสดงผลลัพธ์ได้ในขณะนี้");
        return;
    }

    // Check if all players who are supposed to act have acted (are 'hasStayed' or 'disconnectedMidGame')
    // This includes the dealer if the dealer is part of playerActionOrder
    const allDone = room.players.every(p => {
        if (p.disconnectedMidGame) return true; // Disconnected players are done
        if (!room.playerActionOrder.includes(p.id) && !p.isDealer) return true; // Player wasn't in action order (e.g. Pok early)
        if (p.isDealer && !room.playerActionOrder.includes(p.id)) { // Dealer had Pok and game didn't end from startGame (should not happen)
             return p.hasStayed; // Or dealer has Pok, hence stayed
        }
        return p.hasStayed;
    });

    // More precise check: is current turn index beyond the list of players to act?
    const turnProgressionComplete = room.currentPlayerIndexInOrder >= room.playerActionOrder.length -1;

    if (!turnProgressionComplete && !allDone) { // Check if the logic for enabling showResult on dealer client was correct
        // Find the current player who should be acting
        let currentActingPlayerId = null;
        if (room.currentPlayerIndexInOrder >=0 && room.currentPlayerIndexInOrder < room.playerActionOrder.length){
            currentActingPlayerId = room.playerActionOrder[room.currentPlayerIndexInOrder];
        }
        const currentActor = room.players.find(p => p.id === currentActingPlayerId);

        if (currentActor && !currentActor.hasStayed && !currentActor.disconnectedMidGame) {
             socket.emit("errorMessage", `ยังไม่ถึงเวลาแสดงผล, ผู้เล่น ${currentActor.name} ยังไม่ได้ดำเนินการ`);
             return;
        } else if (!currentActor && room.playerActionOrder.length > 0 && room.currentPlayerIndexInOrder < room.playerActionOrder.length -1) {
             // This implies an issue with turn advancement or playerActionOrder
             socket.emit("errorMessage", `ยังไม่ถึงเวลาแสดงผล, มีผู้เล่นที่ยังต้องดำเนินการ`);
             return;
        }
    }

    console.log(`[Game Flow] Dealer ${socket.id} initiated showResult for room ${roomId}`);
    clearTurnTimer(roomId); // Ensure no timers are running
    // ★★★ เพิ่ม await เพราะ calculateAndEmitResults เป็น async ★★★
    await calculateAndEmitResults(roomId);
  });


  socket.on("resetGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id && !room.gameStarted) { // Can only reset if game not active
        room.deck = shuffleDeck(createDeck());
        room.players.forEach(p => {
            p.cards = [];
            p.handDetails = { rank: 9, type: "ยังไม่มีไพ่", score: 0, subRank: 0, multiplier: 1, cards: [] };
            p.hasStayed = false;
            // Keep money, role, disconnectedMidGame status
        });
        room.gameStarted = false;
        room.showingResult = false;
        room.currentTurnPlayerId = null;
        room.currentPlayerIndexInOrder = -1;
        room.playerActionOrder = [];
        clearTurnTimer(roomId);

        io.to(roomId).emit("gameReset", { message: "เกมถูกรีเซ็ตโดยเจ้ามือ" });
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        console.log(`Room ${roomId} was reset by dealer ${socket.id}`);
    } else if (room && room.gameStarted) {
        socket.emit("errorMessage", "ไม่สามารถรีเซ็ตเกมขณะที่เกมกำลังดำเนินอยู่ได้");
    } else if (room && room.dealerId !== socket.id) {
        socket.emit("errorMessage", "เฉพาะเจ้ามือเท่านั้นที่สามารถรีเซ็ตเกมได้");
    }
  });

  socket.on("endGame", ({ roomId }) => {
    const room = rooms[roomId];
    if (room && room.dealerId === socket.id) {
        console.log(`[Game Flow] Ending game for room ${roomId} by dealer ${socket.id}`);
        // Send final summary or just kick everyone
        room.players.forEach(p => {
            io.to(p.id).emit("gameEndedByDealer", { message: "เจ้ามือจบเกมแล้ว ขอบคุณที่ร่วมเล่น" });
            // Make sockets leave the room
            const playerSocket = io.sockets.sockets.get(p.id);
            if(playerSocket) {
                playerSocket.leave(roomId);
            }
        });
        delete rooms[roomId];
        console.log(`Room ${roomId} ended and deleted.`);
    } else {
        socket.emit("errorMessage", "เฉพาะเจ้ามือเท่านั้นที่สามารถจบเกมได้");
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const disconnectedPlayer = room.players[playerIndex];
        console.log(`Player ${disconnectedPlayer.name} from room ${roomId} disconnected.`);

        if (!room.gameStarted) {
          // If game not started, remove player or assign new dealer
          room.players.splice(playerIndex, 1);
          if (disconnectedPlayer.isDealer && room.players.length > 0) {
            // Promote first player to dealer
            room.players[0].isDealer = true;
            room.dealerId = room.players[0].id;
            room.players[0].role = "เจ้ามือ";
            io.to(room.players[0].id).emit("promotedToDealer", { message: "คุณได้รับการเลื่อนขั้นเป็นเจ้ามือคนใหม่" });
            io.to(roomId).emit("gameMessage", `${disconnectedPlayer.name} (เจ้ามือ) ออกจากห้อง, ${room.players[0].name} เป็นเจ้ามือคนใหม่`);
          } else if (disconnectedPlayer.isDealer && room.players.length === 0) {
            // Dealer disconnected and no one left, delete room
            console.log(`Room ${roomId} is empty after dealer disconnected. Deleting room.`);
            clearTurnTimer(roomId); // Clear timer if any was associated with this room
            delete rooms[roomId];
            return; // Exit loop as room is deleted
          } else {
             io.to(roomId).emit("gameMessage", `${disconnectedPlayer.name} ออกจากห้อง`);
          }
        } else { // Game has started
          disconnectedPlayer.disconnectedMidGame = true;
          disconnectedPlayer.hasStayed = true; // Treat as stayed to skip their turn
          io.to(roomId).emit("gameMessage", `${disconnectedPlayer.name} ขาดการเชื่อมต่อระหว่างเกม`);

          if (disconnectedPlayer.isDealer) {
            io.to(roomId).emit("gameMessage", `เจ้ามือ (${disconnectedPlayer.name}) ขาดการเชื่อมต่อ! กำลังพยายามจัดการ...`);
            // Handle dealer disconnection mid-game (complex: e.g., end round, promote, or pause)
            // For now, let's assume the round might need to be voided or a new dealer elected after round.
            // Simplest immediate action if dealer disconnects mid-game: end the current round prematurely.
            // This would require careful state management.
            // Or, let the game try to continue if possible, and dealer loses their bets.
            // If it was dealer's turn, advance past them.
            if (room.currentTurnPlayerId === disconnectedPlayer.id) {
                advanceTurn(roomId);
            }
          } else { // Non-dealer disconnected mid-game
            // If it was their turn, advance past them
            if (room.currentTurnPlayerId === disconnectedPlayer.id) {
                advanceTurn(roomId);
            }
          }
        }
        io.to(roomId).emit("playersData", getRoomPlayerData(room));
        break; // Found player, no need to check other rooms
      }
    }
  });

  // More Socket.IO event handlers here
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});