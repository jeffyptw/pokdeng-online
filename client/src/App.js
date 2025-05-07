// App.js
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';

const socket = io('https://pokdeng-online1.onrender.com');

function App() {
  const [roomId, setRoomId] = useState('');
  const [name, setName] = useState('');
  const [balance, setBalance] = useState(100);
  const [cards, setCards] = useState([]);
  const [players, setPlayers] = useState([]);
  const [isDealer, setIsDealer] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [canShowResult, setCanShowResult] = useState(false);
  const [result, setResult] = useState([]);
  const [summary, setSummary] = useState([]);
  const [myId, setMyId] = useState('');
  const [turnId, setTurnId] = useState('');

  useEffect(() => {
    socket.on('connect', () => setMyId(socket.id));

    socket.on('yourCards', ({ cards }) => setCards(cards));
    socket.on('playersList', list => setPlayers(list));
    socket.on('currentTurn', ({ id }) => setTurnId(id));
    socket.on('enableShowResult', () => setCanShowResult(true));
    socket.on('result', data => {
      setResult(data);
      setCanShowResult(false);
    });
    socket.on('summaryData', data => setSummary(data));
    socket.on('resetGame', () => {
      setResult([]);
      setSummary([]);
    });
    socket.on('lockRoom', () => {
      // ห้องล็อค
    });
    socket.on('gameEnded', () => {
      socket.emit('requestSummary', { roomId });
    });
  }, [roomId]);

  const handleCreate = () => {
    socket.emit('createRoom', { name, balance }, ({ roomId }) => {
      setRoomId(roomId);
      setHasJoined(true);
      setIsDealer(true);
    });
  };

  const handleJoin = () => {
    socket.emit('joinRoom', { roomId, name, balance }, ({ success }) => {
      if (success) {
        setHasJoined(true);
        setIsDealer(false);
      } else {
        alert('เข้าห้องไม่สำเร็จ');
      }
    });
  };

  const handleStart = () => {
    socket.emit('startGame', { roomId });
  };

  const handleDraw = () => {
    socket.emit('drawCard', { roomId });
  };

  const handleStay = () => {
    socket.emit('stay', { roomId });
  };

  const handleShowResult = () => {
    socket.emit('showResult', { roomId });
  };

  const handleEndGame = () => {
    socket.emit('endGame', { roomId });
  };

  const handleExit = () => {
    window.location.reload();
  };

  const renderResult = () => (
    result.length > 0 && (
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
                  {dealerNet >= 0 ? ` ✅ เจ้ามือ ได้ ${dealerNet} บาท` : ` ❌ เจ้ามือ เสีย ${-dealerNet} บาท`}
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
        {isDealer && <button onClick={handleEndGame}>จบเกม</button>}
      </div>
    )
  );

  const renderSummary = () => (
    summary.length > 0 && (
      <div>
        <h3>สรุปยอดเงินหลังจบเกม</h3>
        <table border="1" cellPadding="5">
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
            {summary.map((s, idx) => (
              <tr key={idx}>
                <td>{idx + 1}</td>
                <td>{s.name}</td>
                <td>{s.balance} บาท</td>
                <td style={{ color: s.net >= 0 ? 'green' : 'red' }}>
                  {s.net >= 0 ? `+${s.net} บาท` : `${s.net} บาท`}
                </td>
                <td>
                  {s.income.map((x, i) => (
                    <div key={i}>{x.from} ({x.amount}฿)</div>
                  ))}
                </td>
                <td>
                  {s.expense.map((x, i) => (
                    <div key={i}>{x.to} ({x.amount}฿)</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={handleExit}>Exit</button>
      </div>
    )
  );

  if (!hasJoined) {
    return (
      <div>
        <h2>ป๊อกเด้งออนไลน์</h2>
        <input placeholder="ชื่อ" value={name} onChange={e => setName(e.target.value)} />
        <input type="number" placeholder="เงิน" value={balance} onChange={e => setBalance(Number(e.target.value))} />
        <button onClick={handleCreate}>สร้างห้อง</button>
        <br />
        <input placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
        <button onClick={handleJoin}>เข้าร่วมห้อง</button>
      </div>
    );
  }

  return (
    <div>
      <h3>ห้อง: {roomId}</h3>
      <p>ชื่อ : {name}</p>
      <p>บท: {isDealer ? 'เจ้ามือ' : 'ขาไพ่'}</p>

      {players.length > 0 && (
        <div>
          <h4>ผู้เล่นภายในห้องนี้:</h4>
          <ul>
            {players.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {cards.length > 0 && (
        <p><b>ไพ่ของคุณ:</b> {cards.map(c => `${c.value}${c.suit}`).join(', ')}</p>
      )}

      {isDealer && result.length === 0 && <button onClick={handleStart}>เริ่มเกมอีกครั้ง</button>}

      {!isDealer && myId === turnId && (
        <>
          <button onClick={handleDraw}>จั่ว</button>
          <button onClick={handleStay}>ไม่จั่ว</button>
        </>
      )}

      {isDealer && canShowResult && <button onClick={handleShowResult}>เปิดไพ่</button>}

      {renderResult()}
      {renderSummary()}
    </div>
  );
}

export default App;
