// server.js
const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {}; // Store room states: { roomId: { players: [], deck: [], betAmount: 0, gameStarted: false, dealerId: null, currentPlayerTurn: null, roundOver: false, etc. } }

const SUITS = ['♠️', '♥️', '♣️', '♦️'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const CARD_FACE_VALUES = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };

// --- Helper Functions ---
function generatePlayerId() {
    return uuidv4();
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getCardPointValue(value) {
    if (['K', 'Q', 'J', '10'].includes(value)) return 0;
    if (value === 'A') return 1;
    return parseInt(value);
}

function calculateHandScore(cards) {
    if (!cards || cards.length === 0) return 0;
    return cards.reduce((sum, card) => sum + getCardPointValue(card.value), 0) % 10;
}

function sortCardsByFaceValue(cards) {
    return [...cards].sort((a, b) => CARD_FACE_VALUES[b.value] - CARD_FACE_VALUES[a.value]);
}

function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ value, suit });
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

function dealCard(deck) {
    return deck.pop();
}

function broadcastRoomState(roomId, specificData = null) {
    const room = rooms[roomId];
    if (!room) return;

    const playersSimplified = room.players.map(p => ({
        id: p.id,
        name: p.name,
        roleInRoom: p.roleInRoom,
        isDealer: p.isDealer,
        balance: p.balance,
        hand: p.showHandOnBroadcast ? p.hand : p.hand.map(() => ({ value: '?', suit: '?' })), // Hide hand unless specified
        handCount: p.hand.length,
        bet: p.bet,
        hasStayed: p.hasStayed,
        isReady: p.isReady,
        disconnectedMidGame: p.disconnectedMidGame,
        handDetails: p.showHandOnBroadcast && p.handDetails ? { type: p.handDetails.type, score: p.handDetails.score } : null
    }));

    const roomState = {
        roomId: room.roomId,
        players: playersSimplified,
        betAmount: room.betAmount,
        gameStarted: room.gameStarted,
        dealerId: room.dealerId,
        currentPlayerTurn: room.currentPlayerTurn,
        roundOver: room.roundOver,
        pot: room.pot,
        gameMessage: specificData ? specificData.message : room.gameMessage,
        // Add other relevant room info
    };

    room.players.forEach(player => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            try {
                player.ws.send(JSON.stringify({ type: 'roomUpdate', data: roomState }));
                if (specificData && player.id === specificData.playerId) {
                     player.ws.send(JSON.stringify({ type: 'personalUpdate', data: specificData.personalData }));
                }
            } catch (error) {
                console.error(`Error sending room state to player ${player.id}:`, error);
            }
        }
    });
    if (specificData && specificData.log) console.log(`[Room ${roomId}] ${specificData.log}`);
}
// --- Core Game Logic: getHandRank ---
function getHandRank(cardsInput) {
    if (!cardsInput || cardsInput.length === 0) {
        return { rank: 0, type: "ไม่มีไพ่", score: 0, subRank: 0, multiplier: 0, cards: [] };
    }
    const cards = sortCardsByFaceValue(cardsInput);
    const numCards = cards.length;
    const currentScore = calculateHandScore(cards);

    let handDetails = {
        rank: 0,
        type: "",
        score: currentScore,
        subRank: 0,
        multiplier: 1,
        cards: cardsInput // Original cards for display purposes later
    };

    if (numCards === 2) {
        const isSameSuit = cards[0].suit === cards[1].suit;
        const isPairValue = cards[0].value === cards[1].value;

        if (currentScore === 9) { // ป๊อก 9
            handDetails.rank = 10;
            handDetails.subRank = isSameSuit ? 2 : 1; // ป๊อกเด้ง > ป๊อกธรรมดา
            handDetails.type = isSameSuit ? "ป๊อก 9 สองเด้ง" : "ป๊อก 9";
            handDetails.multiplier = isSameSuit ? 2 : 1;
        } else if (currentScore === 8) { // ป๊อก 8
            handDetails.rank = 9;
            handDetails.subRank = isSameSuit ? 2 : 1;
            handDetails.type = isSameSuit ? "ป๊อก 8 สองเด้ง" : "ป๊อก 8";
            handDetails.multiplier = isSameSuit ? 2 : 1;
        } else { // แต้มธรรมดา 2 ใบ
            handDetails.rank = 4;
            handDetails.subRank = currentScore;
            const isDeng = isSameSuit || isPairValue; // ดอกเดียวกัน หรือ เลขเหมือนกัน
            if (currentScore === 0) {
                handDetails.type = "บอด" + (isDeng ? " สองเด้ง" : "");
            } else {
                handDetails.type = `${currentScore} แต้ม` + (isDeng ? " สองเด้ง" : "");
            }
            handDetails.multiplier = isDeng ? 2 : 1;
        }
        return handDetails;
    }

    if (numCards === 3) {
        const cardValues = cards.map(c => CARD_FACE_VALUES[c.value]); // Sorted by face value desc

        const isTong = cardValues[0] === cardValues[1] && cardValues[1] === cardValues[2];
        const isAllSameSuit = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
        const isStraight = (cardValues[0] === cardValues[1] + 1 && cardValues[1] === cardValues[2] + 1);
        const isSian = cards.every(c => ['J', 'Q', 'K'].includes(c.value));

        if (isTong) {
            handDetails.rank = 8;
            handDetails.type = `ตอง ${cards[0].value}`;
            handDetails.subRank = cardValues[0];
            handDetails.multiplier = 5;
        } else if (isStraight && isAllSameSuit) {
            handDetails.rank = 7;
            handDetails.type = `สเตรทฟลัช ${cards[0].value} สูง`;
            handDetails.subRank = cardValues[0];
            handDetails.multiplier = 5;
        } else if (isStraight) {
            handDetails.rank = 6;
            handDetails.type = `เรียง ${cards[0].value} สูง`;
            handDetails.subRank = cardValues[0];
            handDetails.multiplier = 3;
        } else if (isSian) {
            handDetails.rank = 5;
            const sortedSianFaceValues = cards.map(c => CARD_FACE_VALUES[c.value]).sort((a,b) => b-a);
            handDetails.type = `เซียน ${cards.map(c=>c.value).join('')}`; // เช่น เซียน KQK
            handDetails.subRank = sortedSianFaceValues[0] * 10000 + sortedSianFaceValues[1] * 100 + sortedSianFaceValues[2];
            handDetails.multiplier = 3;
        } else { // แต้มธรรมดา 3 ใบ
            handDetails.rank = 4;
            handDetails.subRank = currentScore;
            if (isAllSameSuit) { // สามเด้ง (not SF)
                if (currentScore === 9) handDetails.type = "9 หลัง สามเด้ง";
                else if (currentScore === 8) handDetails.type = "8 หลัง สามเด้ง";
                else if (currentScore === 0) handDetails.type = "บอด สามเด้ง";
                else handDetails.type = `${currentScore} แต้ม สามเด้ง`;
                handDetails.multiplier = 3;
            } else { // 3 ใบ ไม่มีเด้ง
                if (currentScore === 9) handDetails.type = "9 หลัง";
                else if (currentScore === 8) handDetails.type = "8 หลัง";
                else if (currentScore === 0) handDetails.type = "บอด";
                else handDetails.type = `${currentScore} แต้ม`;
                handDetails.multiplier = 1;
            }
        }
        return handDetails;
    }
    // Fallback for unexpected card counts
    handDetails.type = `${currentScore} แต้ม`;
    handDetails.score = currentScore;
    handDetails.rank = 4;
    handDetails.subRank = currentScore;
    handDetails.multiplier = 1;
    console.warn(`[getHandRank] Unexpected card count: ${numCards}. Cards: ${JSON.stringify(cardsInput)}`);
    return handDetails;
}


