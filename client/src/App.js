// App.js
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css"; // ตรวจสอบว่าคุณมีไฟล์นี้ หรือลบการ import ถ้าไม่ใช้

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // สำหรับทดสอบ Local

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
  const [myCards, setMyCards] = useState([]); // จะเก็บ array ของ object ไพ่ [{value: 'K', suit: '♠️'}, ...]
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
  const [transferSummary, setTransferSummary] = useState({ toPay: [], toReceive: [] });

  useEffect(() => {
    if (showSummary && summaryData.length > 0 && myPlayerId) {
      const currentUserSummary = summaryData.find(p => p.id === myPlayerId);
      const otherPlayersSummary = summaryData.filter(p => p.id !== myPlayerId);

      if (!currentUserSummary) return;

      const toPayList = [];
      const toReceiveList = [];

      // กรณีที่ผู้เล่นปัจจุบันเป็น "ผู้เล่น" (ไม่ใช่เจ้ามือ)
      if (!currentUserSummary.isDealer) { // หรือ !isDealer (ถ้า isDealer state ถูกต้อง ณ จุดนี้)
        if (currentUserSummary.netChange < 0) { // เราเสียเงิน
          // ในเกมนี้ ผู้เล่นจะเสียให้เจ้ามือเท่านั้น
          const dealer = summaryData.find(p => p.isDealer); // หรือ p.role === "เจ้ามือ"
          if (dealer) {
            toPayList.push({
              name: dealer.name,
              role: dealer.role,
              amount: Math.abs(currentUserSummary.netChange) // จำนวนเงินที่ต้องโอนให้เจ้ามือ
            });
          }
        } else if (currentUserSummary.netChange > 0) { // เราได้เงิน
          // ผู้เล่นจะได้เงินจากเจ้ามือเท่านั้น
          const dealer = summaryData.find(p => p.isDealer);
          if (dealer) {
            toReceiveList.push({
              name: dealer.name,
              role: dealer.role,
              amount: currentUserSummary.netChange // จำนวนเงินที่ได้จากเจ้ามือ
            });
          }
        }
      }
      // กรณีที่ผู้เล่นปัจจุบันเป็น "เจ้ามือ"
      else {
        otherPlayersSummary.forEach(player => {
          if (player.netChange > 0) { // ผู้เล่นคนนี้ได้เงินจากเรา (เจ้ามือ)
            toPayList.push({
              name: player.name,
              role: player.role,
              amount: player.netChange
            });
          } else if (player.netChange < 0) { // เรา (เจ้ามือ) ได้เงินจากผู้เล่นคนนี้
            toReceiveList.push({
              name: player.name,
              role: player.role,
              amount: Math.abs(player.netChange)
            });
          }
        });
      }
      setTransferSummary({ toPay: toPayList, toReceive: toReceiveList });
    }
  }, [showSummary, summaryData, myPlayerId, isDealer]);

  // State ใหม่สำหรับเก็บไพ่ของผู้เล่นอื่นที่ป๊อกแล้วถูกเปิด
  const [revealedPokPlayers, setRevealedPokPlayers] = useState({}); // { playerId: { name, role, cards, handDetails }, ... }

  const [errorMsg, setErrorMsg] = useState("");
  const [messages, setMessages] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (text, type = "info") => {
    const fullText = `[${new Date().toLocaleTimeString()}] ${text}`;
    setMessages((prev) => {
      const newMessages = [...prev, { text: fullText, type }];
      if (newMessages.length > 20)
        return newMessages.slice(newMessages.length - 20);
      return newMessages;
    });
    // แสดง errorMsg เฉพาะเมื่อ type เป็น error, success, info (หรือตามต้องการ)
    // และไม่ทับข้อความ error ที่สำคัญกว่าถ้ามีข้อความใหม่เข้ามาเร็ว
    if (type === "error" || type === "success" || type === "info" || type === "highlight") {
      setErrorMsg(text); // แสดง errorMsg ชั่วคราวสำหรับ type เหล่านี้ด้วย
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

    function onConnect() {
      console.log("[Client] Connected to server with ID:", socketClient.id);
      setMyPlayerId(socketClient.id);
      setIsConnected(true);
      addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว!", "success");
    }

    function onDisconnect(reason) {
      console.log("[Client] Disconnected from server. Reason:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
      // Consider a more robust reset of game state here
      // setInRoom(false); setGameStarted(false); // etc.
    }

    function onConnectError(err) {
      console.error('[Client] Connection Attempt Error:', err);
      addMessage(`พยายามเชื่อมต่อ Server ไม่สำเร็จ: ${err.message}`, "error");
      setIsConnected(false);
    }

    socketClient.on("connect", onConnect);
    socketClient.on("disconnect", onDisconnect);
    socketClient.on("connect_error", onConnectError); // เพิ่ม listener

    socketClient.on("roomCreated", (data) => {
      console.log("[Client] Room Created:", data);
      setRoomId(data.roomId); setInRoom(true); setIsDealer(true);
      addMessage(`ห้อง ${data.roomId} ถูกสร้างโดย ${name || data.dealerName}`, "success");
      if (typeof data.betAmount === "number") {
        setBetAmount(data.betAmount);
        setInputBetAmount(data.betAmount.toString());
      }
    });

    socketClient.on("joinedRoom", (data) => {
      console.log("[Client] Joined Room:", data);
      setRoomId(data.roomId); setInRoom(true);
      addMessage(`เข้าร่วมห้อง ${data.roomId} สำเร็จ. เจ้ามือ: ${data.dealerName || "N/A"}`, "success");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
    });

    socketClient.on("playersData", (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerId);
      if (me) {
        setIsDealer(me.isDealer);
        // อัปเดต hasStayed จาก server ถ้ามีการส่งมา (เช่น กรณีป๊อก Server จะ set true)
        if (typeof me.hasStayed === "boolean") {
          setHasStayed(me.hasStayed);
        }
      }



    });



    socketClient.on("yourCards", (cardsFromServer) => { // Server ต้องส่ง array of objects
      console.log(`[Client ${myPlayerId || socketClient?.id}] Received 'yourCards'. Data:`, JSON.stringify(cardsFromServer));
      if (Array.isArray(cardsFromServer) && cardsFromServer.every(c => typeof c === 'object' && c !== null && 'value' in c && 'suit' in c)) {
        setMyCards(cardsFromServer);
        // ไม่ควร setHasStayed(false) ที่นี่โดยไม่มีเงื่อนไข เพราะอาจจะล้างสถานะที่ server กำหนด
        // การ reset hasStayed ควรทำเมื่อเริ่มรอบใหม่ (gameStarted) หรือเมื่อถึงตาของผู้เล่น (currentTurn)
      } else {
        console.warn("[Client] 'yourCards' received non-array of objects or invalid data:", cardsFromServer);
        setMyCards([]); // ตั้งเป็น array ว่างถ้าข้อมูลไม่ถูกต้อง
      }
    });

    socketClient.on("gameStarted", (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "info");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      setGameStarted(true);
      setResult([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({}); // รีเซ็ตไพ่ป๊อกที่เปิดของผู้เล่นอื่น
    });

    socketClient.on("currentTurn", (turnData) => {
      console.log("[Client] Event 'currentTurn':", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({ name: turnData.name, role: turnData.role, timeLeft: turnData.timeLeft });
      const newCountdown = turnData.timeLeft || DEFAULT_TURN_DURATION;
      setCountdown(newCountdown);
      if (turnData.id === myPlayerId) {
        // รีเซ็ต hasStayed เมื่อถึงตาของผู้เล่น *ยกเว้น* server ได้บอกแล้วว่าผู้เล่นนี้ hasStayed (เช่น ป๊อก)
        // การตรวจสอบนี้อาจจะซับซ้อน ถ้า me.hasStayed จาก playersData ถูกต้อง ก็ไม่ต้องทำอะไรมาก
        // เพื่อความปลอดภัย, ถ้า server บอกว่า hasStayed แล้ว ก็ไม่ควรเปลี่ยนเป็น false
        const meInPlayerData = playerData.find(p => p.id === myPlayerId);
        if (!(meInPlayerData && meInPlayerData.hasStayed)) {
            setHasStayed(false);
        }
      }
    });

    socketClient.on("turnTimerUpdate", (timerData) => {
      if (currentTurnId === timerData.playerId) {
        setCurrentTurnInfo((prev) => ({ ...prev, timeLeft: timerData.timeLeft }));
        if (timerData.playerId === myPlayerId) setCountdown(timerData.timeLeft);
      }
    });

    socketClient.on("enableShowResult", (canShow) => {
      console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    });

    socketClient.on("lockRoom", (isLockedFromServer) => {
      console.log("[Client] Room lock status from server:", isLockedFromServer);
      setRoomLocked(isLockedFromServer);
      addMessage(isLockedFromServer ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค");
    });

    socketClient.on("result", (roundResults) => {
      console.log("[Client] Event 'result':", roundResults);
      setResult(roundResults);
      setGameStarted(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setGameRound((prev) => prev + 1);
    });

    socketClient.on("resetGame", () => {
      console.log("[Client] Event 'resetGame'");
      addMessage("เกมถูกรีเซ็ต เตรียมเริ่มรอบใหม่", "info");
      setGameStarted(false);
      setMyCards([]);
      setResult([]);
      setHasStayed(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setRevealedPokPlayers({}); // รีเซ็ตไพ่ป๊อกที่เปิดของผู้เล่นอื่น
    });

    // *** NEW: Listener for player_revealed_pok ***
    socketClient.on("player_revealed_pok", (data) => {
        console.log("[Client] Player revealed Pok:", data);
        if (data && data.playerId && data.cards && data.handDetails) {
            addMessage(
                `${data.role || 'ผู้เล่น'} (${data.name}) ป๊อก! แสดงไพ่: ${data.cards.map(getCardDisplay).join(" ")} (${data.handDetails.type})`,
                "highlight" // ใช้ type ใหม่ หรือ 'info'
            );
            setRevealedPokPlayers(prev => ({
                ...prev,
                [data.playerId]: {
                    name: data.name,
                    role: data.role,
                    cards: data.cards,
                    handDetails: data.handDetails
                }
            }));
        } else {
            console.warn("[Client] Received invalid data for player_revealed_pok:", data);
        }
    });

    socketClient.on("gameEnded", (gameSummary) => {
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary);
      setSummaryData(gameSummary);
      setShowSummary(true);
      setGameStarted(false);
      setResult([]);
      setCurrentTurnId(null);
    });

    socketClient.on("errorMessage", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Error"), "error")
    );

    socketClient.on("message", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Message"))
    );

    socketClient.on("playerLeft", (data) =>
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`)
    );

    socketClient.on("roomSettings", (settings) => {
      console.log("[Client] Received 'roomSettings'. Data:", settings);
      if (settings && typeof settings.betAmount === "number") {
        addMessage(
          `[EVENT] ราคาเดิมพันอัปเดตเป็น: ${settings.betAmount} (จาก roomSettings)`,
          "info"
        );
        setBetAmount(settings.betAmount);
        // The playerData state used in the condition below will be the latest value
        // due to closure, even if 'playerData' is not in the useEffect dependency array.
        // This listener is re-attached if myPlayerId changes, which is appropriate.
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

    return () => {
      console.log(
        "[Client] useEffect cleanup: Removing listeners for socket ID:",
        socketClient?.id
      );
      if (socketClient) {
        socketClient.off("connect", onConnect);
        socketClient.off("disconnect", onDisconnect);
        socketClient.off("connect_error", onConnectError); // Cleanup connect_error listener
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
        socketClient.off("message");
        socketClient.off("lockRoom");
        socketClient.off("playerLeft");
        socketClient.off("roomSettings"); // Ensure roomSettings is also cleaned up
      }
    };
  }, [myPlayerId, name, roomId, currentTurnId, playerData]); // Added playerData because it's used in roomSettings callback condition.

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      myCards.length >= 2 && // Player can have 2 or 3 cards and still be in their turn before 'stay'
      !hasStayed &&
      countdown > 0
    ) {
      timer = setTimeout(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);
    } else if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      myCards.length >= 2 &&
      !hasStayed &&
      countdown === 0
    ) {
      addMessage("หมดเวลา! ทำการ 'อยู่' อัตโนมัติ", "info");
      socketClient.emit("stay", roomId);
      setHasStayed(true); // Optimistic update
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
    // addMessage was removed as a dependency because it's stable if defined outside or via useCallback
  ]);


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

  const handleCopyRoomId = () => { // ปรับปรุงให้ใช้ addMessage
    if (!roomId) return;
    navigator.clipboard
      .writeText(roomId)
      .then(() => addMessage(`คัดลอกเลขห้อง "${roomId}" เรียบร้อยแล้ว`, "success"))
      .catch((err) => {
          console.error("คัดลอกไม่สำเร็จ:", err);
          addMessage("คัดลอกเลขห้องไม่สำเร็จ", "error");
      });
  };

  const handleStartGame = () => { // ปรับปรุงเงื่อนไข disabled ใน JSX
    if (socketClient && socketClient.connected && roomId && isDealer) {
      if (betAmount <= 0) {
        addMessage("กรุณากำหนดเงินเดิมพันก่อนเริ่มเกม", "error");
        return;
      }
      console.log("[Client] Attempting 'startGame'. RoomId:", roomId, "IsDealer:", isDealer);
      socketClient.emit("startGame", roomId);
    } else {
      addMessage("ไม่สามารถเริ่มเกมได้ (ตรวจสอบการเชื่อมต่อ, รหัสห้อง, หรือสิทธิ์เจ้ามือ)", "error");
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
      setHasStayed(true); // Optimistic update
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
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'resetGame' for room:", roomId);
      socketClient.emit("resetGame", roomId);
    }
  };

  const handleEndGame = () => {
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'endGame' for room:", roomId);
      socketClient.emit("endGame", roomId);
    }
  };

  const handleExitGame = () => {
    window.location.reload();
  };

  const getCardDisplay = (card) => { // ควรจะทำงานถูกต้องถ้า server ส่ง object ไพ่มา
    if (card && typeof card.value !== "undefined" && typeof card.suit !== "undefined")
      return `${card.value}${card.suit}`;
    console.warn("[Client] getCardDisplay received invalid card object:", card);
    return "?";
  };

  const getCardPoint = (v) => ["J", "Q", "K", "10"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v);

  const calculateRankForDisplay = (cardsToRank) => { // เพิ่มการเช็ค "ตอง"
    if (!cardsToRank || cardsToRank.length === 0) return { score: 0, type: "ยังไม่มีไพ่" };
    const calculatedScore = cardsToRank.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
    let type = `${calculatedScore} แต้ม`;

    if (cardsToRank.length === 2) {
      const isPok = calculatedScore === 8 || calculatedScore === 9;
      const isDeng = cardsToRank[0].suit === cardsToRank[1].suit || cardsToRank[0].value === cardsToRank[1].value;
      if (isPok) { type = `ป๊อก ${calculatedScore}`; if (isDeng) type += " สองเด้ง"; }
      else if (isDeng) { type = `สองเด้ง (${calculatedScore} แต้ม)`; }
    } else if (cardsToRank.length === 3) {
      const suits = cardsToRank.map((c) => c.suit);
      const values = cardsToRank.map((c) => c.value).sort();
      const isSameSuit = suits.every((s) => s === suits[0]);
      const isTaong = values[0] === values[1] && values[1] === values[2];
      if (isTaong) { type = `ตอง ${values[0]} (${calculatedScore} แต้ม)`; if (isSameSuit) type += " (สี)";} // ตองสี
      else if (isSameSuit) { type = `สามเด้ง (${calculatedScore} แต้ม)`; }
      // สามารถเพิ่มการตรวจสอบ เรียง, เซียน ที่นี่ได้ถ้าต้องการให้ Client แสดงผลแม่นยำขึ้น
    }
    return { score: calculatedScore, type };
  };

  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);
  let myHandScore = "-";
  let myHandType = "ยังไม่มีไพ่";

  if (myCards && myCards.length > 0 && gameStarted && (!result || result.length === 0)) {
    const rankData = calculateRankForDisplay(myCards);
    myHandScore = rankData.score;
    myHandType = rankData.type;
  }
  // ปรับปรุง isMyTurn ให้ถูกต้อง (เอา myCards.length < 3 ออก)
  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed;
   // JSX
   if (showSummary) {
    return (
      <div className="App-summary">
        <h2>สรุปยอดเงินหลังจบเกม (ห้อง: {roomId})</h2>
        <table border="1" cellPadding="5">
          <thead>
            <tr>
              {/* คอลัมน์ 1: ชื่อผู้เล่น */}
              <th>ชื่อผู้เล่น</th>
              {/* คอลัมน์ 2: บทบาท */}
              <th>บทบาท</th>
              {/* คอลัมน์ 3: เงินคงเหลือ */}
              <th>ยอดเงินคงเหลือ</th>
              {/* คอลัมน์ 4: กำไร/ขาดทุนสุทธิ */}
              <th>กำไร/ขาดทุนสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {summaryData.map((p, i) => (
              <tr key={p.id || i}> {/* ยังคงใช้ p.id สำหรับ key เพื่อความ unique */}
                {/* คอลัมน์ 1: แสดงชื่อผู้เล่น */}
                <td>{p.name}</td>
                {/* คอลัมน์ 2: แสดงบทบาท */}
                <td>{p.role}</td>
                {/* คอลัมน์ 3: แสดงยอดเงินสุดท้าย */}
                <td>{p.finalBalance?.toLocaleString()} บาท</td>
                {/* คอลัมน์ 4: แสดงกำไร/ขาดทุนสุทธิ */}
                <td className={p.netChange >= 0 ? "profit" : "loss"}>
                  {p.netChange > 0 && `+${p.netChange?.toLocaleString()} บาท`}
                  {p.netChange < 0 && `${p.netChange?.toLocaleString()} บาท`}
                  {p.netChange === 0 && "0 บาท"} {/* หรือจะแสดงเป็น "-" ก็ได้ */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>สรุปยอดต้องโอนให้และต้องได้</h2>


        <button onClick={handleExitGame}>ออกจากเกม (เริ่มใหม่)</button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์</h2>
        {errorMsg && (
  <p
    className="error-message"
    style={{
      color: "#000000", // กำหนดสีตัวอักษรเป็นสีดำ
      border: "1px solid #551818",
      padding: "5px",
      backgroundColor: "#eeeeee",
      whiteSpace: "pre-wrap",
    }}
  >
    {errorMsg}
  </p>
)}


      ชื่อคุณ: <input
          type="text"
          placeholder="ชื่อคุณ"
          value={name}
          onChange={(e) => setName(e.target.value)}></input>

        เงิน: <input
          type="number"
          placeholder="เงินเริ่มต้น (ขั้นต่ำ 50)"
          value={money}
          onChange={(e) => setMoney(e.target.value)}
          min="50"
          step="10"
        />
        &nbsp;&nbsp;&nbsp;<div style={{ marginTop: 20 }}>
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
          onClick={handleJoinRoom}
          disabled={
            !inputRoomId.trim() || !isConnected || !name.trim() || !money.trim()
          }
        >
          เข้าร่วมห้อง
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      <header>
        <h2>
          ห้อง:&nbsp;
          <button
            className="text-button2"
            onClick={handleCopyRoomId}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomId}
          </button>
          <br></br>(ราคาเดิมพันต่อรอบ:{" "}
          {betAmount > 0
            ? `${betAmount.toLocaleString()} บาท`
            : "รอเจ้ามือกำหนด"}
          )
        </h2>
        <p>
          คุณ: {name}{" "}
          {isDealer
            ? "(เจ้ามือ)"
            : `(${myCurrentPlayerData?.role || "ผู้เล่น"})`}{" "}
          | ID: {myPlayerId?.substring(0, 5)} | เงิน:{" "}
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
          สถานะห้อง: {roomLocked ? "ล็อค" : "เปิด"}
        </p>
      </header>
      {errorMsg && (
        <p
          className="error-message"
          style={{
            border: "1px solid #3c763d",
            padding: "5px",
            backgroundColor: "#dff0d8",
            whiteSpace: "pre-wrap",
          }}
        >
          {errorMsg}
        </p>
      )}
      {!gameStarted && isDealer && (!result || result.length === 0) && (
        <div className="dealer-controls pre-game">
          <h4>ตั้งค่าเกม (เจ้ามือ):</h4>
          <div>
            <label>เงินเดิมพัน: </label>
            <input type="number" value={inputBetAmount} onChange={(e) => setInputBetAmount(e.target.value)} step="5" min="5"/>
            <button className="btn-inroom-setting" onClick={handleSetBet}>ตั้งค่า</button>
          </div>
          <button onClick={handleToggleLockRoom}>{roomLocked ? "ปลดล็อคห้อง" : "ล็อคห้อง"}</button>
          <button onClick={handleStartGame} disabled={betAmount <= 0} >
            {gameRound > 0 || (result && result.length > 0) ? "เริ่มเกมรอบใหม่" : "เริ่มเกม"}
          </button>
        </div>
      )}
      <div className="players-list">
        <h4>ผู้เล่นในห้อง ({playerData.length} คน):</h4>
        <ul>
          {playerData.map((user) => (
            <li key={user.id} className={user.id === currentTurnId ? "current-turn-player" : ""}>
              {user.name} ({user.role}) - เงิน: {user.balance?.toLocaleString()} บาท
              {user.id === currentTurnId && currentTurnInfo.timeLeft > 0 && gameStarted &&
                ` (กำลังเล่น... ${currentTurnInfo.timeLeft}วิ)`}
              {revealedPokPlayers[user.id] && user.id !== myPlayerId && gameStarted && (!result || result.length === 0) && (
                <div className="revealed-pok-cards">
                  <strong>ไพ่ที่ป๊อก:</strong>{" "}
                  {revealedPokPlayers[user.id].cards.map((card, cIdx) => (
                    <span key={cIdx} className="card-display">
                      {getCardDisplay(card)}
                    </span>
                  ))}
                  <em> ({revealedPokPlayers[user.id].handDetails.type})</em>
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
            <h3>
              ไพ่ของคุณ:{" "}
              {myCards.map((card, idx) => (
                <span key={idx}>{getCardDisplay(card)} </span>
              ))}
            </h3>
            <p>
              แต้ม: {myHandScore}, ประเภท: {myHandType}
            </p>
            {isMyTurn &&
              myCards.length >= 2 && // Must have at least 2 cards to make a decision
              !hasStayed && (
                <div className="player-actions">
                  <p>ตาของคุณ! เวลา: {countdown} วินาที</p>
                  {myCards.length < 3 && ( // Can only draw if cards are less than 3
                    <button
                      onClick={handleDrawCard}
                      disabled={myCards.length >= 3}
                    >
                      จั่ว
                    </button>
                  )}
                  <button onClick={handleStay} disabled={hasStayed}>
                    อยู่
                  </button>
                </div>
              )}
          </div>
        )}
      {gameStarted &&
        (!myCards || myCards.length === 0) &&
        (!result || result.length === 0) && (
          <p className="debug-message error">
            [DEBUG Client] {isDealer ? "เจ้ามือ:" : "ผู้เล่น:"} เกมเริ่มแล้ว
            แต่ยังไม่ได้รับไพ่/ไพ่ไม่แสดง. myCards: {JSON.stringify(myCards)}
          </p>
        )}
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
            ผู้เล่น ({currentTurnInfo.role}) {currentTurnInfo.name}{" "}
            กำลังตัดสินใจ ({currentTurnInfo.timeLeft} วิ)...
          </p>
        )}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        showResultBtn &&
        (!result || result.length === 0) && (
          <button className="show-result-btn" onClick={handleShowResult}>
            เปิดไพ่ทั้งหมด (เจ้ามือ)
          </button>
        )}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        !showResultBtn &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">รอผู้เล่นทุกคนตัดสินใจ...</p>
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
            <th>ผู้เล่น (บทบาท)</th>
            <th>ไพ่</th>
            <th>แต้ม</th>
            <th>ประเภท</th>
            <th>ผล</th>
            <th>ได้/เสีย</th>
            <th>เงินคงเหลือ</th> {/* <--- เปลี่ยนชื่อคอลัมน์ */}
          </tr>
        </thead>
        <tbody>
          {result.map((r, i) => ( // Server ควรจะส่ง result ที่เรียงลำดับมาแล้ว (เจ้ามือก่อน)
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
              <td>{r.name} ({r.role || 'N/A'})</td>
              <td>{r.cardsDisplay || "N/A"}</td>
              <td>{r.score}</td>
              <td>{r.specialType}</td>
              <td> {/* <--- แก้ไขการแสดงผล "ผล" */}
                {r.outcome === "ชนะ" && "✅ ชนะ"}
                {r.outcome === "แพ้" && "❌ แพ้"}
                {r.outcome === "เสมอ" && "🤝 เสมอ"}
                {r.outcome === "เจ้ามือ" && "เจ้ามือ"}
                {r.outcome === "ขาดการเชื่อมต่อ" && "ขาดการเชื่อมต่อ"}
                {/* เพิ่มเงื่อนไขสำหรับ outcome อื่นๆ ถ้ามี */}
                {!(["ชนะ", "แพ้", "เสมอ", "เจ้ามือ", "ขาดการเชื่อมต่อ"].includes(r.outcome)) && r.outcome}
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
  {r.moneyChange > 0 && `+${r.moneyChange?.toLocaleString()} บาท`}
  {r.moneyChange < 0 && `${r.moneyChange?.toLocaleString()} บาท`}
  {/* แก้ไขบรรทัดล่างนี้ โดยการเอา {} ชั้นนอกออก */}
  {r.moneyChange === 0 && (
    (r.outcome === "เจ้ามือ" || r.outcome === "เสมอ" || (r.outcome === "ขาดการเชื่อมต่อ" && r.balance < betAmount))
      ? "-"
      : "0 บาท" // ถ้า moneyChange เป็น 0 และไม่เข้าเงื่อนไขข้างบน ก็แสดง "0 บาท"
  )}
</td>
              <td>{r.balance?.toLocaleString()} บาท</td> {/* <--- แก้ไขการแสดงผล "เงินคงเหลือ" */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      )}
      {isDealer &&
        (!gameStarted || (result && result.length > 0)) &&
        !showSummary && (
          <div className="post-round-controls">
            <button onClick={handleResetGameHandler}>
              เริ่มรอบใหม่ / รีเซ็ต
            </button>
            <button onClick={handleEndGame}>จบเกมทั้งหมด (ดูสรุป)</button>
          </div>
        )}
      {!isDealer &&
        result &&
        result.length > 0 &&
        !gameStarted &&
        !showSummary && (
          <p className="turn-indicator">
            --- รอเจ้ามือเริ่มรอบใหม่ หรือ จบเกม ---
          </p>
        )}
      <button onClick={handleExitGame} className="exit-button">
        ออกจากห้อง/เกม (โหลดใหม่)
      </button>
      <div className="messages-log">
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>
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

export default App;
