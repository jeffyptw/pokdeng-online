// Merged App.js
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css"; // Ensure you have this file, or remove if not used
// import { v4 as uuidv4 } from 'uuid'; // Only if you prefer uuid library for random room ID

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // For local testing

let socketClient = null;
const DEFAULT_TURN_DURATION = 30;

// --- Persistent Player ID (from new code) ---
let persistentPlayerId = localStorage.getItem("pokdengPersistentPlayerId");
if (!persistentPlayerId) {
  if (window.crypto && window.crypto.randomUUID) {
    persistentPlayerId = window.crypto.randomUUID();
  } else {
    // Basic fallback if crypto.randomUUID is not available
    persistentPlayerId = `pid-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }
  localStorage.setItem("pokdengPersistentPlayerId", persistentPlayerId);
}
console.log("My Persistent Player ID:", persistentPlayerId);
// --- End Persistent Player ID ---

function App() {
  // States from your original code
  const [isConnected, setIsConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(null); // Current socket.id
  const [name, setName] = useState(
    localStorage.getItem("pokdengPlayerName") || ""
  ); // Initialized from localStorage
  const [money, setMoney] = useState(
    localStorage.getItem("pokdengPlayerMoney") || "50"
  ); // Initialized from localStorage
  const [inputRoomId, setInputRoomId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [playerData, setPlayerData] = useState([]);
  const [betAmount, setBetAmount] = useState(0); // This is room's bet amount set by dealer
  const [inputBetAmount, setInputBetAmount] = useState(
    localStorage.getItem("pokdengDefaultBet") || "5"
  ); // For dealer input and player's bet input
  const [roomLocked, setRoomLocked] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [myCards, setMyCards] = useState([]);
  const [hasStayed, setHasStayed] = useState(false);
  const [currentTurnId, setCurrentTurnId] = useState(null);
  const [currentTurnInfo, setCurrentTurnInfo] = useState({
    name: "",
    role: "",
    timeLeft: 0,
  });
  const [countdown, setCountdown] = useState(DEFAULT_TURN_DURATION); // Player's turn countdown
  const [result, setResult] = useState([]);
  const [showResultBtn, setShowResultBtn] = useState(false);
  const [gameRound, setGameRound] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState([]);
  const [transferSummary, setTransferSummary] = useState({
    toPay: [],
    toReceive: [],
  });
  const [revealedPokPlayers, setRevealedPokPlayers] = useState({});
  const [errorMsg, setErrorMsg] = useState(""); // For general error display banner
  const [messages, setMessages] = useState([]); // For system/game messages log

  // States from new code (or to ensure they are managed)
  const [turnDuration, setTurnDuration] = useState(DEFAULT_TURN_DURATION); // Max duration for a turn, from server
  // const [hasBet, setHasBet] = useState(false); // Player specific bet status for the round - managed within playerData now

  const messagesEndRef = useRef(null);

  // Scroll to bottom for messages (from new code, was commented in original)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Save name, money, and defaultBet to localStorage (from new code)
  useEffect(() => {
    localStorage.setItem("pokdengPlayerName", name);
  }, [name]);

  useEffect(() => {
    localStorage.setItem("pokdengPlayerMoney", money); // Stores initial money input by user
  }, [money]);

  useEffect(() => {
    localStorage.setItem("pokdengDefaultBet", inputBetAmount);
  }, [inputBetAmount]);

  // addMessage function from your original code (very useful)
  const addMessage = (text, type = "info") => {
    const fullText = `[${new Date().toLocaleTimeString()}] ${text}`;
    setMessages((prev) => {
      const newMessages = [...prev, { text: fullText, type }];
      if (newMessages.length > 30)
        return newMessages.slice(newMessages.length - 30); // Increased limit slightly
      return newMessages;
    });

    if (type === "error" || type === "success" || type === "highlight") {
      // Removed 'info' from setting errorMsg
      setErrorMsg(text); // Show important messages in the banner
      setTimeout(
        () => setErrorMsg((current) => (current === text ? "" : current)),
        type === "error" ? 7000 : 5000
      );
    }
  };

  // Main useEffect for Socket.IO connection (merged)
  useEffect(() => {
    if (!socketClient) {
      console.log("[Client] Initializing new socket connection to", SERVER_URL);
      socketClient = io(SERVER_URL, {
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
        query: { persistentPlayerId }, // Send persistentPlayerId on initial connection
        transports: ["websocket"], // From original code
      });
    }

    // --- Standard Socket Event Handlers (merged) ---
    const onConnect = () => {
      console.log("[Client] Connected to server with ID:", socketClient.id);
      setIsConnected(true);
      setMyPlayerId(socketClient.id);
      addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว!", "success");

      // Attempt to rejoin room if previously in one (from new code)
      const lastRoomId = sessionStorage.getItem("pokdengLastRoomId");
      const storedName = localStorage.getItem("pokdengPlayerName");
      const storedMoney = localStorage.getItem("pokdengPlayerMoney"); // This is the initial money

      if (lastRoomId && storedName && storedMoney && persistentPlayerId) {
        console.log(
          `[Client] Attempting to rejoin room ${lastRoomId} with persistentId ${persistentPlayerId}`
        );
        // Use the structure your server expects for "joinRoom"
        socketClient.emit("joinRoom", {
          roomId: lastRoomId,
          playerName: storedName,
          initialBalance: parseInt(storedMoney), // Or current balance if server handles that
          persistentPlayerId: persistentPlayerId,
        });
      }
    };

    const onDisconnect = (reason) => {
      console.log("[Client] Disconnected from server. Reason:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
      // Do not clear all room state here, allow server/rejoin logic to handle
    };

    const onConnectError = (err) => {
      console.error("[Client] Connection Attempt Error:", err);
      addMessage(`พยายามเชื่อมต่อ Server ไม่สำเร็จ: ${err.message}`, "error");
      setIsConnected(false);
    };

    socketClient.on("connect", onConnect);
    socketClient.on("disconnect", onDisconnect);
    socketClient.on("connect_error", onConnectError);
    socketClient.on("error", (errorData) => {
      // General socket error
      console.error("Socket/Server Error:", errorData.message || errorData);
      addMessage(
        `ข้อผิดพลาดจากเซิร์ฟเวอร์/Socket: ${errorData.message || errorData}`,
        "error"
      );
    });

    // --- Game-Specific Event Handlers (from original, enhanced) ---
    socketClient.on("roomCreated", (data) => {
      // From original
      console.log("[Client] Room Created:", data);
      setRoomId(data.roomId);
      setInRoom(true);
      setIsDealer(true); // Creator is dealer
      setMyPlayerId(socketClient.id); // Ensure current socket ID is set
      addMessage(
        `ห้อง ${data.roomId} ถูกสร้างโดย ${name || data.dealerName}`,
        "success"
      );
      if (typeof data.betAmount === "number") {
        setBetAmount(data.betAmount);
        setInputBetAmount(data.betAmount.toString());
      }
      sessionStorage.setItem("pokdengLastRoomId", data.roomId); // Store current room
      if (data.allPlayerData) setPlayerData(data.allPlayerData); // Sync player data
    });

    socketClient.on("joinedRoom", (data) => {
      // From original
      console.log("[Client] Joined Room:", data);
      setRoomId(data.roomId);
      setInRoom(true);
      setMyPlayerId(socketClient.id); // Ensure current socket ID is set
      //setIsDealer(false); // Server should confirm this in playerData or specific field
      addMessage(
        `เข้าร่วมห้อง ${data.roomId} สำเร็จ. เจ้ามือ: ${
          data.dealerName || "N/A"
        }`,
        "success"
      );
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      sessionStorage.setItem("pokdengLastRoomId", data.roomId); // Store current room
      if (data.allPlayerData) setPlayerData(data.allPlayerData); // Sync player data
      if (data.myPlayerDetails) {
        // If server sends specific details for the joining player
        setIsDealer(data.myPlayerDetails.isDealer);
        // setMoney(data.myPlayerDetails.balance.toString()); // Update money if server provides it
      }
    });

    // playersData handler from new code (more robust)
    socketClient.on("playersData", (updatedPlayerData) => {
      console.log("[Client] Received 'playersData':", updatedPlayerData);
      setPlayerData(updatedPlayerData);
      const me = updatedPlayerData.find(
        (p) =>
          p.id === myPlayerId ||
          (p.persistentId && p.persistentId === persistentPlayerId)
      );
      if (me) {
        setIsDealer(me.isDealer);
        if (typeof me.balance === "number") {
          // Assuming 'balance' is the source of truth for money in room
          // setMoney(me.balance.toString()); // This could overwrite initial input if not careful.
          // Let's assume 'money' state is for input, player list shows 'p.balance'
        }
        setMyCards(me.cards || []);
        setHasStayed(me.hasStayed); // From player's state on server
        // Bet amount is room-wide, not per player here, but 'me.hasBet' could be useful
      }
    });

    socketClient.on("yourCards", (cardsFromServer) => {
      // From original
      console.log(
        `[Client ${
          myPlayerId || socketClient?.id
        }] Received 'yourCards'. Data:`,
        JSON.stringify(cardsFromServer)
      );
      if (
        Array.isArray(cardsFromServer) &&
        cardsFromServer.every(
          (c) =>
            typeof c === "object" && c !== null && "value" in c && "suit" in c
        )
      ) {
        setMyCards(cardsFromServer);
      } else {
        console.warn(
          "[Client] 'yourCards' received non-array of objects or invalid data:",
          cardsFromServer
        );
        setMyCards([]);
      }
    });

    socketClient.on("gameStarted", (data) => {
      // From original
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "info");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      setGameStarted(true);
      setResult([]);
      setHasStayed(false);
      //setMyCards([]); // Server will send 'yourCards'
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({});
    });

    socketClient.on("currentTurn", (turnData) => {
      // From original, enhanced
      console.log("[Client] Event 'currentTurn':", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name,
        role: turnData.role,
        timeLeft: turnData.timeLeft,
      });
      setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);
      setTurnDuration(turnData.timeLeft || DEFAULT_TURN_DURATION); // Store max duration

      if (turnData.id === myPlayerId) {
        addMessage(
          `ตาของคุณ! (เวลา: ${
            turnData.timeLeft || DEFAULT_TURN_DURATION
          } วินาที)`,
          "highlight"
        );
        const meInPlayerData = playerData.find((p) => p.id === myPlayerId);
        if (!(meInPlayerData && meInPlayerData.hasStayed)) {
          // Check from player data
          setHasStayed(false); // Reset hasStayed if it's my turn and I haven't stayed (according to server)
        }
      }
    });

    socketClient.on("turnTimerUpdate", (timerData) => {
      // From original
      if (currentTurnId === timerData.playerId) {
        setCurrentTurnInfo((prev) => ({
          ...prev,
          timeLeft: timerData.timeLeft,
        }));
        if (timerData.playerId === myPlayerId) setCountdown(timerData.timeLeft);
      }
    });

    socketClient.on("enableShowResult", (canShow) => {
      // From original
      console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    });

    socketClient.on("lockRoom", (isLockedFromServer) => {
      // From original
      console.log("[Client] Room lock status from server:", isLockedFromServer);
      setRoomLocked(isLockedFromServer);
      addMessage(
        isLockedFromServer ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค",
        "system"
      );
    });

    socketClient.on("result", (roundResultsFromServer) => {
      // From original
      console.log(
        "[Client] Event 'result' from server:",
        roundResultsFromServer
      );
      if (Array.isArray(roundResultsFromServer)) {
        const sortedResults = [...roundResultsFromServer].sort((a, b) => {
          const isADealer = a.role === "เจ้ามือ";
          const isBDealer = b.role === "เจ้ามือ";
          if (isADealer && !isBDealer) return -1;
          if (!isADealer && isBDealer) return 1;
          if (!isADealer && !isBDealer) {
            const numA = parseInt(a.role?.replace(/[^0-9]/g, ""), 10);
            const numB = parseInt(b.role?.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
          }
          return 0;
        });
        setResult(sortedResults);
      } else {
        setResult([]);
      }
      setGameStarted(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setGameRound((prev) => prev + 1);
    });

    socketClient.on("resetGame", () => {
      // From original
      console.log("[Client] Event 'resetGame'");
      addMessage("เกมถูกรีเซ็ต เตรียมเริ่มรอบใหม่", "info");
      setGameStarted(false);
      setMyCards([]);
      setResult([]);
      setHasStayed(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setRevealedPokPlayers({});
    });

    socketClient.on("player_revealed_pok", (data) => {
      // From original
      console.log("[Client] Player revealed Pok:", data);
      if (data && data.playerId && data.cards && data.handDetails) {
        addMessage(
          `${data.role || "ขาไพ่"} (${data.name}) ${
            data.handDetails.name || "ป๊อก!"
          } แสดงไพ่: ${data.cards.map(getCardDisplay).join(" ")}`,
          "highlight"
        );
        setRevealedPokPlayers((prev) => ({
          ...prev,
          [data.playerId]: {
            name: data.name,
            role: data.role,
            cards: data.cards,
            handDetails: data.handDetails,
          },
        }));
      } else {
        console.warn(
          "[Client] Received invalid data for player_revealed_pok:",
          data
        );
      }
    });

    socketClient.on("gameEnded", (gameSummary) => {
      // From original
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary);
      setSummaryData(
        gameSummary.map((p) => ({
          ...p,
          isDealer:
            playerData.find((pd) => pd.id === p.id)?.isDealer ||
            p.role === "เจ้ามือ",
        }))
      );
      setShowSummary(true);
      setGameStarted(false);
      setResult([]);
      setCurrentTurnId(null);
    });

    // Generic message handlers (ensure these use addMessage)
    socketClient.on("errorMessage", (msg) =>
      addMessage(
        msg.text ||
          (typeof msg === "string" ? msg : "Error processing request"),
        "error"
      )
    );
    socketClient.on("message", (msg) =>
      addMessage(
        msg.text || (typeof msg === "string" ? msg : "System message"),
        msg.type || "system"
      )
    ); // msg.type for styling
    socketClient.on("gameError", (error) =>
      addMessage(`ข้อผิดพลาดจากเกม: ${error.message}`, "error")
    ); // From new code

    socketClient.on("playerLeft", (data) =>
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`, "system")
    ); // From original

    socketClient.on("roomSettings", (settings) => {
      // From original
      console.log("[Client] Received 'roomSettings'. Data:", settings);
      if (settings && typeof settings.betAmount === "number") {
        addMessage(
          `[EVENT] ราคาเดิมพันอัปเดตเป็น: ${settings.betAmount} (จาก roomSettings)`,
          "info"
        );
        setBetAmount(settings.betAmount);
        const amIDealer = playerData.find(
          (p) => p.id === myPlayerId && p.isDealer
        );
        if (amIDealer) {
          setInputBetAmount(settings.betAmount.toString());
        }
      } else {
        console.warn(
          "[Client] 'roomSettings' received invalid data:",
          settings
        );
      }
    });

    // Cleanup function (from original, ensuring all listeners are off)
    return () => {
      console.log("[Client] Cleaning up socket connection...");
      if (socketClient) {
        socketClient.off("connect", onConnect);
        socketClient.off("disconnect", onDisconnect);
        socketClient.off("connect_error", onConnectError);
        socketClient.off("error"); // General error
        socketClient.off("roomCreated");
        socketClient.off("joinedRoom");
        socketClient.off("playersData");
        socketClient.off("yourCards");
        socketClient.off("gameStarted");
        socketClient.off("currentTurn");
        socketClient.off("turnTimerUpdate");
        socketClient.off("result");
        socketClient.off("gameEnded");
        socketClient.off("resetGame");
        socketClient.off("enableShowResult");
        socketClient.off("errorMessage");
        socketClient.off("message"); // Generic message
        socketClient.off("gameError"); // Game error
        socketClient.off("lockRoom");
        socketClient.off("playerLeft");
        socketClient.off("roomSettings");
        socketClient.off("player_revealed_pok");
        // socketClient.disconnect(); // Disconnect if component unmounts for good
      }
    };
    // Dependencies from original, check if `addMessage` needs to be here.
    // `addMessage` itself doesn't change, but it uses `setMessages` and `setErrorMsg`.
    // If handlers use `name`, `roomId`, `currentTurnId`, `myPlayerId`, `playerData` from closure, they should be here.
  }, [myPlayerId, name, roomId, currentTurnId, playerData]); // Consider if addMessage needs to be dependency if it uses state from App directly

  // Countdown timer effect (from original, ensure dependencies are correct)
  useEffect(() => {
    let timer;
    if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      myCards.length >= 2 &&
      !hasStayed &&
      countdown > 0
    ) {
      timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    } else if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      countdown === 0
    ) {
      if (socketClient && socketClient.connected) {
        addMessage("หมดเวลา! ทำการ 'อยู่' อัตโนมัติ", "info");
        socketClient.emit("stay", { roomId }); // Send roomId object
        // setHasStayed(true); // Server should confirm this via playersData
      }
    }
    return () => clearTimeout(timer);
  }, [
    countdown,
    currentTurnId,
    hasStayed,
    myPlayerId,
    myCards.length,
    gameStarted,
    roomId /* addMessage dependency? */,
  ]);

  // useEffect for transferSummary (from original)
  useEffect(() => {
    if (showSummary && summaryData.length > 0 && myPlayerId) {
      const currentUserSummary = summaryData.find((p) => p.id === myPlayerId);
      if (!currentUserSummary) {
        console.warn(
          "[Client] Cannot find current user in summaryData for transfer calculation."
        );
        setTransferSummary({ toPay: [], toReceive: [] });
        return;
      }
      const amIDealer = currentUserSummary.isDealer;
      const toPayList = [];
      const toReceiveList = [];
      if (!amIDealer) {
        if (currentUserSummary.netChange < 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer)
            toPayList.push({
              name: dealer.name,
              role: dealer.role,
              amount: Math.abs(currentUserSummary.netChange),
            });
        } else if (currentUserSummary.netChange > 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer)
            toReceiveList.push({
              name: dealer.name,
              role: dealer.role,
              amount: currentUserSummary.netChange,
            });
        }
      } else {
        summaryData.forEach((player) => {
          if (player.id === myPlayerId) return;
          if (player.netChange > 0)
            toPayList.push({
              name: player.name,
              role: player.role,
              amount: player.netChange,
            });
          else if (player.netChange < 0)
            toReceiveList.push({
              name: player.name,
              role: player.role,
              amount: Math.abs(player.netChange),
            });
        });
      }
      setTransferSummary({ toPay: toPayList, toReceive: toReceiveList });
    } else if (!showSummary) {
      setTransferSummary({ toPay: [], toReceive: [] });
    }
  }, [showSummary, summaryData, myPlayerId]);

  // --- Action Handlers (from original, enhanced with persistentId and roomId object) ---
  const handleCreateRoom = () => {
    if (!socketClient || !isConnected) {
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error");
      return;
    }
    const bal = parseInt(money);
    if (!name.trim()) {
      addMessage("กรุณากรอกชื่อของคุณ", "error");
      return;
    }
    if (isNaN(bal) || bal < 50 || bal % 10 !== 0) {
      addMessage(
        "จำนวนเงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 50 และต้องลงท้ายด้วย 0 เท่านั้น",
        "error"
      );
      return;
    }
    console.log("[Client] Emitting 'createRoom'");
    socketClient.emit("createRoom", {
      playerName: name,
      initialBalance: bal,
      persistentPlayerId,
    });
  };

  const handleJoinRoom = () => {
    if (!socketClient || !isConnected) {
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error");
      return;
    }
    const bal = parseInt(money);
    if (!name.trim()) {
      addMessage("กรุณากรอกชื่อของคุณ", "error");
      return;
    }
    if (!inputRoomId.trim()) {
      addMessage("กรุณากรอกรหัสห้อง", "error");
      return;
    }
    if (isNaN(bal) || bal < 10 || bal % 10 !== 0) {
      addMessage(
        "จำนวนเงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 10 และต้องลงท้ายด้วย 0 เท่านั้น",
        "error"
      );
      return;
    }
    console.log("[Client] Emitting 'joinRoom' to room:", inputRoomId.trim());
    setMessages([]); // Clear messages for new room attempt
    socketClient.emit("joinRoom", {
      roomId: inputRoomId.trim(),
      playerName: name,
      initialBalance: bal,
      persistentPlayerId,
    });
  };

  // Player betting action (from new code logic, adapted)
  const handlePlaceBet = () => {
    if (socketClient && isConnected && inRoom && !isDealer) {
      const amount = parseInt(inputBetAmount); // Use the general inputBetAmount for player's bet
      if (isNaN(amount) || amount <= 0) {
        addMessage("จำนวนเงินเดิมพันไม่ถูกต้อง", "error");
        return;
      }
      // Check against player's balance if needed (playerData may hold current balance)
      const me = playerData.find((p) => p.id === myPlayerId);
      if (me && me.balance < amount) {
        addMessage("เงินไม่พอสำหรับการเดิมพันนี้", "error");
        return;
      }
      if (amount > betAmount && betAmount > 0) {
        // If dealer has set a bet amount, player cannot bet more than that.
        // This logic might need refinement based on game rules.
        // Usually players bet up to the dealer's single bet amount.
        // addMessage(`ไม่สามารถเดิมพันเกินยอดที่เจ้ามือกำหนด: ${betAmount}`, "error");
        // return;
        // For now, assume player bets the room's betAmount or their own if dealer hasn't set.
      }

      socketClient.emit("placeBet", { roomId, amount }); // Server needs to handle "placeBet"
      // Server should confirm via playersData update (e.g., player.hasBet = true, player.currentBet = amount)
      addMessage(`คุณวางเดิมพัน ${amount} บาท`, "info");
    } else {
      addMessage("ไม่สามารถวางเดิมพันได้ในขณะนี้", "error");
    }
  };

  const handleSetBet = () => {
    // Dealer sets room bet
    if (socketClient && isConnected && isDealer && !gameStarted) {
      const amount = parseInt(inputBetAmount);
      if (
        !isNaN(amount) &&
        amount >= 5 &&
        (amount % 10 === 0 || amount % 5 === 0)
      ) {
        console.log("[Client] Emitting 'setBetAmount' with amount:", amount);
        socketClient.emit("setBetAmount", { roomId, amount });
      } else {
        addMessage(
          "จำนวนเงินเดิมพันต้องเป็นตัวเลข, ไม่น้อยกว่า 5 และลงท้ายด้วย 0 หรือ 5",
          "error"
        );
      }
    } else {
      addMessage("ไม่สามารถตั้งค่าเดิมพันได้ในขณะนี้", "error");
    }
  };

  const handleToggleLockRoom = () => {
    if (socketClient && isConnected && isDealer && !gameStarted) {
      console.log("[Client] Emitting 'lockRoom' with new state:", !roomLocked);
      socketClient.emit("lockRoom", { roomId, lock: !roomLocked });
    }
  };

  const handleCopyRoomId = () => {
    // From original
    if (!roomId) return;
    navigator.clipboard
      .writeText(roomId)
      .then(() =>
        addMessage(`คัดลอกเลขห้อง "${roomId}" เรียบร้อยแล้ว`, "success")
      )
      .catch((err) => {
        console.error("คัดลอกไม่สำเร็จ:", err);
        addMessage("คัดลอกเลขห้องไม่สำเร็จ", "error");
      });
  };

  const handleStartGame = () => {
    // From original
    if (socketClient && socketClient.connected && roomId && isDealer) {
      if (betAmount <= 0) {
        addMessage("กรุณากำหนดเงินเดิมพันก่อนเริ่มเกม", "error");
        return;
      }
      console.log(
        "[Client] Attempting 'startGame'. RoomId:",
        roomId,
        "IsDealer:",
        isDealer
      );
      socketClient.emit("startGame", { roomId }); // Send as object
    } else {
      addMessage("ไม่สามารถเริ่มเกมได้", "error");
    }
  };

  const handleDrawCard = () => {
    // From original (used as "Hit")
    if (
      socketClient &&
      socketClient.connected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      myCards.length < 3
    ) {
      console.log("[Client] Emitting 'drawCard' in room:", roomId);
      socketClient.emit("drawCard", { roomId }); // Send as object
    } else {
      addMessage("ไม่สามารถจั่วไพ่ได้ในขณะนี้", "error");
    }
  };

  const handleStay = () => {
    // Merged: emit object, server confirms hasStayed
    if (
      socketClient &&
      socketClient.connected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed
    ) {
      console.log("[Client] Emitting 'stay' in room:", roomId);
      socketClient.emit("stay", { roomId }); // Send as object
      // setHasStayed(true); // Optimistic update removed, rely on server playersData
    } else {
      addMessage("ไม่สามารถอยู่ได้ในขณะนี้", "error");
    }
  };

  const handleShowResult = () => {
    // From original
    if (
      socketClient &&
      socketClient.connected &&
      isDealer &&
      gameStarted &&
      showResultBtn
    ) {
      console.log("[Client] Emitting 'showResult' for room:", roomId);
      socketClient.emit("showResult", { roomId }); // Send as object
    } else {
      addMessage("ไม่สามารถแสดงผลได้ในขณะนี้", "error");
    }
  };

  const handleResetGameHandler = () => {
    // From original
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'resetGame' for room:", roomId);
      socketClient.emit("resetGame", { roomId }); // Send as object
    }
  };

  const handleEndGame = () => {
    // From original
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'endGame' for room:", roomId);
      socketClient.emit("endGame", { roomId }); // Send as object
    }
  };

  const handleExitGame = () => {
    // Merged: Prefer graceful exit then reload if needed
    if (socketClient && roomId) {
      socketClient.emit("leaveRoom", { roomId }); // Server needs to handle "leaveRoom"
      addMessage("กำลังออกจากห้อง...", "system");
    }
    // Clear local state associated with the room
    setInRoom(false);
    setRoomId("");
    setPlayerData([]);
    // setMessages([]); // Keep messages for a bit or clear after a delay
    setGameStarted(false);
    setMyCards([]);
    // setIsDealer(false); // Will be reset on joining new room
    setResult([]);
    setShowSummary(false);
    sessionStorage.removeItem("pokdengLastRoomId"); // Clear stored room on clean exit
    // Optionally, force reload or navigate to lobby after a short delay
    // setTimeout(() => window.location.reload(), 500);
    // For now, just resets state, user can join/create new.
  };

  // --- Helper Functions (from original) ---
  const getCardDisplay = (card) => {
    if (
      card &&
      typeof card.value !== "undefined" &&
      typeof card.suit !== "undefined"
    )
      return `${card.value}${card.suit}`;
    console.warn("[Client] getCardDisplay received invalid card object:", card);
    return "?";
  };
  const getCardPoint = (v) =>
    ["J", "Q", "K", "10"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v);
  const calculateRankForDisplay = (cardsToRank) => {
    // ... (Your existing calculateRankForDisplay logic - keep as is)
    if (!cardsToRank || cardsToRank.length === 0)
      return { score: 0, type: "ยังไม่มีไพ่" };
    const calculatedScore =
      cardsToRank.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
    let type = `${calculatedScore} แต้ม`;
    if (cardsToRank.length === 2) {
      const isPok = calculatedScore === 8 || calculatedScore === 9;
      const isDeng =
        cardsToRank[0].suit === cardsToRank[1].suit ||
        cardsToRank[0].value === cardsToRank[1].value;
      if (isPok) {
        type = `ป๊อก ${calculatedScore}`;
        if (isDeng) type += " สองเด้ง";
      } else if (isDeng) {
        type =
          calculatedScore === 0
            ? "บอดสองเด้ง"
            : `${calculatedScore} แต้มสองเด้ง`;
      } // Simplified
      else {
        if (calculatedScore === 0) type = "บอด";
      }
    } else if (cardsToRank.length === 3) {
      const suits = cardsToRank.map((c) => c.suit);
      const card_raw_values = cardsToRank.map((c) => c.value);
      const isSameSuit = suits.every((s) => s === suits[0]);
      const isTaong = card_raw_values.every(
        (val) => val === card_raw_values[0]
      );
      const n_vals_for_straight = [...card_raw_values]
        .map(
          (v_str) => ({ A: 1, J: 11, Q: 12, K: 13 }[v_str] || parseInt(v_str))
        )
        .sort((a, b) => a - b);
      let is_straight_result = false;
      if (
        n_vals_for_straight.length === 3 &&
        n_vals_for_straight.every((n) => typeof n === "number" && !isNaN(n))
      ) {
        if (
          (n_vals_for_straight[1] === n_vals_for_straight[0] + 1 &&
            n_vals_for_straight[2] === n_vals_for_straight[1] + 1) ||
          (n_vals_for_straight[0] === 1 &&
            n_vals_for_straight[1] === 12 &&
            n_vals_for_straight[2] === 13) /* QKA */
        ) {
          is_straight_result = true;
        }
      }
      const is_sian_result = card_raw_values.every((v_str) =>
        ["J", "Q", "K"].includes(v_str)
      );
      if (isTaong) type = `ตอง ${card_raw_values[0]}`;
      else if (is_straight_result && isSameSuit) type = "สเตรทฟลัช";
      else if (is_sian_result) type = "เซียน";
      else if (is_straight_result) type = "เรียง";
      else if (isSameSuit)
        type =
          calculatedScore === 0
            ? "สามเด้ง (บอด)"
            : `${calculatedScore} แต้มสามเด้ง`;
      else {
        if (calculatedScore === 9) type = "9 หลัง";
        else if (calculatedScore === 8) type = "8 หลัง";
        else if (calculatedScore === 0) type = "บอด";
      }
    }
    if (type === "0 แต้ม" && calculatedScore === 0) type = "บอด"; // Final check for 0 points
    return { score: calculatedScore, type };
  };

  // --- Derived State for UI (from original) ---
  const myCurrentPlayerData = playerData.find(
    (p) =>
      p.id === myPlayerId ||
      (p.persistentId && p.persistentId === persistentPlayerId)
  );
  let myHandType = "ยังไม่มีไพ่";
  if (myCards && myCards.length > 0 && (gameStarted || result.length > 0)) {
    // Show hand type even if result is shown
    const rankData = calculateRankForDisplay(myCards);
    myHandType = rankData.type;
  }
  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed;

  // --- Render Logic ---

  // Initial connecting screen (from new code)
  if (!isConnected && !inRoom) {
    return (
      <div className="App-lobby">
        <h2>เชื่อมต่อกับเซิร์ฟเวอร์ Pok Deng...</h2>
        <p className="status-connecting">
          สถานะ: {isConnected ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมต่อ..."}
        </p>
        {messages.length > 0 && ( // Show initial connection messages
          <div className="messages-log" style={{ marginTop: "20px" }}>
            <h4>ข้อความจากระบบ:</h4>
            <div
              className="messages-box"
              ref={messagesEndRef}
              style={{ maxHeight: "100px" }}
            >
              {messages.map((msg, index) => (
                <p
                  key={index}
                  className={`message-type-${msg.type || "system"}`}
                >
                  {msg.text}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Summary Screen (from original)
  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId);
    return (
      <div className="App-summary">
        <h2>สรุปยอดต้องโอนให้และต้องได้ (ห้อง: {roomId})</h2>
        <h3>
          ชื่อขาไพ่: {me?.name || name} (
          {me?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")})
        </h3>
        <hr />
        {transferSummary.toReceive.length > 0 && (
          <>
            <h3 style={{ color: "green", marginTop: "20px" }}>
              ยอดที่จะได้รับ:
            </h3>
            {transferSummary.toReceive.map((item, index) => (
              <p
                key={`receive-${index}`}
                style={{ color: "green", marginLeft: "20px" }}
              >
                {" "}
                - จาก {item.name} ({item.role}): {item.amount.toLocaleString()}{" "}
                บาท
              </p>
            ))}{" "}
            <hr />
          </>
        )}
        {transferSummary.toPay.length > 0 && (
          <>
            <h3 style={{ color: "red", marginTop: "20px" }}>ยอดที่ต้องโอน:</h3>
            {transferSummary.toPay.map((item, index) => (
              <p
                key={`pay-${index}`}
                style={{ color: "red", marginLeft: "20px" }}
              >
                {" "}
                - ให้ {item.name} ({item.role}): {item.amount.toLocaleString()}{" "}
                บาท
              </p>
            ))}{" "}
            <hr />
          </>
        )}
        {transferSummary.toReceive.length === 0 &&
          transferSummary.toPay.length === 0 && (
            <p style={{ textAlign: "center", marginTop: "20px" }}>
              ไม่มีรายการได้เสียสำหรับคุณในรอบนี้
            </p>
          )}
        <h3 style={{ marginTop: "20px" }}>
          ยอดเงินคงเหลือของคุณ:{" "}
          {(me?.finalBalance !== undefined
            ? me.finalBalance
            : parseInt(myCurrentPlayerData?.balance || money)
          )?.toLocaleString()}{" "}
          บาท
        </h3>
        {me && (
          <p
            style={{
              fontStyle: "italic",
              textAlign: "center",
              color: "#555",
              marginTop: "10px",
            }}
          >
            {" "}
            (ยอดเงินเริ่มต้น: {me.initialBalance?.toLocaleString()} บาท,
            กำไร/ขาดทุนสุทธิ:{" "}
            <span className={me.netChange >= 0 ? "profit" : "loss"}>
              {" "}
              {me.netChange > 0
                ? `+${me.netChange?.toLocaleString()}`
                : me.netChange?.toLocaleString() || "0"}{" "}
              บาท{" "}
            </span>
            )
          </p>
        )}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากเกม (กลับไปล็อบบี้)
        </button>
      </div>
    );
  }

  // Lobby UI (from original, with additions from new code)
  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์</h2>
        <p>Persistent ID (Debug): {persistentPlayerId}</p>
        <p>Socket ID ปัจจุบัน: {myPlayerId || "N/A"}</p>
        {errorMsg && (
          <p
            className="error-message"
            style={{
              color: "#000000",
              border: "1px solid #551818",
              padding: "5px",
              backgroundColor: "#eeeeee",
              whiteSpace: "pre-wrap",
            }}
          >
            {errorMsg}
          </p>
        )}
        ชื่อคุณ:{" "}
        <input
          type="text"
          placeholder="กรุณาใส่ชื่อของคุณ"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        เงินเริ่มต้น:{" "}
        <input
          type="number"
          placeholder="เงินเริ่มต้น (ขั้นต่ำ 50)"
          value={money}
          onChange={(e) => setMoney(e.target.value)}
          min="50"
          step="10"
        />
        <div style={{ marginTop: 20 }}>
          <button
            onClick={handleCreateRoom}
            disabled={!isConnected || !name.trim() || !money.trim()}
          >
            สร้างห้อง
          </button>
        </div>
        <hr />
        <input
          type="text"
          placeholder="รหัสห้อง (ถ้ามี)"
          value={inputRoomId}
          onChange={(e) => setInputRoomId(e.target.value)}
        />
        <button
          onClick={() =>
            setInputRoomId(
              (window.crypto?.randomUUID &&
                window.crypto.randomUUID().substring(0, 6)) ||
                `r${Date.now()}`.substring(0, 7)
            )
          }
          style={{ marginLeft: "5px" }}
        >
          สุ่ม ID
        </button>
        <button
          onClick={handleJoinRoom}
          disabled={
            !inputRoomId.trim() || !isConnected || !name.trim() || !money.trim()
          }
        >
          เข้าร่วมห้อง
        </button>
        <div className="messages-log" style={{ marginTop: "20px" }}>
          <h4>ข้อความจากระบบ:</h4>
          <div
            className="messages-box"
            ref={messagesEndRef}
            style={{ maxHeight: "150px", overflowY: "auto" }}
          >
            {messages.map((msg, index) => (
              <p key={index} className={`message-type-${msg.type || "system"}`}>
                {msg.text}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // In Room UI (from original, with enhancements)
  const meInGame = playerData.find(
    (p) =>
      p.id === myPlayerId ||
      (p.persistentId && p.persistentId === persistentPlayerId)
  );
  const canPlayerBet =
    gameStarted &&
    !isDealer &&
    currentTurnId === myPlayerId &&
    (myCards.length === 0 ||
      (myCards.length === 2 && !(meInGame && meInGame.hasBet))); // Simplified player bet condition

  return (
    <div className="App">
      <header>
        <h1>
          ห้อง:&nbsp;
          <button
            className="text-button2"
            onClick={handleCopyRoomId}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomId}
          </button>
        </h1>
        <p>
          คุณ: {name}{" "}
          {isDealer ? "(เจ้ามือ)" : `(${myCurrentPlayerData?.role || "ขาไพ่"})`}{" "}
          | เงินคงเหลือ:{" "}
          {myCurrentPlayerData?.balance?.toLocaleString() || money} | SocketID:{" "}
          {myPlayerId}
        </p>
        <p style={{ color: roomLocked ? "red" : "green" }}>
          สถานะห้อง:{" "}
          <button
            className="text-button2"
            onClick={handleToggleLockRoom}
            disabled={!isDealer || gameStarted}
            title="คลิกเพื่อ ล็อค/ปลดล็อค ห้อง"
          >
            {roomLocked ? "ล็อค" : "เปิด"}
          </button>
        </p>
      </header>

      {errorMsg && (
        <p
          className="error-message"
          style={{
            border: "1px solid #3c763d",
            padding: "5px",
            backgroundColor: " #dff0d8",
            whiteSpace: "pre-wrap",
          }}
        >
          {errorMsg}
        </p>
      )}

      {!gameStarted && isDealer && (!result || result.length === 0) && (
        <div className="dealer-controls pre-game">
          <h4>ตั้งค่าเกม (เจ้ามือ): ขั้นต่ำ 5 บาท</h4>
          <div>
            <label>เงินเดิมพัน: </label>
            <input
              type="number"
              value={inputBetAmount}
              onChange={(e) => setInputBetAmount(e.target.value)}
              step="5"
              min="5"
            />
            <button className="btn-inroom-setting" onClick={handleSetBet}>
              ตั้งค่า
            </button>
          </div>
        </div>
      )}

      <div className="players-list">
        <h4>
          ราคาเดิมพันต่อรอบ:{" "}
          {betAmount > 0
            ? `${betAmount.toLocaleString()} บาท`
            : "รอเจ้ามือกำหนด"}
        </h4>
        <h4>ขาไพ่ในห้อง: ({playerData.length} คน)</h4>
        <ul>
          {playerData.map((p) => (
            <li
              key={p.persistentId || p.id}
              className={`${
                p.id === currentTurnId ? "current-turn-player" : ""
              } ${
                p.isTemporarilyDisconnected ? "player-disconnected-ingame" : ""
              }`}
            >
              <strong>{p.name}</strong> ({p.role}) - เงิน:{" "}
              {p.balance?.toLocaleString()} บาท
              {p.id === currentTurnId &&
                currentTurnInfo.timeLeft > 0 &&
                gameStarted &&
                ` (กำลังเล่น... ${currentTurnInfo.timeLeft}วิ)`}
              {p.isTemporarilyDisconnected && (
                <span className="status-disconnected-ingame">
                  (ขาดการเชื่อมต่อ)
                </span>
              )}
              {/* Display status from new code if server provides it */}
              {p.displayStatus && <span> ({p.displayStatus})</span>}
              {revealedPokPlayers[p.id] &&
                p.id !== myPlayerId &&
                gameStarted &&
                (!result || result.length === 0) && (
                  <div className="revealed-pok-cards">
                    <strong>ไพ่ที่ป๊อก:</strong>{" "}
                    {revealedPokPlayers[p.id].cards.map((card, cIdx) => (
                      <span key={cIdx} className="card-display">
                        {getCardDisplay(card)}
                      </span>
                    ))}{" "}
                    <em>{revealedPokPlayers[p.id].handDetails.type}</em>
                  </div>
                )}
              {/* Show card counts or simplified card view for others (from new code) */}
              {p.id !== myPlayerId &&
                gameStarted &&
                p.cards &&
                p.cards.length > 0 &&
                (!result || result.length === 0) &&
                !revealedPokPlayers[p.id] && (
                  <div className="other-player-cards">
                    ไพ่: {p.cards.map((_) => "🂠").join(" ")} (
                    {p.cardCount || p.cards.length})
                  </div>
                )}
            </li>
          ))}
        </ul>
      </div>

      {gameStarted &&
        myCards &&
        myCards.length > 0 &&
        (!result || result.length === 0) && (
          <div className="my-cards-area">
            <h2>
              ไพ่ของคุณ:{" "}
              {myCards.map((card, idx) => (
                <span key={idx} className="card">
                  {getCardDisplay(card)}{" "}
                </span>
              ))}
            </h2>
            <p>
              <h2>{myHandType}</h2>
            </p>
          </div>
        )}

      {/* Player Betting Controls (from new code logic, adapted for player's turn pre-draw) */}
      {canPlayerBet && !isDealer && (
        <div className="player-actions betting-phase">
          <h4>
            ตาของคุณ! วางเดิมพัน (เดิมพันห้อง:{" "}
            {betAmount > 0 ? betAmount : "รอเจ้ามือกำหนด"}) (เหลือ {countdown}{" "}
            วิ)
          </h4>
          <div>
            <label>จำนวนเงินเดิมพัน: </label>
            <input
              type="number"
              value={inputBetAmount}
              onChange={(e) => setInputBetAmount(e.target.value)}
              min="1"
              max={betAmount > 0 ? betAmount : undefined}
            />
            <button
              onClick={handlePlaceBet}
              disabled={
                !(parseInt(inputBetAmount) > 0) ||
                (betAmount > 0 && parseInt(inputBetAmount) > betAmount)
              }
            >
              วางเดิมพัน
            </button>
            <p style={{ fontSize: "0.8em" }}>
              (คุณสามารถเดิมพันได้ไม่เกินยอดที่เจ้ามือกำหนด หากมีการกำหนดไว้)
            </p>
          </div>
        </div>
      )}

      {/* Player Draw/Stay Controls (from original, now checks isMyTurn) */}
      {isMyTurn &&
        myCards.length >= 2 &&
        !hasStayed &&
        !(meInGame && meInGame.hasBet === false && !isDealer) && ( // Ensure betting is done if it's a betting turn
          <div className="player-actions">
            <p className="turn-info">ตาของคุณ! เวลา: {countdown} วินาที</p>
            <div className="action-buttons">
              {myCards.length < 3 && (
                <button
                  onClick={handleDrawCard}
                  disabled={hasStayed || myCards.length >= 3}
                >
                  จั่ว
                </button>
              )}
              <button onClick={handleStay} disabled={hasStayed}>
                อยู่
              </button>
            </div>
          </div>
        )}

      {/* Turn Indicators (from original) */}
      {!isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            รอ... ({currentTurnInfo.role}) {currentTurnInfo.name} (
            {currentTurnInfo.timeLeft} วิ) ⌛
          </p>
        )}
      {isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            ขาไพ่ที่ ({currentTurnInfo.role}) {currentTurnInfo.name}{" "}
            กำลังตัดสินใจ ({currentTurnInfo.timeLeft} วิ)...
          </p>
        )}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        showResultBtn &&
        (!result || result.length === 0) && (
          <div className="turn-indicator">
            <button className="btn-inroom-endgame2" onClick={handleShowResult}>
              เปิดไพ่ดวล
            </button>
          </div>
        )}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        !showResultBtn &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">รอขาไพ่ทุกคนตัดสินใจ...</p>
        )}

      {/* Results Display (from original) */}
      {result && result.length > 0 && (
        <div className="results-display">
          <h3>
            ผลลัพธ์รอบที่ {gameRound}: (เดิมพัน: {betAmount?.toLocaleString()}{" "}
            บาท)
          </h3>
          <table>
            <thead>
              <tr>
                <th>ชื่อขาไพ่</th>
                <th>ไพ่</th>
                <th>แต้ม</th>
                <th>ประเภท</th>
                <th>ผล</th>
                <th>ได้/เสีย</th>
                <th>เงินคงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {result.map((r, i) => (
                <tr
                  key={r.id || i}
                  className={`${r.id === myPlayerId ? "my-result-row" : ""} ${
                    r.disconnectedMidGame ? "disconnected-result-row" : ""
                  }`}
                >
                  <td>
                    {r.name} ({r.role || "N/A"})
                  </td>
                  <td>{r.cardsDisplay || "N/A"}</td>
                  <td>{r.score}</td>
                  <td>{r.specialType}</td>
                  <td>
                    {r.outcome === "ชนะ" && "✅ ชนะ"}
                    {r.outcome === "แพ้" && "❌ แพ้"}
                    {r.outcome === "เสมอ" && "🤝 เสมอ"}
                    {r.outcome === "เจ้ามือ" && "เจ้ามือ"}
                    {r.outcome === "ขาดการเชื่อมต่อ" && "ขาดการเชื่อมต่อ"}{" "}
                    {![
                      "ชนะ",
                      "แพ้",
                      "เสมอ",
                      "เจ้ามือ",
                      "ขาดการเชื่อมต่อ",
                    ].includes(r.outcome) && r.outcome}
                  </td>
                  <td
                    className={
                      r.moneyChange > 0
                        ? "profit"
                        : r.moneyChange < 0
                        ? "loss"
                        : ""
                    }
                  >
                    {r.moneyChange !== 0
                      ? `${
                          r.moneyChange > 0 ? "+" : ""
                        }${r.moneyChange?.toLocaleString()} บาท`
                      : "-"}
                  </td>
                  <td>{r.balance?.toLocaleString()} บาท</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dealer Post-Round/Pre-Next-Round Controls (from original) */}
      {isDealer &&
        (!gameStarted || (result && result.length > 0)) &&
        !showSummary && (
          <div className="turn-indicator">
            <button
              className="btn-inroom-start1"
              onClick={handleStartGame}
              disabled={betAmount <= 0}
            >
              &nbsp;&nbsp; &nbsp;
              {gameRound > 0 || (result && result.length > 0)
                ? "เริ่มเกมรอบใหม่"
                : "เริ่มเกม"}
              &nbsp;&nbsp;&nbsp;
            </button>
            <button
              className="btn-inroom-restart"
              onClick={handleResetGameHandler}
            >
              รีเซ็ตตา&สับไพ่
            </button>
            <button className="btn-inroom-result" onClick={handleEndGame}>
              จบเกม&ดูสรุปยอด
            </button>
          </div>
        )}
      {!isDealer &&
        result &&
        result.length > 0 &&
        !gameStarted &&
        !showSummary && (
          <p className="btn-inroom-waitinggame">
            <center>--- รอเจ้ามือเริ่มรอบใหม่ หรือ จบเกม ---</center>
          </p>
        )}

      <div className="turn-indicator" style={{ marginTop: "20px" }}>
        {" "}
        {/* Ensure some space */}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากห้อง
        </button>
      </div>

      <div className="messages-log">
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>
        <div className="messages-box" ref={messagesEndRef}>
          {messages.map((msg, index) => (
            <p key={index} className={`message-type-${msg.type || "system"}`}>
              {msg.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
