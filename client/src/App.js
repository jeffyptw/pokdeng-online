import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('https://pokdeng-online-th.onrender.com', {
  transports: ['websocket'],
});

function App() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [money, setMoney] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [players, setPlayers] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [hasStayed, setHasStayed] = useState(false);
  const [isDealer, setIsDealer] = useState(false);
  const [result, setResult] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [roomLocked, setRoomLocked] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryData, setSummaryData] = useState([]);
  const [showResultBtn, setShowResultBtn] = useState(false);
  const [showStartAgain, setShowStartAgain] = useState(false);
  const [gameRound, setGameRound] = useState(0);
  const [currentTurnId, setCurrentTurnId] = useState(null);
  const [countdown, setCountdown] = useState(15);
  const [gameStarted, setGameStarted] = useState(false);

  useEffect(() => {
    if (currentTurnId === socket.id && countdown > 0 && !hasStayed) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
    if (countdown === 0 && !hasStayed && currentTurnId === socket.id) {
      socket.emit('stay', { roomId });
      setHasStayed(true);
    }
  }, [countdown, currentTurnId, hasStayed]);

  const createRoom = () => {
    const bal = parseInt(money);
    if (bal < 100 || bal % 10 !== 0) {
      alert('จำนวนเงินขั้นต่ำ 100 และต้องลงท้ายด้วย 0 เท่านั้น');
      return;
    }
    socket.emit('createRoom', { name, balance: bal }, ({ roomId }) => {
      setRoomId(roomId);
      setInRoom(true);
    });
  };

  const joinRoom = () => {
    const bal = parseInt(money);
    if (bal < 100 || bal % 10 !== 0) {
      alert('จำนวนเงินขั้นต่ำ 100 และต้องลงท้ายด้วย 0 เท่านั้น');
      return;
    }
    socket.emit('joinRoom', { roomId, name, balance: bal }, res => {
      if (res.success) setInRoom(true);
      else alert(res.message || 'ไม่สามารถเข้าห้องได้');
    });
  };

  const startGame = () => {
    socket.emit('startGame', { roomId });
    setShowResultBtn(false);
    setShowStartAgain(false);
    setGameStarted(true);
  };

  const drawCard = () => {
    socket.emit('drawCard', { roomId });
    setHasStayed(true);
  };

  const stay = () => {
    socket.emit('stay', { roomId });
    setHasStayed(true);
  };

  const showResult = () => {
    socket.emit('showResult', { roomId });
    setGameRound(prev => prev + 1);
    setShowStartAgain(true);
    setShowResultBtn(false);
  };

  const endGame = () => {
    socket.emit('endGame', { roomId });
    socket.emit('requestSummary', { roomId });
    setGameStarted(false);
  };

  const exitGame = () => window.location.reload();

  const isMyTurn = currentTurnId === socket.id;

  const summarizeTransactions = (me) => {
    const incomeMap = {}, expenseMap = {};
    me.income.forEach(e => incomeMap[e.from] = (incomeMap[e.from] || 0) + e.amount);
    me.expense.forEach(e => expenseMap[e.to] = (expenseMap[e.to] || 0) + e.amount);
    const names = new Set([...Object.keys(incomeMap), ...Object.keys(expenseMap)]);
    const finalIncome = [], finalExpense = [];
    names.forEach(person => {
      const income = incomeMap[person] || 0;
      const expense = expenseMap[person] || 0;
      if (income > expense) finalIncome.push({ name: person, amount: income - expense });
      else if (expense > income) finalExpense.push({ name: person, amount: expense - income });
    });
    return { finalIncome, finalExpense };
  };

  useEffect(() => {
    socket.on('yourCards', data => setMyCards(data.cards));
    socket.on('resetGame', () => {
      setHasStayed(false);
      setResult([]);
      setErrorMsg('');
    });
    socket.on('playersList', names => {
      setPlayers(names);
      const me = names.find(p => p.includes(name));
      setIsDealer(me && me.includes('เจ้ามือ'));
    });
    socket.on('result', data => {
      setResult(data);
      setShowSummary(false);
    });
    socket.on('errorMessage', msg => setErrorMsg(msg));
    socket.on('lockRoom', () => setRoomLocked(true));
    socket.on('gameEnded', () => {
      setMyCards([]);
      setHasStayed(false);
      setRoomLocked(false);
    });
    socket.on('summaryData', data => {
      setSummaryData(data);
      setShowSummary(true);
    });
    socket.on('currentTurn', ({ id }) => {
      setCurrentTurnId(id);
      if (id === socket.id) setCountdown(15);
    });
    socket.on('enableShowResult', () => setShowResultBtn(true));
    return () => socket.off();
  }, [name]);

  const getCardPoint = v => ['J', 'Q', 'K'].includes(v) ? 0 : v === 'A' ? 1 : parseInt(v);

  const calculateRank = (cards) => {
    const values = cards.map(c => c.value);
    const suits = cards.map(c => c.suit);
    const score = cards.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
    const count = {};
    values.forEach(v => count[v] = (count[v] || 0) + 1);
    const sameSuit = suits.every(s => s === suits[0]);
    const allJQK = values.every(v => ['J','Q','K'].includes(v));
    const sorted = cards.map(c => ({A:1, J:11, Q:12, K:13}[c.value] || parseInt(c.value))).sort((a,b)=>a-b);
    const isStraight = cards.length === 3 && sorted[2] === sorted[1]+1 && sorted[1] === sorted[0]+1;
    if (cards.length === 2) {
      const isDouble = suits[0] === suits[1] || values[0] === values[1];
      if (score === 9) return `(ป๊อก 9${isDouble ? ' สองเด้ง' : ''})`;
      if (score === 8) return `(ป๊อก 8${isDouble ? ' สองเด้ง' : ''})`;
    }
    if (cards.length === 3) {
      if (Object.values(count).includes(3)) return `(ตอง)`;
      if (isStraight && sameSuit) return `(สเตรทฟลัช)`;
      if (isStraight) return `(เรียง)`;
      if (allJQK) return `(เซียน)`;
      if (sameSuit) return `(แต้มธรรมดา สามเด้ง)`;
    }
    if (cards.length === 2 && (values[0] === values[1] || suits[0] === suits[1])) return `(แต้มธรรมดา สองเด้ง)`;
    return `(แต้มธรรมดา)`;
  };

  if (showSummary) {
    const me = summaryData.find(p => p.name.startsWith(name));
    const { finalIncome, finalExpense } = me ? summarizeTransactions(me) : { finalIncome: [], finalExpense: [] };
    return (
      <div style={{ padding: 20 }}>
        <h2>สรุปยอดเงินหลังจบเกม</h2>
        <table border="1" cellPadding="10">
          <thead><tr><th>ลำดับ</th><th>ชื่อ</th><th>ยอดเงินคงเหลือ</th><th>กำไร/ขาดทุน</th></tr></thead>
          <tbody>
            {summaryData.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td><td>{p.name}</td>
                <td>{p.balance} บาท</td>
                <td style={{ color: p.net >= 0 ? 'green' : 'red' }}>{p.net >= 0 ? `+${p.net}` : p.net} บาท</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>ชื่อ : {me?.name}</h3>
        <h4 style={{ color: 'green' }}>
          ได้จาก : {finalIncome.map(e => `${e.name} (${e.amount} บาท)`).join(', ') || '-'}
        </h4>
        <h4 style={{ color: 'red' }}>
          โอนให้ : {finalExpense.map(e => `${e.name} (${e.amount} บาท)`).join(', ') || '-'}
        </h4>
        <button onClick={exitGame}>Exit</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      {!inRoom ? (
        <div>
          <h2>ป๊อกเด้งออนไลน์</h2>
          <input placeholder="ชื่อคุณ" onChange={e => setName(e.target.value)} />
          <input placeholder="จำนวนเงิน (ขั้นต่ำ 100)" onChange={e => setMoney(e.target.value)} />
          <input placeholder="Room ID" onChange={e => setRoomId(e.target.value)} />
          <br />
          <button onClick={createRoom}>สร้างห้องใหม่</button>
          <button onClick={joinRoom} disabled={roomLocked}>เข้าร่วมห้อง</button>
          {roomLocked && <p style={{ color: 'orange' }}>เกมกำลังเล่นอยู่ ไม่สามารถเข้าร่วมห้องได้</p>}
        </div>
      ) : (
        <div>
          <h2>ห้อง: {roomId}</h2>
          <p>ชื่อ : {name}</p>
          <p>บท: {isDealer ? 'เจ้ามือ' : players.find(p => p.includes(name))?.split('(')[1]?.replace(')', '')}</p>
          {isDealer && (
            <>
              {!gameStarted && (
                <button onClick={startGame}>{gameRound === 0 ? 'เริ่มเกม' : 'เริ่มเกมอีกครั้ง'}</button>
              )}
              {showResultBtn && <button onClick={showResult}>เปิดไพ่</button>}
              {result.length > 0 && <button onClick={endGame}>จบเกม</button>}
            </>
          )}
          {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}
          <h4>ผู้เล่นภายในห้องนี้:</h4>
          <ul>{players.map((p, i) => <li key={i}>{p}</li>)}</ul>
          {myCards.length > 0 && result.length === 0 && (
            <div>
              <h3>ไพ่ของคุณ:</h3>
              <p>{myCards.map(c => `${c.value}${c.suit}`).join(', ')} {calculateRank(myCards)}</p>
              {!hasStayed && myCards.length === 2 && isMyTurn && (
                <>
                  <p style={{ color: 'blue' }}>เวลาคิด: {countdown} วินาที</p>
                  <button onClick={drawCard}>จั่ว</button>
                  <button onClick={stay}>ไม่จั่ว</button>
                </>
              )}
              {!isMyTurn && <p style={{ color: 'gray' }}>รอผู้เล่นอื่น...</p>}
            </div>
          )}
          {result.length > 0 && (
            <div>
              <h3>ผลลัพธ์:</h3>
              <ul>
                {result.map((r, i) => {
                  const isDealer = r.outcome === 'dealer';
                  const dealerIncome = result.filter(x => x.outcome === 'lose').reduce((sum, x) => sum + (-x.moneyChange), 0);
                  const dealerLoss = result.filter(x => x.outcome === 'win').reduce((sum, x) => sum + x.moneyChange, 0);
                  const dealerNet = dealerIncome - dealerLoss;
                  if (isDealer) {
                    return (
                      <li key={i}>
                        {r.name}: {r.cards} = {r.sum} แต้ม {r.specialType}
                        {dealerNet > 0 && ` ✅ เจ้ามือ ได้ ${dealerNet} บาท`}
                        {dealerNet < 0 && ` ❌ เจ้ามือ เสีย ${-dealerNet} บาท`}
                        {dealerNet === 0 && ` ✅ ได้ 0 บาท`}
                      </li>
                    );
                  }
                  return (
                    <li key={i}>
                      {r.name}: {r.cards} = {r.sum} แต้ม {r.specialType}
                      {r.outcome === 'win' && ` ✅ ชนะ : ได้ ${r.moneyChange} บาท`}
                      {r.outcome === 'lose' && ` ❌ แพ้ : เสีย ${-r.moneyChange} บาท`}
                      {r.outcome === 'draw' && ` 🤝 เสมอ`}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
