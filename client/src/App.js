import { useEffect, useRef, useState, useCallback } from "react"; // เพิ่ม useCallback
import io from "socket.io-client";
import "./App.css"; // ตรวจสอบว่าคุณมีไฟล์นี้ หรือลบการ import ถ้าไม่ใช้

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // สำหรับทดสอบ Local

let socketClient = null;
const DEFAULT_TURN_DURATION = 30;

// --- Helper functions for Local Storage ---
const LOCAL_STORAGE_KEY_PREFIX = "pokdeng_game_history_";

/**
 * บันทึกผลลัพธ์ของรอบเกมลง Local Storage
 * @param {string} roomId - ID ของห้อง
 * @param {string} playerId - ID ของผู้เล่นปัจจุบัน
 * @param {number} roundNumber - หมายเลขรอบของเกม
 * @param {Array} resultData - ข้อมูลผลลัพธ์ของรอบ (จาก server)
 * @param {number} betAmountForRound - จำนวนเงินเดิมพันสำหรับรอบนั้น
 */
const saveRoundResultToLocalStorage = (
  roomId,
  playerId,
  roundNumber,
  resultData,
  betAmountForRound
) => {
  if (
    !roomId ||
    !playerId ||
    typeof roundNumber === "undefined" ||
    !resultData ||
    resultData.length === 0
  ) {
    console.warn("[LocalStorage] ข้อมูลไม่ครบถ้วนสำหรับการบันทึก:", {
      roomId,
      playerId,
      roundNumber,
      resultData,
    });
    return;
  }

  const key = `${LOCAL_STORAGE_KEY_PREFIX}${roomId}_${playerId}`;
  try {
    let history = [];
    const storedHistory = localStorage.getItem(key);
    if (storedHistory) {
      try {
        const parsedHistory = JSON.parse(storedHistory);
        if (Array.isArray(parsedHistory)) {
          history = parsedHistory;
        }
      } catch (e) {
        console.error(
          "[LocalStorage] ไม่สามารถอ่านข้อมูลประวัติเดิมได้, เริ่มต้นใหม่:",
          e
        );
        history = []; // ถ้า parse ไม่ได้ ให้เริ่มเป็น array ว่าง
      }
    }

    const newRoundEntry = {
      round: roundNumber,
      timestamp: new Date().toISOString(),
      betAmount: betAmountForRound,
      players: resultData.map((player) => ({
        // เก็บเฉพาะข้อมูลที่จำเป็นและปลอดภัย
        name: player.name,
        role: player.role,
        cards: player.cards ? player.cards.map((c) => ({ ...c })) : [], // clone cards array and objects
        handDetails: player.handDetails ? { ...player.handDetails } : {}, // clone handDetails
        score: player.score,
        netChange: player.netChange, // ผลได้เสียสำหรับผู้เล่นนี้ในรอบนี้
        isMe: player.id === playerId, // ระบุว่าเป็นผู้เล่นคนนี้หรือไม่
      })),
    };

    // ตรวจสอบว่ารอบนี้ (ตาม roundNumber) ถูกบันทึกไปแล้วหรือยัง
    const existingEntryIndex = history.findIndex(
      (entry) => entry.round === roundNumber
    );
    if (existingEntryIndex > -1) {
      // ถ้ามีอยู่แล้ว ให้อัปเดต (เผื่อข้อมูลมีการเปลี่ยนแปลงเล็กน้อย หรือ event มาซ้ำ)
      history[existingEntryIndex] = newRoundEntry;
      console.log(
        `[LocalStorage] อัปเดตผลลัพธ์รอบที่ ${roundNumber} สำหรับห้อง ${roomId}, ผู้เล่น ${playerId}`
      );
    } else {
      history.push(newRoundEntry);
    }

    // เรียงตามรอบ เผื่อมีการบันทึกไม่ตามลำดับ (ไม่น่าเกิด แต่ป้องกันไว้)
    history.sort((a, b) => a.round - b.round);

    // จำกัดจำนวนประวัติที่เก็บ (เช่น 50 รอบล่าสุด)
    const MAX_HISTORY_LENGTH = 50;
    if (history.length > MAX_HISTORY_LENGTH) {
      history = history.slice(history.length - MAX_HISTORY_LENGTH);
    }

    localStorage.setItem(key, JSON.stringify(history));
    // console.log(`[LocalStorage] บันทึกผลลัพธ์รอบที่ ${roundNumber} (เดิมพัน: ${betAmountForRound}) สำหรับห้อง ${roomId}, ผู้เล่น ${playerId}`);
  } catch (error) {
    console.error("[LocalStorage] เกิดข้อผิดพลาดในการบันทึกผลลัพธ์:", error);
  }
};

/**
 * โหลดประวัติเกมจาก Local Storage
 * @param {string} roomId - ID ของห้อง
 * @param {string} playerId - ID ของผู้เล่นปัจจุบัน
 * @returns {Array} - Array ของข้อมูลประวัติ หรือ Array ว่างถ้าไม่มี
 */
