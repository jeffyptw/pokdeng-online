// App.js
import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css"; // สมมติว่ามีไฟล์ CSS สำหรับ Styling

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // สำหรับทดสอบ Local

const socket = io(SERVER_URL, {
  transports: ["websocket"],
  // autoConnect: false, // สามารถตั้งเป็น false แล้วค่อย socket.connect() เมื่อพร้อม
});

const DEFAULT_TURN_DURATION = 30; // วินาที

function App() {
  // --- States for connection and initial setup ---
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [myPlayerId, setMyPlayerId] = useState(null);
  const [name, setName] = useState(""); // User's own name input
  const [money, setMoney] = useState("1000"); // Initial money input
  const [inputRoomId, setInputRoomId] = useState(""); // For join room input

  // --- In-Room states ---
  const [roomId, setRoomId] = useState(""); // Actual Room ID after create/join
  const [inRoom, setInRoom] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [playerData, setPlayerData] = useState([]); // Active players in room {id, name, balance, role, isDealer}
  const [betAmount, setBetAmount] = useState(0);
  const [inputBetAmount, setInputBetAmount] = useState("10");
  const [roomLocked, setRoomLocked] = useState(false);

  // --- Game Play states ---
  const [gameStarted, setGameStarted] = useState(false); // Is a round currently active?
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
  const [result, setResult] = useState([]); // Array of result objects from server for the round
  const [showResultBtn, setShowResultBtn] = useState(false); // For dealer to click 'show result'
  const [gameRound, setGameRound] = useState(0); // Tracks rounds for UI text like "ผลลัพธ์รอบที่ X"
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState([]);

  // --- UI states ---
  const [errorMsg, setErrorMsg] = useState("");
  const [messages, setMessages] = useState([]); // For a log of game events/messages
  const messagesEndRef = useRef(null);

  // Auto-scroll for messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (text, type = "info") => {
    // type can be 'info', 'error', 'success'
    setMessages((prev) => [
      ...prev,
      { text, time: new Date().toLocaleTimeString(), type },
    ]);
    if (type === "error") {
      setErrorMsg(text); // Also show in a more prominent error spot
      setTimeout(() => setErrorMsg(""), 7000);
    }
  };

  // Socket connection and event listeners setup
  useEffect(() => {
    function onConnect() {
      console.log("[Client] Connected to server with ID:", socket.id);
      setMyPlayerId(socket.id);
      setIsConnected(true);
    }
    function onDisconnect() {
      console.log("[Client] Disconnected from server.");
      addMessage("การเชื่อมต่อกับ Server หลุด!", "error");
      setIsConnected(false);
      // Potentially reset all game states or redirect to lobby
      // setInRoom(false); setGameStarted(false); etc.
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // --- Room and Player Setup Events ---
    socket.on("roomCreated", (data) => {
      console.log("[Client] Room Created:", data);
      setRoomId(data.roomId);
      setInRoom(true);
      setIsDealer(true);
      addMessage(
        `ห้อง ${data.roomId} ถูกสร้างโดย ${name || data.dealerName}`,
        "success"
      );
      if (data.betAmount) setBetAmount(data.betAmount);
      if (data.betAmount) setInputBetAmount(data.betAmount.toString());
    });

    socket.on("joinedRoom", (data) => {
      console.log("[Client] Joined Room:", data);
      setRoomId(data.roomId);
      setInRoom(true);
      addMessage(
        `เข้าร่วมห้อง ${data.roomId} สำเร็จ. เจ้ามือ: ${
          data.dealerName || "N/A"
        }`,
        "success"
      );
      if (data.betAmount) setBetAmount(data.betAmount);
      // isDealer will be updated via 'playersData'
    });

    socket.on("playersData", (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerId);
      if (me) setIsDealer(me.isDealer);
    });

    socket.on("roomSettings", (settings) => {
      console.log("[Client] Room Settings:", settings);
      if (typeof settings.betAmount === "number")
        setBetAmount(settings.betAmount);
      if (typeof settings.betAmount === "number")
        setInputBetAmount(settings.betAmount.toString());
    });

    socket.on("lockRoom", (isLocked) => {
      console.log("[Client] Room lock status:", isLocked);
      setRoomLocked(isLocked);
      addMessage(isLocked ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค");
    });

    socket.on("playerLeft", (data) => {
      console.log("[Client] Player Left:", data);
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`);
    });

    // --- Game Play Events ---
    socket.on("gameStarted", (data) => {
      console.log("[Client] Game Started:", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`);
      if (data.betAmount) setBetAmount(data.betAmount);
      setGameStarted(true);
      setResult([]);
      setMyCards([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false); // Hide summary from previous game
    });

    socket.on("yourCards", (cardsFromServer) => {
      console.log(
        "[Client] Received 'yourCards'. Data:",
        JSON.stringify(cardsFromServer)
      );
      if (Array.isArray(cardsFromServer)) {
        setMyCards(cardsFromServer);
      } else {
        console.warn(
          "[Client] 'yourCards' received non-array data:",
          cardsFromServer
        );
        setMyCards([]);
      }
      setHasStayed(false); // Reset for new hand/turn
    });

    socket.on("currentTurn", (turnData) => {
      console.log("[Client] Current Turn:", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name,
        role: turnData.role,
        timeLeft: turnData.timeLeft,
      });
      if (turnData.id === myPlayerId) {
        setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);
        setHasStayed(false); // Critical: reset hasStayed when it becomes my turn with cards
      } else {
        setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);
      }
    });

    socket.on("turnTimerUpdate", (timerData) => {
      if (currentTurnId === timerData.playerId) {
        setCurrentTurnInfo((prev) => ({
          ...prev,
          timeLeft: timerData.timeLeft,
        }));
        if (timerData.playerId === myPlayerId) {
          setCountdown(timerData.timeLeft);
        }
      }
    });

    socket.on("playerAction", (actionData) => {
      addMessage(`${actionData.name}: ${actionData.action}`);
    });

    socket.on("enableShowResult", (canShow) => {
      console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    });

    socket.on("result", (roundResults) => {
      console.log("[Client] Received 'result':", roundResults);
      setResult(roundResults);
      setGameStarted(false); // Round is over
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setGameRound((prev) => prev + 1);
    });

    socket.on("resetGame", () => {
      console.log("[Client] Received 'resetGame'");
      addMessage("เกมถูกรีเซ็ต เตรียมเริ่มรอบใหม่", "info");
      setGameStarted(false);
      setMyCards([]);
      setResult([]);
      setHasStayed(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      // gameRound is managed by showResult or dealer can start a new round
    });

    socket.on("gameEnded", (gameSummary) => {
      console.log("[Client] Game Ended. Summary:", gameSummary);
      setSummaryData(gameSummary);
      setShowSummary(true);
      setGameStarted(false);
      setResult([]); // Clear last round results
      setCurrentTurnId(null);
    });

    // --- Error/Message Handling ---
    socket.on("errorMessage", (msg) => {
      console.error("[Client] Error Message from Server:", msg);
      addMessage(
        msg.text ||
          (typeof msg === "string" ? msg : "เกิดข้อผิดพลาดไม่ทราบสาเหตุ"),
        "error"
      );
    });

    socket.on("message", (msg) => {
      // General info messages from server
      console.log("[Client] Info Message from Server:", msg);
      addMessage(
        msg.text || (typeof msg === "string" ? msg : "ได้รับข้อความจาก Server")
      );
    });

    return () => {
      console.log(
        "[Client] Cleaning up ALL socket listeners for ID:",
        socket.id
      );
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("roomCreated");
      socket.off("joinedRoom");
      socket.off("playersData");
      socket.off("roomSettings");
      socket.off("lockRoom");
      socket.off("playerLeft");
      socket.off("gameStarted");
      socket.off("yourCards");
      socket.off("currentTurn");
      socket.off("turnTimerUpdate");
      socket.off("playerAction");
      socket.off("enableShowResult");
      socket.off("result");
      socket.off("resetGame");
      socket.off("gameEnded");
      socket.off("errorMessage");
      socket.off("message");
    };
  }, [myPlayerId, name, roomId, currentTurnId]); // Dependencies that might affect how listeners are set up or behave internally

  // Countdown timer specific effect
  useEffect(() => {
    let timer;
    if (
      currentTurnId === myPlayerId &&
      countdown > 0 &&
      !hasStayed &&
      myCards.length === 2 &&
      gameStarted
    ) {
      timer = setTimeout(() => {
        setCountdown((c) => Math.max(0, c - 1));
      }, 1000);
    } else if (
      countdown === 0 &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      myCards.length === 2 &&
      gameStarted
    ) {
      if (socket) {
        console.log("[Client] Countdown ended for my turn, auto-staying.");
        socket.emit("stay", roomId);
        setHasStayed(true); // Optimistically set, server will confirm turn change
      }
    }
    return () => clearTimeout(timer);
  }, [
    countdown,
    currentTurnId,
    hasStayed,
    roomId,
    myPlayerId,
    myCards.length,
    gameStarted,
  ]);

  // --- Action Functions ---
  const handleCreateRoom = () => {
    const bal = parseInt(money);
    if (!name.trim()) {
      addMessage("กรุณากรอกชื่อของคุณ", "error");
      return;
    }
    if (bal < 10 || bal % 10 !== 0) {
      addMessage("จำนวนเงินขั้นต่ำ 10 และต้องลงท้ายด้วย 0 เท่านั้น", "error");
      return;
    }
    socket.emit("createRoom", { playerName: name, initialBalance: bal });
  };

  const handleJoinRoom = () => {
    const bal = parseInt(money);
    if (!name.trim()) {
      addMessage("กรุณากรอกชื่อของคุณ", "error");
      return;
    }
    if (!inputRoomId.trim()) {
      addMessage("กรุณากรอกรหัสห้อง", "error");
      return;
    }
    if (bal < 10 || bal % 10 !== 0) {
      addMessage("จำนวนเงินขั้นต่ำ 10 และต้องลงท้ายด้วย 0 เท่านั้น", "error");
      return;
    }
    socket.emit("joinRoom", {
      roomId: inputRoomId.trim(),
      playerName: name,
      initialBalance: bal,
    });
  };

  const handleSetBet = () => {
    if (isDealer && !gameStarted) {
      const amount = parseInt(inputBetAmount);
      if (amount > 0 && amount % 10 === 0) {
        socket.emit("setBetAmount", { roomId, amount });
      } else {
        addMessage("จำนวนเงินเดิมพันต้องมากกว่า 0 และลงท้ายด้วย 0", "error");
      }
    }
  };

  const handleToggleLockRoom = () => {
    if (isDealer && !gameStarted) {
      socket.emit("lockRoom", { roomId, lock: !roomLocked });
    }
  };

  const handleStartGame = () => {
    console.log("[Client] User clicked Start Game for room:", roomId);
    if (roomId && socket && isDealer) {
      socket.emit("startGame", roomId);
    } else {
      addMessage(
        "ไม่สามารถเริ่มเกมได้ (อาจไม่ใช่เจ้ามือ หรือยังไม่ได้เข้าร่วมห้อง)",
        "error"
      );
    }
  };

  const handleDrawCard = () => {
    console.log("[Client] User clicked Draw Card in room:", roomId);
    if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      myCards.length < 3
    ) {
      socket.emit("drawCard", roomId);
      // setHasStayed(true); // Optimistic, but server will confirm with turn change or new cards
    }
  };

  const handleStay = () => {
    console.log("[Client] User clicked Stay in room:", roomId);
    if (gameStarted && currentTurnId === myPlayerId && !hasStayed) {
      socket.emit("stay", roomId);
      setHasStayed(true); // Player has made their decision for this turn
    }
  };

  const handleShowResult = () => {
    console.log("[Client] Dealer clicked Show Result for room:", roomId);
    if (isDealer && gameStarted && showResultBtn) {
      // Ensure game is started but results not yet shown
      socket.emit("showResult", roomId);
    }
  };

  const handleResetGameHandler = () => {
    console.log("[Client] Dealer clicked Reset Game for room:", roomId);
    if (isDealer) {
      socket.emit("resetGame", roomId);
    }
  };

  const handleEndGame = () => {
    console.log("[Client] Dealer clicked End Game for room:", roomId);
    if (isDealer) {
      socket.emit("endGame", roomId);
    }
  };

  const handleExitGame = () => {
    window.location.reload();
  };

  // --- Helper Functions ---
  const getCardDisplay = (card) => {
    if (
      card &&
      typeof card.value !== "undefined" &&
      typeof card.suit !== "undefined"
    ) {
      return `${card.value}${card.suit}`;
    }
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
        type = `สองเด้ง (${calculatedScore} แต้ม)`;
      }
    } else if (cardsToRank.length === 3) {
      const suits = cardsToRank.map((c) => c.suit);
      const sameSuit = suits.every((s) => s === suits[0]);
      // Add more complex 3-card logic for display if needed (ตอง, เรียง, etc.)
      if (sameSuit) type = `สามเด้ง (${calculatedScore} แต้ม)`;
    }
    return { score: calculatedScore, type };
  };

  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);
  const { score: myHandScore, type: myHandType } =
    myCards && myCards.length > 0 && gameStarted
      ? calculateRankForDisplay(myCards)
      : { score: "-", type: "N/A" };

  const isMyTurn = currentTurnId === myPlayerId;

  // --- JSX Rendering ---
  if (showSummary) {
    return (
      <div className="App-summary">
        {" "}
        {/* Added class for potential styling */}
        <h2>สรุปยอดเงินหลังจบเกม (ห้อง: {roomId})</h2>
        <table border="1" cellPadding="5">
          <thead>
            <tr>
              <th>ID</th>
              <th>ชื่อผู้เล่น</th>
              <th>บทบาท</th>
              <th>ยอดเงินเริ่มต้น</th>
              <th>ยอดเงินสุดท้าย</th>
              <th>กำไร/ขาดทุนสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            {summaryData.map((p, i) => (
              <tr key={p.id || i}>
                <td>{p.id?.substring(0, 5)}</td>
                <td>{p.name}</td>
                <td>{p.role}</td>
                <td>{p.initialBalance?.toLocaleString()}</td>
                <td>{p.finalBalance?.toLocaleString()}</td>
                <td
                  className={
                    p.netChange > 0 ? "profit" : p.netChange < 0 ? "loss" : ""
                  }
                >
                  {p.netChange >= 0
                    ? `+${p.netChange?.toLocaleString()}`
                    : p.netChange?.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={handleExitGame}>ออกจากเกม (เริ่มใหม่)</button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์</h2>
        {errorMsg && <p className="error-message">{errorMsg}</p>}
        <input
          type="text"
          placeholder="ชื่อคุณ"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="number"
          placeholder="เงินเริ่มต้น (100, 200..)"
          value={money}
          onChange={(e) => setMoney(e.target.value)}
        />
        <div style={{ marginTop: 20 }}>
          {" "}
          <button onClick={handleCreateRoom}>สร้างห้อง</button>{" "}
        </div>
        <hr />
        <input
          type="text"
          placeholder="รหัสห้อง (ถ้ามี)"
          value={inputRoomId}
          onChange={(e) => setInputRoomId(e.target.value)}
        />
        <button onClick={handleJoinRoom} disabled={!inputRoomId.trim()}>
          เข้าร่วมห้อง
        </button>
      </div>
    );
  }

  // --- In Room View ---
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
      {errorMsg && (
        <p
          className="error-message"
          style={{
            border: "1px solid orange",
            padding: "5px",
            backgroundColor: "#fff3cd",
          }}
        >
          {errorMsg}
        </p>
      )}

      {!gameStarted &&
        isDealer &&
        !result.length && ( // Dealer controls before game starts or after a round if no results yet
          <div className="dealer-controls pre-game">
            <h4>ตั้งค่าเกม (เจ้ามือ):</h4>
            <div>
              <label>เงินเดิมพัน: </label>
              <input
                type="number"
                value={inputBetAmount}
                onChange={(e) => setInputBetAmount(e.target.value)}
                step="10"
                min="10"
              />
              <button onClick={handleSetBet}>ตั้งค่า</button>
            </div>
            <button onClick={handleToggleLockRoom}>
              {roomLocked ? "ปลดล็อคห้อง" : "ล็อคห้อง"}
            </button>
            <button
              onClick={handleStartGame}
              disabled={betAmount <= 0 || (roomLocked && playerData.length < 2)}
            >
              {" "}
              {/* Lock might prevent start if no players */}
              {gameRound > 0 || result.length > 0
                ? "เริ่มเกมรอบใหม่"
                : "เริ่มเกม"}
            </button>
          </div>
        )}

      <div className="players-list">
        <h4>ผู้เล่นในห้อง ({playerData.length} คน):</h4>
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
                ` (กำลังเล่น... ${currentTurnInfo.timeLeft}วิ)`}
            </li>
          ))}
        </ul>
      </div>

      {/* --- My Cards Display --- */}
      {console.log(
        "[Render Check] gameStarted:",
        gameStarted,
        "myCards.length:",
        myCards?.length,
        "result.length:",
        result?.length
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
            {!isDealer && isMyTurn && myCards.length === 2 && !hasStayed && (
              <div className="player-actions">
                <p>ตาของคุณ! เวลา: {countdown} วินาที</p>
                <button onClick={handleDrawCard} disabled={myCards.length >= 3}>
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
            [DEBUG Client] เกมเริ่มแล้ว แต่คุณยังไม่ได้รับไพ่ (myCards:{" "}
            {JSON.stringify(myCards)})
          </p>
        )}

      {/* --- Turn Indicator --- */}
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

      {/* --- Results Display --- */}
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
                <th>เงินใหม่</th>
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
                  <td>{r.name}</td>
                  <td>{r.cardsDisplay || "N/A"}</td>
                  <td>{r.score}</td>
                  <td>{r.specialType}</td>
                  <td
                    className={`outcome-${r.outcome
                      ?.toLowerCase()
                      .replace(/\s+/g, "-")}`}
                  >
                    {r.outcome}
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
                      ? r.moneyChange?.toLocaleString()
                      : "-"}
                  </td>
                  <td>{r.balance?.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Post-Round/Game Controls for Dealer --- */}
      {isDealer &&
        (!gameStarted || result.length > 0) &&
        !showSummary && ( // Show if game not started OR results are shown
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

      {/* Message Log (Optional but Recommended) */}
      <div className="messages-log">
        <h4>ประวัติข้อความ/เหตุการณ์:</h4>
        <div className="messages-box" ref={messagesEndRef}>
          {messages.map((msg, index) => (
            <p key={index} className={`message-type-${msg.type}`}>
              <i>[{msg.time}]</i> {msg.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
