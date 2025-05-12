// App.js
import { useCallback, useEffect, useRef, useState } from "react"; // เพิ่ม useCallback
import io from "socket.io-client";
import "./App.css";

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001";

let socketClient = null;

const DEFAULT_TURN_DURATION = 30;

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [name, setName] = useState("");
  const [money, setMoney] = useState("50"); // ค่าเริ่มต้นตามที่ Server คาดหวัง
  const [inputRoomId, setInputRoomId] = useState("");

  const [roomId, setRoomId] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [playerData, setPlayerData] = useState([]);
  const [betAmount, setBetAmount] = useState(0);
  const [inputBetAmount, setInputBetAmount] = useState("5");
  const [roomLocked, setRoomLocked] = useState(false);

  const [gameStarted, setGameStarted] = useState(false);
  const [myCards, setMyCards] = useState([]);
  const [myHandDetails, setMyHandDetails] = useState(null); // เพิ่ม state สำหรับเก็บ handDetails ของตัวเอง
  const [hasStayed, setHasStayed] = useState(false);
  const [currentTurnId, setCurrentTurnId] = useState(null);
  const [currentTurnInfo, setCurrentTurnInfo] = useState({
    name: "",
    role: "",
    timeLeft: 0,
  });
  const [countdown, setCountdown] = useState(DEFAULT_TURN_DURATION);

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

  const [errorMsg, setErrorMsg] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages]);

  const addMessage = useCallback((text, type = "info") => {
    const fullText = `[${new Date().toLocaleTimeString()}] ${text}`;
    setMessages((prev) => {
      const newMessages = [...prev, { text: fullText, type }];
      if (newMessages.length > 30)
        // เพิ่มจำนวนข้อความที่เก็บได้
        return newMessages.slice(newMessages.length - 30);
      return newMessages;
    });
    if (
      type === "error" ||
      type === "success" ||
      type === "info" ||
      type === "highlight" ||
      type === "warning" // เพิ่ม type warning
    ) {
      setErrorMsg(text); // แสดงข้อความนี้ใน errorMsg ด้วย
      setTimeout(
        () => setErrorMsg((current) => (current === text ? "" : current)),
        type === "error" || type === "warning" ? 7000 : 5000
      );
    }
  }, []); // addMessage ไม่ควรเปลี่ยนบ่อย

  useEffect(() => {
    if (!socketClient) {
      console.log("[Client] Initializing new socket connection to", SERVER_URL);
      socketClient = io(SERVER_URL, { transports: ["websocket"] });
    }

    function onConnect() {
      console.log("[Client] Connected to server with ID:", socketClient.id);
      setMyPlayerId(socketClient.id); // Server จะใช้ ID นี้เป็น ID ผู้เล่น
      setIsConnected(true);
      addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว!", "success");
    }
    function onDisconnect(reason) {
      console.log("[Client] Disconnected from server. Reason:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
      setInRoom(false); // ถ้าหลุด ก็ออกจากห้องด้วย
      setGameStarted(false);
    }
    function onConnectError(err) {
      console.error("[Client] Connection Attempt Error:", err);
      addMessage(`พยายามเชื่อมต่อ Server ไม่สำเร็จ: ${err.message}`, "error");
      setIsConnected(false);
    }

    socketClient.on("connect", onConnect);
    socketClient.on("disconnect", onDisconnect);
    socketClient.on("connect_error", onConnectError);

    // --- Room and Player Events ---
    socketClient.on("roomCreated", (data) => {
      console.log("[Client] Room Created:", data);
      setRoomId(data.roomId);
      setPlayerData(data.players || []); // Server ส่ง players มาด้วย
      setMyPlayerId(data.yourId); // Server ส่ง ID ของเรามา
      setInRoom(true);
      setIsDealer(true);
      addMessage(
        `ห้อง ${data.roomId} ถูกสร้างโดย ${name || data.dealerName}`,
        "success"
      );
      if (typeof data.betAmount === "number") {
        setBetAmount(data.betAmount);
        setInputBetAmount(data.betAmount.toString());
      }
    });

    socketClient.on("joinedRoom", (data) => {
      console.log("[Client] Joined Room:", data);
      setRoomId(data.roomId);
      setPlayerData(data.players || []); // Server ส่ง players มาด้วย
      setMyPlayerId(data.yourId); // Server ส่ง ID ของเรามา
      setInRoom(true);
      setIsDealer(
        data.players.find((p) => p.id === data.yourId)?.isDealer || false
      ); // ตรวจสอบว่าเป็นเจ้ามือหรือไม่จากข้อมูลที่ Server ส่งมา
      addMessage(`เข้าร่วมห้อง ${data.roomId} สำเร็จ.`, "success");
      // Server ควรส่ง betAmount มาใน roomSettings หรือ gameStarted
    });

    socketClient.on("playersData", (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers || []);
      const me = activePlayers.find((p) => p.id === myPlayerId);
      if (me) {
        setIsDealer(me.isDealer);
        if (typeof me.hasStayed === "boolean") setHasStayed(me.hasStayed);
        // อัปเดตเงินคงเหลือของตัวเองจาก playerData ด้วย (ถ้ามี)
        // setMoney(me.balance.toString()); // อาจจะไม่จำเป็นถ้า balance ถูก update ที่ผลลัพธ์
      }
    });

    socketClient.on("yourCards", (data) => {
      // Server ส่ง object ที่มี cards และ handDetails
      console.log(
        `[Client ${myPlayerId}] Received 'yourCards'. Data:`,
        JSON.stringify(data)
      );
      if (data && Array.isArray(data.cards)) {
        setMyCards(data.cards);
        setMyHandDetails(data.handDetails || null); // เก็บ handDetails ด้วย
      } else {
        console.warn("[Client] 'yourCards' received invalid data:", data);
        setMyCards([]);
        setMyHandDetails(null);
      }
    });

    // --- Game Flow Events ---
    socketClient.on("gameStarted", (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(
        `เกมรอบที่ ${data.round || gameRound + 1} เริ่มแล้ว! เดิมพัน: ${
          data.betAmount
        } บาท`,
        "info"
      );
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      if (typeof data.round === "number") setGameRound(data.round);

      setGameStarted(true);
      setResult([]);
      setMyCards([]); // Server จะส่ง 'yourCards' มาใหม่
      setMyHandDetails(null);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({});
    });

    socketClient.on("currentTurn", (turnData) => {
      console.log("[Client] Event 'currentTurn':", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name,
        role: turnData.role,
        timeLeft: turnData.timeLeft,
      });
      setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);
      // if (turnData.id === myPlayerId) {
      //   const meInPlayerData = playerData.find((p) => p.id === myPlayerId);
      //   if (!(meInPlayerData && (meInPlayerData.hasStayed || meInPlayerData.hasPok))) {
      //     setHasStayed(false); // ไม่ควร reset hasStayed ที่นี่ถ้า Server จัดการแล้ว
      //   }
      // }
    });

    socketClient.on("turnTimerUpdate", (timerData) => {
      if (currentTurnId === timerData.playerId) {
        setCurrentTurnInfo((prev) => ({
          ...prev,
          timeLeft: timerData.timeLeft,
        }));
        if (timerData.playerId === myPlayerId) setCountdown(timerData.timeLeft);
      }
    });

    socketClient.on("enableShowResult", (canShow) => {
      setShowResultBtn(canShow);
    });

    socketClient.on("lockRoomStatus", (isLockedFromServer) => {
      // เปลี่ยนชื่อ event ให้ตรงกับ server
      console.log("[Client] Room lock status from server:", isLockedFromServer);
      setRoomLocked(isLockedFromServer);
      // addMessage(isLockedFromServer ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค"); // message จะมาจาก server โดยตรง
    });

    socketClient.on("result", (roundResultsFromServer) => {
      console.log(
        "[Client] Event 'result' from server:",
        roundResultsFromServer
      );
      if (Array.isArray(roundResultsFromServer)) {
        setResult(roundResultsFromServer); // Server ส่งมาเรียงลำดับแล้ว
      } else {
        setResult([]);
      }
      setGameStarted(false); // เกมจบสำหรับรอบนี้
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      // setGameRound((prev) => prev + 1); // gameRound ควรอัปเดตจาก server ตอน gameStarted
      setMyCards([]); // ล้างไพ่เมื่อจบรอบ
      setMyHandDetails(null);
      setHasStayed(false); // Reset hasStayed สำหรับรอบใหม่
    });

    socketClient.on("gameResetSignal", () => {
      // เปลี่ยนชื่อ event ให้ตรงกับ server
      console.log("[Client] Event 'gameResetSignal'");
      addMessage("เกมถูกรีเซ็ตโดยเจ้ามือ เตรียมเริ่มรอบใหม่", "info");
      setGameStarted(false);
      setMyCards([]);
      setMyHandDetails(null);
      setResult([]);
      setHasStayed(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setRevealedPokPlayers({});
    });

    socketClient.on("player_revealed_pok", (data) => {
      console.log("[Client] Player revealed Pok:", data);
      if (data && data.playerId && data.cards && data.handDetails) {
        addMessage(
          `${data.role || "ผู้เล่น"} (${
            data.name || data.playerId.slice(0, 5)
          }) ${data.handDetails.name || "ป๊อก!"} แสดงไพ่: ${data.cards
            .map(getCardDisplay)
            .join(" ")}`,
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
      }
    });

    socketClient.on("gameEnded", (gameSummary) => {
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary);
      setSummaryData(gameSummary || []);
      setShowSummary(true);
      setGameStarted(false);
      setResult([]);
      setCurrentTurnId(null);
      setInRoom(false); // เมื่อจบเกม อาจจะให้ออกจากห้องไปเลย หรือให้เลือก
      setRoomId("");
      setPlayerData([]);
      addMessage("เจ้ามือจบเกมแล้ว ขอบคุณที่ร่วมสนุก!", "success");
    });

    // --- Error and Message Handling ---
    const handleErrorMessage = (msgData, defaultMsg = "เกิดข้อผิดพลาด") => {
      const messageText =
        msgData?.message ||
        msgData?.text ||
        (typeof msgData === "string" ? msgData : defaultMsg);
      console.error(`[Client Error]: ${messageText}`);
      addMessage(messageText, "error");
    };

    socketClient.on("createRoomError", (data) =>
      handleErrorMessage(data, "สร้างห้องไม่สำเร็จ")
    );
    socketClient.on("joinRoomError", (data) =>
      handleErrorMessage(data, "เข้าร่วมห้องไม่สำเร็จ")
    );
    socketClient.on("dealerError", (data) =>
      handleErrorMessage(data, "การดำเนินการของเจ้ามือมีปัญหา")
    );
    socketClient.on("gameError", (data) =>
      handleErrorMessage(data, "เกิดข้อผิดพลาดในเกม")
    );
    socketClient.on("errorMessage", (data) => handleErrorMessage(data)); // General error

    socketClient.on("gameMessage", (data) => {
      // For general game messages
      addMessage(data.text || "ข้อความจากเกม", data.type || "info");
    });
    socketClient.on("message", (msg) => {
      // For general server messages
      addMessage(
        msg.text || (typeof msg === "string" ? msg : "ข้อความ"),
        "info"
      );
    });
    socketClient.on("playerLeft", (data) => {
      addMessage(`${data.name || "ผู้เล่น"} ${data.message || "ออกจากห้อง"}`);
    });

    socketClient.on("roomSettings", (settings) => {
      console.log("[Client] Received 'roomSettings'. Data:", settings);
      if (settings && typeof settings.betAmount === "number") {
        // addMessage(`ราคาเดิมพันอัปเดตเป็น: ${settings.betAmount}`, "info"); // message จะมาจาก server โดยตรง
        setBetAmount(settings.betAmount);
        if (isDealer) {
          // ใช้ isDealer จาก state
          setInputBetAmount(settings.betAmount.toString());
        }
      }
    });

    // แจ้งเตือน dealer ถ้าได้รับการโปรโมท
    socketClient.on("dealerPromotion", () => {
      addMessage("คุณได้รับเลือกให้เป็นเจ้ามือคนใหม่!", "success");
      setIsDealer(true);
    });

    return () => {
      if (socketClient) {
        socketClient.off("connect", onConnect);
        socketClient.off("disconnect", onDisconnect);
        socketClient.off("connect_error", onConnectError);
        socketClient.off("roomCreated");
        socketClient.off("joinedRoom");
        socketClient.off("playersData");
        socketClient.off("yourCards");
        socketClient.off("gameStarted");
        socketClient.off("currentTurn");
        socketClient.off("turnTimerUpdate");
        socketClient.off("result");
        socketClient.off("gameEnded");
        socketClient.off("gameResetSignal"); // แก้ชื่อ event
        socketClient.off("enableShowResult");
        socketClient.off("createRoomError");
        socketClient.off("joinRoomError");
        socketClient.off("dealerError");
        socketClient.off("gameError");
        socketClient.off("errorMessage");
        socketClient.off("message");
        socketClient.off("gameMessage");
        socketClient.off("lockRoomStatus"); // แก้ชื่อ event
        socketClient.off("playerLeft");
        socketClient.off("roomSettings");
        socketClient.off("player_revealed_pok");
        socketClient.off("dealerPromotion");
      }
    };
  }, [
    myPlayerId,
    name,
    roomId,
    currentTurnId,
    playerData,
    isDealer,
    gameRound,
    addMessage,
  ]); // เพิ่ม isDealer และ gameRound, addMessage

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      myCards.length >= 2 &&
      !hasStayed &&
      countdown > 0
    ) {
      const mePlayer = playerData.find((p) => p.id === myPlayerId);
      if (mePlayer && !mePlayer.hasPok) {
        // Timer for non-Pok players only
        timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
      } else {
        clearTimeout(timer); // Clear if I have Pok
        setCountdown(DEFAULT_TURN_DURATION); // Reset countdown if I have Pok
      }
    } else if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      countdown === 0
    ) {
      const mePlayer = playerData.find((p) => p.id === myPlayerId);
      if (
        mePlayer &&
        !mePlayer.hasPok &&
        socketClient &&
        socketClient.connected
      ) {
        addMessage("หมดเวลา! ทำการ 'อยู่' อัตโนมัติ", "info");
        socketClient.emit("stay", roomId);
        setHasStayed(true);
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
    roomId,
    addMessage,
    playerData,
  ]);

  // useEffect สำหรับคำนวณ transferSummary
  useEffect(() => {
    if (showSummary && summaryData.length > 0 && myPlayerId) {
      const currentUserSummary = summaryData.find((p) => p.id === myPlayerId);
      if (!currentUserSummary) {
        setTransferSummary({ toPay: [], toReceive: [] });
        return;
      }
      const amIDealer = currentUserSummary.isDealer;
      const toPayList = [];
      const toReceiveList = [];

      if (!amIDealer) {
        if (currentUserSummary.netChange < 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer) {
            toPayList.push({
              name: dealer.name,
              role: dealer.role,
              amount: Math.abs(currentUserSummary.netChange),
            });
          }
        } else if (currentUserSummary.netChange > 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer) {
            toReceiveList.push({
              name: dealer.name,
              role: dealer.role,
              amount: currentUserSummary.netChange,
            });
          }
        }
      } else {
        // I am the dealer
        summaryData.forEach((player) => {
          if (player.id === myPlayerId || player.isDealer) return; // Skip self and other potential dealers (should be only one)
          if (player.netChange > 0) {
            // Player won money from me
            toPayList.push({
              name: player.name,
              role: player.role,
              amount: player.netChange,
            });
          } else if (player.netChange < 0) {
            // Player lost money to me
            toReceiveList.push({
              name: player.name,
              role: player.role,
              amount: Math.abs(player.netChange),
            });
          }
        });
      }
      setTransferSummary({ toPay: toPayList, toReceive: toReceiveList });
    } else if (!showSummary) {
      setTransferSummary({ toPay: [], toReceive: [] });
    }
  }, [showSummary, summaryData, myPlayerId]);

  const handleCreateRoom = () => {
    if (!socketClient || !isConnected) {
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error");
      return;
    }
    const trimmedName = name.trim();
    const bal = parseInt(money);
    if (!trimmedName) {
      addMessage("กรุณากรอกชื่อของคุณ", "error");
      return;
    }
    if (isNaN(bal) || bal < 50 || (bal % 10 !== 0 && bal % 5 !== 0)) {
      addMessage(
        "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 50, และลงท้ายด้วย 0 หรือ 5)",
        "error"
      );
      return;
    }
    setErrorMsg(""); // Clear previous errors
    socketClient.emit("createRoom", {
      playerName: trimmedName,
      initialBalance: bal,
    });
  };

  const handleJoinRoom = () => {
    if (!socketClient || !isConnected) {
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error");
      return;
    }
    const trimmedName = name.trim();
    const trimmedRoomId = inputRoomId.trim().toUpperCase();
    const bal = parseInt(money);
    if (!trimmedName) {
      addMessage("กรุณากรอกชื่อของคุณ", "error");
      return;
    }
    if (!trimmedRoomId) {
      addMessage("กรุณากรอกรหัสห้อง", "error");
      return;
    }
    if (isNaN(bal) || bal < 50 || (bal % 10 !== 0 && bal % 5 !== 0)) {
      // Server check min 50
      addMessage(
        "เงินเริ่มต้นไม่ถูกต้อง (ขั้นต่ำ 50, และลงท้ายด้วย 0 หรือ 5)",
        "error"
      );
      return;
    }
    setErrorMsg(""); // Clear previous errors
    socketClient.emit("joinRoom", {
      roomId: trimmedRoomId,
      playerName: trimmedName,
      initialBalance: bal,
    });
  };

  const handleSetBet = () => {
    if (socketClient && isConnected && isDealer && !gameStarted) {
      const amount = parseInt(inputBetAmount);
      if (
        !isNaN(amount) &&
        amount >= 5 &&
        (amount % 10 === 0 || amount % 5 === 0)
      ) {
        socketClient.emit("setBetAmount", { roomId, amount });
      } else {
        addMessage(
          "จำนวนเงินเดิมพันต้องเป็นตัวเลข, ไม่น้อยกว่า 5 และลงท้ายด้วย 0 หรือ 5",
          "error"
        );
      }
    }
  };

  const handleToggleLockRoom = () => {
    if (socketClient && isConnected && isDealer && !gameStarted) {
      // Can only lock if game not started
      socketClient.emit("lockRoom", { roomId, lock: !roomLocked });
    }
  };

  const handleCopyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard
      .writeText(roomId)
      .then(() =>
        addMessage(`คัดลอกเลขห้อง "${roomId}" เรียบร้อยแล้ว`, "success")
      )
      .catch((err) =>
        addMessage("คัดลอกเลขห้องไม่สำเร็จ: " + err.message, "error")
      );
  };

  const handleStartGame = () => {
    if (socketClient && isConnected && roomId && isDealer) {
      if (betAmount <= 0) {
        addMessage("กรุณากำหนดเงินเดิมพันก่อนเริ่มเกม", "error");
        return;
      }
      socketClient.emit("startGame", roomId);
    }
  };

  const handleDrawCard = () => {
    const mePlayer = playerData.find((p) => p.id === myPlayerId);
    if (
      socketClient &&
      isConnected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      myCards.length < 3 &&
      !(mePlayer && mePlayer.hasPok)
    ) {
      socketClient.emit("drawCard", roomId);
    }
  };

  const handleStay = () => {
    const mePlayer = playerData.find((p) => p.id === myPlayerId);
    if (
      socketClient &&
      isConnected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      !(mePlayer && mePlayer.hasPok)
    ) {
      socketClient.emit("stay", roomId);
      setHasStayed(true); // Optimistic update
    }
  };

  const handleShowResult = () => {
    if (socketClient && isConnected && isDealer && showResultBtn) {
      // No need to check gameStarted here if showResultBtn depends on it
      socketClient.emit("showResult", roomId);
    }
  };

  const handleResetGameHandler = () => {
    if (socketClient && isConnected && isDealer && !gameStarted) {
      // Can only reset if game not started
      socketClient.emit("resetGame", roomId);
    }
  };

  const handleEndGame = () => {
    if (socketClient && isConnected && isDealer) {
      socketClient.emit("endGame", roomId);
    }
  };

  const handleExitGame = () => {
    // Instead of reload, try to disconnect socket and reset state cleanly
    if (socketClient) {
      socketClient.disconnect();
      socketClient = null; // Allow re-initialization
    }
    setIsConnected(false);
    setMyPlayerId(null);
    // Reset all relevant states to initial values
    setRoomId("");
    setInRoom(false);
    setIsDealer(false);
    setPlayerData([]);
    setBetAmount(0);
    setInputBetAmount("5");
    setRoomLocked(false);
    setGameStarted(false);
    setMyCards([]);
    setMyHandDetails(null);
    setHasStayed(false);
    setCurrentTurnId(null);
    setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
    setCountdown(DEFAULT_TURN_DURATION);
    setResult([]);
    setShowResultBtn(false);
    setGameRound(0);
    setShowSummary(false);
    setSummaryData([]);
    setTransferSummary({ toPay: [], toReceive: [] });
    setRevealedPokPlayers({});
    setErrorMsg("");
    setMessages([]);
    setName(name); // Keep name for next session
    setMoney(money); // Keep money for next session
    setInputRoomId("");
  };

  const getCardDisplay = (card) => {
    if (
      card &&
      typeof card.value !== "undefined" &&
      typeof card.suit !== "undefined"
    )
      return `${card.value}${card.suit}`;
    return "?";
  };

  // This function is illustrative, server-side hand ranking is the source of truth.
  // This can be used for preliminary display on client side.
  // const getCardPoint = (v) => (["J", "Q", "K", "10"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v));
  // const calculateMyHandTypeForDisplay = () => {
  //   if (!myHandDetails || !myCards || myCards.length === 0) return "ยังไม่มีไพ่";
  //   return myHandDetails.name || `${myHandDetails.score} แต้ม`; // Use name from server's handDetails
  // };
  // let myHandType = calculateMyHandTypeForDisplay();

  // Use hand details from server if available
  const myHandType = myHandDetails
    ? myHandDetails.name
    : myCards.length > 0
    ? "รอผล..."
    : "ยังไม่มีไพ่";

  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);
  const isMyTurn =
    currentTurnId === myPlayerId &&
    gameStarted &&
    !hasStayed &&
    !(myCurrentPlayerData && myCurrentPlayerData.hasPok);

  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId);
    return (
      <div className="App-summary">
        <h2>สรุปยอดเงิน (ห้อง: {roomId})</h2>
        <h3>
          ชื่อผู้เล่น: {me?.name || name} (
          {me?.role || (isDealer ? "เจ้ามือ" : "ผู้เล่น")})
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
                - จาก {item.name} ({item.role}): {item.amount.toLocaleString()}{" "}
                บาท
              </p>
            ))}{" "}
            <hr />
          </>
        )}
        {transferSummary.toPay.length > 0 && (
          <>
            <h3 style={{ color: "red", marginTop: "20px" }}>ยอดที่ต้องจ่าย:</h3>
            {transferSummary.toPay.map((item, index) => (
              <p
                key={`pay-${index}`}
                style={{ color: "red", marginLeft: "20px" }}
              >
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
              ไม่มีรายการได้เสียสำหรับคุณ
            </p>
          )}
        <h3 style={{ marginTop: "20px" }}>
          ยอดเงินคงเหลือ:{" "}
          {(me?.finalBalance !== undefined
            ? me.finalBalance
            : parseInt(money)
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
            (ยอดเริ่มต้น: {me.initialBalance?.toLocaleString()} บาท,
            กำไร/ขาดทุน:{" "}
            <span className={me.netChange >= 0 ? "profit" : "loss"}>
              {me.netChange > 0
                ? `+${me.netChange?.toLocaleString()}`
                : me.netChange?.toLocaleString() || "0"}{" "}
              บาท
            </span>
            )
          </p>
        )}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากเกม (กลับไปหน้าล็อบบี้)
        </button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์ (V1.1 Beta)</h2>
        <br></br>
        <br></br>
        ชื่อคุณ:{" "}
        <input
          type="text"
          placeholder="กรุณาใส่ชื่อของคุณ"
          value={name}
          onChange={(e) => setName(e.target.value.trim())}
          maxLength={15}
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
            disabled={!isConnected || !name.trim() || parseInt(money) < 50}
          >
            สร้างห้อง
          </button>
        </div>
        <hr />
        รหัสห้อง:{" "}
        <input
          type="text"
          placeholder="รหัสห้อง (ถ้ามี)"
          value={inputRoomId}
          onChange={(e) => setInputRoomId(e.target.value.trim().toUpperCase())}
          maxLength={5}
        />
        <button
          onClick={handleJoinRoom}
          disabled={
            !inputRoomId.trim() ||
            !isConnected ||
            !name.trim() ||
            parseInt(money) < 50
          }
        >
          เข้าร่วมห้อง
        </button>
        <div className="messages-log-lobby">
          <h4>Log เหตุการณ์:</h4>
          <div className="messages-box" ref={messagesEndRef}>
            {messages.map((msg, index) => (
              <p key={index} className={`message-type-${msg.type}`}>
                {msg.text}
              </p>
            ))}
          </div>
        </div>
      </div>
    );
  }

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
          {myCurrentPlayerData?.balance?.toLocaleString() || money} |
          ห้อง:&nbsp;
          <button
            className="text-button"
            onClick={handleCopyRoomId}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomId}
          </button>
        </p>
        <p style={{ color: roomLocked ? "red" : "green" }}>
          สถานะห้อง:{" "}
          <button
            className="text-button2"
            onClick={handleToggleLockRoom}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
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
            backgroundColor: " #a4e988",
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
          {playerData.map((user) => (
            <li
              key={user.id}
              className={user.id === currentTurnId ? "current-turn-player" : ""}
            >
              {user.name} ({user.role}) - เงิน: {user.balance?.toLocaleString()}{" "}
              บาท
              {user.id === currentTurnId &&
                currentTurnInfo.timeLeft > 0 &&
                gameStarted &&
                ` (กำลังเล่น... ${currentTurnInfo.timeLeft}วิ)`}
              {revealedPokPlayers[user.id] &&
                user.id !== myPlayerId &&
                gameStarted &&
                (!result || result.length === 0) && (
                  <div className="revealed-pok-cards">
                    <strong>ไพ่ที่ป๊อก:</strong>{" "}
                    {revealedPokPlayers[user.id].cards.map((card, cIdx) => (
                      <span key={cIdx} className="card-display">
                        {getCardDisplay(card)}
                      </span>
                    ))}
                    <em>{revealedPokPlayers[user.id].handDetails.type}</em>
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
                <span key={idx}>{getCardDisplay(card)} </span>
              ))}
            </h2>
            <p>
              <h2>{myHandType}</h2>
            </p>
            {isMyTurn && myCards.length >= 2 && !hasStayed && (
              <div className="player-actions">
                {" "}
                {/* คลาสนี้สำหรับจัดกึ่งกลางเนื้อหาทั้งหมดในส่วนนี้ */}
                <p className="turn-info">
                  ตาของคุณ! เวลา: {countdown} วินาที
                </p>{" "}
                {/* คลาสสำหรับข้อความตา */}
                <div className="action-buttons">
                  {" "}
                  {/* Div ใหม่สำหรับครอบปุ่ม */}
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
          </div>
        )}
      {!isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            {" "}
            รอ... ({currentTurnInfo.role}) {currentTurnInfo.name} (
            {currentTurnInfo.timeLeft} วิ) ⌛{" "}
          </p>
        )}
      {isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            {" "}
            ขาไพ่ที่ ({currentTurnInfo.role}) {currentTurnInfo.name}{" "}
            กำลังตัดสินใจ ({currentTurnInfo.timeLeft} วิ)...{" "}
          </p>
        )}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        showResultBtn &&
        (!result || result.length === 0) && (
          <div className="turn-indicator">
            <button className="btn-inroom-endgame2" onClick={handleShowResult}>
              {" "}
              เปิดไพ่ดวล{" "}
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
                  className={
                    r.id === myPlayerId
                      ? "my-result-row"
                      : r.disconnectedMidGame
                      ? "disconnected-result-row"
                      : ""
                  }
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
                    {r.outcome === "ขาดการเชื่อมต่อ" && "ขาดการเชื่อมต่อ"}
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
      {isDealer &&
        (!gameStarted || (result && result.length > 0)) &&
        !showSummary && (
          <div className="turn-indicator">
            <button
              className="btn-inroom-start1"
              onClick={handleStartGame}
              disabled={betAmount <= 0}
            >
              {" "}
              &nbsp;&nbsp; &nbsp;
              {gameRound > 0 || (result && result.length > 0)
                ? "เริ่มเกมรอบใหม่"
                : "เริ่มเกม"}
              &nbsp;&nbsp;&nbsp;{" "}
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
      <div className="turn-indicator">
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          {" "}
          ออกจากห้อง
        </button>
      </div>
      <div className="messages-log">
        {" "}
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>{" "}
        <div className="messages-box" ref={messagesEndRef}>
          {" "}
          {messages.map((msg, index) => (
            <p key={index} className={`message-type-${msg.type}`}>
              {" "}
              {msg.text}{" "}
            </p>
          ))}{" "}
        </div>{" "}
      </div>
    </div>
  );
}

export default App;