// --- Game Logic: performResultCalculation ---
function performResultCalculation(roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.roundOver) return;

    console.log(`[Room ${roomId}] Performing result calculation.`);
    room.roundOver = true; // Mark round as over to prevent further actions like hit/stay

    const dealer = room.players.find(p => p.isDealer);
    if (!dealer) {
        console.error(`[PerformResult] Dealer not found in room ${roomId}`);
        room.gameMessage = "ข้อผิดพลาด: ไม่พบเจ้ามือ";
        broadcastRoomState(roomId, { log: room.gameMessage });
        return;
    }

    // Calculate hand details for all players if not already done (e.g. if player stayed)
    room.players.forEach(player => {
        if (player.hand.length > 0 && !player.handDetails) { // Calculate if missing
            player.handDetails = getHandRank(player.hand);
        } else if (player.hand.length === 0) {
             player.handDetails = { rank: 0, type: "ไม่ได้เล่น", score: 0, subRank: 0, multiplier: 0, cards: [] };
        }
        player.showHandOnBroadcast = true; // Reveal all hands now
    });

    const dealerHandDetails = dealer.handDetails;
    if (!dealerHandDetails) {
        console.error(`[PerformResult] Dealer hand details not calculated for room ${roomId}`);
        // Attempt to calculate now if it was missed
        if (dealer.hand.length > 0) dealer.handDetails = getHandRank(dealer.hand);
        else dealer.handDetails = { rank: 0, type: "ไม่มีไพ่", score: 0, subRank: 0, multiplier: 0, cards: [] };
        if(!dealer.handDetails) { // Still no details
            room.gameMessage = "ข้อผิดพลาด: คำนวณไพ่เจ้ามือไม่ได้";
            broadcastRoomState(roomId, { log: room.gameMessage });
            return;
        }
    }
    
    const resultsForClient = [];
    let totalDealerNetChange = 0;

    room.players.forEach(player => {
        if (player.isDealer) {
            player.roundResult = { // Placeholder for dealer self-result
                outcome: "เจ้ามือ",
                moneyChange: 0, // Dealer's own money change is sum of changes with players
                // newBalance will be updated after all players
            };
            return; // Skip dealer comparison with self
        }

        if (player.hand.length === 0 || player.bet <= 0 || player.disconnectedMidGame) { // Skip players who didn't play or disconnected
            player.roundResult = { outcome: player.disconnectedMidGame ? "หลุดการเชื่อมต่อ" : "ไม่ได้เล่น", moneyChange: 0, newBalance: player.balance };
            if (player.disconnectedMidGame) {
                // Handle bet for disconnected player, e.g., forfeit to dealer
                const betAmount = player.bet || room.betAmount; // Use player's bet if individual, else room bet
                dealer.balance += betAmount;
                totalDealerNetChange += betAmount;
                console.log(`Player ${player.name} disconnected, bet ${betAmount} forfeited to dealer.`);
            }
            return;
        }

        const playerHandDetails = player.handDetails;
        if (!playerHandDetails) {
            console.error(`[PerformResult] Player ${player.name} hand details not calculated.`);
            player.roundResult = { outcome: "ข้อผิดพลาด", moneyChange: 0, newBalance: player.balance };
            return;
        }

        let outcome = "";
        let moneyChange = 0;
        let effectiveMultiplier = 1; // The multiplier that determines the win/loss amount

        // 1. เจ้ามือป๊อก (Rank 10 or 9)
        if (dealerHandDetails.rank >= 9) {
            if (playerHandDetails.rank > dealerHandDetails.rank) { // ผู้เล่นป๊อกสูงกว่า (เช่น ป๊อก9 ชนะ ป๊อก8 เจ้ามือ)
                outcome = "ชนะ";
                effectiveMultiplier = playerHandDetails.multiplier;
            } else if (playerHandDetails.rank === dealerHandDetails.rank && playerHandDetails.subRank > dealerHandDetails.subRank) { // ป๊อกแต้มเท่า แต่ผู้เล่นเด้งเยอะกว่า
                outcome = "ชนะ";
                effectiveMultiplier = playerHandDetails.multiplier;
            } else if (playerHandDetails.rank === dealerHandDetails.rank && playerHandDetails.subRank === dealerHandDetails.subRank) {
                outcome = "เสมอ"; // ป๊อกชนป๊อก (แต้มเท่า, เด้งเท่า)
            } else { // ผู้เล่นแพ้เจ้ามือป๊อก (ไพ่ผู้เล่นต่ำกว่า หรือเป็นไพ่พิเศษที่ไม่ใช่ป๊อก)
                outcome = "แพ้";
                effectiveMultiplier = dealerHandDetails.multiplier;
            }
        }
        // 2. ผู้เล่นป๊อก (Rank 10 or 9) และเจ้ามือไม่ป๊อก
        else if (playerHandDetails.rank >= 9) {
            outcome = "ชนะ";
            effectiveMultiplier = playerHandDetails.multiplier;
        }
        // 3. ไม่มีใครป๊อก: เทียบ rank -> subRank
        else {
            if (playerHandDetails.rank > dealerHandDetails.rank) {
                outcome = "ชนะ";
                effectiveMultiplier = playerHandDetails.multiplier;
            } else if (playerHandDetails.rank < dealerHandDetails.rank) {
                outcome = "แพ้";
                effectiveMultiplier = dealerHandDetails.multiplier;
            } else { // rank เท่ากัน
                if (playerHandDetails.subRank > dealerHandDetails.subRank) {
                    outcome = "ชนะ";
                    effectiveMultiplier = playerHandDetails.multiplier;
                } else if (playerHandDetails.subRank < dealerHandDetails.subRank) {
                    outcome = "แพ้";
                    effectiveMultiplier = dealerHandDetails.multiplier;
                } else {
                    outcome = "เสมอ"; // rank และ subRank เท่ากัน (เช่น แต้มธรรมดาเท่ากัน)
                }
            }
        }
        const baseBet = player.bet > 0 ? player.bet : room.betAmount; // Use player's bet if set, else room's default

        if (outcome === "ชนะ") {
            moneyChange = baseBet * effectiveMultiplier;
        } else if (outcome === "แพ้") {
            moneyChange = -baseBet * effectiveMultiplier;
        }

        // Ensure player doesn't lose more than they have, or win more than dealer has (for this transaction)
        if (moneyChange > 0) { // Player wins
            moneyChange = Math.min(moneyChange, dealer.balance); // Player cannot win more than dealer has
        } else if (moneyChange < 0) { // Player loses
            moneyChange = -Math.min(Math.abs(moneyChange), player.balance); // Player cannot lose more than they have
        }
        
        player.balance += moneyChange;
        dealer.balance -= moneyChange; // Dealer's balance adjusts based on player's outcome
        totalDealerNetChange -= moneyChange;

        player.roundResult = {
            outcome: outcome,
            moneyChange: moneyChange,
            newBalance: player.balance
        };
    });
    
    // Update dealer's final balance based on cumulative changes
    if (dealer.roundResult) { // Check if dealer.roundResult was initialized
        dealer.roundResult.moneyChange = totalDealerNetChange;
        dealer.roundResult.newBalance = dealer.balance;
    } else { // Should not happen if dealer exists and logic is correct
        console.error("Dealer round result not initialized for final update.");
    }


    // Prepare data for client
    room.players.forEach(p => {
        const handD = p.handDetails || { cards: [], score: 0, type: "N/A" };
        const roundR = p.roundResult || { outcome: "N/A", moneyChange: 0, newBalance: p.balance };
        resultsForClient.push({
            id: p.id,
            name: p.name,
            role: p.roleInRoom || (p.isDealer ? "เจ้ามือ" : "ผู้เล่น"),
            cardsDisplay: handD.cards.map(card => `${card.value}${card.suit}`).join(' '),
            score: handD.score,
            specialType: handD.type,
            outcome: roundR.outcome,
            moneyChange: roundR.moneyChange,
            balance: roundR.newBalance, // Send the updated balance
            disconnectedMidGame: p.disconnectedMidGame
        });
    });
    
    room.gameMessage = "สรุปผลรอบเกม!";
    console.log(`[Room ${roomId}] Results: ${JSON.stringify(resultsForClient.map(r => ({n:r.name, o:r.outcome, mc:r.moneyChange, b:r.balance})))}`);
    
    // Send results to all players
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            try {
                p.ws.send(JSON.stringify({ type: 'result', data: resultsForClient }));
            } catch (err) {
                console.error(`Error sending results to player ${p.id}:`, err);
            }
        }
    });
    
    // Optionally, broadcast final room state after results
    broadcastRoomState(roomId, { log: "Round ended. Results sent." });

    // Prepare for next round (resetting flags, etc.)
    // This might be triggered by a "new round" button from client or automatically
    // resetRound(roomId); // Call this function when ready for a new round
}

