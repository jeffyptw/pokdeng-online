// App.js
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css";

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // สำหรับทดสอบ Local

let socketClient = null;

const DEFAULT_TURN_DURATION = 30; // ควรจะมาจาก Server หรือเป็นค่าคงที่ที่ตรงกัน

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [name, setName] = useState("");
  const [money, setMoney] = useState("50"); // ควรเป็นตัวเลข
  const [inputRoomId, setInputRoomId] = useState("");

  const [roomId, setRoomId] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [playerData, setPlayerData] = useState([]); // จะมี handDetails ของแต่ละคนถ้า server ส่งมา
  const [betAmount, setBetAmount] = useState(0);
  const [inputBetAmount, setInputBetAmount] = useState("5"); // ควรเป็นตัวเลข
  const [roomLocked, setRoomLocked] = useState(false);

  const [gameStarted, setGameStarted] = useState(false);
  const [myCards, setMyCards] = useState([]);
  // ★★★ ลบ myHandDetails state ถ้าเราจะดึงจาก myCurrentPlayerData.handDetails โดยตรง ★★★
  // const [myHandDetails, setMyHandDetails] = useState(null); // เก็บ {type, score, rank, multiplier}
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
  const [gameRound, setGameRound] = useState(0); // นับรอบเกม
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
      // ควรจะรีเซ็ต State ของเกมบางส่วนเมื่อหลุดการเชื่อมต่อ
      // setInRoom(false);
      // setGameStarted(false);
      // setMyCards([]);
      // setPlayerData([]);
    }
    function onConnectError(err) {
      console.error("[Client] Connection Attempt Error:", err);
      addMessage(`พยายามเชื่อมต่อ Server ไม่สำเร็จ: ${err.message}`, "error");
      setIsConnected(false);
    }

    socketClient.on("connect", onConnect);
    socketClient.on("disconnect", onDisconnect);
    socketClient.on("connect_error", onConnectError);

    socketClient.on("roomCreated", (data) => {
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
      // Server ควรส่ง playersData มาด้วย
      if (data.playersData) setPlayerData(data.playersData);
    });

    socketClient.on("joinedRoom", (data) => {
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
      if (data.roomSettings) { // Server ส่ง roomSettings มาด้วย
          if (typeof data.roomSettings.betAmount === "number") setBetAmount(data.roomSettings.betAmount);
          if (typeof data.roomSettings.locked === "boolean") setRoomLocked(data.roomSettings.locked);
      }
      if (data.playersData) setPlayerData(data.playersData);
    });

    socketClient.on("playersData", (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerId);
      if (me) {
        setIsDealer(me.isDealer);
        if (typeof me.hasStayed === "boolean") {
          setHasStayed(me.hasStayed);
        }
        // ★★★ สมมติว่า handDetails ของผู้เล่นปัจจุบันถูกส่งมาใน playersData ★★★
        // if (me.handDetails) {
        //   setMyHandDetails(me.handDetails);
        // }
      }
    });

    socketClient.on("yourCards", (dataFromServer) => { // server อาจส่ง cards และ handDetails มาพร้อมกัน
      console.log("[Client] Received 'yourCards'. Data:",dataFromServer);
      let cardsToSet = [];
      // let handDetailsToSet = null;

      if (dataFromServer && Array.isArray(dataFromServer.cards)) { // สมมติ server ส่ง { cards: [...], handDetails: {...} }
          cardsToSet = dataFromServer.cards;
          // handDetailsToSet = dataFromServer.handDetails || null;
      } else if (Array.isArray(dataFromServer)) { // ถ้า server ส่งแค่ array ของ cards (แบบเดิม)
          cardsToSet = dataFromServer;
      }

      if (cardsToSet.every(c => typeof c === "object" && c !== null && "value" in c && "suit" in c)) {
        setMyCards(cardsToSet);
      } else {
        console.warn("[Client] 'yourCards' received invalid card data structure:", dataFromServer);
        setMyCards([]);
      }
      // setMyHandDetails(handDetailsToSet); // อัปเดต handDetails ที่ได้จาก server
    });

    socketClient.on("gameStarted", (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "highlight");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      setGameStarted(true);
      setResult([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({});
      // myCards และ myHandDetails ควรจะถูกอัปเดตจาก event 'playersData' หรือ 'yourCards' ที่ server ส่งมาหลังเริ่มเกม
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
      if (turnData.id === myPlayerId) {
        const meInPlayerData = playerData.find((p) => p.id === myPlayerId);
        // ตรวจสอบ hasStayed จาก playerData ที่ server ส่งมาล่าสุดเสมอ
        if (meInPlayerData && !meInPlayerData.hasStayed) {
          setHasStayed(false);
        } else if (meInPlayerData && meInPlayerData.hasStayed) {
          setHasStayed(true);
        }
      }
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
      console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    });

    socketClient.on("lockRoom", (isLockedFromServer) => {
      console.log("[Client] Room lock status from server:", isLockedFromServer);
      setRoomLocked(isLockedFromServer);
      addMessage(isLockedFromServer ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค", "info");
    });

    socketClient.on("result", (roundResultsFromServer) => {
      console.log("[Client] Event 'result' from server:", roundResultsFromServer);
      if (Array.isArray(roundResultsFromServer)) {
        const sortedResults = [...roundResultsFromServer].sort((a, b) => {
          // การเรียงผลลัพธ์สามารถทำได้ตามเดิม หรือปรับปรุงถ้าต้องการ
          const isADealer = a.role === "เจ้ามือ";
          const isBDealer = b.role === "เจ้ามือ";
          if (isADealer && !isBDealer) return -1; // เจ้ามือมาก่อน
          if (!isADealer && isBDealer) return 1;
          if (!isADealer && !isBDealer) { // ถ้าไม่ใช่เจ้ามือทั้งคู่ เรียงตาม role "ขา X"
            const numA = parseInt(a.role?.replace(/[^0-9]/g, ""), 10);
            const numB = parseInt(b.role?.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return 0; // fallback
          }
          return 0;
        });
        setResult(sortedResults);
      } else {
        setResult([]);
      }
      setGameStarted(false); // เกมจบแล้ว
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      // setMyHandDetails(null); // รีเซ็ต hand details ของฉันเมื่อจบรอบ
      setGameRound((prev) => prev + 1);
    });

    socketClient.on("resetGame", () => {
      console.log("[Client] Event 'resetGame'");
      addMessage("เกมถูกรีเซ็ต เตรียมเริ่มรอบใหม่", "info");
      setGameStarted(false);
      setMyCards([]);
      // setMyHandDetails(null);
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
          `${data.role || "ขาไพ่"} (${data.name}) ป๊อก! แสดงไพ่: ${data.cards
            .map(getCardDisplay)
            .join(" ")} (${data.handDetails.type})`,
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
        console.warn("[Client] Received invalid data for player_revealed_pok:", data);
      }
    });

    socketClient.on("gameEnded", (gameSummary) => {
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary);
      setSummaryData(
        gameSummary.map((p) => ({
          ...p,
          isDealer: playerData.find((pd) => pd.id === p.id)?.isDealer || p.role === "เจ้ามือ",
        }))
      );
      setShowSummary(true);
      setGameStarted(false);
      setResult([]);
      setCurrentTurnId(null);
    });

    socketClient.on("errorMessage", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Error จาก Server"), "error")
    );
    socketClient.on("message", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "ข้อความจาก Server"), "info")
    );
    socketClient.on("playerLeft", (data) =>
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`, "info")
    );

    socketClient.on("roomSettings", (settings) => {
      console.log("[Client] Received 'roomSettings'. Data:", settings);
      if (settings && typeof settings.betAmount === "number") {
        addMessage(`ราคาเดิมพันอัปเดตเป็น: ${settings.betAmount}`, "info");
        setBetAmount(settings.betAmount);
        const amIDealer = playerData.find(p => p.id === myPlayerId && p.isDealer);
        if (amIDealer) {
          setInputBetAmount(settings.betAmount.toString());
        }
      }
    });

    return () => {
      if (socketClient) {
        console.log("[Client] Cleaning up socket listeners for:", socketClient.id);
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
        socketClient.off("resetGame");
        socketClient.off("enableShowResult");
        socketClient.off("errorMessage");
        socketClient.off("message");
        socketClient.off("lockRoom");
        socketClient.off("playerLeft");
        socketClient.off("roomSettings");
        socketClient.off("player_revealed_pok");
      }
    };
  }, [myPlayerId, name, roomId, currentTurnId, playerData]); // เพิ่ม playerData ใน dependencies


  useEffect(() => {
    let timer;
    if (gameStarted && currentTurnId === myPlayerId && !hasStayed && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    } else if (gameStarted && currentTurnId === myPlayerId && !hasStayed && countdown === 0) {
      if (socketClient && socketClient.connected) {
        addMessage("หมดเวลา! ทำการ 'อยู่' อัตโนมัติ", "info");
        socketClient.emit("stay", roomId);
        setHasStayed(true); // Optimistic update
      }
    }
    return () => clearTimeout(timer);
  }, [countdown, currentTurnId, hasStayed, myPlayerId, gameStarted, roomId, addMessage]);


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
      } else { // I am the dealer
        summaryData.forEach((player) => {
          if (player.id === myPlayerId) return; // Skip myself
          if (player.netChange > 0) { // Player won from me
            toPayList.push({
              name: player.name,
              role: player.role,
              amount: player.netChange,
            });
          } else if (player.netChange < 0) { // Player lost to me
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
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error"); return;
    }
    const bal = parseInt(money);
    if (!name.trim()) {
      addMessage("กรุณากรอกชื่อของคุณ", "error"); return;
    }
    if (isNaN(bal) || bal < 50 || bal % 10 !== 0) {
      addMessage("จำนวนเงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 50 และต้องลงท้ายด้วย 0 เท่านั้น", "error"); return;
    }
    socketClient.emit("createRoom", { playerName: name, initialBalance: bal });
  };

  const handleJoinRoom = () => {
    if (!socketClient || !isConnected) {
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error"); return;
    }
    const bal = parseInt(money);
    if (!name.trim()) {
      addMessage("กรุณากรอกชื่อของคุณ", "error"); return;
    }
    if (!inputRoomId.trim()) {
      addMessage("กรุณากรอกรหัสห้อง", "error"); return;
    }
    if (isNaN(bal) || bal < 10 || bal % 10 !== 0) { // สำหรับขาไพ่ อาจจะขั้นต่ำน้อยกว่า
      addMessage("จำนวนเงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 10 และต้องลงท้ายด้วย 0 เท่านั้น", "error"); return;
    }
    socketClient.emit("joinRoom", {
      roomId: inputRoomId.trim().toUpperCase(), // Normalize room ID
      playerName: name,
      initialBalance: bal,
    });
  };

  const handleSetBet = () => {
    if (socketClient && isConnected && isDealer && !gameStarted) {
      const amount = parseInt(inputBetAmount);
      if (!isNaN(amount) && amount >= 5 && (amount % 10 === 0 || amount % 5 === 0)) {
        socketClient.emit("setBetAmount", { roomId, amount });
      } else {
        addMessage("จำนวนเงินเดิมพันต้องเป็นตัวเลข, ไม่น้อยกว่า 5 และลงท้ายด้วย 0 หรือ 5", "error");
      }
    }
  };

  const handleToggleLockRoom = () => {
    if (socketClient && isConnected && isDealer && !gameStarted) {
      socketClient.emit("lockRoom", { roomId, lock: !roomLocked });
    }
  };

  const handleCopyRoomId = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId)
      .then(() => addMessage(`คัดลอกเลขห้อง "${roomId}" เรียบร้อยแล้ว`, "success"))
      .catch(err => addMessage("คัดลอกเลขห้องไม่สำเร็จ", "error"));
  };

  const handleStartGame = () => {
    if (socketClient && socketClient.connected && roomId && isDealer) {
      if (betAmount <= 0) {
        addMessage("กรุณากำหนดเงินเดิมพันก่อนเริ่มเกม", "error"); return;
      }
      socketClient.emit("startGame", roomId);
    }
  };

  const handleDrawCard = () => {
    if (socketClient && socketClient.connected && gameStarted && currentTurnId === myPlayerId && !hasStayed && myCards.length < 3) {
      socketClient.emit("drawCard", roomId);
    }
  };

  const handleStay = () => {
    if (socketClient && socketClient.connected && gameStarted && currentTurnId === myPlayerId && !hasStayed) {
      socketClient.emit("stay", roomId);
      setHasStayed(true); // Optimistic update
    }
  };

  const handleShowResult = () => {
    if (socketClient && socketClient.connected && isDealer && gameStarted && showResultBtn) {
      socketClient.emit("showResult", roomId);
    }
  };

  const handleResetGameHandler = () => {
    if (socketClient && socketClient.connected && isDealer && !gameStarted) {
      socketClient.emit("resetGame", roomId);
    }
  };

  const handleEndGame = () => {
    if (socketClient && socketClient.connected && isDealer) {
      socketClient.emit("endGame", roomId);
    }
  };

  const handleExitGame = () => { // This reloads the page, effectively disconnecting and clearing state
    window.location.reload();
  };

  // Function to get card display (can be kept on client for UI)
  const getCardDisplay = (card) => {
    if (card && typeof card.value !== "undefined" && typeof card.suit !== "undefined")
      return `${card.value}${card.suit}`;
    return "?";
  };

  // ★★★ ส่วนนี้จะถูกลบออก Client จะไม่คำนวณ Rank เอง ★★★
  // const calculateRankForDisplay = (cardsToRank) => { ... };

  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);

  // ★★★ แสดง hand type และ score จาก myCurrentPlayerData.handDetails ที่ Server ส่งมา ★★★
  let myHandTypeForDisplay = "ยังไม่มีไพ่";
  let myHandScoreForDisplay = "-";

  if (myCurrentPlayerData && myCurrentPlayerData.handDetails && gameStarted && (!result || result.length === 0) && myCards.length > 0) {
    myHandTypeForDisplay = myCurrentPlayerData.handDetails.type || "รอข้อมูล...";
    myHandScoreForDisplay = (typeof myCurrentPlayerData.handDetails.score === 'number') ? myCurrentPlayerData.handDetails.score.toString() : "-";
  } else if (myCards.length > 0 && gameStarted && (!result || result.length === 0)) {
    // กรณีที่ handDetails ยังไม่มา แต่มีไพ่แล้ว อาจจะแสดงว่ากำลังโหลด
    myHandTypeForDisplay = "กำลังโหลดข้อมูลไพ่...";
  }


  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed;

  // JSX content
  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId);
    return (
      <div className="App-summary">
        <h2>สรุปยอดต้องโอนให้และต้องได้ (ห้อง: {roomId})</h2>
        <h3>ชื่อขาไพ่: {me?.name || name} ({me?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")})</h3>
        <hr />
        {transferSummary.toReceive.length > 0 && (
          <>
            <h3 style={{ color: "green", marginTop: "20px" }}>ยอดที่จะได้รับ:</h3>
            {transferSummary.toReceive.map((item, index) => (
              <p key={`receive-${index}`} style={{ color: "green", marginLeft: "20px" }}>
                - จาก {item.name} ({item.role}): {item.amount.toLocaleString()} บาท
              </p>
            ))}
            <hr />
          </>
        )}
        {transferSummary.toPay.length > 0 && (
          <>
            <h3 style={{ color: "red", marginTop: "20px" }}>ยอดที่ต้องโอน:</h3>
            {transferSummary.toPay.map((item, index) => (
              <p key={`pay-${index}`} style={{ color: "red", marginLeft: "20px" }}>
                - ให้ {item.name} ({item.role}): {item.amount.toLocaleString()} บาท
              </p>
            ))}
            <hr />
          </>
        )}
        {transferSummary.toReceive.length === 0 && transferSummary.toPay.length === 0 && (
          <p style={{ textAlign: "center", marginTop: "20px" }}>ไม่มีรายการได้เสียสำหรับคุณในรอบนี้</p>
        )}
        <h3 style={{ marginTop: "20px" }}>
          ยอดเงินคงเหลือของคุณ:{" "}
          {(me?.finalBalance !== undefined ? me.finalBalance : parseInt(money))?.toLocaleString()} บาท
        </h3>
        {me && (
          <p style={{ fontStyle: "italic", textAlign: "center", color: "#555", marginTop: "10px" }}>
            (ยอดเงินเริ่มต้น: {me.initialBalance?.toLocaleString()} บาท,
            กำไร/ขาดทุนสุทธิ:{" "}
            <span className={me.netChange >= 0 ? "profit" : "loss"}>
              {me.netChange > 0 ? `+${me.netChange?.toLocaleString()}` : me.netChange?.toLocaleString() || "0"} บาท
            </span>)
          </p>
        )}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>ออกจากเกม (เริ่มใหม่)</button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์</h2>
        {errorMsg && <p className="error-message" style={{color: errorMsg.startsWith("เกิดข้อผิดพลาด") || errorMsg.startsWith("พยายามเชื่อมต่อ") ? "red" : "green", border: "1px solid #ccc", padding: "10px", backgroundColor: "#f9f9f9", whiteSpace: "pre-wrap" }}>{errorMsg}</p>}
        ชื่อคุณ: <input type="text" placeholder="กรุณาใส่ชื่อของคุณ" value={name} onChange={(e) => setName(e.target.value)} />
        เงินเริ่มต้น: <input type="number" placeholder="เงินเริ่มต้น (ขั้นต่ำ 50)" value={money} onChange={(e) => setMoney(e.target.value)} min="50" step="10" />
        <div style={{ marginTop: 20 }}>
          <button onClick={handleCreateRoom} disabled={!isConnected || !name.trim() || !money.trim()}>สร้างห้อง</button>
        </div>
        <hr />
        <input type="text" placeholder="รหัสห้อง (ถ้ามี)" value={inputRoomId} onChange={(e) => setInputRoomId(e.target.value.toUpperCase())} />
        <button onClick={handleJoinRoom} disabled={!inputRoomId.trim() || !isConnected || !name.trim() || !money.trim()}>เข้าร่วมห้อง</button>
      </div>
    );
  }

  return (
    <div className="App">
      <header>
        <h1>ห้อง: <button className="text-button2" onClick={handleCopyRoomId} title="คลิกเพื่อคัดลอกรหัสห้อง">{roomId}</button></h1>
        <p>คุณ: {name} {isDealer ? "(เจ้ามือ)" : `(${myCurrentPlayerData?.role || "ขาไพ่"})`} | เงินคงเหลือ: {myCurrentPlayerData?.balance?.toLocaleString() || money}</p>
        <p style={{ color: roomLocked ? "red" : "green" }}>สถานะห้อง: {roomLocked ? "ล็อค" : "เปิด"}</p>
      </header>
      {errorMsg && <p className="error-message" style={{ border: "1px solid #ccc", padding: "10px", backgroundColor: errorMsg.toLowerCase().includes("error") || errorMsg.toLowerCase().includes("ผิดพลาด") ? "#ffdddd" : "#dff0d8", whiteSpace: "pre-wrap", color: errorMsg.toLowerCase().includes("error") || errorMsg.toLowerCase().includes("ผิดพลาด") ? "darkred" : "darkgreen" }}>{errorMsg}</p>}

      {!gameStarted && isDealer && (!result || result.length === 0) && (
        <div className="dealer-controls pre-game">
          <h4>ตั้งค่าเกม (เจ้ามือ): ขั้นต่ำ 5 บาท</h4>
          <div>
            <label>เงินเดิมพัน: </label>
            <input type="number" value={inputBetAmount} onChange={(e) => setInputBetAmount(e.target.value)} step="5" min="5" />
            <button className="btn-inroom-setting" onClick={handleSetBet}>ตั้งค่า</button>
          </div>
          <button className={`btn-inroom-lockgame ${roomLocked ? "locked" : "unlocked"}`} onClick={handleToggleLockRoom}>
            {roomLocked ? "ปลดล็อคห้อง" : "ล็อคห้อง"}
          </button>
          <button className="btn-inroom-start1" onClick={handleStartGame} disabled={betAmount <= 0}>
            {gameRound > 0 || (result && result.length > 0) ? "เริ่มเกมรอบใหม่" : "เริ่มเกม"}
          </button>
        </div>
      )}

      <div className="players-list">
        <h4>ราคาเดิมพันต่อรอบ: {betAmount > 0 ? `${betAmount.toLocaleString()} บาท` : "รอเจ้ามือกำหนด"}</h4>
        <h4>ขาไพ่ในห้อง: ({playerData.length} คน)</h4>
        <ul>
          {playerData.map((user) => (
            <li key={user.id} className={user.id === currentTurnId ? "current-turn-player" : ""}>
              {user.name} ({user.role}) - เงิน: {user.balance?.toLocaleString()} บาท
              {user.id === currentTurnId && currentTurnInfo.timeLeft > 0 && gameStarted && ` (กำลังเล่น... ${currentTurnInfo.timeLeft}วิ)`}
              {/* ★★★ แสดง handDetails.type ของผู้เล่นอื่น (ถ้า server ส่งมาและต้องการแสดง) ★★★ */}
              {user.id !== myPlayerId && gameStarted && user.handDetails && user.handDetails.type && (!result || result.length === 0) && (
                 user.handDetails.type.toLowerCase().includes("ป๊อก") ? <em> (ป๊อกแล้ว!)</em> : (user.hasStayed && <em> (หมอบแล้ว)</em>)
              )}
              {/* แสดงไพ่ป๊อกที่เปิดของผู้เล่นอื่น */}
              {revealedPokPlayers[user.id] && user.id !== myPlayerId && gameStarted && (!result || result.length === 0) && (
                <div className="revealed-pok-cards">
                  <strong>ไพ่ที่ป๊อก:</strong>{" "}
                  {revealedPokPlayers[user.id].cards.map((card, cIdx) => (
                    <span key={cIdx} className="card-display">{getCardDisplay(card)}</span>
                  ))}
                  <em> ({revealedPokPlayers[user.id].handDetails.type})</em>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {gameStarted && myCards && myCards.length > 0 && (!result || result.length === 0) && (
        <div className="my-cards-area">
          <h2>ไพ่ของคุณ: {myCards.map((card, idx) => (<span key={idx} className="card-display">{getCardDisplay(card)} </span>))}</h2>
          {/* ★★★ แสดง myHandTypeForDisplay และ myHandScoreForDisplay ★★★ */}
          <p><h2>{myHandTypeForDisplay} {/* (แต้ม: {myHandScoreForDisplay}) */} </h2></p>
          {isMyTurn && myCards.length >= 2 && !hasStayed && (
            <div className="player-actions">
              <p className="turn-info">ตาของคุณ! เวลา: {countdown} วินาที</p>
              <div className="action-buttons">
                {myCards.length < 3 && (
                  <button onClick={handleDrawCard} disabled={hasStayed || myCards.length >= 3}>จั่ว</button>
                )}
                <button onClick={handleStay} disabled={hasStayed}>อยู่</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* แสดงสถานะตาของผู้เล่นอื่น */}
      {!isDealer && currentTurnId && currentTurnId !== myPlayerId && gameStarted && (!result || result.length === 0) && (
        <p className="turn-indicator"> รอ... ({currentTurnInfo.role}) {currentTurnInfo.name} ({currentTurnInfo.timeLeft} วิ) ⌛ </p>
      )}
      {isDealer && currentTurnId && currentTurnId !== myPlayerId && gameStarted && (!result || result.length === 0) && (
        <p className="turn-indicator"> ขาไพ่ที่ ({currentTurnInfo.role}) {currentTurnInfo.name} กำลังตัดสินใจ ({currentTurnInfo.timeLeft} วิ)... </p>
      )}
      {isDealer && !currentTurnId && gameStarted && showResultBtn && (!result || result.length === 0) && (
        <div className="turn-indicator">
          <button className="btn-inroom-endgame2" onClick={handleShowResult}> เปิดไพ่ดวล </button>
        </div>
      )}
      {isDealer && !currentTurnId && gameStarted && !showResultBtn && (!result || result.length === 0) && (
        <p className="turn-indicator">รอขาไพ่ทุกคนตัดสินใจ...</p>
      )}

      {result && result.length > 0 && (
        <div className="results-display">
          <h3>ผลลัพธ์รอบที่ {gameRound}: (เดิมพัน: {betAmount?.toLocaleString()} บาท)</h3>
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
                <tr key={r.id || i} className={r.id === myPlayerId ? "my-result-row" : r.disconnectedMidGame ? "disconnected-result-row" : ""}>
                  <td>{r.name} ({r.role || "N/A"})</td>
                  <td>{r.cardsDisplay || "N/A"}</td>
                  <td>{typeof r.handScore === 'number' ? r.handScore : r.score}</td> {/* ใช้ handScore ถ้ามี */}
                  <td>{r.handType || r.specialType}</td> {/* ใช้ handType ถ้ามี */}
                  <td>
                    {r.result === "WIN" && "✅ ชนะ"}
                    {r.result === "LOSE" && "❌ แพ้"}
                    {r.result === "TIE" && "🤝 เสมอ"}
                    {r.result === "DEALER" && "เจ้ามือ"}
                    {r.result === "LOSE_DISCONNECTED" && "ขาดการเชื่อมต่อ"}
                    {![ "WIN", "LOSE", "TIE", "DEALER", "LOSE_DISCONNECTED"].includes(r.result) && r.result}
                  </td>
                  <td className={r.payout > 0 ? "profit" : r.payout < 0 ? "loss" : ""}>
                    {r.payout !== 0 ? `${r.payout > 0 ? "+" : ""}${r.payout?.toLocaleString()} บาท` : "-"}
                  </td>
                  <td>{r.moneyAfterRound?.toLocaleString()} บาท</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isDealer && (!gameStarted || (result && result.length > 0)) && !showSummary && (
        <div className="turn-indicator">
          <button className="btn-inroom-restart" onClick={handleResetGameHandler}>รีเซ็ตตา&สับไพ่</button>
          <button className="btn-inroom-result" onClick={handleEndGame}>จบเกม&ดูสรุปยอด</button>
        </div>
      )}
      {!isDealer && result && result.length > 0 && !gameStarted && !showSummary && (
        <p className="btn-inroom-waitinggame"><center>--- รอเจ้ามือเริ่มรอบใหม่ หรือ จบเกม ---</center></p>
      )}

      <div className="turn-indicator">
        <button className="btn-inroom-endgame" onClick={handleExitGame}> ออกจากห้อง </button>
      </div>
      <div className="messages-log">
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>
        <div className="messages-box" ref={messagesEndRef}>
          {messages.map((msg, index) => (
            <p key={index} className={`message-type-${msg.type}`}> {msg.text} </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;