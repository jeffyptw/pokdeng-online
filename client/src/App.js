// App.js
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('http://localhost:3001');


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

  useEffect(() => {
    if (currentTurnId === socket.id && countdown > 0 && !hasStayed) {
      const timer = setTimeout(() => {
        setCountdown(c => c - 1);
      }, 1000);
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
      alert('จำนวนเงินขั้นต่ำ 100 และหาร 10 ลงตัว');
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
      alert('จำนวนเงินขั้นต่ำ 100 และหาร 10 ลงตัว');
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
  };

  const exitGame = () => window.location.reload();

  const getCardPoint = (value) => {
    if (['J', 'Q', 'K'].includes(value)) return 0;
    if (value === 'A') return 1;
    return parseInt(value);
  };

  const calculateRank = (cards) => {
    const values = cards.map(c => c.value);
    const suits = cards.map(c => c.suit);
    const score = cards.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;
    const count = {};
    values.forEach(v => count[v] = (count[v] || 0) + 1);
    const allJQK = values.every(v => ['J', 'Q', 'K'].includes(v));
    const sameSuit = suits.every(s => s === suits[0]);
    const sorted = cards.map(c => {
      const map = { A: 1, J: 11, Q: 12, K: 13 };
      return map[c.value] || parseInt(c.value);
    }).sort((a, b) => a - b);
    const isStraight = cards.length === 3 && sorted[1] === sorted[0] + 1 && sorted[2] === sorted[1] + 1;

    if (cards.length === 2) {
      const isDouble = cards[0].suit === cards[1].suit || cards[0].value === cards[1].value;
      if (score === 9) return `= 9 แต้ม (${isDouble ? 'ป๊อก 9 สองเด้ง' : 'ป๊อก 9'})`;
      if (score === 8) return `= 8 แต้ม (${isDouble ? 'ป๊อก 8 สองเด้ง' : 'ป๊อก 8'})`;
    }

    if (cards.length === 3) {
      if (Object.values(count).includes(3)) return `= ${score} แต้ม (ตอง)`;
      if (isStraight && sameSuit) return `= ${score} แต้ม (สเตรทฟลัช)`;
      if (isStraight) return `= ${score} แต้ม (เรียง)`;
      if (allJQK) return `= ${score} แต้ม (เซียน)`;
      if (sameSuit) return `= ${score} แต้ม (แต้มธรรมดา สามเด้ง)`;
    }

    if (cards.length === 2 && (cards[0].suit === cards[1].suit || cards[0].value === cards[1].value)) {
      return `= ${score} แต้ม (แต้มธรรมดา สองเด้ง)`;
    }

    return `= ${score} แต้ม (แต้มธรรมดา)`;
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
    socket.on('result', data => setResult(data));
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
    });
    socket.on('enableShowResult', () => {
      setShowResultBtn(true);
    });

    return () => socket.off();
  }, [name]);

  if (showSummary) {
    return (
      <div style={{ padding: 20 }}>
        <h2>สรุปยอดเงินหลังจบเกม</h2>
        <table border="1" cellPadding="10">
          <thead>
            <tr>
              <th>ลำดับ</th>
              <th>ชื่อ</th>
              <th>ยอดเงินคงเหลือ</th>
              <th>กำไร/ขาดทุน</th>
              <th>ได้เงินจาก</th>
              <th>เสียเงินให้</th>
            </tr>
          </thead>
          <tbody>
            {summaryData.map((p, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{p.name}</td>
                <td>{p.balance} บาท</td>
                <td style={{ color: p.net >= 0 ? 'green' : 'red' }}>
                  {p.net >= 0 ? `+${p.net}` : p.net} บาท
                </td>
                <td>{p.income.map(e => `${e.from} (${e.amount}฿)`).join(', ') || '-'}</td>
                <td>{p.expense.map(e => `${e.to} (${e.amount}฿)`).join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <br />
        <button onClick={exitGame}>Exit</button>
      </div>
    );
  }

  const isMyTurn = currentTurnId === socket.id;

  return (
    <div style={{ padding: 20 }}>
      {!inRoom ? (
        <div>
          <h2>ป๊อกเด้งออนไลน์</h2>
          <input placeholder="ชื่อคุณ" onChange={e => setName(e.target.value)} />
          <input placeholder="จำนวนเงิน (ขั้นต่ำ 100)" onChange={e => setMoney(e.target.value)} />
          <input placeholder="Room ID" onChange={e => setRoomId(e.target.value)} />
          <br /><button onClick={createRoom}>สร้างห้องใหม่</button>
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
              {(gameRound === 0 || showStartAgain) && <button onClick={startGame}>{gameRound === 0 ? 'เริ่มเกม' : 'เริ่มเกมอีกครั้ง'}</button>}
              {showResultBtn && <button onClick={showResult}>เปิดไพ่</button>}
              {result.length > 0 && <button onClick={endGame}>จบเกม</button>}
            </>
          )}

          {errorMsg && <p style={{ color: 'red' }}>{errorMsg}</p>}

          <h4>ผู้เล่นภายในห้องนี้:</h4>
          <ul>{players.map((p, i) => <li key={i}>{p}</li>)}</ul>

          {myCards.length > 0 && (
            <div>
              <h3>ไพ่ของคุณ:</h3>
              <p>
                {myCards.map(c => `${c.value}${c.suit}`).join(', ')} {calculateRank(myCards)}
              </p>
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
                        {r.name}: {r.cards} = {r.sum} แต้ม
                        {r.specialType ? ` (${r.specialType})` : ''}
                        {dealerNet >= 0 ? `✅ได้ ${dealerNet} บาท` : `❌เสีย ${-dealerNet} บาท`}
                      </li>
                    );
                  }

                  return (
                    <li key={i}>
                      {r.name}: {r.cards} = {r.sum} แต้ม
                      {r.specialType ? ` (${r.specialType})` : ''}
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
