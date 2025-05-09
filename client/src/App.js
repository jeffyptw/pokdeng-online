import { useEffect, useState } from "react";
import io from "socket.io-client";

const socket = io("https://pokdeng-online-th.onrender.com", {
  transports: ["websocket"],
});

function App() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [money, setMoney] = useState("");
  const [inRoom, setInRoom] = useState(false);
  const [players, setPlayers] = useState([]); // ยังคงไว้เนื่องจากใช้ในการแสดงบทบาทของผู้เล่น
  const [myCards, setMyCards] = useState([]);
  const [hasStayed, setHasStayed] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [result, setResult] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [roomLocked, setRoomLocked] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState([]);
  const [showResultBtn, setShowResultBtn] = useState(false);
  // const [showStartAgain, setShowStartAgain] = useState(false); // <--- นำออก
  const [gameRound, setGameRound] = useState(0);
  const [currentTurnId, setCurrentTurnId] = useState(null);
  const [countdown, setCountdown] = useState(15);
  const [startClicked, setStartClicked] = useState(false);
  const [playerData, setPlayerData] = useState([]);
  // const [usersInRoom, setUsersInRoom] = useState([]); // <--- นำออก
  // const [isGameEnded, setIsGameEnded] = useState(false); // <--- นำออก

  useEffect(() => {
    if (currentTurnId === socket.id && countdown > 0 && !hasStayed) {
      const timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
    if (countdown === 0 && !hasStayed && currentTurnId === socket.id) {
      socket.emit("stay", { roomId });
      setHasStayed(true);
    }
  }, [countdown, currentTurnId, hasStayed, roomId]); // เพิ่ม roomId ใน dependencies array เพราะใช้ใน emit

  const createRoom = () => {
    const bal = parseInt(money);
    if (bal < 100 || bal % 10 !== 0) {
      alert("จำนวนเงินขั้นต่ำ 100 และต้องลงท้ายด้วย 0 เท่านั้น");
      return;
    }
    socket.emit(
      "createRoom",
      { name, balance: bal },
      ({ roomId: newRoomId }) => {
        // เปลี่ยนชื่อ roomId เพื่อไม่ให้ชน
        setRoomId(newRoomId);
        setInRoom(true);
      }
    );
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
    // setShowStartAgain(false); // <--- นำออก (state ถูกลบแล้ว)
    setStartClicked(true);
  };

  const drawCard = () => {
    socket.emit("drawCard", { roomId });
    setHasStayed(true);
  };

  const stay = () => {
    socket.emit("stay", { roomId });
    setHasStayed(true);
  };

  const showResult = () => {
    socket.emit("showResult", { roomId });
    setGameRound((prev) => prev + 1);
    // setShowStartAgain(true); // <--- นำออก (state ถูกลบแล้ว)
    setShowResultBtn(false);
  };

  const endGame = () => {
    socket.emit("endGame", { roomId });
    socket.emit("requestSummary", { roomId });
  };

  const exitGame = () => window.location.reload();

  const isMyTurn = currentTurnId === socket.id;
  const currentPlayer = playerData.find((p) => p.id === currentTurnId);
  const turnPlayerName = currentPlayer?.name;
  const turnPlayerRole = currentPlayer?.role;

  const summarizeTransactions = (me) => {
    if (!me || !me.income || !me.expense) {
      // เพิ่มการตรวจสอบ me และ property
      return { finalIncome: [], finalExpense: [] };
    }
    const incomeMap = {};
    const expenseMap = {};

    me.income.forEach((entry) => {
      incomeMap[entry.from] = (incomeMap[entry.from] || 0) + entry.amount;
    });

    me.expense.forEach((entry) => {
      expenseMap[entry.to] = (expenseMap[entry.to] || 0) + entry.amount;
    });

    const allNames = new Set([
      ...Object.keys(incomeMap),
      ...Object.keys(expenseMap),
    ]);
    const finalIncome = [];
    const finalExpense = [];

    allNames.forEach((person) => {
      const get = incomeMap[person] || 0;
      const give = expenseMap[person] || 0;

      if (get > give) finalIncome.push({ name: person, amount: get - give });
      else if (give > get)
        finalExpense.push({ name: person, amount: give - get });
    });

    return { finalIncome, finalExpense };
  };

  useEffect(() => {
    socket.on("yourCards", (data) => setMyCards(data.cards));
    socket.on("resetGame", () => {
      setHasStayed(false);
      setResult([]);
      setErrorMsg("");
    });
    socket.on("playersList", (names) => {
      setPlayers(names);
      const me = names.find((p) => p.includes(name)); // ใช้ name จาก state
      setIsDealer(me && me.includes("เจ้ามือ"));
    });
    // socket.on("usersInRoom", (users) => { // <--- นำออก
    //   setUsersInRoom(users);
    // });
    socket.on("playersData", (data) => {
      setPlayerData(data);
    });
    socket.on("result", (data) => {
      setResult(data);
      setShowSummary(false);
    });
    socket.on("errorMessage", (msg) => setErrorMsg(msg)); // ควรเป็น msg.text หรือ msg ตามที่ server ส่งมา
    socket.on("lockRoom", () => setRoomLocked(true));
    socket.on("gameEnded", () => {
      setMyCards([]);
      setHasStayed(false);
      setRoomLocked(false);
      // setIsGameEnded(true); // <--- นำออก (state ถูกลบแล้ว)
    });
    socket.on("summaryData", (data) => {
      setSummaryData(data);
      setShowSummary(true);
    });
    socket.on("currentTurn", ({ id }) => {
      setCurrentTurnId(id);
      if (id === socket.id) setCountdown(15);
    });
    socket.on("enableShowResult", () => setShowResultBtn(true));

    return () => {
      socket.off("yourCards");
      socket.off("resetGame");
      socket.off("playersList");
      socket.off("playersData");
      // socket.off("usersInRoom"); // <--- นำออก
      socket.off("result");
      socket.off("errorMessage");
      socket.off("lockRoom");
      socket.off("gameEnded");
      socket.off("summaryData");
      socket.off("currentTurn");
      socket.off("enableShowResult");
    };
  }, [name]); // name ใช้ใน playersList listener

  const getCardPoint = (v) =>
    ["J", "Q", "K"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v);
  const calculateRank = (cards) => {
    if (!cards || cards.length === 0) return ""; // ป้องกัน error ถ้า cards เป็น undefined หรือ array ว่าง
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
      if (score === 9) return `=${isDouble ? " ป๊อก 9 สองเด้ง" : "ป๊อก 9"}`;
      if (score === 8) return `=${isDouble ? " ป๊อก 8 สองเด้ง" : "ป๊อก 8"}`;
    }

    if (cards.length === 3) {
      if (Object.values(count).includes(3)) return `= ${score} แต้ม (ตอง)`;
      if (isStraight && sameSuit) return `= สเตรทฟลัช`;
      if (isStraight) return `= เรียง`;
      if (allJQK) return `= เซียน`; // ควรเป็น J, Q, K ทั้ง 3 ใบ
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

  if (showSummary) {
    const me = summaryData.find((p) => p.name && p.name.startsWith(name)); // ตรวจสอบ p.name ก่อน startsWith
    const { finalIncome, finalExpense } = me
      ? summarizeTransactions(me)
      : { finalIncome: [], finalExpense: [] };

    return (
      <div style={{ padding: 20 }}>
        <h2>สรุปยอดเงินหลังจบเกม</h2>
        <table
          border="1"
          cellPadding="10"
          style={{ borderCollapse: "collapse", width: "auto" }}
        >
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>ชื่อ</th>
              <th>ยอดเงินคงเหลือ</th>
              <th>กำไร/ขาดทุน</th>
            </tr>
          </thead>
          <tbody>
            {summaryData.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td>{p.balance} บาท</td>
                <td style={{ color: p.net >= 0 ? "green" : "red" }}>
                  {p.net >= 0 ? `+${p.net}` : p.net} บาท
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>สรุปยอดต้องโอนให้และต้องได้</h2>
        <h3>ชื่อ : {me?.name}</h3>
        <h3>
          <span style={{ color: "green" }}>
            ได้จาก :{" "}
            {finalIncome.map((e) => `${e.name} (${e.amount} บาท)`).join(", ") ||
              "-"}
          </span>
        </h3>
        <h3>
          <span style={{ color: "red" }}>
            โอนให้ :{" "}
            {finalExpense
              .map((e) => `${e.name} (${e.amount} บาท)`)
              .join(", ") || "-"}
          </span>
        </h3>
        <button onClick={exitGame}>ออกจากเกม</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      {!inRoom ? (
        <div>
          {" "}
          <h2>ป๊อกเด้งออนไลน์</h2>
          <input
            type="text" // เพิ่ม type attribute
            placeholder="ชื่อคุณ"
            value={name} // ควบคุม component
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number" // เพิ่ม type attribute
            placeholder="จำนวนเงิน (ขั้นต่ำ 100)"
            value={money} // ควบคุม component
            onChange={(e) => setMoney(e.target.value)}
          />
          <input
            type="text" // เพิ่ม type attribute
            placeholder="Room ID (หากต้องการเข้าร่วม)"
            value={roomId} // ควบคุม component
            onChange={(e) => setRoomId(e.target.value)}
          />{" "}
          <br /> <button onClick={createRoom}>สร้างห้องใหม่</button>{" "}
          <button onClick={joinRoom} disabled={!roomId || roomLocked}>
            {" "}
            {/* ปรับปรุงเงื่อนไข disabled */}
            เข้าร่วมห้อง{" "}
          </button>
          {roomLocked &&
            !inRoom && ( // แสดงเมื่อ roomLocked และยังไม่ได้เข้าห้อง
              <p style={{ color: "orange" }}>
                เกมในห้องนี้กำลังเล่นอยู่ ไม่สามารถเข้าร่วมได้{" "}
              </p>
            )}
        </div>
      ) : (
        <div>
          {" "}
          <h2>ห้อง: {roomId}</h2> <p>ชื่อ : {name}</p>{" "}
          <p>
            บท:{" "}
            {isDealer
              ? "เจ้ามือ"
              : players
                  .find((p) => p.includes(name)) // players คือ string array จาก playersList
                  ?.split("(")[1]
                  ?.replace(")", "")}{" "}
          </p>
          {isDealer && (
            <>
              {/* ปุ่มเริ่มเกม จะแสดงเมื่อเป็นเจ้ามือ, ยังไม่ได้กดเริ่ม(startClicked=false), และเป็นรอบแรก (gameRound=0) หรือ ผลลัพธ์มีแล้ว (พร้อมเริ่มรอบใหม่) */}
              {(!startClicked || result.length > 0) && (
                <button onClick={startGame}>
                  {result.length > 0 || gameRound > 0
                    ? "เริ่มเกมอีกครั้ง"
                    : "เริ่มเกม"}
                </button>
              )}
              {showResultBtn && <button onClick={showResult}>เปิดไพ่</button>}
            </>
          )}
          {errorMsg && (
            <p style={{ color: "red" }}>
              {typeof errorMsg === "object" ? errorMsg.text : errorMsg}
            </p>
          )}
          <h4>ผู้เล่นภายในห้องนี้:</h4>
          <ul>
            {playerData.map((user) => (
              <li key={user.id}>
                {user.name} ({user.role}) = {user.balance} บาท{" "}
                {/* ไม่มีการใช้ user.leftEarly จากโค้ด server ที่ให้มา */}
              </li>
            ))}
          </ul>
          {myCards.length > 0 && result.length === 0 && (
            <div>
              <h3>ไพ่ของคุณ:</h3>
              <p>
                {myCards.map((c) => `${c.value}${c.suit}`).join(", ")}{" "}
                {calculateRank(myCards)}
              </p>
              {!hasStayed && myCards.length === 2 && isMyTurn && (
                <>
                  <p style={{ color: "blue" }}>เวลาคิด: {countdown} วินาที</p>
                  <button onClick={drawCard}>จั่ว</button>
                  <button onClick={stay}>ไม่จั่ว</button>
                </>
              )}
              {!isMyTurn &&
                currentTurnId &&
                playerData.find((p) => p.id === currentTurnId) && ( // ตรวจสอบว่า currentTurnId มีใน playerData
                  <p style={{ color: "gray" }}>
                    รอ...({turnPlayerRole}) {turnPlayerName} เล่น ⌛
                  </p>
                )}
            </div>
          )}
          {result.length > 0 && (
            <div>
              <h3>ผลลัพธ์:</h3>
              <ul>
                {result.map((r, i) => {
                  const isCurrentPlayerDealer = r.outcome === "dealer";
                  let dealerNet = 0;
                  if (isCurrentPlayerDealer) {
                    const dealerIncome = result
                      .filter((x) => x.outcome === "lose")
                      .reduce((sum, x) => sum + -x.moneyChange, 0);
                    const dealerLoss = result
                      .filter((x) => x.outcome === "win")
                      .reduce((sum, x) => sum + x.moneyChange, 0);
                    dealerNet = dealerIncome - dealerLoss;
                  }

                  return (
                    <li key={i}>
                      {r.name}: {r.cards} = {r.sum} แต้ม ({r.specialType})
                      {isCurrentPlayerDealer && (
                        <>
                          {dealerNet > 0 && ` ✅ เจ้ามือ ได้ ${dealerNet} บาท`}
                          {dealerNet < 0 &&
                            ` ❌ เจ้ามือ เสีย ${-dealerNet} บาท`}
                          {dealerNet === 0 && ` 🤝 เจ้ามือ เสมอ`}
                        </>
                      )}
                      {r.outcome === "win" &&
                        ` ✅ ชนะ : ได้ ${r.moneyChange} บาท`}
                      {r.outcome === "lose" &&
                        ` ❌ แพ้ : เสีย ${-r.moneyChange} บาท`}
                      {r.outcome === "draw" && ` 🤝 เสมอ (กับเจ้ามือ)`}
                    </li>
                  );
                })}
              </ul>
              {isDealer &&
                result.length > 0 && ( // ให้เจ้ามือเห็นปุ่มจบเกมเมื่อมีผลลัพธ์แล้ว
                  <button onClick={endGame}>จบเกม (ดูสรุปยอด)</button>
                )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