const loadGameHistoryFromLocalStorage = (roomId, playerId) => {
  if (!roomId || !playerId) return [];
  const key = `${LOCAL_STORAGE_KEY_PREFIX}${roomId}_${playerId}`;
  try {
    const storedHistory = localStorage.getItem(key);
    if (storedHistory) {
      const history = JSON.parse(storedHistory);
      return Array.isArray(history) ? history : [];
    }
    return [];
  } catch (error) {
    console.error("[LocalStorage] เกิดข้อผิดพลาดในการโหลดประวัติ:", error);
    return [];
  }
};
// --- End Helper functions for Local Storage ---

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
  const [gameRound, setGameRound] = useState(0); // รอบเกม (เริ่มจาก 0 สำหรับรอบแรก)
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

  // --- State for Local Storage History ---
  const [localHistory, setLocalHistory] = useState([]);
  const [showLocalHistoryUI, setShowLocalHistoryUI] = useState(false); // ควบคุมการแสดงผล UI ประวัติ

  // --- Refs for stable access to state within socket handlers ---
  const roomIdRef = useRef(roomId);
  const myPlayerIdRef = useRef(myPlayerId);
  const gameRoundRef = useRef(gameRound);
  const betAmountRef = useRef(betAmount);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);
  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);
  useEffect(() => {
    gameRoundRef.current = gameRound;
  }, [gameRound]);
  useEffect(() => {
    betAmountRef.current = betAmount;
  }, [betAmount]);

  // Memoize addMessage to stabilize its reference
  const addMessage = useCallback((text, type = "info") => {
    const fullText = `[${new Date().toLocaleTimeString()}] ${text}`;
    setMessages((prev) => {
      const newMessages = [...prev, { text: fullText, type }];
      return newMessages.length > 20
        ? newMessages.slice(newMessages.length - 20)
        : newMessages;
    });
    if (["error", "success", "info", "highlight"].includes(type)) {
      setErrorMsg(text);
      setTimeout(
        () => setErrorMsg((current) => (current === text ? "" : current)),
        type === "error" ? 7000 : 5000
      );
    }
  }, []); // setErrorMsg and setMessages are stable

  useEffect(() => {
    // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!socketClient) {
      console.log("[Client] เริ่มการเชื่อมต่อ socket ใหม่ไปที่", SERVER_URL);
      socketClient = io(SERVER_URL, { transports: ["websocket"] });
    }

    function onConnect() {
      console.log("[Client] เชื่อมต่อกับ Server สำเร็จ ID:", socketClient.id);
      setMyPlayerId(socketClient.id);
      setIsConnected(true);
      addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว!", "success");
    }

    function onDisconnect(reason) {
      console.log("[Client] การเชื่อมต่อกับ Server หลุด. เหตุผล:", reason);
      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");
      setIsConnected(false);
    }

    function onConnectError(err) {
      console.error("[Client] ข้อผิดพลาดในการพยายามเชื่อมต่อ:", err);
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
      setGameRound(0); // เริ่มรอบที่ 0 เมื่อสร้างห้อง
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
      setGameRound(data.currentRound || 0); // รับรอบปัจจุบันจาก server หรือเริ่มที่ 0
      // โหลดประวัติทันทีเมื่อเข้าร่วมห้องสำเร็จ
      if (socketClient.id && data.roomId) {
        // socketClient.id คือ myPlayerId ที่เพิ่ง set
        const loadedHistory = loadGameHistoryFromLocalStorage(
          data.roomId,
          socketClient.id
        );
        setLocalHistory(loadedHistory);
      }
    });

    socketClient.on("playersData", (activePlayers) => {
      // console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerIdRef.current); // ใช้ Ref
      if (me) {
        setIsDealer(me.isDealer);
        if (typeof me.hasStayed === "boolean") {
          setHasStayed(me.hasStayed);
        }
      }
    });

    socketClient.on("yourCards", (cardsFromServer) => {
      // console.log(`[Client ${myPlayerIdRef.current || socketClient?.id}] Received 'yourCards'. Data:`, JSON.stringify(cardsFromServer));
      if (
        Array.isArray(cardsFromServer) &&
        cardsFromServer.every(
          (c) =>
            typeof c === "object" && c !== null && "value" in c && "suit" in c
        )
      ) {
        setMyCards(cardsFromServer);
      } else {
        console.warn(
          "[Client] 'yourCards' received invalid data:",
          cardsFromServer
        );
        setMyCards([]);
      }
    });

    socketClient.on("gameStarted", (data) => {
      console.log("[Client] Event 'gameStarted':", data);
      addMessage(`เกมเริ่มแล้ว! เดิมพัน: ${data.betAmount} บาท`, "info");
      if (typeof data.betAmount === "number") setBetAmount(data.betAmount);
      setGameStarted(true);
      setResult([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({});
      // gameRound จะถูกจัดการโดย server หรือเพิ่มเมื่อ 'result'
    });

    socketClient.on("currentTurn", (turnData) => {
      // console.log("[Client] Event 'currentTurn':", turnData);
      setCurrentTurnId(turnData.id);
      setCurrentTurnInfo({
        name: turnData.name,
        role: turnData.role,
        timeLeft: turnData.timeLeft,
      });
      setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);
      if (turnData.id === myPlayerIdRef.current) {
        // ใช้ Ref
        const meInPlayerData = playerData.find(
          (p) => p.id === myPlayerIdRef.current
        ); // ใช้ Ref
        if (!(meInPlayerData && meInPlayerData.hasStayed)) {
          setHasStayed(false);
        }
      }
    });

    socketClient.on("turnTimerUpdate", (timerData) => {
      if (currentTurnId === timerData.playerId) {
        // currentTurnId จาก state ได้
        setCurrentTurnInfo((prev) => ({
          ...prev,
          timeLeft: timerData.timeLeft,
        }));
        if (timerData.playerId === myPlayerIdRef.current)
          setCountdown(timerData.timeLeft); // ใช้ Ref
      }
    });

    socketClient.on("enableShowResult", (canShow) => {
      // console.log("[Client] Enable Show Result:", canShow);
      setShowResultBtn(canShow);
    });

    socketClient.on("lockRoom", (isLockedFromServer) => {
      // console.log("[Client] Room lock status from server:", isLockedFromServer);
      setRoomLocked(isLockedFromServer);
      addMessage(isLockedFromServer ? "ห้องถูกล็อค" : "ห้องถูกปลดล็อค");
    });

    socketClient.on("result", (roundResultsFromServer) => {
      console.log(
        "[Client] Event 'result' from server:",
        roundResultsFromServer
      );
      if (Array.isArray(roundResultsFromServer)) {
        const sortedResults = [...roundResultsFromServer].sort((a, b) => {
          const isADealer = a.role === "เจ้ามือ";
          const isBDealer = b.role === "เจ้ามือ";
          if (isADealer && !isBDealer) return -1;
          if (!isADealer && isBDealer) return 1;
          if (!isADealer && !isBDealer) {
            const numA = parseInt(a.role?.replace(/[^0-9]/g, ""), 10);
            const numB = parseInt(b.role?.replace(/[^0-9]/g, ""), 10);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            if (!isNaN(numA)) return -1;
            if (!isNaN(numB)) return 1;
          }
          return 0;
        });
        setResult(sortedResults);

        // --- LOCAL STORAGE SAVE ---
        const currentRoomIdVal = roomIdRef.current;
        const currentPlayerIdVal = myPlayerIdRef.current;
        const currentRoundVal = gameRoundRef.current; // gameRound คือรอบที่เพิ่งจบไป
        const currentBetAmountVal = betAmountRef.current;

        if (
          currentRoomIdVal &&
          currentPlayerIdVal &&
          sortedResults.length > 0
        ) {
          saveRoundResultToLocalStorage(
            currentRoomIdVal,
            currentPlayerIdVal,
            currentRoundVal,
            sortedResults,
            currentBetAmountVal
          );
          // อัปเดต state ของ localHistory ทันทีหากกำลังแสดงผลอยู่
          if (showLocalHistoryUI) {
            const updatedHistory = loadGameHistoryFromLocalStorage(
              currentRoomIdVal,
              currentPlayerIdVal
            );
            setLocalHistory(updatedHistory);
          }
        }
        // --- END LOCAL STORAGE SAVE ---
      } else {
        setResult([]);
      }
      setGameStarted(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
      setGameRound((prev) => prev + 1); // เพิ่มรอบสำหรับรอบถัดไป
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
      setRevealedPokPlayers({});
      // gameRound อาจจะถูก reset โดย server หรือคงไว้เพื่อเริ่มรอบใหม่ในห้องเดิม
      // หากต้องการ reset round number ด้วย ต้องให้ server ส่งมา หรือ client จัดการเอง
      // setGameRound(0); // ถ้าต้องการเริ่มนับรอบใหม่ทั้งหมด
    });

    socketClient.on("player_revealed_pok", (data) => {
      // console.log("[Client] Player revealed Pok:", data);
      if (data && data.playerId && data.cards && data.handDetails) {
        addMessage(
          `${data.role || "ขาไพ่"} (${data.name}) ${
            data.handDetails.name || "ป๊อก!"
          } แสดงไพ่: ${data.cards.map(getCardDisplay).join(" ")}`,
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
        console.warn(
          "[Client] Received invalid data for player_revealed_pok:",
          data
        );
      }
    });

    socketClient.on("gameEnded", (gameSummary) => {
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary);
      setSummaryData(
        gameSummary.map((p) => ({
          ...p,
          isDealer:
            playerData.find((pd) => pd.id === p.id)?.isDealer ||
            p.role === "เจ้ามือ",
        }))
      );
      setShowSummary(true);
      setGameStarted(false);
      setResult([]);
      setCurrentTurnId(null);
      // ณ จุดนี้ เกมทั้ง session สิ้นสุด อาจจะไม่ต้องบันทึก local storage เพิ่มเติม
      // เว้นแต่ว่า gameSummary คือผลสรุปของรอบสุดท้าย ซึ่ง event 'result' ควรจะจัดการไปแล้ว
    });

    socketClient.on("errorMessage", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Error"), "error")
    );
    socketClient.on("message", (msg) =>
      addMessage(msg.text || (typeof msg === "string" ? msg : "Message"))
    );
    socketClient.on("playerLeft", (data) =>
      addMessage(`${data.name} ${data.message || "ออกจากห้อง"}`)
    );

    socketClient.on("roomSettings", (settings) => {
      // console.log("[Client] Received 'roomSettings'. Data:", settings);
      if (settings && typeof settings.betAmount === "number") {
        addMessage(
          `[EVENT] ราคาเดิมพันอัปเดตเป็น: ${settings.betAmount} (จาก roomSettings)`,
          "info"
        );
        setBetAmount(settings.betAmount);
        const amIDealer = playerData.find(
          (p) => p.id === myPlayerIdRef.current && p.isDealer
        ); // ใช้ Ref
        if (amIDealer) {
          setInputBetAmount(settings.betAmount.toString());
        }
      } else {
        console.warn(
          "[Client] 'roomSettings' received invalid data:",
          settings
        );
      }
    });

    return () => {
      if (socketClient) {
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
    // Dependencies for socket setup. `addMessage` is memoized.
    // `playerData` อาจจะไม่จำเป็นถ้าการอ้างอิงถึงมันถูกจัดการผ่าน ref หรือ state อื่นๆ ที่เหมาะสม
  }, [addMessage, name]); // `name` ใช้ใน roomCreated, `playerData` อาจจะต้องพิจารณาอีกครั้ง

  // Countdown timer effect
  useEffect(() => {
    let timer;
    if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      myCards.length >= 2 &&
      !hasStayed &&
      countdown > 0
    ) {
      timer = setTimeout(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    } else if (
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      countdown === 0
    ) {
      if (socketClient && socketClient.connected) {
        addMessage("หมดเวลา! ทำการ 'อยู่' อัตโนมัติ", "info");
        socketClient.emit("stay", roomIdRef.current); // ใช้ Ref
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
    addMessage,
  ]); // roomId ไม่ได้ใช้ตรงๆ ในนี้แล้ว

  // useEffect สำหรับคำนวณ transferSummary
  useEffect(() => {
    if (showSummary && summaryData.length > 0 && myPlayerId) {
      const currentUserSummary = summaryData.find((p) => p.id === myPlayerId);
      if (!currentUserSummary) {
        console.warn(
          "[Client] Cannot find current user in summaryData for transfer calculation."
        );
        setTransferSummary({ toPay: [], toReceive: [] });
        return;
      }
      const amIDealerNow = currentUserSummary.isDealer;
      const toPayList = [];
      const toReceiveList = [];
      if (!amIDealerNow) {
        if (currentUserSummary.netChange < 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer)
            toPayList.push({
              name: dealer.name,
              role: dealer.role,
              amount: Math.abs(currentUserSummary.netChange),
            });
        } else if (currentUserSummary.netChange > 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer)
            toReceiveList.push({
              name: dealer.name,
              role: dealer.role,
              amount: currentUserSummary.netChange,
            });
        }
      } else {
        summaryData.forEach((player) => {
          if (player.id === myPlayerId) return;
          if (player.netChange > 0)
            toPayList.push({
              name: player.name,
              role: player.role,
              amount: player.netChange,
            });
          else if (player.netChange < 0)
            toReceiveList.push({
              name: player.name,
              role: player.role,
              amount: Math.abs(player.netChange),
            });
        });
      }
      setTransferSummary({ toPay: toPayList, toReceive: toReceiveList });
    } else if (!showSummary) {
      setTransferSummary({ toPay: [], toReceive: [] });
    }
  }, [showSummary, summaryData, myPlayerId]);

  // --- Effect for loading local history when component mounts or relevant IDs change ---
  useEffect(() => {
    const currentRoomIdVal = roomIdRef.current;
    const currentPlayerIdVal = myPlayerIdRef.current;
    if (currentRoomIdVal && currentPlayerIdVal) {
      const loadedHistory = loadGameHistoryFromLocalStorage(
        currentRoomIdVal,
        currentPlayerIdVal
      );
      setLocalHistory(loadedHistory);
      // console.log("[LocalStorage] โหลดประวัติเมื่อ roomId/myPlayerId เปลี่ยน:", loadedHistory);
    } else {
      setLocalHistory([]); // เคลียร์ประวัติถ้าไม่มีห้องหรือผู้เล่น
    }
  }, [roomId, myPlayerId]); // ทำงานเมื่อ roomId หรือ myPlayerId จาก state เปลี่ยน (ซึ่งจะอัปเดต ref ด้วย)

  // --- Handlers ---
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
    if (isNaN(bal) || bal < 50 || bal % 10 !== 0) {
      addMessage(
        "จำนวนเงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 50 และต้องลงท้ายด้วย 0 เท่านั้น",
        "error"
      );
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
    if (isNaN(bal) || bal < 10 || bal % 10 !== 0) {
      addMessage(
        "จำนวนเงินเริ่มต้นต้องเป็นตัวเลข, ขั้นต่ำ 10 และต้องลงท้ายด้วย 0 เท่านั้น",
        "error"
      );
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
      if (
        !isNaN(amount) &&
        amount >= 5 &&
        (amount % 10 === 0 || amount % 5 === 0)
      ) {
        console.log("[Client] Emitting 'setBetAmount' with amount:", amount);
        socketClient.emit("setBetAmount", {
          roomId: roomIdRef.current,
          amount,
        }); // ใช้ Ref
      } else {
        addMessage(
          "จำนวนเงินเดิมพันต้องเป็นตัวเลข, ไม่น้อยกว่า 5 และลงท้ายด้วย 0 หรือ 5",
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
      socketClient.emit("lockRoom", {
        roomId: roomIdRef.current,
        lock: !roomLocked,
      }); // ใช้ Ref
    }
  };

  const handleCopyRoomId = () => {
    if (!roomIdRef.current) return; // ใช้ Ref
    navigator.clipboard
      .writeText(roomIdRef.current)
      .then(() =>
        addMessage(
          `คัดลอกเลขห้อง "${roomIdRef.current}" เรียบร้อยแล้ว`,
          "success"
        )
      )
      .catch((err) => {
        console.error("คัดลอกไม่สำเร็จ:", err);
        addMessage("คัดลอกเลขห้องไม่สำเร็จ", "error");
      });
  };

  const handleStartGame = () => {
    if (
      socketClient &&
      socketClient.connected &&
      roomIdRef.current &&
      isDealer
    ) {
      // ใช้ Ref
      if (betAmountRef.current <= 0) {
        addMessage("กรุณากำหนดเงินเดิมพันก่อนเริ่มเกม", "error");
        return;
      } // ใช้ Ref
      console.log(
        "[Client] Attempting 'startGame'. RoomId:",
        roomIdRef.current,
        "IsDealer:",
        isDealer
      );
      socketClient.emit("startGame", roomIdRef.current); // ใช้ Ref
    } else {
      addMessage("ไม่สามารถเริ่มเกมได้", "error");
    }
  };

  const handleDrawCard = () => {
    if (
      socketClient &&
      socketClient.connected &&
      gameStarted &&
      currentTurnId === myPlayerId &&
      !hasStayed &&
      myCards.length < 3
    ) {
      console.log("[Client] Emitting 'drawCard' in room:", roomIdRef.current); // ใช้ Ref
      socketClient.emit("drawCard", roomIdRef.current); // ใช้ Ref
    } else {
      addMessage("ไม่สามารถจั่วไพ่ได้ในขณะนี้", "error");
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
      console.log("[Client] Emitting 'stay' in room:", roomIdRef.current); // ใช้ Ref
      socketClient.emit("stay", roomIdRef.current); // ใช้ Ref
      setHasStayed(true);
    } else {
      addMessage("ไม่สามารถอยู่ได้ในขณะนี้", "error");
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
      console.log(
        "[Client] Emitting 'showResult' for room:",
        roomIdRef.current
      ); // ใช้ Ref
      socketClient.emit("showResult", roomIdRef.current); // ใช้ Ref
    } else {
      addMessage("ไม่สามารถแสดงผลได้ในขณะนี้", "error");
    }
  };

  const handleResetGameHandler = () => {
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'resetGame' for room:", roomIdRef.current); // ใช้ Ref
      socketClient.emit("resetGame", roomIdRef.current); // ใช้ Ref
    }
  };

  const handleEndGame = () => {
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'endGame' for room:", roomIdRef.current); // ใช้ Ref
      socketClient.emit("endGame", roomIdRef.current); // ใช้ Ref
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
    // console.warn("[Client] getCardDisplay received invalid card object:", card);
    return "?";
  };

  // --- Function to toggle Local History UI ---
  const toggleShowLocalHistory = () => {
    if (!showLocalHistoryUI) {
      // ถ้ากำลังจะเปิดดู ให้โหลดข้อมูลล่าสุด
      const currentRoomIdVal = roomIdRef.current;
      const currentPlayerIdVal = myPlayerIdRef.current;
      if (currentRoomIdVal && currentPlayerIdVal) {
        const loadedHistory = loadGameHistoryFromLocalStorage(
          currentRoomIdVal,
          currentPlayerIdVal
        );
        setLocalHistory(loadedHistory);
      }
    }
    setShowLocalHistoryUI((prev) => !prev);
  };

  // ... (calculateRankForDisplay, myCurrentPlayerData, myHandType, isMyTurn - เหมือนเดิม) ...
  // (ฟังก์ชัน getCardPoint, calculateRankForDisplay ไม่เปลี่ยนแปลง)
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
        type =
          calculatedScore === 0
            ? "บอดสองเด้ง"
            : `${calculatedScore} แต้มสองเด้ง`;
      } else {
        type = calculatedScore === 0 ? "บอด" : `${calculatedScore} แต้ม`;
      }
    } else if (cardsToRank.length === 3) {
      const suits = cardsToRank.map((c) => c.suit);
      const card_raw_values = cardsToRank.map((c) => c.value);
      const isSameSuit = suits.every((s) => s === suits[0]);
      const isTaong = card_raw_values.every(
        (val) => val === card_raw_values[0]
      );
      const n_vals_for_straight = [...card_raw_values]
        .map(
          (v_str) => ({ A: 1, J: 11, Q: 12, K: 13 }[v_str] || parseInt(v_str))
        )
        .sort((a, b) => a - b);
      let is_straight_result = false;
      if (
        n_vals_for_straight.length === 3 &&
        n_vals_for_straight.every((n) => typeof n === "number" && !isNaN(n))
      ) {
        if (
          n_vals_for_straight[1] === n_vals_for_straight[0] + 1 &&
          n_vals_for_straight[2] === n_vals_for_straight[1] + 1 &&
          !(
            n_vals_for_straight[0] === 1 &&
            n_vals_for_straight[1] === 2 &&
            n_vals_for_straight[2] === 3
          )
        ) {
          is_straight_result = true;
        }
        if (
          n_vals_for_straight[0] === 1 &&
          n_vals_for_straight[1] === 12 &&
          n_vals_for_straight[2] === 13
        ) {
          // QKA
          is_straight_result = true;
        }
      }
      const is_sian_result = card_raw_values.every((v_str) =>
        ["J", "Q", "K"].includes(v_str)
      );
      if (isTaong) type = `ตอง ${card_raw_values[0]}`;
      else if (is_straight_result && isSameSuit) type = "สเตรทฟลัช";
      else if (is_sian_result) type = "เซียน";
      else if (is_straight_result) type = "เรียง";
      else if (isSameSuit)
        type =
          calculatedScore === 0
            ? "สามเด้ง (บอด)"
            : `${calculatedScore} แต้มสามเด้ง`;
      else {
        if (calculatedScore === 9) type = "9 หลัง";
        else if (calculatedScore === 8) type = "8 หลัง";
        else type = calculatedScore === 0 ? "บอด" : `${calculatedScore} แต้ม`;
      }
    }
    if (type === "0 แต้ม") type = "บอด";
    return { score: calculatedScore, type };
  };

  const myCurrentPlayerData = playerData.find((p) => p.id === myPlayerId);
  let myHandType = "ยังไม่มีไพ่";
  if (
    myCards &&
    myCards.length > 0 &&
    gameStarted &&
    (!result || result.length === 0)
  ) {
    const rankData = calculateRankForDisplay(myCards);
    myHandType = rankData.type;
  }
  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed;

  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId); // หาข้อมูลขาไพ่ปัจจุบัน

    return (
      <div className="App-summary">
        <h2>สรุปยอดต้องโอนให้และต้องได้ (ห้อง: {roomId})</h2>{" "}
        <h3>
          ชื่อขาไพ่: {me?.name || name} ({" "}
          {me?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")}){" "}
        </h3>
        <hr />{" "}
        {transferSummary.toReceive.length > 0 && (
          <>
            {" "}
            <h3 style={{ color: "green", marginTop: "20px" }}>
              ยอดที่จะได้รับ:{" "}
            </h3>{" "}
            {transferSummary.toReceive.map((item, index) => (
              <p
                key={`receive-${index}`}
                style={{ color: "green", marginLeft: "20px" }}
              >
                - จาก {item.name} ({item.role}): {item.amount.toLocaleString()}{" "}
                บาท{" "}
              </p>
            ))}
            <hr />{" "}
          </>
        )}{" "}
        {transferSummary.toPay.length > 0 && (
          <>
            {" "}
            <h3 style={{ color: "red", marginTop: "20px" }}>
              ยอดที่ต้องโอน:
            </h3>{" "}
            {transferSummary.toPay.map((item, index) => (
              <p
                key={`pay-${index}`}
                style={{ color: "red", marginLeft: "20px" }}
              >
                - ให้ {item.name} ({item.role}): {item.amount.toLocaleString()}{" "}
                บาท{" "}
              </p>
            ))}
            <hr />{" "}
          </>
        )}{" "}
        {transferSummary.toReceive.length === 0 &&
          transferSummary.toPay.length === 0 && (
            <p style={{ textAlign: "center", marginTop: "20px" }}>
              ไม่มีรายการได้เสียสำหรับคุณในรอบนี้{" "}
            </p>
          )}{" "}
        <h3 style={{ marginTop: "20px" }}>
          ยอดเงินคงเหลือของคุณ:{" "}
          {(me?.finalBalance !== undefined
            ? me.finalBalance
            : parseInt(money)
          )?.toLocaleString()}{" "}
          บาท{" "}
        </h3>{" "}
        {me && ( // แสดงส่วนนี้ต่อเมื่อมีข้อมูล me
          <p
            style={{
              fontStyle: "italic",

              textAlign: "center",

              color: "#555",

              marginTop: "10px",
            }}
          >
            (ยอดเงินเริ่มต้น: {me.initialBalance?.toLocaleString()} บาท,
            กำไร/ขาดทุนสุทธิ:{" "}
            <span className={me.netChange >= 0 ? "profit" : "loss"}>
              {" "}
              {me.netChange > 0
                ? `+${me.netChange?.toLocaleString()}`
                : me.netChange?.toLocaleString() || "0"}{" "}
              บาท{" "}
            </span>
            ){" "}
          </p>
        )}{" "}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากเกม (เริ่มใหม่){" "}
        </button>{" "}
      </div>
    );
  }

  if (!inRoom) {
    return (
      <div className="App-lobby">
        <h2>ป๊อกเด้ง ออนไลน์</h2>{" "}
        {errorMsg && (
          <p
            className="error-message"
            style={{
              color: "#000000", // กำหนดสีตัวอักษรเป็นสีดำ

              border: "1px solid #551818",

              padding: "5px",

              backgroundColor: "#eeeeee",

              whiteSpace: "pre-wrap",
            }}
          >
            {errorMsg}{" "}
          </p>
        )}
        ชื่อคุณ:{" "}
        <input
          type="text"
          placeholder="กรุณาใส่ชื่อของคุณ"
          value={name}
          onChange={(e) => setName(e.target.value)}
        ></input>
        เงินเริ่มต้น:{" "}
        <input
          type="number"
          placeholder="เงินเริ่มต้น (ขั้นต่ำ 50)"
          value={money}
          onChange={(e) => setMoney(e.target.value)}
          min="50"
          step="10"
        />
        &nbsp;&nbsp;&nbsp;{" "}
        <div style={{ marginTop: 20 }}>
          {" "}
          <button
            onClick={handleCreateRoom}
            disabled={!isConnected || !name.trim() || !money.trim()}
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
          disabled={
            !inputRoomId.trim() || !isConnected || !name.trim() || !money.trim()
          }
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
        <h1>
          ห้อง:&nbsp;{" "}
          <button
            className="text-button2"
            onClick={handleCopyRoomId}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomId}{" "}
          </button>{" "}
        </h1>{" "}
        <p>
          คุณ: {name}{" "}
          {isDealer ? "(เจ้ามือ)" : `(${myCurrentPlayerData?.role || "ขาไพ่"})`}{" "}
          | เงินคงเหลือ:{" "}
          {myCurrentPlayerData?.balance?.toLocaleString() || money} |
          ห้อง:&nbsp;{" "}
          <button
            className="text-button"
            onClick={handleCopyRoomId}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomId}{" "}
          </button>{" "}
        </p>{" "}
        <p style={{ color: roomLocked ? "red" : "green" }}>
          สถานะห้อง:{" "}
          <button
            className="text-button2"
            onClick={handleToggleLockRoom}
            title="คลิกเพื่อคัดลอกรหัสห้อง"
          >
            {roomLocked ? "ล็อค" : "เปิด"}{" "}
          </button>{" "}
        </p>{" "}
      </header>{" "}
      {errorMsg && (
        <p
          className="error-message"
          style={{
            border: "1px solid #3c763d",

            padding: "5px",

            backgroundColor: " #dff0d8",

            whiteSpace: "pre-wrap",
          }}
        >
          {errorMsg}{" "}
        </p>
      )}{" "}
      {!gameStarted && isDealer && (!result || result.length === 0) && (
        <div className="dealer-controls pre-game">
          <h4>ตั้งค่าเกม (เจ้ามือ): ขั้นต่ำ 5 บาท</h4>{" "}
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
        </div>
      )}{" "}
      <div className="players-list">
        {" "}
        <h4>
          ราคาเดิมพันต่อรอบ:{" "}
          {betAmount > 0
            ? `${betAmount.toLocaleString()} บาท`
            : "รอเจ้ามือกำหนด"}{" "}
        </h4>
        <h4>ขาไพ่ในห้อง: ({playerData.length} คน)</h4>{" "}
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
              {revealedPokPlayers[user.id] &&
                user.id !== myPlayerId &&
                gameStarted &&
                (!result || result.length === 0) && (
                  <div className="revealed-pok-cards">
                    <strong>ไพ่ที่ป๊อก:</strong>{" "}
                    {revealedPokPlayers[user.id].cards.map((card, cIdx) => (
                      <span key={cIdx} className="card-display">
                        {getCardDisplay(card)}{" "}
                      </span>
                    ))}{" "}
                    <em>{revealedPokPlayers[user.id].handDetails.type}</em>{" "}
                  </div>
                )}{" "}
            </li>
          ))}{" "}
        </ul>{" "}
      </div>{" "}
      {gameStarted &&
        myCards &&
        myCards.length > 0 &&
        (!result || result.length === 0) && (
          <div className="my-cards-area">
            {" "}
            <h2>
              ไพ่ของคุณ:{" "}
              {myCards.map((card, idx) => (
                <span key={idx}>{getCardDisplay(card)} </span>
              ))}{" "}
            </h2>{" "}
            <p>
              <h2>{myHandType}</h2>{" "}
            </p>{" "}
            {isMyTurn && myCards.length >= 2 && !hasStayed && (
              <div className="player-actions">
                {" "}
                {/* คลาสนี้สำหรับจัดกึ่งกลางเนื้อหาทั้งหมดในส่วนนี้ */}{" "}
                <p className="turn-info">ตาของคุณ! เวลา: {countdown} วินาที </p>{" "}
                {/* คลาสสำหรับข้อความตา */}{" "}
                <div className="action-buttons">
                  {" "}
                  {/* Div ใหม่สำหรับครอบปุ่ม */}{" "}
                  {myCards.length < 3 && (
                    <button
                      onClick={handleDrawCard}
                      disabled={hasStayed || myCards.length >= 3}
                    >
                      จั่ว{" "}
                    </button>
                  )}{" "}
                  <button onClick={handleStay} disabled={hasStayed}>
                    อยู่{" "}
                  </button>{" "}
                </div>{" "}
              </div>
            )}{" "}
          </div>
        )}{" "}
      {!isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            รอ... ({currentTurnInfo.role}) {currentTurnInfo.name} ({" "}
            {currentTurnInfo.timeLeft} วิ) ⌛{" "}
          </p>
        )}{" "}
      {isDealer &&
        currentTurnId &&
        currentTurnId !== myPlayerId &&
        gameStarted &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">
            ขาไพ่ที่ ({currentTurnInfo.role}) {currentTurnInfo.name}{" "}
            กำลังตัดสินใจ ({currentTurnInfo.timeLeft} วิ)...{" "}
          </p>
        )}{" "}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        showResultBtn &&
        (!result || result.length === 0) && (
          <div className="turn-indicator">
            {" "}
            <button className="btn-inroom-endgame2" onClick={handleShowResult}>
              เปิดไพ่ดวล{" "}
            </button>{" "}
          </div>
        )}{" "}
      {isDealer &&
        !currentTurnId &&
        gameStarted &&
        !showResultBtn &&
        (!result || result.length === 0) && (
          <p className="turn-indicator">รอขาไพ่ทุกคนตัดสินใจ...</p>
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
                <th>ชื่อขาไพ่</th> <th>ไพ่</th>
                <th>แต้ม</th> <th>ประเภท</th>
                <th>ผล</th> <th>ได้/เสีย</th>
                <th>เงินคงเหลือ</th>{" "}
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
                  {" "}
                  <td>
                    {r.name} ({r.role || "N/A"}){" "}
                  </td>
                  <td>{r.cardsDisplay || "N/A"}</td>
                  <td>{r.score}</td> <td>{r.specialType}</td>{" "}
                  <td>
                    {r.outcome === "ชนะ" && "✅ ชนะ"}
                    {r.outcome === "แพ้" && "❌ แพ้"}
                    {r.outcome === "เสมอ" && "🤝 เสมอ"}{" "}
                    {r.outcome === "เจ้ามือ" && "เจ้ามือ"}{" "}
                    {r.outcome === "ขาดการเชื่อมต่อ" && "ขาดการเชื่อมต่อ"}{" "}
                    {![
                      "ชนะ",

                      "แพ้",

                      "เสมอ",

                      "เจ้ามือ",

                      "ขาดการเชื่อมต่อ",
                    ].includes(r.outcome) && r.outcome}{" "}
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
                      ? `${
                          r.moneyChange > 0 ? "+" : ""
                        }${r.moneyChange?.toLocaleString()} บาท`
                      : "-"}{" "}
                  </td>
                  <td>{r.balance?.toLocaleString()} บาท</td>{" "}
                </tr>
              ))}{" "}
            </tbody>{" "}
          </table>{" "}
        </div>
      )}{" "}
      {isDealer &&
        (!gameStarted || (result && result.length > 0)) &&
        !showSummary && (
          <div className="turn-indicator">
            {" "}
            <button
              className="btn-inroom-start1"
              onClick={handleStartGame}
              disabled={betAmount <= 0}
            >
              &nbsp;&nbsp; &nbsp;{" "}
              {gameRound > 0 || (result && result.length > 0)
                ? "เริ่มเกมรอบใหม่"
                : "เริ่มเกม"}
              &nbsp;&nbsp;&nbsp;{" "}
            </button>{" "}
            <button
              className="btn-inroom-restart"
              onClick={handleResetGameHandler}
            >
              รีเซ็ตตา&สับไพ่{" "}
            </button>{" "}
            <button className="btn-inroom-result" onClick={handleEndGame}>
              จบเกม&ดูสรุปยอด{" "}
            </button>{" "}
          </div>
        )}{" "}
      {!isDealer &&
        result &&
        result.length > 0 &&
        !gameStarted &&
        !showSummary && (
          <p className="btn-inroom-waitinggame">
            {" "}
            <center>--- รอเจ้ามือเริ่มรอบใหม่ หรือ จบเกม ---</center>{" "}
          </p>
        )}{" "}
      <div className="turn-indicator">
        {" "}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากห้อง{" "}
        </button>{" "}
      </div>{" "}
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
