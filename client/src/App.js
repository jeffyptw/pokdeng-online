import React, { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("https://pokdeng-online-th.onrender.com", {
  transports: ["websocket"],
});

function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [money, setMoney] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [players, setPlayers] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [hasStayed, setHasStayed] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [result, setResult] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [roomLocked, setRoomLocked] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState([]);
  const [showResultBtn, setShowResultBtn] = useState(false);
  const [showStartAgain, setShowStartAgain] = useState(false);
  const [gameRound, setGameRound] = useState(0);
  const [currentTurnId, setCurrentTurnId] = useState(null);
  const [countdown, setCountdown] = useState(30);
  const [startClicked, setStartClicked] = useState(false);
  const [playerData, setPlayerData] = useState([]);
  const [usersInRoom, setUsersInRoom] = useState([]);
  const [isGameEnded, setIsGameEnded] = useState(false);

  const [revealed, setRevealed] = useState(false);
  const [revealCountdown, setRevealCountdown] = useState(10);

  const isMyTurn = currentTurnId === socket.id;
  const currentPlayer = playerData.find((p) => p.id === currentTurnId);
  const turnPlayerName = currentPlayer?.name;
  const turnPlayerRole = currentPlayer?.role;

  useEffect(() => {
    if (isMyTurn && countdown > 0 && !hasStayed) {
      const timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
    if (countdown === 0 && isMyTurn && !hasStayed) {
      socket.emit("stay", { roomId });
      setHasStayed(true);
    }
  }, [countdown, isMyTurn, hasStayed]);

  useEffect(() => {
    let timer;
    if (myCards.length === 3 && !revealed && isMyTurn) {
      timer = setInterval(() => {
        setRevealCountdown((prev) => {
          if (prev === 1) {
            setRevealed(true);
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setRevealCountdown(10);
    }
    return () => clearInterval(timer);
  }, [myCards, revealed, isMyTurn]);

  const createRoom = () => {
    const bal = parseInt(money);
    if (bal < 100 || bal % 10 !== 0) {
      alert("จำนวนเงินขั้นต่ำ 100 และต้องลงท้ายด้วย 0 เท่านั้น");
      return;
    }
    socket.emit("createRoom", { name, balance: bal }, ({ roomId }) => {
      setRoomId(roomId);
      setInRoom(true);
    });
  };

  const joinRoom = () => {
    const bal = parseInt(money);
    if (bal < 100 || bal % 10 !== 0) {
      alert("จำนวนเงินขั้นต่ำ 100 และต้องลงท้ายด้วย 0 เท่านั้น");
      return;
    }
    socket.emit("joinRoom", { roomId, name, balance: bal }, (res) => {
      if (res.success) setInRoom(true);
      else alert(res.message || "ไม่สามารถเข้าห้องได้");
    });
  };

  const startGame = () => {
    socket.emit("startGame", { roomId });
    setShowResultBtn(false);
    setShowStartAgain(false);
    setStartClicked(true);
    setRevealed(false);
    setRevealCountdown(10);
  };

  const drawCard = () => {
    socket.emit("drawCard", { roomId });
    setHasStayed(true);
    setRevealed(false);
    setRevealCountdown(10);
  };

  const stay = () => {
    socket.emit("stay", { roomId });
    setHasStayed(true);
  };

  const showResult = () => {
    socket.emit("showResult", { roomId });
    setGameRound((prev) => prev + 1);
    setShowStartAgain(true);
    setShowResultBtn(false);
  };

  const endGame = () => {
    socket.emit("endGame", { roomId });
    socket.emit("requestSummary", { roomId });
  };

  const exitGame = () => window.location.reload();

  useEffect(() => {
    socket.on("yourCards", (data) => setMyCards(data.cards));
    socket.on("resetGame", () => {
      setHasStayed(false);
      setResult([]);
      setErrorMsg("");
      setRevealed(false);
      setRevealCountdown(10);
    });
    socket.on("playersList", (names) => {
      setPlayers(names);
      const me = names.find((p) => p.includes(name));
      setIsDealer(me && me.includes("เจ้ามือ"));
    });
    socket.on("usersInRoom", (users) => setUsersInRoom(users));
    socket.on("playersData", (data) => setPlayerData(data));
    socket.on("result", (data) => {
      setResult(data);
      setShowSummary(false);
    });
    socket.on("errorMessage", (msg) => setErrorMsg(msg));
    socket.on("lockRoom", () => setRoomLocked(true));
    socket.on("gameEnded", () => {
      setMyCards([]);
      setHasStayed(false);
      setRoomLocked(false);
      setIsGameEnded(true);
    });
    socket.on("summaryData", (data) => {
      setSummaryData(data);
      setShowSummary(true);
    });
    socket.on("currentTurn", ({ id }) => {
      setCurrentTurnId(id);
      if (id === socket.id) {
        setCountdown(30);
        setRevealed(false);
        setRevealCountdown(10);
      }
    });
    socket.on("enableShowResult", () => setShowResultBtn(true));

    return () => {
      socket.off();
    };
  }, [name]);

  const getCardPoint = (v) =>
    ["J", "Q", "K"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v);

  const calculateRank = (cards) => {
    const values = cards.map((c) => c.value);
    const suits = cards.map((c) => c.suit);
    const score = cards.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
    const count = {};
    values.forEach((v) => (count[v] = (count[v] || 0) + 1));
    const allJQK = values.every((v) => ["J", "Q", "K"].includes(v));
    const sameSuit = suits.every((s) => s === suits[0]);
    const sorted = cards
      .map((c) => ({ A: 1, J: 11, Q: 12, K: 13 }[c.value] || parseInt(c.value)))
      .sort((a, b) => a - b);
    const isQKA =
      cards.length === 3 &&
      sorted.includes(1) &&
      sorted.includes(12) &&
      sorted.includes(13);
    const isStraight =
      cards.length === 3 &&
      ((sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1) || isQKA);

    if (cards.length === 2) {
      const isDouble =
        cards[0].suit === cards[1].suit || cards[0].value === cards[1].value;
      if (score === 9) return `=${isDouble ? " ป๊อก 9สองเด้ง" : "ป๊อก 9"}`;
      if (score === 8) return `=${isDouble ? " ป๊อก 8สองเด้ง" : "ป๊อก 8"}`;
    }

    if (cards.length === 3) {
      if (Object.values(count).includes(3)) return `= ${score} แต้ม (ตอง)`;
      if (isStraight && sameSuit) return `= สเตรทฟลัช`;
      if (isStraight) return `= เรียง`;
      if (allJQK) return `= เซียน`;
      if (sameSuit) return `= ${score} แต้มสามเด้ง`;
    }

    if (
      cards.length === 2 &&
      (cards[0].suit === cards[1].suit || cards[0].value === cards[1].value)
    ) {
      return `= ${score} แต้มสองเด้ง`;
    }

    return `= ${score} แต้ม`;
  };

  return (
    <div style={{ padding: 20 }}>
      {!inRoom ? (
        <div>
          <h2>ป๊อกเด้งออนไลน์</h2>
          <input
            placeholder="ชื่อคุณ"
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="จำนวนเงิน (ขั้นต่ำ 100)"
            onChange={(e) => setMoney(e.target.value)}
          />
          <input
            placeholder="Room ID"
            onChange={(e) => setRoomId(e.target.value)}
          />
          <br />
          <button onClick={createRoom}>สร้างห้องใหม่</button>
          <button onClick={joinRoom} disabled={roomLocked}>
            เข้าร่วมห้อง
          </button>
          {roomLocked && (
            <p style={{ color: "orange" }}>
              เกมกำลังเล่นอยู่ ไม่สามารถเข้าห้องได้
            </p>
          )}
        </div>
      ) : (
        <div>
          <h2>ห้อง: {roomId}</h2>
          <p>ชื่อ : {name}</p>
          <h4>ผู้เล่นภายในห้องนี้:</h4>
          <ul>
            {playerData.map((user) => (
              <li key={user.id}>
                {user.name} ({user.role}) = {user.balance} บาท{" "}
                {user.leftEarly && "💨 ออกจากห้องแล้ว"}
              </li>
            ))}
          </ul>

          {myCards.length > 0 && result.length === 0 && (
            <div>
              <h3>ไพ่ของคุณ:</h3>
              <p>
                {myCards
                  .slice(0, 2)
                  .map((c) => `${c.value}${c.suit}`)
                  .join(", ")}
                {myCards.length === 3 &&
                  (revealed
                    ? `, ${myCards[2].value}${myCards[2].suit}`
                    : `, ❓❓ (กดปุ่มเพื่อเปิดไพ่) ${revealCountdown}วินาที`)}{" "}
                {calculateRank(myCards)}
              </p>

              {!revealed && myCards.length === 3 && isMyTurn && (
                <button
                  onClick={() => setRevealed(true)}
                  style={{ color: "red" }}
                >
                  เปิดไพ่ใบที่ 3
                </button>
              )}

              {!hasStayed && myCards.length === 2 && isMyTurn && (
                <>
                  <p style={{ color: "blue" }}>เวลาคิด: {countdown} วินาที</p>
                  <button onClick={drawCard}>จั่ว</button>
                  <button onClick={stay}>ไม่จั่ว</button>
                </>
              )}

              {!isMyTurn && currentPlayer && (
                <p style={{ color: "gray" }}>
                  รอ...({turnPlayerRole}) {turnPlayerName} จั่ว ⌛
                </p>
              )}
            </div>
          )}

          {result.length > 0 && (
            <div>
              <h3>ผลลัพธ์:</h3>
              <ul>
                {result.map((r, i) => {
                  const isDealer = r.outcome === "dealer";
                  const dealerIncome = result
                    .filter((x) => x.outcome === "lose")
                    .reduce((sum, x) => sum + -x.moneyChange, 0);
                  const dealerLoss = result
                    .filter((x) => x.outcome === "win")
                    .reduce((sum, x) => sum + x.moneyChange, 0);
                  const dealerNet = dealerIncome - dealerLoss;
                  if (isDealer) {
                    return (
                      <li key={i}>
                        {r.name}: {r.cards} = {r.sum} แต้ม ({r.specialType})
                        {dealerNet > 0 && ` ✅ เจ้ามือ ได้ ${dealerNet} บาท`}
                        {dealerNet < 0 && ` ❌ เจ้ามือ เสีย ${-dealerNet} บาท`}
                        {dealerNet === 0 && ` ✅ ได้ 0 บาท`}
                      </li>
                    );
                  }
                  return (
                    <li key={i}>
                      {r.name}: {r.cards} = {r.sum} แต้ม ({r.specialType})
                      {r.outcome === "win" &&
                        ` ✅ ชนะ : ได้ ${r.moneyChange} บาท`}
                      {r.outcome === "lose" &&
                        ` ❌ แพ้ : เสีย ${-r.moneyChange} บาท`}
                      {r.outcome === "draw" && ` 🤝 เสมอ`}
                    </li>
                  );
                })}
              </ul>
              {isDealer && (
                <>
                  {result.length > 0 && (
                    <>
                      <button onClick={endGame}>จบเกม</button>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
