// App.js

import { useEffect, useRef, useState } from "react";
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
  const [money, setMoney] = useState("50");
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
    // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (text, type = "info") => {
    const fullText = `[${new Date().toLocaleTimeString()}] ${text}`;
    setMessages((prev) => {
      const newMessages = [...prev, { text: fullText, type }];
      if (newMessages.length > 20)
        return newMessages.slice(newMessages.length - 20);
      return newMessages;
    });
    if (
      type === "error" ||
      type === "success" ||
      type === "info" ||
      type === "highlight"
    ) {
      setErrorMsg(text);
      setTimeout(
        () => setErrorMsg((current) => (current === text ? "" : current)),
        type === "error" ? 7000 : 5000
      );
    }
  };

  useEffect(() => {
    if (!socketClient) {
      console.log("[Client] Initializing new socket connection to", SERVER_URL);
      socketClient = io(SERVER_URL, { transports: ["websocket"] });
    }

    // --- ประกาศ Handler Functions ทั้งหมดที่นี่ ---
    function onConnect() {
      console.log("[Client] Connected to server with ID:", socketClient.id);
      setIsConnected(true);
      const storedRoomId = localStorage.getItem("pokDengRoomId");
      const storedOldPlayerId = localStorage.getItem("pokDengPlayerId");

      if (storedRoomId && storedOldPlayerId) {
        console.log(
          `[Client] Found stored session: roomId=<span class="math-inline">\{storedRoomId\}, oldPlayerId\=</span>{storedOldPlayerId}. Attempting to reconnect...`
        );
        addMessage("กำลังพยายามเชื่อมต่อกลับเข้าห้อง...", "info");
        socketClient.emit("attemptReconnect", {
          roomId: storedRoomId,
          playerId: storedOldPlayerId,
          oldSocketId: storedOldPlayerId,
        });
      } else {
        setMyPlayerId(socketClient.id);
        addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว! (New session)", "success");
        console.log("[Client] No stored session found. New connection.");
      }
    }

    function onDisconnect(reason) {
      console.log("[Client] Disconnected from server. Reason:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
    }

    function onConnectError(err) {
      console.error("[Client] Connection Attempt Error:", err);
      addMessage(`พยายามเชื่อมต่อ Server ไม่สำเร็จ: ${err.message}`, "error");
      setIsConnected(false);
    }

    const handleRoomCreated = (data) => {
      console.log("[Client] Room Created:", data);
      setRoomId(data.roomId);
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
      if (socketClient && socketClient.id) {
        setMyPlayerId(socketClient.id);
        localStorage.setItem("pokDengRoomId", data.roomId);
        localStorage.setItem("pokDengPlayerId", socketClient.id);
        console.log(
          `[Client] Saved to localStorage: roomId=<span class="math-inline">\{data\.roomId\}, playerId\=</span>{socketClient.id}`
        );
      } else {
        console.warn(
          "[Client] Could not save to localStorage: socketClient.id is not available in roomCreated."
        );
      }
    };

    const handleJoinedRoom = (data) => {
      console.log("[Client] Joined Room:", data);
      setRoomId(data.roomId);
      setInRoom(true);
      addMessage(
        `เข้าร่วมห้อง ${data.roomId} สำเร็จ. เจ้ามือ: ${
          data.dealerName || "N/A"
        }`,
        "success"
      );
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      if (socketClient && socketClient.id) {
        setMyPlayerId(socketClient.id);
        localStorage.setItem("pokDengRoomId", data.roomId);
        localStorage.setItem("pokDengPlayerId", socketClient.id);
        console.log(
          `[Client] Saved to localStorage: roomId=<span class="math-inline">\{data\.roomId\}, playerId\=</span>{socketClient.id}`
        );
      } else {
        console.warn(
          "[Client] Could not save to localStorage: socketClient.id is not available in joinedRoom."
        );
      }
    };

    const handleReconnected = (data) => {
      console.log("[Client] Reconnected successfully!", data);
      addMessage("เชื่อมต่อกลับเข้าห้องสำเร็จ!", "success");
      setRoomId(data.roomId);
      setMyPlayerId(data.myPlayerId);
      setIsDealer(data.isDealer || false);
      setInRoom(true);
      setGameStarted(data.gameStarted || false);
      setBetAmount(data.betAmount || 0);
      if (data.isDealer && typeof data.betAmount === "number") {
        setInputBetAmount(data.betAmount.toString());
      }
      if (socketClient && data.myPlayerId) {
        //ใช้ data.myPlayerId ที่ server ส่งมา
        localStorage.setItem("pokDengRoomId", data.roomId);
        localStorage.setItem("pokDengPlayerId", data.myPlayerId);
        console.log(
          `[Client] Updated localStorage after reconnect: roomId=<span class="math-inline">\{data\.roomId\}, playerId\=</span>{data.myPlayerId}`
        );
      }
    };

    const handleReconnectFailed = (data) => {
      console.warn("[Client] Reconnect failed:", data.message);
      addMessage(`ไม่สามารถเชื่อมต่อกลับเข้าห้องได้: ${data.message}`, "error");
      localStorage.removeItem("pokDengRoomId");
      localStorage.removeItem("pokDengPlayerId");
      console.log(
        "[Client] Cleared stored session from localStorage due to reconnect failure."
      );
      setInRoom(false);
      setRoomId("");
      setIsDealer(false);
      setGameStarted(false);
      setMyCards([]);
      if (isConnected && socketClient && socketClient.id) {
        setMyPlayerId(socketClient.id);
        addMessage(
          "คุณไม่ได้อยู่ในห้องอีกต่อไป กรุณาสร้างหรือเข้าร่วมห้องใหม่",
          "info"
        );
      }
    };

    const handlePlayersData = (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      if (myPlayerId) {
        const me = activePlayers.find((p) => p.id === myPlayerId);
        if (me) {
          setIsDealer(me.isDealer);
          if (typeof me.hasStayed === "boolean") {
            setHasStayed(me.hasStayed);
          }
        }
      }
    };

    const handleYourCards = (cardsFromServer) => {
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
    };

    const handleGameStarted = (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "info");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      setGameStarted(true);
      setResult([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({});
    };

    const handleCurrentTurn = (turnData) => {
      console.log("[Client] Event 'currentTurn':", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name,
        role: turnData.role,
        timeLeft: turnData.timeLeft,
      });
      setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);
      if (turnData.id === myPlayerId) {
        const meInPlayerData = playerData.find((p) => p.id === myPlayerId);
        if (!(meInPlayerData && meInPlayerData.hasStayed)) {
          setHasStayed(false);
        }
      }
    };

    const handleTurnTimerUpdate = (timerData) => {
      if (currentTurnId === timerData.playerId) {
        setCurrentTurnInfo((prev) => ({
          ...prev,
          timeLeft: timerData.timeLeft,
        }));
        if (timerData.playerId === myPlayerId) setCountdown(timerData.timeLeft);
      }
    };

    const handleEnableShowResult = (canShow) => {
      console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    };

    const handleLockRoom = (isLockedFromServer) => {
      console.log("[Client] Room lock status from server:", isLockedFromServer);
      setRoomLocked(isLockedFromServer);
      addMessage(isLockedFromServer ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค");
    };

    const handleResult = (roundResultsFromServer) => {
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
    };

    const handleResetGame = () => {
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
    };

    const handlePlayerRevealedPok = (data) => {
      console.log("[Client] Player revealed Pok:", data);
      if (data && data.playerId && data.cards && data.handDetails) {
        addMessage(
          `<span class="math-inline">\{data\.role \|\| "ขาไพ่"\} \(</span>{data.name}) ${
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
    };

    const handleGameEnded = (gameSummary) => {
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
    };

    const handleErrorMessage = (msg) =>
      addMessage(
        msg.text || (typeof msg === "string" ? msg : "Error"),
        "error"
      );

    const handleMessage = (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Message"));

    const handlePlayerLeft = (data) =>
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`);

    const handleRoomSettings = (settings) => {
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
    };

    // --- Handler Functions ที่เพิ่มเข้ามา ---
    const handleRoundVoided = (data) => {
      console.log("[Client] Round Voided:", data);
      addMessage(data.message || "รอบปัจจุบันถูกยกเลิก", "warning");
      setGameStarted(false);
      setMyCards([]);
      setResult([]);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setHasStayed(false);
      setRevealedPokPlayers({});
    };

    const handleGameStatusUpdate = (data) => {
      console.log("[Client] Game Status Update:", data);
      if (typeof data.gameStarted === "boolean") {
        setGameStarted(data.gameStarted);
      }
      if (data.currentTurnPlayerId !== undefined) {
        setCurrentTurnId(data.currentTurnPlayerId);
      }
    };

    // --- ลงทะเบียน Event Listeners ---
    if (socketClient) {
      socketClient.on("connect", onConnect);
      socketClient.on("disconnect", onDisconnect);
      socketClient.on("connect_error", onConnectError);
      socketClient.on("roomCreated", handleRoomCreated);
      socketClient.on("joinedRoom", handleJoinedRoom);
      socketClient.on("reconnected", handleReconnected);
      socketClient.on("reconnectFailed", handleReconnectFailed);
      socketClient.on("playersData", handlePlayersData);
      socketClient.on("yourCards", handleYourCards);
      socketClient.on("gameStarted", handleGameStarted);
      socketClient.on("currentTurn", handleCurrentTurn);
      socketClient.on("turnTimerUpdate", handleTurnTimerUpdate);
      socketClient.on("enableShowResult", handleEnableShowResult);
      socketClient.on("lockRoom", handleLockRoom);
      socketClient.on("result", handleResult);
      socketClient.on("resetGame", handleResetGame);
      socketClient.on("player_revealed_pok", handlePlayerRevealedPok);
      socketClient.on("gameEnded", handleGameEnded);
      socketClient.on("errorMessage", handleErrorMessage);
      socketClient.on("message", handleMessage);
      socketClient.on("playerLeft", handlePlayerLeft);
      socketClient.on("roomSettings", handleRoomSettings);
      // Listener ที่เพิ่มใหม่
      socketClient.on("roundVoided", handleRoundVoided);
      socketClient.on("gameStatusUpdate", handleGameStatusUpdate);
    }

    return () => {
      if (socketClient) {
        socketClient.off("connect", onConnect);
        socketClient.off("disconnect", onDisconnect);
        socketClient.off("connect_error", onConnectError);
        socketClient.off("roomCreated", handleRoomCreated);
        socketClient.off("joinedRoom", handleJoinedRoom);
        socketClient.off("reconnected", handleReconnected);
        socketClient.off("reconnectFailed", handleReconnectFailed);
        socketClient.off("playersData", handlePlayersData);
        socketClient.off("yourCards", handleYourCards);
        socketClient.off("gameStarted", handleGameStarted);
        socketClient.off("currentTurn", handleCurrentTurn);
        socketClient.off("turnTimerUpdate", handleTurnTimerUpdate);
        socketClient.off("enableShowResult", handleEnableShowResult);
        socketClient.off("lockRoom", handleLockRoom);
        socketClient.off("result", handleResult);
        socketClient.off("resetGame", handleResetGame);
        socketClient.off("player_revealed_pok", handlePlayerRevealedPok);
        socketClient.off("gameEnded", handleGameEnded);
        socketClient.off("errorMessage", handleErrorMessage);
        socketClient.off("message", handleMessage);
        socketClient.off("playerLeft", handlePlayerLeft);
        socketClient.off("roomSettings", handleRoomSettings);
        // Cleanup listener ที่เพิ่มใหม่
        socketClient.off("roundVoided", handleRoundVoided);
        socketClient.off("gameStatusUpdate", handleGameStatusUpdate);
      }
    };
  }, [
    myPlayerId,
    name,
    roomId,
    currentTurnId,
    playerData,
    isConnected,
    addMessage,
  ]); // << เพิ่ม addMessage ใน dependency array เพราะถูกใช้ใน handlers หลายตัว

  // ... (useEffect อื่นๆ และโค้ด JSX) ...

  useEffect(() => {
    // Countdown timer effect
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
    addMessage, // addMessage ถูกใช้ใน effect นี้
  ]);

  useEffect(() => {
    // useEffect สำหรับคำนวณ transferSummary
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
        summaryData.forEach((player) => {
          if (player.id === myPlayerId) return;
          if (player.netChange > 0) {
            toPayList.push({
              name: player.name,
              role: player.role,
              amount: player.netChange,
            });
          } else if (player.netChange < 0) {
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
    socketClient.emit("createRoom", { playerName: name, initialBalance: bal });
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
    socketClient.emit("joinRoom", {
      roomId: inputRoomId.trim(),
      playerName: name,
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
      socketClient.emit("startGame", roomId);
    } else {
      addMessage("ไม่สามารถเริ่มเกมได้", "error");
    }
  };

  const handleDrawCard = () => {
    if (
      socketClient &&
      socketClient.connected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      myCards.length < 3
    ) {
      console.log("[Client] Emitting 'drawCard' in room:", roomId);
      socketClient.emit("drawCard", roomId);
    } else {
      addMessage("ไม่สามารถจั่วไพ่ได้ในขณะนี้", "error");
    }
  };

  const handleStay = () => {
    if (
      socketClient &&
      socketClient.connected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed
    ) {
      console.log("[Client] Emitting 'stay' in room:", roomId);
      socketClient.emit("stay", roomId);
      setHasStayed(true);
    } else {
      addMessage("ไม่สามารถอยู่ได้ในขณะนี้", "error");
    }
  };

  const handleShowResult = () => {
    if (
      socketClient &&
      socketClient.connected &&
      isDealer &&
      gameStarted &&
      showResultBtn
    ) {
      console.log("[Client] Emitting 'showResult' for room:", roomId);
      socketClient.emit("showResult", roomId);
    } else {
      addMessage("ไม่สามารถแสดงผลได้ในขณะนี้", "error");
    }
  };

  const handleResetGameHandler = () => {
    if (socketClient && socketClient.connected && isDealer && !gameStarted) {
      // ปรับเงื่อนไข: สามารถรีเซ็ตได้เมื่อเกมยังไม่เริ่ม หรือ หลังจบรอบ
      console.log("[Client] Emitting 'resetGame' for room:", roomId);
      socketClient.emit("resetGame", roomId);
    } else {
      let msg = "เฉพาะเจ้ามือ & เมื่อเกมยังไม่เริ่มรอบใหม่ หรือหลังจบรอบ";
      if (gameStarted) msg = "ไม่สามารถรีเซ็ตได้ระหว่างเกมกำลังดำเนินอยู่";
      addMessage(msg, "error");
    }
  };

  const handleEndGame = () => {
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'endGame' for room:", roomId);
      socketClient.emit("endGame", roomId);
    }
  };

  const handleExitGame = () => {
    // เพิ่มการ clear localStorage ก่อน reload เพื่อให้เป็นการเริ่ม session ใหม่จริงๆ
    localStorage.removeItem("pokDengRoomId");
    localStorage.removeItem("pokDengPlayerId");
    window.location.reload();
  };

  const getCardDisplay = (card) => {
    if (
      card &&
      typeof card.value !== "undefined" &&
      typeof card.suit !== "undefined"
    )
      return `<span class="math-inline">\{card\.value\}</span>{card.suit}`;
    console.warn("[Client] getCardDisplay received invalid card object:", card);
    return "?";
  };

  const getCardPoint = (v) =>
    ["J", "Q", "K", "10"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v);

  const calculateRankForDisplay = (cardsToRank) => {
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
        if (calculatedScore === 0) {
          type = "บอดสองเด้ง"; // แก้ไขให้ชัดเจนขึ้น
        } else {
          type = `${calculatedScore} แต้มสองเด้ง`;
        }
      } else {
        if (calculatedScore === 0) {
          type = "บอด";
        } else {
          type = `${calculatedScore} แต้ม`;
        }
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
          n_vals_for_straight[1] === n_vals_for_straight[0] + 1 &&
          n_vals_for_straight[2] === n_vals_for_straight[1] + 1
        ) {
          if (
            !(
              n_vals_for_straight[0] === 1 &&
              n_vals_for_straight[1] === 2 &&
              n_vals_for_straight[2] === 3
            )
          ) {
            is_straight_result = true;
          }
        }
        if (
          n_vals_for_straight[0] === 1 &&
          n_vals_for_straight[1] === 12 &&
          n_vals_for_straight[2] === 13
        ) {
          is_straight_result = true;
        }
      }
      const is_sian_result = card_raw_values.every((v_str) =>
        ["J", "Q", "K"].includes(v_str)
      );
      if (isTaong) {
        type = `ตอง ${card_raw_values[0]}`;
      } else if (is_straight_result && isSameSuit) {
        type = "สเตรทฟลัช";
      } else if (is_sian_result) {
        type = "เซียน";
      } else if (is_straight_result) {
        type = "เรียง";
      } else if (isSameSuit) {
        if (calculatedScore === 0) {
          type = "บอดสามเด้ง"; // แก้ไขให้ชัดเจนขึ้น
        } else {
          type = `${calculatedScore} แต้มสามเด้ง`;
        }
      } else {
        if (calculatedScore === 9) {
          type = "9 หลัง";
        } else if (calculatedScore === 8) {
          type = "8 หลัง";
        } else if (calculatedScore === 0) {
          type = "บอด";
        } else {
          type = `${calculatedScore} แต้ม`;
        }
      }
    }
    if (type === "0 แต้ม" && cardsToRank.length > 0) {
      // เพิ่มเงื่อนไข cardsToRank.length > 0
      type = "บอด";
    }
    return { score: calculatedScore, type };
  };

  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);
  let myHandType = "ยังไม่มีไพ่";
  if (
    myCards &&
    myCards.length > 0 &&
    gameStarted &&
    (!result || result.length === 0)
  ) {
    const rankData = calculateRankForDisplay(myCards);
    myHandType = rankData.type;
  }

  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed;

  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId);
    return (
      <div className="App-summary">
        <h2>สรุปยอดต้องโอนให้และต้องได้ (ห้อง: {roomId})</h2>{" "}
        <h3>
          ชื่อขาไพ่: {me?.name || name} ({" "}
          {me?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")}){" "}
        </h3>
        <hr />{" "}
        {transferSummary.toReceive.length > 0 && (
          <>
            {" "}
            <h3 style={{ color: "green", marginTop: "20px" }}>
              ยอดที่จะได้รับ:{" "}
            </h3>{" "}
            {transferSummary.toReceive.map((item, index) => (
              <p
                key={`receive-${index}`}
                style={{ color: "green", marginLeft: "20px" }}
              >
                - จาก {item.name} ({item.role}): {item.amount.toLocaleString()}{" "}
                บาท{" "}
              </p>
            ))}
            <hr />{" "}
          </>
        )}{" "}
        {transferSummary.toPay.length > 0 && (
          <>
            {" "}
            <h3 style={{ color: "red", marginTop: "20px" }}>
              ยอดที่ต้องโอน:
            </h3>{" "}
            {transferSummary.toPay.map((item, index) => (
              <p
                key={`pay-${index}`}
                style={{ color: "red", marginLeft: "20px" }}
              >
                - ให้ {item.name} ({item.role}): {item.amount.toLocaleString()}{" "}
                บาท{" "}
              </p>
            ))}
            <hr />{" "}
          </>
        )}{" "}
        {transferSummary.toReceive.length === 0 &&
          transferSummary.toPay.length === 0 && (
            <p style={{ textAlign: "center", marginTop: "20px" }}>
              ไม่มีรายการได้เสียสำหรับคุณในรอบนี้{" "}
            </p>
          )}{" "}
        <h3 style={{ marginTop: "20px" }}>
          ยอดเงินคงเหลือของคุณ:{" "}
          {(me?.finalBalance !== undefined
            ? me.finalBalance
            : parseInt(money)
          )?.toLocaleString()}{" "}
          บาท{" "}
        </h3>{" "}
        {me && (
          <p
            style={{
              fontStyle: "italic",
              textAlign: "center",
              color: "#555",
              marginTop: "10px",
            }}
          >
            (ยอดเงินเริ่มต้น: {me.initialBalance?.toLocaleString()} บาท,
            กำไร/ขาดทุนสุทธิ:{" "}
            <span className={me.netChange >= 0 ? "profit" : "loss"}>
              {" "}
              {me.netChange > 0
                ? `+${me.netChange?.toLocaleString()}`
                : me.netChange?.toLocaleString() || "0"}{" "}
              บาท{" "}
            </span>
            ){" "}
          </p>
        )}{" "}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากเกม{" "}
        </button>{" "}
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์</h2>{" "}
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
            {errorMsg}{" "}
          </p>
        )}
        ชื่อคุณ:{" "}
        <input
          type="text"
          placeholder="กรุณาใส่ชื่อของคุณ"
          value={name}
          onChange={(e) => setName(e.target.value)}
        ></input>
        เงินเริ่มต้น:{" "}
        <input
          type="number"
          placeholder="เงินเริ่มต้น (ขั้นต่ำ 50)"
          value={money}
          onChange={(e) => setMoney(e.target.value)}
          min="50"
          step="10"
        />
        &nbsp;&nbsp;&nbsp;{" "}
        <div style={{ marginTop: 20 }}>
          {" "}
          <button
            onClick={handleCreateRoom}
            disabled={!isConnected || !name.trim() || !money.trim()}
          >
            สร้างห้อง{" "}
          </button>{" "}
        </div>
        <hr />{" "}
        <input
          type="text"
          placeholder="รหัสห้อง (ถ้ามี)"
          value={inputRoomId}
          onChange={(e) => setInputRoomId(e.target.value)}
        />{" "}
        <button
          onClick={handleJoinRoom}
          disabled={
            !inputRoomId.trim() || !isConnected || !name.trim() || !money.trim()
          }
        >
          เข้าร่วมห้อง{" "}
        </button>{" "}
      </div>
    );
  }

  return (
    <div className="App">
      {" "}
      <header>
        {" "}
        <h1>
          ห้อง:&nbsp;{" "}
          <button
            className="text-button2"
            onClick={handleCopyRoomId}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomId}{" "}
          </button>{" "}
        </h1>{" "}
        <p>
          คุณ: {name}{" "}
          {isDealer ? "(เจ้ามือ)" : `(${myCurrentPlayerData?.role || "ขาไพ่"})`}{" "}
          | เงินคงเหลือ:{" "}
          {myCurrentPlayerData?.balance?.toLocaleString() || money} |
          ห้อง:&nbsp;{" "}
          <button
            className="text-button"
            onClick={handleCopyRoomId}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomId}{" "}
          </button>{" "}
        </p>{" "}
        <p style={{ color: roomLocked ? "red" : "green" }}>
          สถานะห้อง:{" "}
          <button
            className="text-button2"
            onClick={handleToggleLockRoom}
            title="คลิกเพื่อเปลี่ยนสถานะล็อคห้อง" // แก้ไข title
          >
            {roomLocked ? "ล็อค" : "เปิด"}{" "}
          </button>{" "}
        </p>{" "}
      </header>{" "}
      {errorMsg && (
        <p
          className="error-message" //ใช้ class เดิม ไม่ต้องใช้ style inline ที่ซ้ำซ้อน
          // style={{
          //   border: "1px solid #3c763d",
          //   padding: "5px",
          //   backgroundColor: " #dff0d8",
          //   whiteSpace: "pre-wrap",
          // }}
        >
          {errorMsg}{" "}
        </p>
      )}{" "}
      {!gameStarted && isDealer && (!result || result.length === 0) && (
        <div className="dealer-controls pre-game">
          <h4>ตั้งค่าเกม (เจ้ามือ): ขั้นต่ำ 5 บาท</h4>{" "}
          <div>
            <label>เงินเดิมพัน: </label>{" "}
            <input
              type="number"
              value={inputBetAmount}
              onChange={(e) => setInputBetAmount(e.target.value)}
              step="5"
              min="5"
            />{" "}
            <button className="btn-inroom-setting" onClick={handleSetBet}>
              ตั้งค่า{" "}
            </button>{" "}
          </div>{" "}
        </div>
      )}{" "}
      <div className="players-list">
        {" "}
        <h4>
          ราคาเดิมพันต่อรอบ:{" "}
          {betAmount > 0
            ? `${betAmount.toLocaleString()} บาท`
            : "รอเจ้ามือกำหนด"}{" "}
        </h4>
        <h4>ขาไพ่ในห้อง: ({playerData.length} คน)</h4>{" "}
        <ul>
          {" "}
          {playerData.map((user) => (
            <li
              key={user.id}
              className={user.id === currentTurnId ? "current-turn-player" : ""}
            >
              {user.name} ({user.role}) - เงิน: {user.balance?.toLocaleString()}{" "}
              บาท{" "}
              {user.id === currentTurnId &&
                currentTurnInfo.timeLeft > 0 &&
                gameStarted &&
                ` (กำลังเล่น... ${currentTurnInfo.timeLeft}วิ)`}{" "}
              {revealedPokPlayers[user.id] &&
                user.id !== myPlayerId &&
                gameStarted &&
                (!result || result.length === 0) && (
                  <div className="revealed-pok-cards">
                    <strong>ไพ่ที่ป๊อก:</strong>{" "}
                    {revealedPokPlayers[user.id].cards.map((card, cIdx) => (
                      <span key={cIdx} className="card-display">
                        {getCardDisplay(card)}{" "}
                      </span>
                    ))}{" "}
                    <em>({revealedPokPlayers[user.id].handDetails.name})</em>{" "}
                    {/* เปลี่ยนจาก type เป็น name */}
                  </div>
                )}{" "}
            </li>
          ))}{" "}
        </ul>{" "}
      </div>{" "}
      {gameStarted &&
        myCards &&
        myCards.length > 0 &&
        (!result || result.length === 0) && (
          <div className="my-cards-area">
            {" "}
            <h2>
              ไพ่ของคุณ:{" "}
              {myCards.map((card, idx) => (
                <span key={idx} className="card-display">
                  {" "}
                  {/* เพิ่ม class */}
                  {getCardDisplay(card)}{" "}
                </span>
              ))}{" "}
            </h2>{" "}
            <p>
              <h2>{myHandType}</h2>{" "}
            </p>{" "}
            {isMyTurn && myCards.length >= 2 && !hasStayed && (
              <div className="player-actions">
                {" "}
                <p className="turn-info">
                  ตาของคุณ! เวลา: {countdown} วินาที{" "}
                </p>{" "}
                <div className="action-buttons">
                  {" "}
                  {myCards.length < 3 && (
                    <button
                      onClick={handleDrawCard}
                      disabled={hasStayed || myCards.length >= 3}
                    >
                      จั่ว{" "}
                    </button>
                  )}{" "}
                  <button onClick={handleStay} disabled={hasStayed}>
                    อยู่{" "}
                  </button>{" "}
                </div>{" "}
              </div>
            )}{" "}
          </div>
        )}{" "}
      {!isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            รอ... ({currentTurnInfo.role || "ผู้เล่น"}) {currentTurnInfo.name} ({" "}
            {currentTurnInfo.timeLeft} วิ) ⌛{" "}
          </p>
        )}{" "}
      {isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            ขาไพ่ ({currentTurnInfo.role || "ผู้เล่น"}) {currentTurnInfo.name}{" "}
            กำลังตัดสินใจ ({currentTurnInfo.timeLeft} วิ)...{" "}
          </p>
        )}{" "}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        showResultBtn &&
        (!result || result.length === 0) && (
          <div className="turn-indicator">
            {" "}
            <button className="btn-inroom-endgame2" onClick={handleShowResult}>
              เปิดไพ่ดวล{" "}
            </button>{" "}
          </div>
        )}{" "}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        !showResultBtn &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">รอขาไพ่ทุกคนตัดสินใจ...</p>
        )}{" "}
      {result && result.length > 0 && (
        <div className="results-display">
          {" "}
          <h3>
            ผลลัพธ์รอบที่ {gameRound}: (เดิมพัน: {betAmount?.toLocaleString()}{" "}
            บาท){" "}
          </h3>{" "}
          <table>
            {" "}
            <thead>
              {" "}
              <tr>
                <th>ชื่อขาไพ่</th> <th>ไพ่</th>
                <th>แต้ม</th> <th>ประเภท</th>
                <th>ผล</th> <th>ได้/เสีย</th>
                <th>เงินคงเหลือ</th>{" "}
              </tr>{" "}
            </thead>{" "}
            <tbody>
              {" "}
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
                  {" "}
                  <td>
                    {r.name} ({r.role || "N/A"}){" "}
                  </td>
                  <td>{r.cardsDisplay || "N/A"}</td>
                  <td>{r.score}</td> <td>{r.specialType}</td>{" "}
                  <td>
                    {r.outcome === "ชนะ" && "✅ ชนะ"}
                    {r.outcome === "แพ้" && "❌ แพ้"}
                    {r.outcome === "เสมอ" && "🤝 เสมอ"}{" "}
                    {r.outcome === "เจ้ามือ" && "👑 เจ้ามือ"}{" "}
                    {r.outcome === "ขาดการเชื่อมต่อ" && "🔌 ขาดการเชื่อมต่อ"}{" "}
                    {![
                      "ชนะ",
                      "แพ้",
                      "เสมอ",
                      "เจ้ามือ",
                      "ขาดการเชื่อมต่อ",
                    ].includes(r.outcome) && r.outcome}{" "}
                  </td>{" "}
                  <td
                    className={
                      r.moneyChange > 0
                        ? "profit"
                        : r.moneyChange < 0
                        ? "loss"
                        : ""
                    }
                  >
                    {" "}
                    {r.moneyChange !== 0
                      ? `<span class="math-inline">\{
r\.moneyChange \> 0 ? "\+" \: ""
\}</span>{r.moneyChange?.toLocaleString()} บาท`
                      : "-"}{" "}
                  </td>
                  <td>{r.balance?.toLocaleString()} บาท</td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
        </div>
      )}{" "}
      {isDealer &&
        (!gameStarted || (result && result.length > 0)) &&
        !showSummary && (
          <div className="dealer-actions post-round-controls">
            {" "}
            {/* เปลี่ยน class ให้สื่อความหมาย */}{" "}
            <button
              className="btn-inroom-start1"
              onClick={handleStartGame}
              disabled={betAmount <= 0}
            >
              &nbsp;&nbsp; &nbsp;{" "}
              {gameRound > 0 || (result && result.length > 0)
                ? "เริ่มเกมรอบใหม่"
                : "เริ่มเกม"}
              &nbsp;&nbsp;&nbsp;{" "}
            </button>{" "}
            <button
              className="btn-inroom-restart"
              onClick={handleResetGameHandler}
            >
              รีเซ็ตตา&สับไพ่{" "}
            </button>{" "}
            <button className="btn-inroom-result" onClick={handleEndGame}>
              จบเกม&ดูสรุปยอด{" "}
            </button>{" "}
          </div>
        )}{" "}
      {!isDealer &&
        result &&
        result.length > 0 &&
        !gameStarted &&
        !showSummary && (
          <p className="turn-indicator waiting-message">
            {" "}
            {/* เปลี่ยน class */} --- รอเจ้ามือเริ่มรอบใหม่ หรือ จบเกม ---{" "}
          </p>
        )}{" "}
      <div className="turn-indicator exit-controls">
        {" "}
        {/* เปลี่ยน class */}{" "}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากห้อง{" "}
        </button>{" "}
      </div>{" "}
      <div className="messages-log">
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>{" "}
        <div className="messages-box" ref={messagesEndRef}>
          {" "}
          {messages.map((msg, index) => (
            <p key={index} className={`message-type-${msg.type}`}>
              {msg.text}{" "}
            </p>
          ))}{" "}
        </div>{" "}
      </div>{" "}
    </div>
  );
}

export default App;
