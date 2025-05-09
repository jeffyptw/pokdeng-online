/* eslint-disable no-undef */
// App.js
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css"; // ตรวจสอบว่าคุณมีไฟล์นี้ หรือลบการ import ถ้าไม่ใช้

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001";

// ย้าย socket instance มาไว้นอก component เพื่อไม่ให้ถูกสร้างใหม่ทุกครั้งที่ App re-render
// แต่การจัดการ connect/disconnect จะต้องทำใน useEffect
let socketClient = null; // ใช้ let เพื่อให้ re-assign ได้ถ้าจำเป็น

const DEFAULT_TURN_DURATION = 30;

function App() {
  // --- States for connection and initial setup ---
  const [isConnected, setIsConnected] = useState(false);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [name, setName] = useState("");
  const [money, setMoney] = useState("1000");
  const [inputRoomId, setInputRoomId] = useState("");

  // --- In-Room states ---
  const [roomId, setRoomId] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [playerData, setPlayerData] = useState([]);
  const [betAmount, setBetAmount] = useState(0);
  const [inputBetAmount, setInputBetAmount] = useState("10");
  const [roomLocked, setRoomLocked] = useState(false);

  // --- Game Play states ---
  const [gameStarted, setGameStarted] = useState(false); // <--- ประกาศ state นี้
  const [myCards, setMyCards] = useState([]);
  const [hasStayed, setHasStayed] = useState(false);
  const [currentTurnId, setCurrentTurnId] = useState(null);
  const [currentTurnInfo, setCurrentTurnInfo] = useState({
    name: "",
    role: "",
    timeLeft: 0,
  });
  const [countdown, setCountdown] = useState(DEFAULT_TURN_DURATION);

  // --- Result and Summary states ---
  const [result, setResult] = useState([]);
  const [showResultBtn, setShowResultBtn] = useState(false);
  const [gameRound, setGameRound] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState([]);

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
    if (type === "error") {
      setErrorMsg(text);
      setTimeout(() => setErrorMsg(""), 7000);
    } else if (type === "info" || type === "success") {
      setErrorMsg(text); // Show general messages briefly in error spot
      setTimeout(
        () => setErrorMsg((current) => (current === text ? "" : current)),
        5000
      );
    }
  };

  // Socket connection and event listeners setup
  useEffect(() => {
    // สร้าง socket instance เมื่อ component mount และยังไม่มี instance
    if (!socketClient) {
      console.log("[Client] Initializing new socket connection to", SERVER_URL);
      socketClient = io(SERVER_URL, { transports: ["websocket"] });
    }

    function onConnect() {
      console.log("[Client] Connected to server with ID:", socketClient.id);
      setMyPlayerId(socketClient.id);
      setIsConnected(true);
    }
    function onDisconnect(reason) {
      console.log("[Client] Disconnected from server. Reason:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
      // Reset states if needed, e.g., force out of room
      // setInRoom(false); setGameStarted(false); etc.
    }

    // ผูก event listeners กับ socketClient instance ปัจจุบัน
    socketClient.on("connect", onConnect);
    socketClient.on("disconnect", onDisconnect);

    // ... (listeners อื่นๆ ที่เคยมี ก็ผูกกับ socketClient ทั้งหมด) ...
    socketClient.on("roomCreated", (data) => {
      /* ... */
    });
    socketClient.on("joinedRoom", (data) => {
      /* ... */
    });
    socketClient.on("playersData", (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerId); // Use myPlayerId state
      if (me) setIsDealer(me.isDealer);
    });
    socketClient.on("yourCards", (cardsFromServer) => {
      console.log(
        `[Client ${
          myPlayerId || socketClient?.id
        }] Received 'yourCards'. Data:`,
        JSON.stringify(cardsFromServer)
      );
      if (Array.isArray(cardsFromServer)) {
        setMyCards(cardsFromServer);
      } else {
        console.warn(
          "[Client] 'yourCards' received non-array or invalid data:",
          cardsFromServer
        );
        setMyCards([]);
      }
      setHasStayed(false);
    });
    socketClient.on("gameStarted", (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "info");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      setGameStarted(true); // <--- ตั้งค่า gameStarted
      setResult([]);
      setMyCards([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
    });
    // ... (ใส่ listeners ที่เหลือทั้งหมด เช่น currentTurn, result, gameEnded, etc. โดยใช้ socketClient.on) ...
    socketClient.on("currentTurn", (turnData) => {
      /* ... */
    });
    socketClient.on("turnTimerUpdate", (timerData) => {
      /* ... */
    });
    socketClient.on("result", (roundResults) => {
      /* ... setResult(roundResults); setGameStarted(false); ... */
    });
    socketClient.on("gameEnded", (gameSummary) => {
      /* ... setSummaryData(gameSummary); setShowSummary(true); setGameStarted(false); ... */
    });
    socketClient.on("resetGame", () => {
      /* ... setGameStarted(false); ... */
    });
    socketClient.on("enableShowResult", (canShow) => setShowResultBtn(canShow));
    socketClient.on("errorMessage", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Error"), "error")
    );
    หsocket.on("message", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Message"))
    );
    socket.on("lockRoom", (isLocked) => setRoomLocked(isLocked));
    socket.on("playerLeft", (data) =>
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`)
    );

    return () => {
      console.log(
        "[Client] useEffect cleanup: Removing listeners for socket ID:",
        socketClient?.id
      );
      // ไม่ควร disconnect socketClient ที่นี่ ถ้าต้องการให้คงการเชื่อมต่อระหว่าง re-render อื่นๆ
      // เว้นแต่ component จะ unmount จริงๆ ซึ่งสำหรับ App component หลักมักจะไม่เกิดขึ้น
      // การ off listeners สำคัญกว่า
      if (socketClient) {
        socketClient.off("connect", onConnect);
        socketClient.off("disconnect", onDisconnect);
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
      }
    };
    // }, [myPlayerId, name, roomId, currentTurnId]); // อาจจะต้องปรับ dependencies
    // ถ้า socketClient เป็น const นอก useEffect, การใส่ myPlayerId ก็พอสำหรับการ re-check บางอย่าง
  }, [myPlayerId]); // ลด dependencies ให้น้อยที่สุดเท่าที่จำเป็น หรือถ้ามีการใช้ state อื่นๆ ในการ setup listener ก็ใส่เพิ่ม

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      myCards.length === 2 &&
      !hasStayed &&
      countdown > 0
    ) {
      timer = setTimeout(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);
    } else if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      myCards.length === 2 &&
      !hasStayed &&
      countdown === 0
    ) {
      if (socketClient && socketClient.connected) {
        // ตรวจสอบ socketClient
        console.log("[Client] Countdown for my turn ended, auto-staying.");
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
  ]);

  // --- Action Functions (ใช้ socketClient แทน socket) ---
  const handleCreateRoom = () => {
    if (!socketClient || !isConnected) {
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error");
      return;
    }
    // ... (โค้ดเดิม)
    socketClient.emit("createRoom", {
      playerName: name,
      initialBalance: parseInt(money),
    });
  };
  const handleJoinRoom = () => {
    if (!socketClient || !isConnected) {
      addMessage("ยังไม่ได้เชื่อมต่อกับ Server", "error");
      return;
    }
    // ... (โค้ดเดิม)
    socketClient.emit("joinRoom", {
      roomId: inputRoomId.trim(),
      playerName: name,
      initialBalance: parseInt(money),
    });
  };
  const handleStartGame = () => {
    console.log(
      "[Client] Attempting 'startGame'. Socket connected:",
      socketClient?.connected,
      "RoomId:",
      roomId
    );
    if (socketClient && socketClient.connected && roomId && isDealer) {
      socketClient.emit("startGame", roomId);
    } else {
      addMessage(
        "ไม่สามารถเริ่มเกมได้ (ตรวจสอบการเชื่อมต่อ, รหัสห้อง, หรือสิทธิ์เจ้ามือ)",
        "error"
      );
    }
  };
  // ... (แก้ไข Action Functions อื่นๆ ให้ใช้ socketClient และตรวจสอบ isConnected)
  const handleDrawCard = () => {
    if (
      socketClient &&
      socketClient.connected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      myCards.length < 3
    ) {
      socketClient.emit("drawCard", roomId);
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
      socketClient.emit("stay", roomId);
      setHasStayed(true);
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
      socketClient.emit("showResult", roomId);
    }
  };
  const handleResetGameHandler = () => {
    if (socketClient && socketClient.connected && isDealer) {
      socketClient.emit("resetGame", roomId);
    }
  };
  const handleEndGame = () => {
    if (socketClient && socketClient.connected && isDealer) {
      socketClient.emit("endGame", roomId);
    }
  };
  const handleSetBet = () => {
    if (socketClient && socketClient.connected && isDealer && !gameStarted) {
      const amount = parseInt(inputBetAmount);
      if (amount > 0 && amount % 10 === 0) {
        socketClient.emit("setBetAmount", { roomId, amount });
      } else {
        addMessage("จำนวนเงินเดิมพันต้องมากกว่า 0 และลงท้ายด้วย 0", "error");
      }
    }
  };
  const handleToggleLockRoom = () => {
    if (socketClient && socketClient.connected && isDealer && !gameStarted) {
      socketClient.emit("lockRoom", { roomId, lock: !roomLocked });
    }
  };

  // ... (Helper functions: getCardDisplay, getCardPoint, calculateRankForDisplay) ...
  // (ควรใช้โค้ดเต็มจากที่ผมให้ไปก่อนหน้าสำหรับส่วนเหล่านี้)
  const getCardDisplay = (card) => {
    /* ... */
  };
  const getCardPoint = (v) => {
    /* ... */
  };
  const calculateRankForDisplay = (cardsToRank) => {
    /* ... */
  };

  // --- JSX Rendering ---
  // (ใช้ JSX ที่สมบูรณ์จากตัวอย่างก่อนหน้าของผม ที่มีการแสดงผล Lobby, InRoom, Results, Summary)
  // (ผมจะยกมาเฉพาะส่วนแสดงไพ่ และส่วน Debug Log ที่สำคัญ)

  let myHandScore = "-";
  let myHandType = "ยังไม่มีไพ่";
  if (myCards && myCards.length > 0 && gameStarted) {
    // คำนวณเมื่อมีไพ่และเกมเริ่มแล้ว
    const rankData = calculateRankForDisplay(myCards);
    myHandScore = rankData.score;
    myHandType = rankData.type;
  }
  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed; // ปรับเงื่อนไข isMyTurn
  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);

  if (showSummary) {
    // ... (JSX สำหรับ Summary view)
    return <div>สรุปผลเกม... (นำ JSX เต็มมาใส่)</div>;
  }

  if (!inRoom) {
    // ... (JSX สำหรับ Lobby view)
    return <div>Lobby... (นำ JSX เต็มมาใส่)</div>;
  }

  return (
    <div className="App">
      <header>
        <h2>
          ห้อง: {roomId} (เดิมพัน:{" "}
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
          {myCurrentPlayerData?.balance?.toLocaleString() || money}
        </p>
        <p style={{ color: roomLocked ? "red" : "green" }}>
          สถานะห้อง: {roomLocked ? "ล็อค" : "เปิด"}
        </p>
      </header>
      {errorMsg && <p className="error-message">{errorMsg}</p>}

      {/* ... (ส่วน Dealer Controls, Players List จาก JSX เต็ม) ... */}

      {/* --- ส่วนแสดงไพ่ของผู้เล่นปัจจุบัน --- */}
      {console.log(
        "[Render Check] gameStarted:",
        gameStarted,
        "myCards.length:",
        myCards?.length,
        "result.length:",
        result?.length,
        "myPlayerId:",
        myPlayerId
      )}
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
            {!isDealer &&
              isMyTurn &&
              myCards.length === 2 &&
              !hasStayed && ( // เงื่อนไขปุ่มจั่ว/อยู่
                <div className="player-actions">
                  <p>ตาของคุณ! เวลา: {countdown} วินาที</p>
                  <button
                    onClick={handleDrawCard}
                    disabled={myCards.length >= 3}
                  >
                    จั่ว
                  </button>
                  <button onClick={handleStay}>อยู่</button>
                </div>
              )}
          </div>
        )}
      {gameStarted &&
        (!myCards || myCards.length === 0) &&
        (!result || result.length === 0) &&
        !isDealer && (
          <p className="debug-message error">
            [DEBUG Client] เกมเริ่มแล้ว แต่คุณยังไม่ได้รับไพ่. myCards:{" "}
            {JSON.stringify(myCards)}
          </p>
        )}
      {gameStarted &&
        (!myCards || myCards.length === 0) &&
        (!result || result.length === 0) &&
        isDealer && (
          <p className="debug-message info">
            [DEBUG Client - Dealer] เกมเริ่มแล้ว, รอไพ่. myCards:{" "}
            {JSON.stringify(myCards)}
          </p>
        )}

      {/* ... (ส่วน Turn Indicator, Results Table, Post-Round Controls, Exit Button, Messages Log จาก JSX เต็ม) ... */}
      <div className="messages-log">
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>
        <div className="messages-box" ref={messagesEndRef}>
          {messages.map((msg, index) => (
            <p key={index} className={`message-type-${msg.type}`}>
              {" "}
              {msg.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