// --- Game Flow Functions ---
function startGame(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameStarted) return;

    // Check if there's a dealer and at least one other player
    const dealer = room.players.find(p => p.isDealer);
    const activePlayers = room.players.filter(p => !p.isDealer && p.isReady && p.balance >= room.betAmount);

    if (!dealer) {
        room.gameMessage = "ไม่สามารถเริ่มเกมได้: ไม่มีเจ้ามือ";
        broadcastRoomState(roomId, {log: room.gameMessage});
        return;
    }
    if (activePlayers.length === 0) {
        room.gameMessage = "ไม่สามารถเริ่มเกมได้: ไม่มีผู้เล่นพร้อม (ต้องมีเงินพอสำหรับเดิมพัน)";
        broadcastRoomState(roomId, {log: room.gameMessage});
        return;
    }
    
    room.gameStarted = true;
    room.roundOver = false;
    room.deck = shuffleDeck(createDeck());
    room.pot = 0; // Or manage bets individually

    // Reset player states for the new round
    room.players.forEach(player => {
        player.hand = [];
        player.handDetails = null;
        player.hasStayed = false;
        player.showHandOnBroadcast = player.isDealer; // Dealer might show 1 card, or hide all initially
        player.roundResult = null;
        player.bet = (player.isReady && !player.isDealer && player.balance >= room.betAmount) ? room.betAmount : 0;
        if (player.bet > 0) {
            // player.balance -= player.bet; // Deduct bet at start or at end
            // room.pot += player.bet;
        }
        player.disconnectedMidGame = false; // Reset for new round
    });

    // Deal initial 2 cards to active players and dealer
    for (let i = 0; i < 2; i++) {
        room.players.forEach(player => {
            if (player.isDealer || (player.isReady && player.bet > 0)) {
                 if (room.deck.length > 0) player.hand.push(dealCard(room.deck));
            }
        });
    }
    
    let firstPlayerId = null;

    // Evaluate initial hands, especially for Pok
    room.players.forEach(player => {
        if (player.hand.length === 2) {
            player.handDetails = getHandRank(player.hand);
            // If dealer has Pok, game might end quickly for players without Pok or lower Pok
            if (player.isDealer && player.handDetails.rank >= 9) { // Dealer Pok
                console.log(`[Room ${roomId}] Dealer has ${player.handDetails.type}!`);
                room.gameMessage = `เจ้ามือได้ ${player.handDetails.type}!`;
                // Game might proceed to immediate result calculation
            }
            if (!player.isDealer && player.handDetails.rank >=9){
                 console.log(`[Room ${roomId}] Player ${player.name} has ${player.handDetails.type}!`);
                 player.hasStayed = true; // Player with Pok automatically stays
            }
        }
         // Determine first player (not dealer, has cards)
        if (!player.isDealer && player.hand.length > 0 && !firstPlayerId && !player.hasStayed) {
            firstPlayerId = player.id;
        }
    });
    
    if (dealer.handDetails && dealer.handDetails.rank >= 9) { // Dealer Pok
        // All players who don't have a stronger/equal Pok lose or draw. Game ends.
        performResultCalculation(roomId);
    } else {
        // Normal game flow, set first player
        room.currentPlayerTurn = firstPlayerId;
        if (!firstPlayerId) { // All players might have Pok or stayed
            // If all non-dealer players stayed (e.g. all got Pok), it's dealer's turn or results
            const nonDealerActivePlayers = room.players.filter(p => !p.isDealer && p.hand.length > 0 && !p.hasStayed);
            if(nonDealerActivePlayers.length === 0){
                handleDealerTurn(roomId); // or proceed to results if dealer also took 2 cards only
            } else {
                 room.currentPlayerTurn = nonDealerActivePlayers[0].id;
            }
        }
        room.gameMessage = room.currentPlayerTurn ? `ตาของ ${room.players.find(p=>p.id === room.currentPlayerTurn).name}` : "รอบเริ่มต้น";
    }

    broadcastRoomState(roomId, { log: `Game started in room ${roomId}. Dealing cards. Dealer: ${dealer.name}`});
}

