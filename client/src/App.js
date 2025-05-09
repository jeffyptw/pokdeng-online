import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";

// --- ใช้ URL ของ Server ของคุณ ---
// const SERVER_URL = 'http://localhost:3001';
const SERVER_URL = "https://pokdeng-online-th.onrender.com"; // ตามที่คุณให้มา

const socket = io(SERVER_URL, {
  transports: ["websocket"],
});

function App() {
  // States from your provided code
  const [name, setName] = useState(""); // User's own name input
  const [roomId, setRoomId] = useState(""); // Current Room ID input/display
  const [money, setMoney] = useState(""); // Initial money input
  const [inRoom, setInRoom] = useState(false); // Is the player in a room?
  // const [players, setPlayers] = useState([]); // Your old playersList (string array), replaced by playerData for richer info
  const [myCards, setMyCards] = useState([]);
  const [hasStayed, setHasStayed] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [result, setResult] = useState([]); // Round results from server
  const [errorMsg, setErrorMsg] = useState("");
  const [roomLocked, setRoomLocked] = useState(false); // From server
  const [showSummary, setShowSummary] = useState(false); // To show end-game summary view
  const [summaryData, setSummaryData] = useState([]); // End-game summary data from server
  const [showResultBtn, setShowResultBtn] = useState(false); // For dealer to click 'show result'
  const [gameRound, setGameRound] = useState(0); // To track game rounds, affects "Start Game" button text
  const [currentTurnId, setCurrentTurnId] = useState(null); // ID of player whose turn it is
  const [countdown, setCountdown] = useState(15); // Timer for current turn
  const [startClicked, setStartClicked] = useState(false); // If dealer clicked start

  // States adapted from my previous more detailed App.js or needed for functionality
  const [myPlayerId, setMyPlayerId] = useState(null); // Player's own socket ID
  const [playerData, setPlayerData] = useState([]); // Array of player objects {id, name, balance, role, isDealer} from server
  const [currentTurnInfo, setCurrentTurnInfo] = useState({
    name: "",
    role: "",
    timeLeft: 0,
  }); // More detailed turn info
  const [betAmount, setBetAmount] = useState(0); // Current bet amount for the room, from server
  const [inputBetAmount, setInputBetAmount] = useState("10"); // For dealer to set bet amount

  const messagesEndRef = useRef(null); // For auto-scrolling messages if you add a log

  // Countdown timer effect from your code
  useEffect(() => {
    if (
      currentTurnId === myPlayerId &&
      countdown > 0 &&
      !hasStayed &&
      myCards.length === 2
    ) {
      const timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
    if (
      countdown === 0 &&
      !hasStayed &&
      currentTurnId === myPlayerId &&
      myCards.length === 2
    ) {
      socket.emit("stay", { roomId });
      setHasStayed(true); // Player auto-stays
      setCountdown(15); // Reset for clarity, though turn will change
    }
  }, [countdown, currentTurnId, hasStayed, roomId, myPlayerId, myCards.length]);

  // Socket event listeners
  useEffect(() => {
    socket.on("connect", () => {
      setMyPlayerId(socket.id);
      console.log("Connected to server with ID:", socket.id);
    });

    socket.on("roomCreated", (data) => {
      setRoomId(data.roomId);
      setInRoom(true);
      setIsDealer(true); // Creator is dealer
      // name state is already set from input by user
      setErrorMsg(`ห้อง ${data.roomId} ถูกสร้างโดย ${name || data.dealerName}`); // Use input name or server name
      if (data.betAmount) setBetAmount(data.betAmount);
    });

    socket.on("joinedRoom", (data) => {
      setRoomId(data.roomId);
      setInRoom(true);
      // isDealer will be set via playersData
      setErrorMsg(`เข้าร่วมห้อง ${data.roomId} สำเร็จ`);
      if (data.betAmount) setBetAmount(data.betAmount);
      const dealer = data.players.find((p) => p.isDealer);
      if (dealer) setErrorMsg((prev) => prev + ` เจ้ามือ: ${dealer.name}`);
    });

    socket.on("playersData", (activePlayers) => {
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerId);
      if (me) {
        setIsDealer(me.isDealer);
        // Update own balance display if needed, though summaryData is better for final
      }
    });

    socket.on("yourCards", (dataFromServer) => {
      // เปลี่ยนชื่อ parameter เพื่อความชัดเจน
      // --- เพิ่ม Console Log เพื่อตรวจสอบ ---
      console.log(
        "[Client] Received 'yourCards' event. Data from server:",
        JSON.stringify(dataFromServer)
      );

      if (Array.isArray(dataFromServer)) {
        // Server ควรจะส่ง array ของไพ่มาโดยตรง
        console.log("[Client] Setting myCards with array:", dataFromServer);
        setMyCards(dataFromServer);
      } else if (dataFromServer && Array.isArray(dataFromServer.cards)) {
        // กรณี Server ส่ง object {cards: [...]} (สำรองไว้)
        console.log(
          "[Client] Setting myCards from dataFromServer.cards:",
          dataFromServer.cards
        );
        setMyCards(dataFromServer.cards);
      } else {
        console.warn(
          "[Client] 'yourCards' received invalid data format or empty. Data:",
          dataFromServer
        );
        setMyCards([]); // ตั้งเป็น array ว่างถ้าข้อมูลไม่ถูกต้อง
      }

      setHasStayed(false);
    });

    socket.on("resetGame", () => {
      setHasStayed(false);
      setResult([]);
      setErrorMsg("เกมถูกรีเซ็ต เตรียมเริ่มรอบใหม่");
      setMyCards([]);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setStartClicked(false); // Allow dealer to click start again
      // gameRound might be incremented by showResult, or reset here if desired
    });

    // This replaces your 'playersList' and 'usersInRoom'
    // socket.on("playersData", (currentPlayersData) => { // Combined into one above
    //   setPlayerData(currentPlayersData);
    //   const me = currentPlayersData.find((p) => p.id === myPlayerId);
    //   if (me) {
    //     setIsDealer(me.isDealer);
    //   }
    // });

    socket.on("result", (roundResults) => {
      // Server sends the full result array
      setResult(roundResults);
      setShowSummary(false); // Hide summary if it was shown
      // setShowStartAgain(true) // Your old logic, handled by startClicked and gameRound now
      setCurrentTurnId(null); // Clear current turn
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false); // Result is shown, hide button
      setStartClicked(false); // Game round ended, dealer can start new one
    });

    socket.on("errorMessage", (msg) => {
      // msg can be string or {text: "..."}
      if (typeof msg === "string") setErrorMsg(msg);
      else if (msg && msg.text) setErrorMsg(msg.text);
      else setErrorMsg("เกิดข้อผิดพลาดไม่ทราบสาเหตุ");
      setTimeout(() => setErrorMsg(""), 7000); // Clear error after 7 seconds
    });

    socket.on("message", (msg) => {
      // For general messages
      setErrorMsg(msg.text); // Display in errorMsg for now, or create a separate message log
      setTimeout(() => setErrorMsg(""), 5000);
    });

    socket.on("lockRoom", (isLocked) => setRoomLocked(isLocked)); // Server sends boolean

    socket.on("gameStarted", (data) => {
      setErrorMsg(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`);
      setBetAmount(data.betAmount);
      setResult([]); // Clear previous results
      setMyCards([]); // Clear cards, server will send new ones
      setHasStayed(false);
      setShowResultBtn(false);
      setStartClicked(true); // Mark that game has been started by dealer
      // setGameRound might be handled elsewhere or not needed if startClicked is used
    });

    socket.on("roomSettings", (settings) => {
      // For bet amount updates etc.
      if (settings.betAmount) setBetAmount(settings.betAmount);
    });

    socket.on("gameEnded", (gameSummary) => {
      // Server sends final summary data
      setSummaryData(gameSummary); // This is the array of {name, initialBalance, finalBalance, netChange}
      setShowSummary(true);
      setMyCards([]);
      setHasStayed(false);
      setRoomLocked(false); // Room might unlock on game end
      setResult([]); // Clear round results
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      // setIsGameEnded(true) // Your old state, showSummary handles this view
    });

    // socket.on("summaryData", (data) => { // Integrated into 'gameEnded' from my server
    //   setSummaryData(data);
    //   setShowSummary(true);
    // });

    socket.on("currentTurn", (turnData) => {
      // turnData = { id, name, role, timeLeft }
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name,
        role: turnData.role,
        timeLeft: turnData.timeLeft,
      });
      if (turnData.id === myPlayerId) {
        setCountdown(turnData.timeLeft || 15); // Use server's timeLeft or default
        // setHasStayed(false); // Moved to yourCards to reset only when cards are dealt
      }
    });

    socket.on("turnTimerUpdate", (timerData) => {
      // timerData = { playerId, timeLeft }
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

    socket.on("enableShowResult", () => setShowResultBtn(true));

    socket.on("playerLeft", (data) => {
      setErrorMsg(`${data.name} ${data.message || "ออกจากห้อง"}`);
    });

    return () => {
      socket.off("connect");
      socket.off("roomCreated");
      socket.off("joinedRoom");
      socket.off("playersData");
      socket.off("yourCards");
      socket.off("resetGame");
      socket.off("result");
      socket.off("errorMessage");
      socket.off("message");
      socket.off("lockRoom");
      socket.off("gameStarted");
      socket.off("roomSettings");
      socket.off("gameEnded");
      // socket.off("summaryData"); // Was part of gameEnded
      socket.off("currentTurn");
      socket.off("turnTimerUpdate");
      socket.off("enableShowResult");
      socket.off("playerLeft");
    };
  }, [myPlayerId, name, roomId]); // Added dependencies

  // --- Action Functions ---
  const createRoom = () => {
    const bal = parseInt(money);
    if (!name.trim()) {
      alert("กรุณากรอกชื่อของคุณ");
      return;
    }
    if (bal < 100 || bal % 10 !== 0) {
      alert("จำนวนเงินขั้นต่ำ 100 และต้องลงท้ายด้วย 0 เท่านั้น");
      return;
    }
    // Server side will generate roomId and send it back in 'roomCreated'
    socket.emit("createRoom", { playerName: name, initialBalance: bal });
  };

  const joinRoom = () => {
    const bal = parseInt(money);
    if (!name.trim()) {
      alert("กรุณากรอกชื่อของคุณ");
      return;
    }
    if (!roomId.trim()) {
      alert("กรุณากรอกรหัสห้อง");
      return;
    }
    if (bal < 100 || bal % 10 !== 0) {
      alert("จำนวนเงินขั้นต่ำ 100 และต้องลงท้ายด้วย 0 เท่านั้น");
      return;
    }
    socket.emit(
      "joinRoom",
      { roomId, playerName: name, initialBalance: bal },
      (res) => {
        if (res && res.success === false) {
          // Check for explicit false if server sends success property
          alert(
            res.message ||
              "ไม่สามารถเข้าห้องได้ (อาจเต็ม, ล็อค, หรือไม่มีห้องนี้)"
          );
        } else if (!res) {
          // Assume success if no response object or no success property (older servers)
          // Client will transition based on 'joinedRoom' event
        }
      }
    );
  };

  const handleSetBet = () => {
    if (isDealer && !startClicked) {
      // Can set bet before game starts
      const amount = parseInt(inputBetAmount);
      if (amount > 0 && amount % 10 === 0) {
        socket.emit("setBetAmount", { roomId, amount });
      } else {
        alert("จำนวนเงินเดิมพันต้องมากกว่า 0 และลงท้ายด้วย 0");
      }
    }
  };

  const handleToggleLockRoom = () => {
    if (isDealer && !startClicked) {
      // Can lock/unlock before game starts
      socket.emit("lockRoom", { roomId, lock: !roomLocked });
    }
  };

  // ใน App.js

  const startGame = () => {
    console.log("[Client] Attempting to start game for room:", roomId); // เพิ่ม console.log เพื่อ debug
    if (roomId && socket) {
      // ตรวจสอบว่ามี roomId และ socket ก่อน emit
      socket.emit("startGame", roomId); // <--- แก้ไขตรงนี้: ส่ง roomId เป็น string โดยตรง
    } else {
      console.error("[Client] Cannot start game: roomId or socket is missing.");
      // อาจจะแสดงข้อความแจ้งเตือนผู้ใช้
    }
    // ไม่ควรตั้งค่า state ของ client (เช่น startClicked, showResultBtn) ที่นี่ทันที
    // ควรให้ client รอรับ event "gameStarted" จาก server แล้วค่อยอัปเดต state
  };

  const drawCard = () => {
    socket.emit("drawCard", { roomId });
    setHasStayed(true); // Assume action taken, server confirms with new cards or turn change
  };

  const stay = () => {
    socket.emit("stay", { roomId });
    setHasStayed(true); // Assume action taken
  };

  const showResult = () => {
    // Dealer action
    socket.emit("showResult", { roomId });
    setGameRound((prev) => prev + 1); // Your logic for gameRound
    // setShowResultBtn(false); // Handled by 'result' event
  };

  const endGame = () => {
    // Dealer action to end the entire game session
    socket.emit("endGame", { roomId }); // Server will emit 'gameEnded' with summary
  };

  const resetGameHandler = () => {
    // Dealer action to reset for a new round
    if (isDealer) {
      socket.emit("resetGame", roomId);
    }
  };

  const exitGame = () => window.location.reload();

  // --- Helper Functions ---
  const getCardDisplay = (card) => {
    // --- เพิ่มการตรวจสอบ card object และ properties ---
    if (
      card &&
      typeof card.value !== "undefined" &&
      typeof card.suit !== "undefined"
    ) {
      return `${card.value}${card.suit}`;
    }
    // --- แสดงข้อความผิดพลาดหรือค่า default ถ้า card object ไม่ถูกต้อง ---
    console.warn("[Client] getCardDisplay received invalid card object:", card);
    return "ไพ่? "; // หรือ return null; หรือ return ''; เพื่อไม่แสดงอะไรเลย
  };

  const getCardPoint = (v) =>
    ["J", "Q", "K"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v);

  const calculateRank = (cards) => {
    if (!cards || cards.length === 0) return { score: 0, type: "ไม่มีไพ่" };
    const score = cards.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
    let type = `${score} แต้ม`; // Default type

    // Basic Pok Deng logic (can be expanded as in your original)
    if (cards.length === 2) {
      const isPok = score === 8 || score === 9;
      // Simple check for "Deng" (same suit or same value)
      const isDeng =
        cards[0].suit === cards[1].suit || cards[0].value === cards[1].value;
      if (isPok) {
        type = `ป๊อก ${score}`;
        if (isDeng) type += " สองเด้ง";
      } else if (isDeng) {
        type = `สองเด้ง (${score} แต้ม)`;
      }
    } else if (cards.length === 3) {
      const suits = cards.map((c) => c.suit);
      const sameSuit = suits.every((s) => s === suits[0]);
      // Add checks for Tong, Straight, Straight Flush, Three of a Kind (เซียน) etc.
      // For simplicity, just showing 3-card deng here
      if (sameSuit) {
        type = `สามเด้ง (${score} แต้ม)`;
      }
    }
    return { score, type };
  };

  const myCurrentData = playerData.find((p) => p.id === myPlayerId);

  // Summarize transactions from your original code (can be used with summaryData from server)
  const summarizeTransactions = (playerSummaryData) => {
    // This function now expects 'playerSummaryData' to be an object like:
    // { name: "PlayerX", balance: 1200, net: 200, incomeDetails: [{from: "PlayerY", amount: 50}], expenseDetails: [{to: "PlayerZ", amount: 30}] }
    // The server would need to provide incomeDetails and expenseDetails if you want this level of "who pays whom" breakdown.
    // For now, let's assume the server's `summaryData` contains {name, balance, net}.
    // If your server's `summaryData` is just {name, initialBalance, finalBalance, netChange},
    // then `incomeDetails` and `expenseDetails` would need to be calculated client-side based on all round results, which is complex.
    // The `server.js` I provided sends `player.incomeTransactions` and `player.expenseTransactions` in the `gameEnded` summary, which can be used here.

    if (!playerSummaryData || !playerSummaryData.name) {
      return { finalIncome: [], finalExpense: [] };
    }

    const incomeMap = {};
    const expenseMap = {};

    if (playerSummaryData.incomeTransactions) {
      playerSummaryData.incomeTransactions.forEach((entry) => {
        incomeMap[entry.fromPlayerName] =
          (incomeMap[entry.fromPlayerName] || 0) + entry.amount;
      });
    }

    if (playerSummaryData.expenseTransactions) {
      playerSummaryData.expenseTransactions.forEach((entry) => {
        expenseMap[entry.toPlayerName] =
          (expenseMap[entry.toPlayerName] || 0) + entry.amount;
      });
    }

    const allNames = new Set([
      ...Object.keys(incomeMap),
      ...Object.keys(expenseMap),
    ]);
    const finalIncome = [];
    const finalExpense = [];

    allNames.forEach((person) => {
      const get = incomeMap[person] || 0;
      const give = expenseMap[person] || 0;
      // This logic simplifies net amounts, not gross per transaction for "who pays whom exactly"
      // For a true "who pays whom", you'd list each transaction or sum per person.
      if (get > give) finalIncome.push({ name: person, amount: get - give });
      else if (give > get)
        finalExpense.push({ name: person, amount: give - get });
    });
    return { finalIncome, finalExpense };
  };

  // --- JSX Rendering ---
  if (showSummary) {
    // Find 'me' in summaryData (which comes from server's 'gameEnded' event)
    const meInSummary = summaryData.find(
      (p) => p.id === myPlayerId || p.name.startsWith(name)
    );
    const { finalIncome, finalExpense } = meInSummary
      ? summarizeTransactions(meInSummary) // Pass the specific player's summary object
      : { finalIncome: [], finalExpense: [] };

    return (
      <div style={{ padding: 20, fontFamily: "sans-serif" }}>
        <h2>สรุปยอดเงินหลังจบเกม (ห้อง: {roomId})</h2>
        <table
          border="1"
          cellPadding="5"
          style={{
            borderCollapse: "collapse",
            width: "auto",
            marginBottom: 20,
          }}
        >
          <thead>
            <tr>
              <th>ลำดับ</th>
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
                <td>{i + 1}</td>
                <td>
                  {p.name} {p.disconnectedMidGame ? "(หลุดระหว่างเกม)" : ""}
                </td>
                <td>{p.role}</td>
                <td>{p.initialBalance?.toLocaleString()} บาท</td>
                <td>{p.finalBalance?.toLocaleString()} บาท</td>
                <td style={{ color: p.netChange >= 0 ? "green" : "red" }}>
                  {p.netChange >= 0
                    ? `+${p.netChange?.toLocaleString()}`
                    : p.netChange?.toLocaleString()}{" "}
                  บาท
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {meInSummary && (
          <>
            <h2>สรุปยอดต้องโอนให้และต้องได้สำหรับ: {meInSummary.name}</h2>
            <h3>
              <span style={{ color: "green" }}>
                ยอดที่ได้รับจากคนอื่นรวม:{" "}
                {finalIncome
                  .map((e) => `${e.name} (${e.amount.toLocaleString()} บาท)`)
                  .join(", ") || "-"}
              </span>
            </h3>
            <h3>
              <span style={{ color: "red" }}>
                ยอดที่ต้องจ่ายให้คนอื่นรวม:{" "}
                {finalExpense
                  .map((e) => `${e.name} (${e.amount.toLocaleString()} บาท)`)
                  .join(", ") || "-"}
              </span>
            </h3>
          </>
        )}
        <button
          onClick={exitGame}
          style={{ padding: "10px 15px", marginTop: "20px" }}
        >
          ออกจากเกม (เริ่มใหม่)
        </button>
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div
        style={{
          padding: 20,
          fontFamily: "sans-serif",
          textAlign: "center",
          maxWidth: "400px",
          margin: "50px auto",
        }}
      >
        <h2>ป๊อกเด้งออนไลน์</h2>
        {errorMsg && (
          <p
            style={{
              color: "red",
              backgroundColor: "#ffe0e0",
              padding: "10px",
              borderRadius: "5px",
            }}
          >
            {errorMsg}
          </p>
        )}
        <input
          type="text"
          placeholder="ชื่อคุณ"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            display: "block",
            width: "90%",
            padding: 10,
            margin: "10px auto",
            borderRadius: 5,
            border: "1px solid #ccc",
          }}
        />
        <input
          type="number"
          placeholder="จำนวนเงิน (ขั้นต่ำ 100, ลงท้ายด้วย 0)"
          value={money}
          onChange={(e) => setMoney(e.target.value)}
          style={{
            display: "block",
            width: "90%",
            padding: 10,
            margin: "10px auto",
            borderRadius: 5,
            border: "1px solid #ccc",
          }}
        />

        <div style={{ marginTop: 20 }}>
          <button
            onClick={createRoom}
            style={{
              padding: "10px 20px",
              marginRight: 10,
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: 5,
            }}
          >
            สร้างห้องใหม่
          </button>
        </div>
        <hr style={{ margin: "20px 0" }} />
        <input
          type="text"
          placeholder="Room ID (หากต้องการเข้าร่วม)"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={{
            display: "block",
            width: "90%",
            padding: 10,
            margin: "10px auto",
            borderRadius: 5,
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={joinRoom}
          disabled={!roomId}
          style={{
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: 5,
          }}
        >
          เข้าร่วมห้อง
        </button>
        {roomLocked && (
          <p style={{ color: "orange", marginTop: 10 }}>
            ห้องนี้อาจกำลังเล่นอยู่ หรือถูกล็อค
          </p>
        )}
      </div>
    );
  }

  // --- In Room View ---
  const { score: myHandScore, type: myHandType } = calculateRank(myCards);
  const isMyTurn = currentTurnId === myPlayerId;

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h2>
        ห้อง: {roomId} (เดิมพันรอบละ:{" "}
        {betAmount > 0 ? `${betAmount.toLocaleString()} บาท` : "รอเจ้ามือกำหนด"}
        )
      </h2>
      <p>
        ชื่อของคุณ: {name} {isDealer ? "(เจ้ามือ)" : `(ผู้เล่น)`} | ID:{" "}
        {myPlayerId?.substring(0, 5)} | ยอดเงินปัจจุบัน:{" "}
        {myCurrentData?.balance?.toLocaleString() || money}
      </p>
      <p style={{ color: roomLocked ? "red" : "green" }}>
        สถานะห้อง:{" "}
        {roomLocked
          ? "ล็อค (ผู้เล่นใหม่เข้าไม่ได้)"
          : "เปิด (ผู้เล่นใหม่เข้าได้)"}
      </p>

      {errorMsg && (
        <p
          style={{
            color: "saddlebrown",
            backgroundColor: "#fff3cd",
            padding: "10px",
            borderRadius: "5px",
            border: "1px solid #ffeeba",
          }}
        >
          {errorMsg}
        </p>
      )}

      {/* Dealer Controls */}
      {isDealer && !startClicked && result.length === 0 && (
        <div
          style={{
            border: "1px solid #007bff",
            padding: 15,
            margin: "15px 0",
            borderRadius: 5,
            backgroundColor: "#e7f3ff",
          }}
        >
          <h4>ตั้งค่าเกม (เจ้ามือ):</h4>
          <div>
            <label>เงินเดิมพันต่อรอบ: </label>
            <input
              type="number"
              value={inputBetAmount}
              onChange={(e) => setInputBetAmount(e.target.value)}
              step="10"
              min="10"
              style={{ padding: 5, marginRight: 5 }}
            />
            <button onClick={handleSetBet} style={{ padding: "5px 10px" }}>
              ตั้งค่าเดิมพัน
            </button>
          </div>
          <button
            onClick={handleToggleLockRoom}
            style={{ padding: "5px 10px", margin: "10px 5px 0 0" }}
          >
            {roomLocked ? "ปลดล็อคห้อง" : "ล็อคห้อง"}
          </button>
          <button
            onClick={startGame}
            disabled={betAmount <= 0}
            style={{
              padding: "10px 15px",
              margin: "10px 0 0 0",
              backgroundColor: "#28a745",
              color: "white",
            }}
          >
            {gameRound > 0 || result.length > 0
              ? "เริ่มเกมรอบใหม่"
              : "เริ่มเกม"}
          </button>
        </div>
      )}
      {isDealer && startClicked && showResultBtn && result.length === 0 && (
        <button
          onClick={showResult}
          style={{
            padding: "10px 15px",
            backgroundColor: "#dc3545",
            color: "white",
            margin: "10px 0",
          }}
        >
          เปิดไพ่ทั้งหมด (เจ้ามือ)
        </button>
      )}

      <h4>ผู้เล่นภายในห้องนี้ ({playerData.length} คน):</h4>
      <ul style={{ listStyleType: "none", paddingLeft: 0 }}>
        {playerData.map((user) => (
          <li
            key={user.id}
            style={{
              padding: "5px 0",
              borderBottom: "1px dotted #eee",
              color: user.id === currentTurnId ? "blue" : "inherit",
              fontWeight: user.id === currentTurnId ? "bold" : "normal",
            }}
          >
            {user.name} ({user.role}) - ยอดเงิน:{" "}
            {user.balance?.toLocaleString()} บาท
            {user.id === currentTurnId &&
              ` (กำลังเล่น... ${currentTurnInfo.timeLeft} วิ)`}
            {user.isDealer && " (เจ้ามือ)"}
          </li>
        ))}
      </ul>

      {myCards.length > 0 && result.length === 0 && (
        <div
          style={{
            border: "1px solid green",
            padding: 15,
            margin: "15px 0",
            borderRadius: 5,
            backgroundColor: "#e6ffed",
          }}
        >
          <h3>ไพ่ของคุณ: {myCards.map(getCardDisplay).join(", ")}</h3>
          <p>
            แต้ม: {myHandScore}, ประเภท: {myHandType}
          </p>
          {!isDealer && isMyTurn && myCards.length === 2 && !hasStayed && (
            <>
              <p style={{ color: "blue", fontWeight: "bold" }}>
                ตาของคุณ! เวลาตัดสินใจ: {countdown} วินาที
              </p>
              <button
                onClick={drawCard}
                style={{
                  padding: "8px 12px",
                  marginRight: 10,
                  backgroundColor: "#17a2b8",
                  color: "white",
                }}
              >
                จั่วไพ่
              </button>
              <button
                onClick={stay}
                style={{
                  padding: "8px 12px",
                  backgroundColor: "#6c757d",
                  color: "white",
                }}
              >
                อยู่ (ไม่จั่ว)
              </button>
            </>
          )}
        </div>
      )}

      {!isMyTurn && currentTurnId && result.length === 0 && startClicked && (
        <p style={{ color: "gray", fontStyle: "italic", marginTop: 15 }}>
          รอ... ({currentTurnInfo.role}) {currentTurnInfo.name} กำลังตัดสินใจ (
          {currentTurnInfo.timeLeft} วิ) ⌛
        </p>
      )}
      {isDealer &&
        !startClicked &&
        result.length > 0 && ( // After results, dealer can start new round or end game
          <div
            style={{
              marginTop: 20,
              paddingTop: 15,
              borderTop: "1px solid #ccc",
            }}
          >
            <button
              onClick={startGame}
              style={{
                padding: "10px 15px",
                marginRight: 10,
                backgroundColor: "#28a745",
                color: "white",
              }}
            >
              เริ่มเกมรอบใหม่
            </button>
            <button
              onClick={endGame}
              style={{
                padding: "10px 15px",
                backgroundColor: "#dc3545",
                color: "white",
              }}
            >
              จบเกมทั้งหมด (ดูสรุปยอด)
            </button>
          </div>
        )}
      {isDealer &&
        startClicked &&
        result.length === 0 &&
        !showResultBtn &&
        !currentTurnId && (
          <p style={{ fontStyle: "italic", color: "purple" }}>
            รอผู้เล่นทุกคนตัดสินใจ หรือรอเจ้ามือกด "เปิดไพ่ทั้งหมด"...
          </p>
        )}

      {result.length > 0 && (
        <div
          style={{
            marginTop: 30,
            paddingTop: 20,
            borderTop: "2px solid #007bff",
          }}
        >
          <h3>
            ผลลัพธ์รอบที่ {gameRound}: (เดิมพัน: {betAmount?.toLocaleString()}{" "}
            บาท)
          </h3>
          <table
            border="1"
            cellPadding="5"
            style={{ borderCollapse: "collapse", width: "100%" }}
          >
            <thead>
              <tr>
                <th>ชื่อผู้เล่น (บทบาท)</th>
                <th>ไพ่ที่ได้</th>
                <th>แต้มรวม</th>
                <th>ประเภทไพ่</th>
                <th>ผลลัพธ์</th>
                <th>ได้/เสีย</th>
                <th>ยอดเงินใหม่</th>
              </tr>
            </thead>
            <tbody>
              {result.map((r, i) => (
                <tr
                  key={r.id || i}
                  style={{
                    backgroundColor:
                      r.id === myPlayerId
                        ? "#d4edda"
                        : r.disconnectedMidGame
                        ? "#fff3cd"
                        : "transparent",
                  }}
                >
                  <td>{r.name}</td>
                  <td>{r.cardsDisplay || "N/A"}</td>
                  <td>{r.score}</td>
                  <td>{r.specialType}</td>
                  <td
                    style={{
                      fontWeight: "bold",
                      color:
                        r.outcome === "win"
                          ? "green"
                          : r.outcome === "lose"
                          ? "red"
                          : r.outcome === "draw"
                          ? "orange"
                          : "inherit",
                    }}
                  >
                    {r.outcome === "win"
                      ? "ชนะ"
                      : r.outcome === "lose"
                      ? "แพ้"
                      : r.outcome === "draw"
                      ? "เสมอ"
                      : r.outcome}{" "}
                    {/* Display special outcomes like 'แพ้ (หลุดระหว่างเกม)' directly */}
                  </td>
                  <td
                    style={{
                      color:
                        r.moneyChange > 0
                          ? "green"
                          : r.moneyChange < 0
                          ? "red"
                          : "grey",
                    }}
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
          {/* Moved dealer buttons for next round/end game to appear after results IF NOT ALREADY STARTED A NEW ROUND */}
          {isDealer &&
            !startClicked && ( // Only show if a new game hasn't been clicked yet
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 15,
                  borderTop: "1px solid #ccc",
                }}
              >
                <button
                  onClick={startGame}
                  style={{
                    padding: "10px 15px",
                    marginRight: 10,
                    backgroundColor: "#28a745",
                    color: "white",
                  }}
                >
                  เริ่มเกมรอบใหม่
                </button>
                <button
                  onClick={endGame}
                  style={{
                    padding: "10px 15px",
                    backgroundColor: "#dc3545",
                    color: "white",
                  }}
                >
                  จบเกมทั้งหมด (ดูสรุปยอด)
                </button>
              </div>
            )}
          {!isDealer && result.length > 0 && !startClicked && (
            <p style={{ fontStyle: "italic", color: "purple", marginTop: 15 }}>
              {" "}
              --- รอเจ้ามือเริ่มเกมรอบใหม่ หรือ จบเกม ---
            </p>
          )}
        </div>
      )}
      <button
        onClick={exitGame}
        style={{
          padding: "10px 15px",
          marginTop: "30px",
          display: "block",
          marginLeft: "auto",
          marginRight: "auto",
          backgroundColor: "#6c757d",
          color: "white",
        }}
      >
        ออกจากห้อง/เกม (โหลดใหม่)
      </button>
    </div>
  );
}

export default App;
