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
    if (type === "error" || type === "success" || type === "info") {
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
    }
    function onDisconnect(reason) {
      console.log("[Client] Disconnected from server. Reason:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
      // อาจจะ reset state อื่นๆ เช่น setInRoom(false), setGameStarted(false)
    }

    socketClient.on("connect", onConnect);
    socketClient.on("disconnect", onDisconnect);

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
    });

    socketClient.on("playersData", (activePlayers) => {
      console.log(
        "[Client] Received 'playersData':",
        JSON.stringify(
          activePlayers.map((p) => ({
            name: p.name,
            role: p.role,
            balance: p.balance,
          }))
        )
      );
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerId);
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
      setHasStayed(false); // Reset for new hand
    });

    socketClient.on("gameStarted", (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "info");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      setGameStarted(true);
      setResult([]);
      // ไม่ต้อง setMyCards([]) ที่นี่ เพราะ Server จะส่ง yourCards มาให้แล้ว หรือเพิ่งส่งไป
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
    });

    socketClient.on("currentTurn", (turnData) => {
      console.log("[Client] Event 'currentTurn':", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name,
        role: turnData.role,
        timeLeft: turnData.timeLeft,
      });
      const newCountdown = turnData.timeLeft || DEFAULT_TURN_DURATION;
      setCountdown(newCountdown);
      if (turnData.id === myPlayerId) {
        setHasStayed(false); // Reset hasStayed when it becomes my turn
      }
    });

    socketClient.on("turnTimerUpdate", (timerData) => {
      // console.log("[Client] Event 'turnTimerUpdate':", timerData); // Frequent log
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

    socketClient.on("enableShowResult", (canShow) => {
      console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    });

    socketClient.on("lockRoom", (isLockedFromServer) => {
      console.log("[Client] Room lock status from server:", isLockedFromServer);
      setRoomLocked(isLockedFromServer);
      addMessage(
        isLockedFromServer
          ? "ห้องถูกล็อคโดยเจ้ามือ"
          : "ห้องถูกปลดล็อคโดยเจ้ามือ"
      );
    });

    socketClient.on("result", (roundResults) => {
      console.log(
        "[Client] Event 'result':",
        JSON.stringify(
          roundResults.map((r) => ({
            name: r.name,
            outcome: r.outcome,
            moneyChange: r.moneyChange,
          }))
        )
      );
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
      addMessage(msg.text || String(msg.message) || String(msg), "error")
    );
    socketClient.on("message", (msg) =>
      addMessage(msg.text || String(msg.message) || String(msg))
    );
    socketClient.on("playerLeft", (data) =>
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`)
    );
    socketClient.on("roomSettings", (settings) => {
      console.log("[Client] Received 'roomSettings'. Data:", settings);
      if (settings && typeof settings.betAmount === "number") {
        addMessage(`ราคาเดิมพันอัปเดตเป็น: ${settings.betAmount} บาท`, "info");
        setBetAmount(settings.betAmount);
        if (isDealer) {
          // isDealer ควรจะถูก set จาก playersData แล้ว
          setInputBetAmount(settings.betAmount.toString());
        }
      }
    });

    return () => {
      console.log(
        "[Client] useEffect cleanup: Removing ALL listeners for socket ID:",
        socketClient?.id
      );
      if (socketClient) {
        socketClient.removeAllListeners(); // ลบ listener ทั้งหมดเมื่อ unmount หรือ dependency เปลี่ยน
        // ไม่จำเป็นต้อง disconnect ที่นี่ ถ้าต้องการให้ socket คงอยู่ตราบเท่าที่ App component ยังอยู่
        // socketClient.disconnect();
      }
    };
  }, [myPlayerId]); // ลด dependencies เหลือ myPlayerId หรือตัวที่จำเป็นจริงๆ เพื่อไม่ให้ re-bind บ่อยเกินไป
  // การใส่ name, roomId, currentTurnId อาจทำให้ re-bind บ่อยถ้าค่าเหล่านี้เปลี่ยน

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
        console.log(
          "[Client] Countdown for my turn ended, auto-staying for room:",
          roomId
        );
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

  // --- Action Functions ---
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
    if (bal < 50 || bal % 10 !== 0) {
      addMessage("จำนวนเงินขั้นต่ำ 50 และต้องลงท้ายด้วย 0 เท่านั้น", "error");
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
    if (bal < 10 || bal % 10 !== 0) {
      addMessage("จำนวนเงินขั้นต่ำ 10 และต้องลงท้ายด้วย 0 เท่านั้น", "error");
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
      if (amount >= 5 && (amount % 10 === 0 || amount % 5 === 0)) {
        // Adjusted condition
        console.log("[Client] Emitting 'setBetAmount' with amount:", amount);
        socketClient.emit("setBetAmount", { roomId, amount });
      } else {
        addMessage(
          "จำนวนเงินเดิมพันต้องไม่น้อยกว่า 5 และลงท้ายด้วย 0 หรือ 5",
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
      .catch((err) => addMessage("คัดลอกไม่สำเร็จ: " + err, "error"));
  };

  const handleStartGame = () => {
    console.log(
      "[Client] Attempting 'startGame'. Socket connected:",
      socketClient?.connected,
      "RoomId:",
      roomId,
      "IsDealer:",
      isDealer
    );
    if (socketClient && isConnected && roomId && isDealer) {
      socketClient.emit("startGame", roomId);
    } else {
      addMessage(
        "ไม่สามารถเริ่มเกมได้ (ตรวจสอบการเชื่อมต่อ, รหัสห้อง, หรือสิทธิ์เจ้ามือ)",
        "error"
      );
    }
  };

  const handleDrawCard = () => {
    if (
      socketClient &&
      isConnected &&
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
      isConnected &&
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
      isConnected &&
      isDealer &&
      (gameStarted || (!gameStarted && result && result.length === 0)) &&
      showResultBtn
    ) {
      // Allow show result even if gameStarted is false but results are expected
      console.log("[Client] Emitting 'showResult' for room:", roomId);
      socketClient.emit("showResult", roomId);
    } else {
      addMessage("ไม่สามารถแสดงผลได้ในขณะนี้", "error");
    }
  };

  const handleResetGameHandler = () => {
    if (socketClient && isConnected && isDealer) {
      console.log("[Client] Emitting 'resetGame' for room:", roomId);
      socketClient.emit("resetGame", roomId);
    }
  };

  const handleEndGame = () => {
    if (socketClient && isConnected && isDealer) {
      console.log("[Client] Emitting 'endGame' for room:", roomId);
      socketClient.emit("endGame", roomId);
    }
  };

  const handleExitGame = () => {
    window.location.reload();
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
      if (sameSuit) type = `สามเด้ง (${calculatedScore} แต้ม)`;
    }
    return { score: calculatedScore, type };
  };

  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);
  let myHandScore = "-";
  let myHandType = "ยังไม่มีไพ่";
  if (
    myCards &&
    myCards.length > 0 &&
    (gameStarted || (result && result.length > 0 && !showSummary))
  ) {
    const rankData = calculateRankForDisplay(myCards); // calculateRankForDisplay ควรมีอยู่
    myHandScore = rankData.score;
    myHandType = rankData.type;
  }
  // isMyTurn จะ true สำหรับทั้งผู้เล่นและเจ้ามือเมื่อถึงตาของพวกเขา และยังไม่ได้ตัดสินใจ
  const isMyTurn =
    currentTurnId === myPlayerId &&
    gameStarted &&
    !hasStayed &&
    myCards.length < 3;
  const canDealerDrawOrStay = isDealer && isMyTurn && myCards.length === 2; // เงื่อนไขเฉพาะสำหรับปุ่มเจ้ามือ
  // --- JSX Rendering ---

  if (showSummary) {
    return (
      <div className="App-summary">
        <h2>สรุปยอดเงินหลังจบเกม (ห้อง: {roomId})</h2>{" "}
        <table border="1" cellPadding="5">
          {" "}
          <thead>
            {" "}
            <tr>
              <th>ID</th> <th>ชื่อผู้เล่น</th>
              <th>บทบาท</th> <th>ยอดเงินเริ่มต้น</th>
              <th>ยอดเงินสุดท้าย</th> <th>กำไร/ขาดทุนสุทธิ</th>{" "}
            </tr>{" "}
          </thead>{" "}
          <tbody>
            {" "}
            {summaryData.map((p, i) => (
              <tr key={p.id || i}>
                <td>{p.id?.substring(0, 5)}</td> <td>{p.name}</td>{" "}
                <td>{p.role}</td>
                <td>{p.initialBalance?.toLocaleString()}</td>{" "}
                <td>{p.finalBalance?.toLocaleString()}</td>{" "}
                <td className={p.netChange >= 0 ? "profit" : "loss"}>
                  {" "}
                  {p.netChange >= 0
                    ? `+${p.netChange?.toLocaleString()}`
                    : p.netChange?.toLocaleString()}{" "}
                </td>{" "}
              </tr>
            ))}{" "}
          </tbody>{" "}
        </table>
        <button onClick={handleExitGame}>ออกจากเกม (เริ่มใหม่)</button>{" "}
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์</h2>{" "}
        {errorMsg && <p className="error-message">{errorMsg}</p>}{" "}
        <p>
          สถานะ:&nbsp;{" "}
          <span
            className={isConnected ? "status-connected" : "status-connecting"}
          >
            {" "}
            {isConnected
              ? "เชื่อมต่อกับเซิฟเวอร์แล้ว"
              : "กำลังเชื่อมต่อกับเซิฟเวอร์..."}{" "}
          </span>{" "}
        </p>{" "}
        <input
          type="text"
          placeholder="ชื่อคุณ"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />{" "}
        <input
          type="number"
          placeholder="เงินเริ่มต้น (ขั้นต่ำ 50)"
          value={money}
          onChange={(e) => setMoney(e.target.value)}
          min="50"
          step="10"
        />{" "}
        <div style={{ marginTop: 20 }}>
          {" "}
          <button
            onClick={handleCreateRoom}
            disabled={!isConnected || !name || !money}
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
          disabled={!inputRoomId.trim() || !isConnected || !name || !money}
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
        <h2>
          ห้อง:&nbsp;{" "}
          <button className="text-button2" onClick={handleCopyRoomId}>
            {roomId}{" "}
          </button>
          <br></br>(ราคาเดิมพันต่อรอบ:{" "}
          {betAmount > 0
            ? `${betAmount.toLocaleString()} บาท`
            : "รอเจ้ามือกำหนด"}
          ){" "}
        </h2>{" "}
        <p>
          คุณ: {name}{" "}
          {isDealer
            ? "(เจ้ามือ)"
            : `(${myCurrentPlayerData?.role || "ผู้เล่น"})`}{" "}
          | ID: {myPlayerId?.substring(0, 5)} | เงิน:{" "}
          {myCurrentPlayerData?.balance?.toLocaleString() || money} |
          ห้อง:&nbsp;{" "}
          <button className="text-button" onClick={handleCopyRoomId}>
            {roomId}{" "}
          </button>{" "}
        </p>{" "}
        <p style={{ color: roomLocked ? "red" : "green" }}>
          สถานะห้อง: {roomLocked ? "ล็อค" : "เปิด"}{" "}
        </p>{" "}
      </header>{" "}
      {errorMsg && (
        <p
          className="error-message"
          style={{
            border: "1px solid orange",

            padding: "5px",

            backgroundColor: "#fff3cd",

            whiteSpace: "pre-wrap",
          }}
        >
          {errorMsg}{" "}
        </p>
      )}{" "}
      {!gameStarted && isDealer && (!result || result.length === 0) && (
        <div className="dealer-controls pre-game">
          <h4>ตั้งค่าเกม (เจ้ามือ):</h4>{" "}
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
          <button onClick={handleToggleLockRoom}>
            {roomLocked ? "ปลดล็อคห้อง" : "ล็อคห้อง"}{" "}
          </button>{" "}
          <button
            onClick={handleStartGame}
            disabled={
              betAmount <= 0 ||
              (roomLocked && playerData.length < 1 && !isDealer)
            }
          >
            {" "}
            {/* Allow start if locked unless no other players*/}{" "}
            {gameRound > 0 || (result && result.length > 0)
              ? "เริ่มเกมรอบใหม่"
              : "เริ่มเกม"}{" "}
          </button>{" "}
        </div>
      )}{" "}
      <div className="players-list">
        <h4>ผู้เล่นในห้อง ({playerData.length} คน):</h4>{" "}
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
            </li>
          ))}{" "}
        </ul>{" "}
      </div>{" "}
      {console.log(
        "[Render Check] gameStarted:",

        gameStarted,

        "myCards.length:",

        myCards?.length,

        "result.length:",

        result?.length,

        "myPlayerId:",

        myPlayerId,

        "isMyTurn:",

        isMyTurn
      )}{" "}
      {gameStarted &&
        myCards &&
        myCards.length > 0 &&
        (!result || result.length === 0) && (
          <div className="my-cards-area">
            <h3>
              ไพ่ของคุณ {isDealer ? "(เจ้ามือ)" : ""}:{" "}
              {myCards.map((card, idx) => (
                <span key={idx}>{getCardDisplay(card)} </span>
              ))}
            </h3>
            <p>
              แต้ม: {myHandScore}, ประเภท: {myHandType}
            </p>

            {/* ปุ่ม Action สำหรับผู้เล่น */}
            {!isDealer && isMyTurn && myCards.length === 2 && !hasStayed && (
              <div className="player-actions">
                <p style={{ color: "blue", fontWeight: "bold" }}>
                  ตาของคุณ! เวลาตัดสินใจ: {countdown} วินาที
                </p>
                <button onClick={handleDrawCard} disabled={myCards.length >= 3}>
                  จั่วไพ่
                </button>
                <button onClick={handleStay}>อยู่ (ไม่จั่ว)</button>
              </div>
            )}

            {/* ปุ่ม Action สำหรับเจ้ามือ (ถ้าต้องการให้เจ้ามือเลือกจั่ว/อยู่เอง) */}
            {isDealer && isMyTurn && myCards.length === 2 && !hasStayed && (
              <div className="player-actions dealer-turn-actions">
                <p style={{ color: "darkred", fontWeight: "bold" }}>
                  ตาเจ้ามือ! เวลาตัดสินใจ: {countdown} วินาที
                </p>
                <button onClick={handleDrawCard} disabled={myCards.length >= 3}>
                  เจ้ามือจั่วไพ่
                </button>
                <button onClick={handleStay}>เจ้ามืออยู่</button>
              </div>
            )}
          </div>
        )}{" "}
      {gameStarted &&
        (!myCards || myCards.length === 0) &&
        (!result || result.length === 0) && (
          <p className="debug-message error">
            [DEBUG Client] {isDealer ? "เจ้ามือ:" : "ผู้เล่น:"} เกมเริ่มแล้ว
            แต่ยังไม่ได้รับไพ่/ไพ่ไม่แสดง. myCards: {JSON.stringify(myCards)}{" "}
          </p>
        )}{" "}
      {!isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            รอ... ({currentTurnInfo.role}) {currentTurnInfo.name} (
            {currentTurnInfo.timeLeft} วิ) ⌛{" "}
          </p>
        )}{" "}
      {isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            ผู้เล่น ({currentTurnInfo.role}) {currentTurnInfo.name}{" "}
            กำลังตัดสินใจ
          </p>
        )}{" "}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        showResultBtn &&
        (!result || result.length === 0) && (
          <button className="show-result-btn" onClick={handleShowResult}>
            เปิดไพ่
          </button>
        )}{" "}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        !showResultBtn &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">รอผู้เล่นทุกคนตัดสินใจ...</p>
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
                <th>ผู้เล่น (บทบาท)</th> <th>ไพ่</th> <th>แต้ม</th>{" "}
                <th>ประเภท</th> <th>ผล</th> <th>ได้/เสีย</th> <th>เงินใหม่</th>{" "}
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
                  <td>{r.name}</td> <td>{r.cardsDisplay || "N/A"}</td>{" "}
                  <td>{r.score}</td> <td>{r.specialType}</td>{" "}
                  <td
                    className={`outcome-${r.outcome

                      ?.toLowerCase()

                      .replace(/\s+/g, "-")

                      .replace(/[()]/g, "")}`}
                  >
                    {r.outcome}{" "}
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
                      ? r.moneyChange?.toLocaleString()
                      : "-"}{" "}
                  </td>
                  <td>{r.balance?.toLocaleString()}</td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
        </div>
      )}{" "}
      {isDealer &&
        (!gameStarted || (result && result.length > 0)) &&
        !showSummary && (
          <div className="post-round-controls">
            {" "}
            <button onClick={handleResetGameHandler}>
              เริ่มรอบใหม่ / รีเซ็ต{" "}
            </button>{" "}
            <button onClick={handleEndGame}>จบเกมทั้งหมด (ดูสรุป)</button>{" "}
          </div>
        )}{" "}
      {!isDealer &&
        result &&
        result.length > 0 &&
        !gameStarted &&
        !showSummary && (
          <p className="turn-indicator">
            --- รอเจ้ามือเริ่มรอบใหม่ หรือ จบเกม ---{" "}
          </p>
        )}{" "}
      <button onClick={handleExitGame} className="exit-button">
        ออกจากห้อง/เกม (โหลดใหม่){" "}
      </button>{" "}
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