function playerHit(playerId, roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.roundOver || room.currentPlayerTurn !== playerId) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player || player.isDealer || player.hasStayed || player.hand.length >= 3) return;

    if (room.deck.length > 0) {
        player.hand.push(dealCard(room.deck));
        player.handDetails = getHandRank(player.hand); // Re-evaluate hand
        console.log(`[Room ${roomId}] Player ${player.name} hits. New hand: ${player.handDetails.type}`);

        if (player.hand.length === 3 || player.handDetails.score > 9) { // Auto-stay if 3 cards or bust (not standard Pok Deng bust)
            player.hasStayed = true; // In Pok Deng, 3 cards is max for players unless specific rules
        }
        player.showHandOnBroadcast = false; // Keep hand hidden during turn generally
        broadcastRoomState(roomId, { log: `${player.name} draws a card.`});
        
        if (player.hasStayed) { // If auto-stayed after hit
            handleNextPlayerTurn(roomId, playerId);
        }

    } else {
        room.gameMessage = "ไพ่หมดกอง!";
        broadcastRoomState(roomId, { log: "Deck empty!"});
        // Potentially end round if no more cards can be dealt
    }
}

function playerStay(playerId, roomId) {
    const room = rooms[roomId];
    if (!room || !room.gameStarted || room.roundOver || room.currentPlayerTurn !== playerId) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player || player.isDealer || player.hasStayed) return;

    player.hasStayed = true;
    player.handDetails = getHandRank(player.hand); // Final hand evaluation
    player.showHandOnBroadcast = false; // Keep hand hidden until results
    console.log(`[Room ${roomId}] Player ${player.name} stays with ${player.handDetails.type}`);
    broadcastRoomState(roomId, { log: `${player.name} stays.` });
    handleNextPlayerTurn(roomId, playerId);
}

