// App.js
import { useEffect, useRef, useState, useCallback } from "react"; // เพิ่ม useCallback
import io from "socket.io-client";
import "./App.css"; // ตรวจสอบว่าคุณมีไฟล์นี้ หรือลบการ import ถ้าไม่ใช้

// URL ของ Game Server (pokdeng-online)
const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // สำหรับทดสอบ Local

const DEFAULT_TURN_DURATION = 20; // ควรตรงกับค่าที่ Server ใช้

function App() {
  // Socket instance ref
  const socketRef = useRef(null);

  // Player and Connection State
  const [isConnected, setIsConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [name, setName] = useState(
    localStorage.getItem("pokdengPlayerName") || ""
  );
  const [money, setMoney] = useState(
    localStorage.getItem("pokdengPlayerMoney") || "1000"
  ); // ควรเป็นตัวเลข
  const [inputRoomId, setInputRoomId] = useState("");

  // Room State
  const [roomId, setRoomId] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [playerData, setPlayerData] = useState([]); // Array ของ player objects จาก server
  const [betAmount, setBetAmount] = useState(0);
  const [inputBetAmount, setInputBetAmount] = useState("100"); // ค่าเริ่มต้นสำหรับ dealer
  const [roomLocked, setRoomLocked] = useState(false);

  // Game State
  const [gameStarted, setGameStarted] = useState(false);
  const [myCards, setMyCards] = useState([]);
  // myHandDetails จะถูกดึงมาจาก myCurrentPlayerData.handDetails
  const [hasStayed, setHasStayed] = useState(false);
  const [currentTurnId, setCurrentTurnId] = useState(null);
  const [currentTurnInfo, setCurrentTurnInfo] = useState({
    name: "",
    role: "",
    timeLeft: 0,
  });
  const [countdown, setCountdown] = useState(DEFAULT_TURN_DURATION);

  // Result and Summary State
  const [result, setResult] = useState([]); // ผลลัพธ์ของรอบปัจจุบัน
  const [showResultBtn, setShowResultBtn] = useState(false); // สำหรับ dealer
  const [gameRound, setGameRound] = useState(0);
  const [showSummary, setShowSummary] = useState(false); // แสดงสรุปเมื่อจบเกม
  const [summaryData, setSummaryData] = useState([]);
  const [transferSummary, setTransferSummary] = useState({
    toPay: [],
    toReceive: [],
  });
  const [revealedPokPlayers, setRevealedPokPlayers] = useState({}); // เก็บข้อมูลผู้เล่นอื่นที่ป๊อก

  // UI State
  const [errorMsg, setErrorMsg] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  // Scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages]);

  // Save name and money to localStorage
  useEffect(() => {
    localStorage.setItem("pokdengPlayerName", name);
  }, [name]);
  useEffect(() => {
    localStorage.setItem("pokdengPlayerMoney", money);
  }, [money]);


  // Function to add messages to the log
  const addMessage = useCallback((text, type = "info") => {
    const fullText = `[${new Date().toLocaleTimeString("th-TH", {hour12: false})}] ${text}`;
    setMessages((prev) => {
      const newMessages = [...prev, { text: fullText, type }];
      return newMessages.slice(Math.max(0, newMessages.length - 30)); // เก็บแค่ 30 ข้อความล่าสุด
    });
    if (type === "error" || type === "success" || type === "highlight") {
      setErrorMsg(text); // แสดงข้อความนี้เด่นๆ ชั่วคราว
      setTimeout(
        () => setErrorMsg((current) => (current === text ? "" : current)),
        type === "error" ? 7000 : 5000
      );
    }
  }, []); // useCallback เพื่อไม่ให้ function นี้ถูกสร้างใหม่บ่อยๆ


  // Effect for initializing and managing socket connection and listeners
  useEffect(() => {
    // สร้าง socket instance เพียงครั้งเดียว
    if (!socketRef.current) {
      console.log("[Client] Initializing new socket connection to", SERVER_URL);
      socketRef.current = io(SERVER_URL, {
        transports: ["websocket"],
        reconnectionAttempts: 5, // ลองเชื่อมต่อใหม่ 5 ครั้ง
        // query: { token: "yourAuthToken" } // ถ้ามีระบบ auth
      });
    }

    const socket = socketRef.current; // ใช้ตัวแปร local เพื่อความสะดวก

    // --- Define event handlers ---
    const onConnect = () => {
      console.log("[Client] Connected to server with ID:", socket.id);
      setMyPlayerId(socket.id);
      setIsConnected(true);
      addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว!", "success");
    };

    const onDisconnect = (reason) => {
      console.log("[Client] Disconnected from server. Reason:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
      // อาจจะ reset game state บางส่วนถ้าต้องการ
      // setInRoom(false);
      // setGameStarted(false);
    };

    const onConnectError = (err) => {
      console.error("[Client] Connection Attempt Error:", err);
      addMessage( `พยายามเชื่อมต่อ Server ไม่สำเร็จ: ${err.message}. กำลังลองใหม่...`, "error");
      setIsConnected(false);
    };

    const onRoomCreated = (data) => {
      console.log("[Client] Room Created:", data);
      setRoomId(data.roomId);
      setInRoom(true);
      setIsDealer(true); // ผู้สร้างห้องเป็นเจ้ามือเสมอ
      addMessage( `ห้อง ${data.roomId} ถูกสร้างโดย ${data.dealerName || name}`, "success");
      if (data.playersData) setPlayerData(data.playersData);
      if (typeof data.betAmount === "number") {
        setBetAmount(data.betAmount);
        setInputBetAmount(data.betAmount.toString());
      }
    };

    const onJoinedRoom = (data) => {
      console.log("[Client] Joined Room:", data);
      setRoomId(data.roomId);
      setInRoom(true);
      setIsDealer(false); // ผู้เข้าร่วมไม่ใช่เจ้ามือ (ยกเว้น rejoin เป็นเจ้ามือ แต่ server ควรจัดการ)
      addMessage( `เข้าร่วมห้อง ${data.roomId} สำเร็จ. เจ้ามือ: ${data.dealerName || "N/A"}`, "success");
      if (data.playersData) setPlayerData(data.playersData);
      if (data.roomSettings) {
        if (typeof data.roomSettings.betAmount === "number") setBetAmount(data.roomSettings.betAmount);
        if (typeof data.roomSettings.locked === "boolean") setRoomLocked(data.roomSettings.locked);
      }
    };

    const onPlayersData = (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === socket.id); // ใช้ socket.id โดยตรง
      if (me) {
        setIsDealer(me.isDealer);
        setHasStayed(me.hasStayed || false); // Ensure boolean
        setMoney(me.money.toString()); // อัปเดตเงินจาก server
      }
    };

    const onYourCards = (dataFromServer) => {
      console.log("[Client] Received 'yourCards'. Data:", dataFromServer);
      let cardsToSet = [];
      if (dataFromServer && Array.isArray(dataFromServer.cards)) {
        cardsToSet = dataFromServer.cards;
        // ถ้า server ส่ง handDetails มาพร้อม cards ใน event นี้ ก็สามารถ set ได้เลย
        // if (dataFromServer.handDetails) setMyHandDetails(dataFromServer.handDetails);
      } else if (Array.isArray(dataFromServer)) {
        cardsToSet = dataFromServer;
      }

      if (cardsToSet.every(c => typeof c === "object" && c !== null && "value" in c && "suit" in c)) {
        setMyCards(cardsToSet);
      } else {
        setMyCards([]);
      }
    };

    const onGameStarted = (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมรอบที่ ${data.gameRound || gameRound + 1} เริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "highlight");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      if (typeof data.gameRound === "number") setGameRound(data.gameRound);
      setGameStarted(true);
      setResult([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({});
      // myCards และ handDetails จะถูกอัปเดตจาก playersData หรือ yourCards ที่ server ส่งมา
    };

    const onCurrentTurn = (turnData) => {
      console.log("[Client] Event 'currentTurn':", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name || "",
        role: turnData.role || "",
        timeLeft: turnData.timeLeft || DEFAULT_TURN_DURATION,
      });
      setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);
      if (turnData.id === socket.id) { // ใช้ socket.id
        const meInPlayerData = playerData.find((p) => p.id === socket.id);
        setHasStayed(meInPlayerData ? meInPlayerData.hasStayed : false);
      }
    };

    const onTurnTimerUpdate = (timerData) => {
      // อัปเดตเวลาถอยหลังเฉพาะถ้าเป็นตาของผู้เล่นที่ระบุ และข้อมูลตรงกับ currentTurnId
      if (timerData && currentTurnId === timerData.playerId) {
        setCurrentTurnInfo((prev) => ({ ...prev, timeLeft: timerData.timeLeft }));
        if (timerData.playerId === socket.id) setCountdown(timerData.timeLeft); // ใช้ socket.id
      }
    };

    const onEnableShowResult = (canShow) => {
      console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    };

    const onLockRoom = (isLockedFromServer) => {
      setRoomLocked(isLockedFromServer);
      addMessage(isLockedFromServer ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค", "info");
    };

    const onResult = (roundResultsFromServer) => {
      console.log("[Client] Event 'result':", roundResultsFromServer);
      if (Array.isArray(roundResultsFromServer)) {
         const sortedResults = [...roundResultsFromServer].sort((a, b) => {
            const isADealer = a.role === "เจ้ามือ";
            const isBDealer = b.role === "เจ้ามือ";
            if (isADealer && !isBDealer) return -1;
            if (!isADealer && isBDealer) return 1;
            if (!isADealer && !isBDealer) {
                const numA = parseInt(a.role?.match(/\d+$/)?.[0], 10); // ดึงเลขท้ายของ "ขา X"
                const numB = parseInt(b.role?.match(/\d+$/)?.[0], 10);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            }
            return 0;
        });
        setResult(sortedResults);
        // อัปเดตเงินของผู้เล่นปัจจุบันหลังจากได้รับผล
        const myResult = sortedResults.find(r => r.playerId === socket.id);
        if (myResult && typeof myResult.moneyAfterRound === 'number') {
            setMoney(myResult.moneyAfterRound.toString());
        }

      } else {
        setResult([]);
      }
      setGameStarted(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      // setMyHandDetails(null); // ล้างเมื่อจบรอบ
    };

    const onResetGame = (data) => {
      console.log("[Client] Event 'resetGame'", data);
      addMessage(data?.message || "เกมถูกรีเซ็ต เตรียมเริ่มรอบใหม่", "info");
      setGameStarted(false);
      setMyCards([]);
      // setMyHandDetails(null);
      setResult([]);
      setHasStayed(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setRevealedPokPlayers({});
    };

    const onPlayerRevealedPok = (data) => {
      console.log("[Client] Player revealed Pok:", data);
      if (data && data.playerId && data.cards && data.handDetails) {
        addMessage(
          `${data.role || "ผู้เล่น"} (${data.name}) ป๊อก! แสดงไพ่: ${data.cards
            .map(getCardDisplay) // ใช้ getCardDisplay ที่ define ไว้ใน App.js
            .join(" ")} (${data.handDetails.type})`,
          "highlight"
        );
        setRevealedPokPlayers((prev) => ({
          ...prev,
          [data.playerId]: { ...data },
        }));
      }
    };

    const onGameEnded = (gameSummary) => {
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary);
      const me = gameSummary.find(p => p.id === socket.id); // ใช้ socket.id
      if (me && typeof me.finalBalance === 'number') {
          setMoney(me.finalBalance.toString()); // อัปเดตเงินครั้งสุดท้าย
      }
      setSummaryData(gameSummary);
      setShowSummary(true);
      setInRoom(false); // อาจจะให้ออกจากห้องเมื่อเกมจบจริง
      setRoomId("");
      // รีเซ็ต state อื่นๆที่เกี่ยวข้องกับห้องและเกม
      setGameStarted(false);
      setResult([]);
      setCurrentTurnId(null);
    };

    const onErrorMessage = (msg) => addMessage(msg.text || (typeof msg === "string" ? msg : "Error จาก Server"), "error");
    const onMessage = (msg) => addMessage(msg.text || (typeof msg === "string" ? msg : "ข้อความจาก Server"), "info");
    const onPlayerLeft = (data) => addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`, "info");
    const onRoomSettings = (settings) => {
      if (settings && typeof settings.betAmount === "number") {
        setBetAmount(settings.betAmount);
        const amIDealer = playerData.find(p => p.id === socket.id && p.isDealer); // ใช้ socket.id
        if (amIDealer) {
          setInputBetAmount(settings.betAmount.toString());
        }
      }
       if (settings && typeof settings.locked === "boolean") { // Server ควรส่ง 'locked' มาด้วย
        setRoomLocked(settings.locked);
      }
    };

    // --- Register event handlers ---
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("roomCreated", onRoomCreated);
    socket.on("joinedRoom", onJoinedRoom);
    socket.on("playersData", onPlayersData);
    socket.on("yourCards", onYourCards);
    socket.on("gameStarted", onGameStarted);
    socket.on("currentTurn", onCurrentTurn);
    socket.on("turnTimerUpdate", onTurnTimerUpdate);
    socket.on("enableShowResult", onEnableShowResult);
    socket.on("lockRoom", onLockRoom);
    socket.on("result", onResult);
    socket.on("resetGame", onResetGame);
    socket.on("player_revealed_pok", onPlayerRevealedPok);
    socket.on("gameEnded", onGameEnded);
    socket.on("errorMessage", onErrorMessage);
    socket.on("message", onMessage);
    socket.on("playerLeft", onPlayerLeft);
    socket.on("roomSettings", onRoomSettings);


    // --- Cleanup function ---
    return () => {
      if (socketRef.current) {
        console.log("[Client] Cleaning up ALL socket listeners and disconnecting for:", socketRef.current.id);
        socketRef.current.removeAllListeners();
        // ถ้าต้องการให้ disconnect เมื่อ component unmount (เช่น ปิด tab หรือเปลี่ยนหน้า)
        // socketRef.current.disconnect();
        // socketRef.current = null; // ถ้าต้องการให้สร้าง instance ใหม่เมื่อ App re-mount (ไม่แนะนำถ้า App คือ root)
      }
    };
  // Dependency array ว่างเปล่า เพื่อให้ effect นี้ทำงานแค่ครั้งเดียวตอน mount และ cleanup ตอน unmount
  // การอัปเดต state ภายใน listeners จะไม่ทำให้ effect นี้รันใหม่
  }, [addMessage, playerData]); // ★★★ เพิ่ม addMessage, playerData เข้าไปเนื่องจาก ESLint อาจจะเตือนเรื่อง missing dependencies ใน callback ของ listener
                      // การใส่ playerData อาจจะยังทำให้ re-register บ่อย แต่ addMessage ที่ memoized ด้วย useCallback จะไม่เป็นปัญหา
                      // ทางที่ดีที่สุดคือการไม่ใช้ state ภายนอกใน callback ของ listener โดยตรง หรือ ส่ง state เข้าไปใน callback


  // Countdown timer effect
  useEffect(() => {
    let timer;
    // เงื่อนไขสำหรับ Countdown ควรเช็ค myPlayerId ด้วย (ซึ่งมาจาก socket.id)
    if (gameStarted && currentTurnId === myPlayerId && myCards.length >= 2 && !hasStayed && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    } else if (gameStarted && currentTurnId === myPlayerId && !hasStayed && countdown === 0) {
      if (socketRef.current && socketRef.current.connected) {
        addMessage("หมดเวลา! ทำการ 'อยู่' อัตโนมัติ", "info");
        socketRef.current.emit("stay", roomId); // ใช้ socketRef.current
        setHasStayed(true); // Optimistic update
      }
    }
    return () => clearTimeout(timer);
  }, [countdown, currentTurnId, hasStayed, myPlayerId, myCards.length, gameStarted, roomId, addMessage]);

  // Transfer summary effect
  useEffect(() => {
    if (showSummary && summaryData.length > 0 && myPlayerId) {
      const currentUserSummary = summaryData.find((p) => p.id === myPlayerId);
      if (!currentUserSummary) {
        setTransferSummary({ toPay: [], toReceive: [] }); return;
      }
      const amIDealer = currentUserSummary.isDealer;
      const toPayList = [];
      const toReceiveList = [];

      if (!amIDealer) {
        if (currentUserSummary.netChange < 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer) toPayList.push({ name: dealer.name, role: dealer.role, amount: Math.abs(currentUserSummary.netChange) });
        } else if (currentUserSummary.netChange > 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer) toReceiveList.push({ name: dealer.name, role: dealer.role, amount: currentUserSummary.netChange });
        }
      } else {
        summaryData.forEach((player) => {
          if (player.id === myPlayerId) return;
          if (player.netChange > 0) toPayList.push({ name: player.name, role: player.role, amount: player.netChange });
          else if (player.netChange < 0) toReceiveList.push({ name: player.name, role: player.role, amount: Math.abs(player.netChange) });
        });
      }
      setTransferSummary({ toPay: toPayList, toReceive: toReceiveList });
    } else if (!showSummary) {
      setTransferSummary({ toPay: [], toReceive: [] });
    }
  }, [showSummary, summaryData, myPlayerId]);


  // --- Action Handlers ---
  const handleCreateRoom = () => {
    if (!socketRef.current || !isConnected) { addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error"); return; }
    const bal = parseInt(money);
    if (!name.trim()) { addMessage("กรุณากรอกชื่อของคุณ", "error"); return; }
    if (isNaN(bal) || bal < 50 || bal % 10 !== 0) { addMessage("เงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 50 และลงท้ายด้วย 0", "error"); return;}
    socketRef.current.emit("createRoom", { playerName: name, initialBalance: bal });
  };

  const handleJoinRoom = () => {
    if (!socketRef.current || !isConnected) { addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error"); return; }
    const bal = parseInt(money);
    const roomIdToJoin = inputRoomId.trim().toUpperCase();
    if (!name.trim()) { addMessage("กรุณากรอกชื่อของคุณ", "error"); return; }
    if (!roomIdToJoin) { addMessage("กรุณากรอกรหัสห้อง", "error"); return; }
    if (isNaN(bal) || bal < 10 || bal % 10 !== 0) { addMessage("เงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 10 และลงท้ายด้วย 0", "error"); return; }
    socketRef.current.emit("joinRoom", { roomId: roomIdToJoin, playerName: name, initialBalance: bal });
  };

  const handleSetBet = () => {
    if (socketRef.current && isConnected && isDealer && !gameStarted) {
      const amount = parseInt(inputBetAmount);
      if (!isNaN(amount) && amount >= 5 && (amount % 10 === 0 || amount % 5 === 0)) {
        socketRef.current.emit("setBetAmount", { roomId, amount });
      } else { addMessage("เงินเดิมพันต้องไม่น้อยกว่า 5 และลงท้ายด้วย 0 หรือ 5", "error"); }
    }
  };

  const handleToggleLockRoom = () => {
    if (socketRef.current && isConnected && isDealer && !gameStarted) {
      socketRef.current.emit("lockRoom", { roomId, lock: !roomLocked });
    }
  };

  const handleCopyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId)
      .then(() => addMessage(`คัดลอกเลขห้อง "${roomId}" เรียบร้อย`, "success"))
      .catch(err => addMessage("คัดลอกเลขห้องไม่สำเร็จ", "error"));
  };

  const handleStartGame = () => {
    if (socketRef.current && socketRef.current.connected && roomId && isDealer) {
      if (betAmount <= 0) { addMessage("กรุณากำหนดเงินเดิมพัน", "error"); return; }
      socketRef.current.emit("startGame", roomId);
    }
  };

  const handleDrawCard = () => {
    if (socketRef.current && socketRef.current.connected && gameStarted && currentTurnId === myPlayerId && !hasStayed && myCards.length < 3) {
      socketRef.current.emit("drawCard", roomId);
    }
  };

  const handleStay = () => {
    if (socketRef.current && socketRef.current.connected && gameStarted && currentTurnId === myPlayerId && !hasStayed) {
      socketRef.current.emit("stay", roomId);
      setHasStayed(true); // Optimistic update
    }
  };

  const handleShowResult = () => {
    if (socketRef.current && socketRef.current.connected && isDealer && gameStarted && showResultBtn) {
      socketRef.current.emit("showResult", roomId);
    }
  };

  const handleResetGameHandler = () => {
    if (socketRef.current && socketRef.current.connected && isDealer && !gameStarted && !showSummary) {
      socketRef.current.emit("resetGame", roomId);
    }
  };

  const handleEndGame = () => {
    if (socketRef.current && socketRef.current.connected && isDealer && !showSummary) {
      socketRef.current.emit("endGame", roomId);
    }
  };

  const handleExitGame = () => { window.location.reload(); };

  const getCardDisplay = (card) => { // Kept for UI rendering
    if (card && typeof card.value !== "undefined" && typeof card.suit !== "undefined") return `${card.value}${card.suit}`;
    return "?";
  };

  // --- UI Rendering Logic ---
  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);

  let myHandTypeForDisplay = "ยังไม่มีไพ่";
  let myHandScoreForDisplay = "-";

  // ★★★ แสดง hand type และ score จาก myCurrentPlayerData.handDetails ที่ Server ส่งมา ★★★
  if (myCurrentPlayerData && myCurrentPlayerData.handDetails && myCards.length > 0 && gameStarted && (!result || result.length === 0)) {
    myHandTypeForDisplay = myCurrentPlayerData.handDetails.type || "รอข้อมูล...";
    myHandScoreForDisplay = (typeof myCurrentPlayerData.handDetails.score === 'number') ? myCurrentPlayerData.handDetails.score.toString() : "-";
  } else if (myCards.length > 0 && gameStarted && (!result || result.length === 0)) {
    myHandTypeForDisplay = "กำลังโหลดข้อมูลไพ่...";
  }

  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed;


  // --- JSX Return ---
  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId);
    return (
      <div className="App-summary">
        <h2>สรุปยอดบัญชี (ห้อง: {roomId})</h2>
        <h3>คุณ: {me?.name || name} ({me?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")})</h3>
        <hr />
        {transferSummary.toReceive.length > 0 && (
          <>
            <h4 style={{ color: "green"}}>ยอดที่จะได้รับ:</h4>
            {transferSummary.toReceive.map((item, index) => (
              <p key={`receive-${index}`} style={{ color: "green", marginLeft: "15px" }}>
                - จาก {item.name} ({item.role}): {item.amount.toLocaleString()} บาท
              </p>
            ))}
          </>
        )}
        {transferSummary.toPay.length > 0 && (
          <>
            <h4 style={{ color: "red", marginTop: "15px" }}>ยอดที่ต้องจ่าย:</h4>
            {transferSummary.toPay.map((item, index) => (
              <p key={`pay-${index}`} style={{ color: "red", marginLeft: "15px" }}>
                - ให้ {item.name} ({item.role}): {item.amount.toLocaleString()} บาท
              </p>
            ))}
          </>
        )}
        {transferSummary.toReceive.length === 0 && transferSummary.toPay.length === 0 && (
          <p style={{ textAlign: "center", marginTop: "15px" }}>ไม่มีรายการได้เสียสำหรับคุณจากเกมนี้</p>
        )}
        <hr style={{margin: "15px 0"}} />
        <h4 style={{ marginTop: "15px" }}>
          ยอดเงินคงเหลือของคุณ:{" "}
          {(me?.finalBalance !== undefined ? me.finalBalance : parseInt(money))?.toLocaleString()} บาท
        </h4>
        {me && (
          <p className="summary-details">
            (ยอดเริ่มต้น: {me.initialBalance?.toLocaleString()} บาท,
            ผลต่าง:{" "}
            <span className={me.netChange >= 0 ? "profit" : "loss"}>
              {me.netChange > 0 ? `+${me.netChange?.toLocaleString()}` : me.netChange?.toLocaleString() || "0"} บาท
            </span>)
          </p>
        )}
        <button className="btn-lobby" onClick={handleExitGame}>กลับไปที่ล็อบบี้ (เริ่มใหม่)</button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์ (Real-time)</h2>
        {errorMsg && <p className={`message-banner ${errorMsg.toLowerCase().includes("error") || errorMsg.toLowerCase().includes("ผิดพลาด") || errorMsg.toLowerCase().includes("ไม่สำเร็จ") ? 'error-banner' : 'success-banner'}`}>{errorMsg}</p>}
        <div>
          <label htmlFor="playerName">ชื่อคุณ:</label>
          <input id="playerName" type="text" placeholder="ชื่อผู้เล่น" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="initialMoney">เงินเริ่มต้น:</label>
          <input id="initialMoney" type="number" placeholder="เงินเริ่มต้น" value={money} onChange={(e) => setMoney(e.target.value)} min="10" step="10" />
        </div>
        <div className="lobby-actions">
          <button onClick={handleCreateRoom} disabled={!isConnected || !name.trim() || !money.trim() || parseInt(money) < 10}>สร้างห้อง</button>
          <hr />
          <label htmlFor="joinRoomId">รหัสห้อง:</label>
          <input id="joinRoomId" type="text" placeholder="กรอกรหัสห้อง" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value.toUpperCase())} />
          <button onClick={handleJoinRoom} disabled={!inputRoomId.trim() || !isConnected || !name.trim() || !money.trim() || parseInt(money) < 10}>เข้าร่วมห้อง</button>
        </div>
        <p className="connection-status">สถานะ Server: {isConnected ? <span style={{color: "green"}}>เชื่อมต่อแล้ว</span> : <span style={{color: "red"}}>ยังไม่ได้เชื่อมต่อ</span>}</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="room-info">
          <span>ห้อง: <button className="room-id-btn" onClick={handleCopyRoomId} title="คลิกเพื่อคัดลอก">{roomId}</button></span>
          <span>สถานะห้อง: <span style={{ color: roomLocked ? "red" : "green" }}>{roomLocked ? "ล็อค" : "เปิด"}</span></span>
        </div>
        <div className="player-info-bar">
          <span>คุณ: {myCurrentPlayerData?.name || name} ({myCurrentPlayerData?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")})</span>
          <span>เงิน: {(myCurrentPlayerData?.balance !== undefined ? myCurrentPlayerData.balance : parseInt(money))?.toLocaleString()}</span>
        </div>
      </header>

      {errorMsg && <p className={`message-banner ${errorMsg.toLowerCase().includes("error") || errorMsg.toLowerCase().includes("ผิดพลาด") || errorMsg.toLowerCase().includes("ไม่สำเร็จ") ? 'error-banner' : 'highlight-banner'}`}>{errorMsg}</p>}

      {!gameStarted && isDealer && (!result || result.length === 0) && (
        <div className="dealer-controls pre-game-controls">
          <h4>ตั้งค่าเกม (เจ้ามือ)</h4>
          <div>
            <label>เดิมพันต่อรอบ (ขั้นต่ำ 5, ลงท้าย 0 หรือ 5): </label>
            <input type="number" value={inputBetAmount} onChange={(e) => setInputBetAmount(e.target.value)} step="5" min="5" />
            <button onClick={handleSetBet}>ตั้งค่าเดิมพัน</button>,
          </div>
          <button onClick={handleToggleLockRoom}>{roomLocked ? "ปลดล็อคห้อง" : "ล็อคห้อง"}</button>
          <button onClick={handleStartGame} disabled={!betAmount || betAmount < 5 || playerData.length < 2}>
            {gameRound > 0 || (result && result.length > 0) ? "เริ่มรอบใหม่" : "เริ่มเกม"}
          </button>
        </div>
      )}

      <div className="game-area">
        <div className="players-display-area">
          <h4>ผู้เล่นในห้อง ({playerData.length} คน) | เดิมพัน: {betAmount > 0 ? `${betAmount.toLocaleString()}` : "N/A"}</h4>
          <ul className="players-list-ul">
            {playerData.map((user) => (
              <li key={user.id} className={`player-item ${user.id === currentTurnId ? "current-turn-highlight" : ""} ${user.disconnectedMidGame ? "player-disconnected" : ""}`}>
                <span className="player-name-role">{user.name} ({user.role})</span>
                <span className="player-balance">เงิน: {user.balance?.toLocaleString()}</span>
                {user.id === currentTurnId && gameStarted && currentTurnInfo.timeLeft > 0 && !user.hasStayed &&
                  <span className="player-timer"> (กำลังเล่น... {currentTurnInfo.timeLeft}วิ)</span>
                }
                {user.id !== myPlayerId && gameStarted && user.handDetails && user.handDetails.type && (!result || result.length === 0) &&
                    (user.handDetails.type.includes("ป๊อก") ? <span className="player-status-pok"> (ป๊อกแล้ว!)</span> : (user.hasStayed && <span className="player-status-stayed"> (หมอบแล้ว)</span>))
                }
                 {revealedPokPlayers[user.id] && user.id !== myPlayerId && gameStarted && (!result || result.length === 0) && (
                    <div className="other-player-cards">
                      ไพ่: {revealedPokPlayers[user.id].cards.map(getCardDisplay).join(" ")} ({revealedPokPlayers[user.id].handDetails.type})
                    </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {gameStarted && myCards && myCards.length > 0 && (!result || result.length === 0) && (
          <div className="my-hand-area">
            <h3>ไพ่ของคุณ: {myCards.map((card, idx) => (<span key={idx} className="card-display-value">{getCardDisplay(card)} </span>))}</h3>
            <h4 className="my-hand-type">{myHandTypeForDisplay} {/* (แต้ม: {myHandScoreForDisplay}) */} </h4>
            {isMyTurn && (
              <div className="actions-area">
                <p className="turn-timer-display">ตาของคุณ! เหลือเวลา: {countdown} วินาที</p>
                <div className="action-buttons-container">
                  {myCards.length < 3 && (
                    <button onClick={handleDrawCard} disabled={hasStayed || myCards.length >= 3}>จั่วไพ่</button>
                  )}
                  <button onClick={handleStay} disabled={hasStayed}>อยู่ (หมอบ)</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>


      {/* แสดงสถานะตาของผู้เล่นอื่น / ปุ่ม Show Result ของเจ้ามือ */}
      {gameStarted && !isMyTurn && currentTurnId && (!result || result.length === 0) && (
        <p className="waiting-indicator">รอ... ({currentTurnInfo.role}) {currentTurnInfo.name} ({currentTurnInfo.timeLeft} วิ) ⌛</p>
      )}
      {isDealer && gameStarted && !currentTurnId && showResultBtn && (!result || result.length === 0) && (
        <div className="dealer-action-show-result">
          <button className="btn-show-result" onClick={handleShowResult}>เปิดไพ่ทั้งหมด (คำนวณผล)</button>
        </div>
      )}
       {isDealer && gameStarted && !currentTurnId && !showResultBtn && (!result || result.length === 0) && (
        <p className="waiting-indicator">รอผู้เล่นทุกคนดำเนินการให้เสร็จสิ้น...</p>
      )}


      {result && result.length > 0 && (
        <div className="results-table-container">
          <h3>ผลลัพธ์รอบที่ {gameRound} (เดิมพัน: {betAmount?.toLocaleString()} บาท)</h3>
          <table>
            <thead>
              <tr>
                <th>ผู้เล่น (บทบาท)</th>
                <th>ไพ่ที่ได้</th>
                <th>แต้ม</th>
                <th>ประเภทไพ่</th>
                <th>ผลการแข่ง</th>
                <th>ได้/เสีย</th>
                <th>เงินคงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {result.map((r) => (
                <tr key={r.playerId} className={`${r.playerId === myPlayerId ? "my-result" : ""} ${r.result === "LOSE_DISCONNECTED" ? "disconnected-player-result" : ""}`}>
                  <td>{r.name} ({r.role})</td>
                  <td>{r.cardsDisplay || "-"}</td>
                  <td>{typeof r.handScore === 'number' ? r.handScore : (r.score !== undefined ? r.score : "-")}</td>
                  <td>{r.handType || r.specialType || "-"}</td>
                  <td className={`outcome-${r.result?.toLowerCase()}`}>
                    {r.result === "WIN" && "✅ ชนะ"}
                    {r.result === "LOSE" && "❌ แพ้"}
                    {r.result === "TIE" && "🤝 เสมอ"}
                    {r.result === "DEALER" && "เจ้ามือ"}
                    {r.result === "LOSE_DISCONNECTED" && "ขาดการเชื่อมต่อ"}
                    {/* Fallback for other outcomes */}
                    {![ "WIN", "LOSE", "TIE", "DEALER", "LOSE_DISCONNECTED"].includes(r.result) && r.result}
                  </td>
                  <td className={r.payout > 0 ? "amount-profit" : r.payout < 0 ? "amount-loss" : ""}>
                    {r.payout !== 0 ? `${r.payout > 0 ? "+" : ""}${r.payout?.toLocaleString()}` : "-"}
                  </td>
                  <td>{r.moneyAfterRound?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="game-controls-footer">
          {isDealer && (!gameStarted || (result && result.length > 0)) && !showSummary && (
            <>
              <button onClick={handleResetGameHandler} disabled={gameStarted && (!result || result.length ===0)}>รีเซ็ตเกม (รอบใหม่)</button>
              <button onClick={handleEndGame}>จบเกมทั้งหมด & ดูสรุปยอด</button>
            </>
          )}
          {!isDealer && result && result.length > 0 && !gameStarted && !showSummary && (
            <p className="waiting-for-dealer">--- รอเจ้ามือเริ่มรอบใหม่ หรือ จบเกม ---</p>
          )}
          <button onClick={handleExitGame} className="exit-button">ออกจากห้อง (กลับไปล็อบบี้)</button>
      </div>

      <div className="messages-log-container">
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>
        <div className="messages-box" ref={messagesEndRef}>
          {messages.map((msg, index) => (
            <p key={index} className={`message-item message-type-${msg.type}`}> {msg.text} </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;