function handleNextPlayerTurn(roomId, currentPlayerId) {
    const room = rooms[roomId];
    if (!room) return;

    const currentIndex = room.players.findIndex(p => p.id === currentPlayerId);
    let nextPlayerFound = false;
    for (let i = 1; i < room.players.length; i++) {
        const nextIndex = (currentIndex + i) % room.players.length;
        const nextPlayer = room.players[nextIndex];
        if (!nextPlayer.isDealer && !nextPlayer.hasStayed && nextPlayer.hand.length < 3 && nextPlayer.bet > 0 && !nextPlayer.disconnectedMidGame) {
            room.currentPlayerTurn = nextPlayer.id;
            room.gameMessage = `ตาของ ${nextPlayer.name}`;
            nextPlayerFound = true;
            break;
        }
    }

    if (!nextPlayerFound) { // All players have stayed or are done
        room.currentPlayerTurn = null; // Signal for dealer's turn or results
        console.log(`[Room ${roomId}] All players have stayed. Proceeding to dealer or results.`);
        handleDealerTurn(roomId);
    } else {
        broadcastRoomState(roomId);
    }
}

function handleDealerTurn(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    const dealer = room.players.find(p => p.isDealer);
    if (!dealer) return;

    // Dealer reveals hand before drawing (if applicable)
    dealer.showHandOnBroadcast = true;
    broadcastRoomState(roomId, {log: "Dealer's turn."});


    // Dealer's drawing logic (example: draw if score < 4 and less than 3 cards, PokDeng rules can vary)
    // In classic Pok Deng, if dealer doesn't have Pok, they must draw a 3rd card if any player has 3 cards
    // or if their score is low and players are still in.
    // For simplicity here: if dealer score is low, they might draw.
    // A common rule: if any player has 3 cards, dealer *must* draw to 3 if not Pok.
    // Or if all players have 2 cards and stayed, dealer might draw based on their score (e.g. < 4).
    
    let dealerNeedsToDraw = false;
    const playersWithThreeCards = room.players.some(p => !p.isDealer && p.hand.length === 3 && p.bet > 0);

    if (dealer.hand.length === 2 && !(dealer.handDetails && dealer.handDetails.rank >=9) ) { // Dealer no Pok with 2 cards
        if (playersWithThreeCards) {
            dealerNeedsToDraw = true;
            console.log(`[Room ${roomId}] Player(s) have 3 cards, dealer must draw.`);
        } else {
            // Optional: Simple dealer AI to draw on low score if all players stayed with 2 cards
            const allPlayersTwoCardsStayed = room.players.every(p => p.isDealer || p.hasStayed && p.hand.length === 2 || p.bet === 0);
            if (allPlayersTwoCardsStayed && dealer.handDetails.score < 4) { // Example threshold
                 dealerNeedsToDraw = true;
                 console.log(`[Room ${roomId}] Dealer low score (${dealer.handDetails.score}), drawing.`);
            }
        }
    }


    if (dealerNeedsToDraw && room.deck.length > 0) {
        dealer.hand.push(dealCard(room.deck));
        dealer.handDetails = getHandRank(dealer.hand);
        console.log(`[Room ${roomId}] Dealer draws. New hand: ${dealer.handDetails.type}`);
        broadcastRoomState(roomId, { log: "Dealer draws a card."});
    } else {
         console.log(`[Room ${roomId}] Dealer stays with ${dealer.handDetails.type}`);
         broadcastRoomState(roomId, { log: "Dealer stays."});
    }
    performResultCalculation(roomId);
}


function resetRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    console.log(`[Room ${roomId}] Resetting round.`);
    room.gameStarted = false;
    room.roundOver = true; // Mark as over until new game starts
    room.deck = [];
    room.currentPlayerTurn = null;
    room.gameMessage = "พร้อมสำหรับรอบใหม่! กำหนดเงินเดิมพันและกดเริ่มเกม";

    room.players.forEach(p => {
        p.hand = [];
        p.handDetails = null;
        p.hasStayed = false;
        p.isReady = false; // Players need to ready up again
        p.bet = 0; // Reset individual bets
        p.showHandOnBroadcast = false;
        // p.roleInRoom might change if dealer rotates
    });
    
    // Rotate dealer (optional)
    // const currentDealerIndex = room.players.findIndex(p => p.isDealer);
    // if (currentDealerIndex !== -1) {
    //     room.players[currentDealerIndex].isDealer = false;
    //     room.players[currentDealerIndex].roleInRoom = "ผู้เล่น";
    //     const nextDealerIndex = (currentDealerIndex + 1) % room.players.length;
    //     room.players[nextDealerIndex].isDealer = true;
    //     room.players[nextDealerIndex].roleInRoom = "เจ้ามือ";
    //     room.dealerId = room.players[nextDealerIndex].id;
    //     console.log(`[Room ${roomId}] Dealer rotated to ${room.players[nextDealerIndex].name}`);
    // }


    broadcastRoomState(roomId, { log: "Round has been reset. Waiting for players to ready for new game." });
}


// --- WebSocket Connection Handling ---
wss.on('connection', (ws) => {
    const playerId = generatePlayerId();
    ws.playerId = playerId; // Associate playerId with WebSocket connection
    console.log(`Player ${playerId} connected.`);

    ws.send(JSON.stringify({ type: 'connected', data: { playerId } }));

    ws.on('message', (message) => {
        let parsedMessage;
        try {
            parsedMessage = JSON.parse(message);
        } catch (error) {
            console.error('Failed to parse message or message is not JSON:', message, error);
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format.' }));
            return;
        }

        const { type, data } = parsedMessage;
        const player = rooms[data?.roomId]?.players.find(p => p.id === playerId);

        switch (type) {
            case 'createRoom': {
                const roomId = generateRoomId();
                rooms[roomId] = {
                    roomId,
                    players: [],
                    deck: [],
                    betAmount: 10, // Default bet
                    gameStarted: false,
                    dealerId: null,
                    currentPlayerTurn: null,
                    roundOver: true,
                    pot: 0,
                    gameMessage: "ห้องถูกสร้างแล้ว รอผู้เล่น...",
                    // maxPlayers: 5 // Example
                };
                console.log(`Room ${roomId} created by ${playerId}`);
                // Player who creates might auto-join
                // For simplicity, client will send joinRoom next
                ws.send(JSON.stringify({ type: 'roomCreated', data: { roomId } }));
                break;
            }
            case 'joinRoom': {
                const { roomId, playerName, initialBalance = 1000 } = data;
                if (!rooms[roomId]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
                    return;
                }
                // if (rooms[roomId].players.length >= rooms[roomId].maxPlayers) {
                //     ws.send(JSON.stringify({ type: 'error', message: 'Room is full.' }));
                //     return;
                // }

                const newPlayer = {
                    id: playerId,
                    ws: ws,
                    name: playerName || `ผู้เล่น-${playerId.substring(0,4)}`,
                    balance: initialBalance,
                    hand: [],
                    handDetails: null,
                    bet: 0,
                    isDealer: rooms[roomId].players.length === 0, // First player is dealer
                    isReady: false,
                    hasStayed: false,
                    roleInRoom: rooms[roomId].players.length === 0 ? "เจ้ามือ" : `ผู้เล่น ${rooms[roomId].players.length}`,
                    showHandOnBroadcast: false,
                    disconnectedMidGame: false
                };
                if (newPlayer.isDealer) {
                    rooms[roomId].dealerId = playerId;
                }
                rooms[roomId].players.push(newPlayer);
                ws.roomId = roomId; // Associate roomId with WebSocket connection

                console.log(`Player ${newPlayer.name} (${playerId}) joined room ${roomId}. Role: ${newPlayer.roleInRoom}`);
                ws.send(JSON.stringify({ type: 'joinedRoom', data: { roomId, playerId: newPlayer.id, playerName: newPlayer.name, balance: newPlayer.balance, isDealer: newPlayer.isDealer, roleInRoom: newPlayer.roleInRoom } }));
                broadcastRoomState(roomId, {log: `${newPlayer.name} ได้เข้าร่วมห้อง`});
                break;
            }
            case 'setPlayerName': {
                if (player) {
                    player.name = data.name;
                     broadcastRoomState(player.ws.roomId, { log: `ผู้เล่น ${playerId} เปลี่ยนชื่อเป็น ${data.name}` });
                }
                break;
            }
             case 'setBet': { // Room-wide bet for this example
                const room = rooms[data.roomId];
                if (room && room.players.find(p=>p.id === playerId)?.isDealer && !room.gameStarted) {
                    room.betAmount = parseInt(data.amount);
                    if (isNaN(room.betAmount) || room.betAmount <=0) room.betAmount = 10;
                    broadcastRoomState(data.roomId, {log: `เจ้ามือกำหนดเงินเดิมพันเป็น ${room.betAmount}`});
                } else if (room && !room.gameStarted && !player.isDealer) { // Individual bet placement
                    if(player && data.amount > 0 && player.balance >= data.amount) {
                        player.bet = parseInt(data.amount);
                         broadcastRoomState(data.roomId, {log: `${player.name} วางเดิมพัน ${player.bet}`});
                    } else {
                         ws.send(JSON.stringify({ type: 'error', message: 'ไม่สามารถวางเดิมพันได้' }));
                    }
                }
                break;
            }
            case 'playerReady': {
                 if (player && !rooms[player.ws.roomId].gameStarted) {
                    player.isReady = data.isReady;
                    broadcastRoomState(player.ws.roomId, {log: `${player.name} ${player.isReady ? "พร้อมแล้ว" : "ยังไม่พร้อม"}`});

                    // Auto-start if all players ready and conditions met
                    const room = rooms[player.ws.roomId];
                    const dealer = room.players.find(p=>p.isDealer);
                    const readyPlayers = room.players.filter(p => p.isReady && !p.isDealer && p.balance >= room.betAmount);
                    if(dealer && dealer.isReady && readyPlayers.length > 0 && readyPlayers.length === room.players.length -1 ){
                        // Check if all non-dealers are ready
                        if (room.players.filter(p => !p.isDealer).every(p => p.isReady || p.balance < room.betAmount)) {
                           startGame(player.ws.roomId);
                        }
                    }
                 }
                break;
            }
            case 'startGame': { // Typically dealer initiates or auto-starts
                const room = rooms[data.roomId];
                 if (room && player && player.isDealer && !room.gameStarted) {
                     // Check if enough players are ready
                     const readyPlayers = room.players.filter(p => p.isReady && !p.isDealer && p.balance >= room.betAmount );
                     if (readyPlayers.length > 0) {
                        startGame(data.roomId);
                     } else {
                         ws.send(JSON.stringify({ type: 'error', message: 'ไม่มีผู้เล่นพร้อมที่จะเริ่มเกม หรือเงินไม่พอ' }));
                     }
                 }
                break;
            }
            case 'hit': {
                if (player && rooms[player.ws.roomId]) {
                    playerHit(playerId, player.ws.roomId);
                }
                break;
            }
            case 'stay': {
                 if (player && rooms[player.ws.roomId]) {
                    playerStay(playerId, player.ws.roomId);
                }
                break;
            }
            case 'requestResetRound': { // Allow any player to request reset if round is over
                const room = rooms[data.roomId];
                if (room && room.roundOver) {
                    resetRound(data.roomId);
                }
                break;
            }
            default:
                console.log(`Received unknown message type: ${type} from ${playerId}`);
                ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${type}` }));
        }
    });

    ws.on('close', () => {
        console.log(`Player ${playerId} disconnected.`);
        const roomId = ws.roomId; // Get roomId associated with this ws connection
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === playerId);
            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players[playerIndex];
                console.log(`Player ${disconnectedPlayer.name} removed from room ${roomId}.`);

                if (room.gameStarted && !room.roundOver) {
                    disconnectedPlayer.disconnectedMidGame = true;
                    disconnectedPlayer.hasStayed = true; // Treat as stayed to advance turn
                     room.gameMessage = `${disconnectedPlayer.name} หลุดออกจากเกม`;
                     console.log(`[Room ${roomId}] ${disconnectedPlayer.name} disconnected mid-game.`);
                    // If it was this player's turn, advance it
                    if (room.currentPlayerTurn === playerId) {
                        handleNextPlayerTurn(roomId, playerId); // This will find next or go to dealer/results
                    }
                } else if (!room.gameStarted || room.roundOver) {
                     // If game not started or round over, just remove
                     room.players.splice(playerIndex, 1);
                }


                if (room.players.length === 0) {
                    console.log(`Room ${roomId} is empty, deleting.`);
                    delete rooms[roomId];
                } else {
                    // If dealer disconnected, need to assign a new dealer or end game
                    if (disconnectedPlayer.isDealer) {
                        console.log(`Dealer ${disconnectedPlayer.name} disconnected from room ${roomId}.`);
                        if (room.gameStarted && !room.roundOver) {
                             room.gameMessage = "เจ้ามือหลุดการเชื่อมต่อ! เกมจบลง";
                             // Could force results or just end
                             room.players.forEach(p => p.showHandOnBroadcast = true); // show hands
                             // performResultCalculation might be complex here if dealer hand incomplete
                             // Simplest: refund bets or declare no contest for this round
                             room.roundOver = true; // Mark round over
                             room.gameStarted = false;
                        }
                        // Assign new dealer if game not started or for next round
                        if ((!room.gameStarted || room.roundOver) && room.players.length > 0) {
                            room.players[0].isDealer = true;
                            room.players[0].roleInRoom = "เจ้ามือ";
                            room.dealerId = room.players[0].id;
                             room.gameMessage = `${room.players[0].name} เป็นเจ้ามือคนใหม่`;
                            console.log(`New dealer in room ${roomId}: ${room.players[0].name}`);
                        }
                    }
                    broadcastRoomState(roomId, { log: `${disconnectedPlayer.name} ออกจากห้อง` });
                }
            }
        }
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for player ${playerId}: ${error.message}`);
        // Handle disconnection or cleanup if needed
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`WebSocket Server for Pok Deng is running on port ${PORT}`);
});