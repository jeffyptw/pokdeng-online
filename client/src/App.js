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

  const [transferSummary, setTransferSummary] = useState({
    toPay: [],

    toReceive: [],
  });

  const [revealedPokPlayers, setRevealedPokPlayers] = useState({});

  const [errorMsg, setErrorMsg] = useState("");

  const [messages, setMessages] = useState([]);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    //messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (text, type = "info") => {
    const fullText = `[${new Date().toLocaleTimeString()}] ${text}`;

    setMessages((prev) => {
      const newMessages = [...prev, { text: fullText, type }];

      if (newMessages.length > 20)
        return newMessages.slice(newMessages.length - 20);

      return newMessages;
    });

    if (
      type === "error" ||
      type === "success" ||
      type === "info" ||
      type === "highlight"
    ) {
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

      // setMyPlayerId(socketClient.id); // <<-- จะยังไม่ตั้ง myPlayerId ทันทีตรงนี้
      // เพราะถ้าเป็นการ reconnect, server จะส่ง myPlayerId (ใหม่) กลับมาอีกที
      // หรือถ้าเป็นการ join ใหม่, myPlayerId จะถูกตั้งตอน roomCreated/joinedRoom/reconnected

      setIsConnected(true);
      // addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว!", "success"); // <<-- อาจจะย้าย message นี้ไปแสดงหลัง reconnect สำเร็จ หรือถ้าไม่ใช่การ reconnect

      // --- เพิ่มตรงนี้ ---
      const storedRoomId = localStorage.getItem("pokDengRoomId");
      const storedOldPlayerId = localStorage.getItem("pokDengPlayerId"); // นี่คือ socket.id เก่า

      if (storedRoomId && storedOldPlayerId) {
        console.log(
          `[Client] Found stored session: roomId=${storedRoomId}, oldPlayerId=${storedOldPlayerId}. Attempting to reconnect...`
        );
        addMessage("กำลังพยายามเชื่อมต่อกลับเข้าห้อง...", "info");

        socketClient.emit("attemptReconnect", {
          roomId: storedRoomId,
          playerId: storedOldPlayerId, // นี่คือ ID เก่าที่ Server จะใช้ค้นหาผู้เล่น
          oldSocketId: storedOldPlayerId, // ส่ง oldSocketId ไปด้วย (เหมือนกับ playerId ในกรณีนี้)
          // Server จะใช้ oldSocketId ในการ map ไปหาผู้เล่นเดิม
          // และจะอัปเดต socket id ของผู้เล่นนั้นเป็น socketClient.id (ใหม่) นี้
        });
        // ไม่ต้อง setMyPlayerId หรือ setInRoom ทันที รอการตอบกลับจาก server (reconnected หรือ reconnectFailed)
      } else {
        // ไม่มีข้อมูล session เก่า หรือผู้ใช้เคลียร์ localStorage เอง
        // นี่คือการเชื่อมต่อใหม่ปกติ (ไม่ใช่การ reconnect)
        setMyPlayerId(socketClient.id); // ตั้ง myPlayerId สำหรับการ join ใหม่
        addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว! (New session)", "success");
        console.log("[Client] No stored session found. New connection.");
        // ณ จุดนี้ ผู้ใช้จะต้อง create หรือ join room ตามปกติ
      }
    }

    function onDisconnect(reason) {
      console.log("[Client] Disconnected from server. Reason:", reason);

      addMessage(`การเชื่อมต่อกับ Server หลุด! (${reason})`, "error");

      setIsConnected(false);
    }

    function onConnectError(err) {
      console.error("[Client] Connection Attempt Error:", err);

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
      if (socketClient && socketClient.id) {
        setMyPlayerId(socketClient.id);
        localStorage.setItem("pokDengRoomId", data.roomId);
        localStorage.setItem("pokDengPlayerId", socketClient.id); // ใช้ socketClient.id ปัจจุบัน
        console.log(
          `[Client] Saved to localStorage: roomId=${data.roomId}, playerId=${socketClient.id}`
        );
      } else {
        console.warn(
          "[Client] Could not save to localStorage: socketClient.id is not available in roomCreated."
        );
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
      if (socketClient && socketClient.id) {
        setMyPlayerId(socketClient.id);
        localStorage.setItem("pokDengRoomId", data.roomId);
        localStorage.setItem("pokDengPlayerId", socketClient.id); // ใช้ socketClient.id ปัจจุบัน
        console.log(
          `[Client] Saved to localStorage: roomId=${data.roomId}, playerId=${socketClient.id}`
        );
      } else {
        console.warn(
          "[Client] Could not save to localStorage: socketClient.id is not available in joinedRoom."
        );
      }
    });

    const handleReconnected = (data) => {
      console.log("[Client] Reconnected successfully!", data);
      addMessage("เชื่อมต่อกลับเข้าห้องสำเร็จ!", "success");

      setRoomId(data.roomId);
      setMyPlayerId(data.myPlayerId); // Server จะส่ง myPlayerId ใหม่มาให้ (ซึ่งก็คือ socketClient.id ปัจจุบัน)
      setIsDealer(data.isDealer || false);
      setInRoom(true);
      setGameStarted(data.gameStarted || false);
      setBetAmount(data.betAmount || 0);
      // setInputBetAmount ถ้าจำเป็น (เช่น ถ้าเป็นเจ้ามือและ betAmount เปลี่ยน)
      if (data.isDealer && typeof data.betAmount === "number") {
        setInputBetAmount(data.betAmount.toString());
      }

      // อัปเดต localStorage ด้วย myPlayerId ใหม่ (ซึ่งก็คือ socketClient.id ปัจจุบัน)
      // roomId ควรจะยังเป็นค่าเดิม
      if (socketClient && socketClient.id) {
        localStorage.setItem("pokDengRoomId", data.roomId);
        localStorage.setItem("pokDengPlayerId", data.myPlayerId); // ใช้ myPlayerId ที่ server ส่งมา (ซึ่งควรจะตรงกับ socketClient.id)
        console.log(
          `[Client] Updated localStorage after reconnect: roomId=${data.roomId}, playerId=${data.myPlayerId}`
        );
      }

      // Client ควรจะได้รับ 'playersData' และ 'yourCards' (ถ้าเกมกำลังเล่น) จาก server โดยอัตโนมัติ
      // หลังจาก reconnected ดังนั้นอาจจะไม่ต้อง request ข้อมูลเหล่านั้นอีก
      // แต่ถ้า server ไม่ได้ส่งมาให้ ก็อาจจะต้องมี logic ขอข้อมูลใหม่
      // จากโค้ด server.js ที่เราทำ:
      // - 'playersData' จะถูกส่งมา
      // - 'yourCards' จะถูกส่งมาถ้าเกมเริ่มแล้วและผู้เล่นมีไพ่

      // รีเซ็ต UI บางส่วนที่อาจจะไม่ sync หลังจากหลุดไป
      // เช่น currentTurnId, countdown (server ควรส่ง currentTurn มาใหม่ถ้าเป็นตาเรา)
      // setHasStayed(false); // server ควรส่งสถานะ hasStayed ที่ถูกต้องมากับ playersData หรือข้อมูลผู้เล่น
    };

    const handleReconnectFailed = (data) => {
      console.warn("[Client] Reconnect failed:", data.message);
      addMessage(`ไม่สามารถเชื่อมต่อกลับเข้าห้องได้: ${data.message}`, "error");

      // ล้างข้อมูล session เก่าออกจาก localStorage เพื่อไม่ให้พยายาม reconnect อีก
      localStorage.removeItem("pokDengRoomId");
      localStorage.removeItem("pokDengPlayerId");
      console.log(
        "[Client] Cleared stored session from localStorage due to reconnect failure."
      );

      // รีเซ็ต state ที่เกี่ยวกับห้องและเกม (ถ้าต้องการให้ผู้ใช้เริ่มใหม่จาก lobby)
      setInRoom(false);
      setRoomId("");
      // setMyPlayerId(null); // อาจจะไม่ต้อง null ทันที เพราะ onConnect อาจจะตั้งให้ใหม่ถ้าเป็นการเชื่อมต่อสดๆ
      setIsDealer(false);
      setGameStarted(false);
      setMyCards([]);
      // ... รีเซ็ต state อื่นๆ ตามความเหมาะสม ...

      // แสดงข้อความ "เชื่อมต่อกับ Server สำเร็จแล้ว! (New session)" ถ้ายัง isConnected
      // เพื่อให้ผู้ใช้รู้ว่ายังเชื่อมต่อกับ server ได้ แต่ต้อง join ห้องใหม่
      if (isConnected && socketClient && socketClient.id) {
        setMyPlayerId(socketClient.id); // ตั้ง myPlayerId สำหรับการ join ใหม่
        addMessage(
          "คุณไม่ได้อยู่ในห้องอีกต่อไป กรุณาสร้างหรือเข้าร่วมห้องใหม่",
          "info"
        );
      }
    };

    socketClient.on("reconnected", handleReconnected);
    socketClient.on("reconnectFailed", handleReconnectFailed);
    // --- สิ้นสุดการเพิ่ม Event Listeners ใหม่ ---

    socketClient.on("playersData", (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      // ตรวจสอบว่า myPlayerId มีค่าหรือไม่ก่อนใช้ find
      if (myPlayerId) {
        const me = activePlayers.find((p) => p.id === myPlayerId);
        if (me) {
          setIsDealer(me.isDealer);
          if (typeof me.hasStayed === "boolean") {
            setHasStayed(me.hasStayed);
          }
        }
      }
    });

    socketClient.on("yourCards", (cardsFromServer) => {
      console.log(
        `[Client ${
          myPlayerId || socketClient?.id
        }] Received 'yourCards'. Data:`,

        JSON.stringify(cardsFromServer)
      );

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
          "[Client] 'yourCards' received non-array of objects or invalid data:",

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

      setResult([]); // ไม่ setMyCards([]) ที่นี่แล้ว เพราะ Server จะส่ง yourCards มา

      setHasStayed(false);

      setShowResultBtn(false);

      setShowSummary(false);

      setRevealedPokPlayers({});
    });

    socketClient.on("currentTurn", (turnData) => {
      console.log("[Client] Event 'currentTurn':", turnData);

      setCurrentTurnId(turnData.id);

      setCurrentTurnInfo({
        name: turnData.name,

        role: turnData.role,

        timeLeft: turnData.timeLeft,
      });

      setCountdown(turnData.timeLeft || DEFAULT_TURN_DURATION);

      if (turnData.id === myPlayerId) {
        const meInPlayerData = playerData.find((p) => p.id === myPlayerId);

        if (!(meInPlayerData && meInPlayerData.hasStayed)) {
          setHasStayed(false);
        }
      }
    });

    socketClient.on("turnTimerUpdate", (timerData) => {
      if (currentTurnId === timerData.playerId) {
        setCurrentTurnInfo((prev) => ({
          ...prev,

          timeLeft: timerData.timeLeft,
        }));

        if (timerData.playerId === myPlayerId) setCountdown(timerData.timeLeft);
      }
    });

    socketClient.on("enableShowResult", (canShow) => {
      console.log("[Client] Enable Show Result:", canShow);

      setShowResultBtn(canShow);
    });

    socketClient.on("lockRoom", (isLockedFromServer) => {
      console.log("[Client] Room lock status from server:", isLockedFromServer);

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
      } else {
        setResult([]);
      }

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

      setRevealedPokPlayers({}); // รีเซ็ตไพ่ป๊อกที่เปิดของขาไพ่อื่น
    }); // *** NEW: Listener for player_revealed_pok ***

    socketClient.on("player_revealed_pok", (data) => {
      console.log("[Client] Player revealed Pok:", data);

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
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary); // Server ควรส่ง isDealer มาใน gameSummary ด้วย

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
      console.log("[Client] Received 'roomSettings'. Data:", settings);

      if (settings && typeof settings.betAmount === "number") {
        addMessage(
          `[EVENT] ราคาเดิมพันอัปเดตเป็น: ${settings.betAmount} (จาก roomSettings)`,

          "info"
        );

        setBetAmount(settings.betAmount); // The playerData state used in the condition below will be the latest value // due to closure, even if 'playerData' is not in the useEffect dependency array. // This listener is re-attached if myPlayerId changes, which is appropriate.

        const amIDealer = playerData.find(
          (p) => p.id === myPlayerId && p.isDealer
        );

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

        // --- เพิ่มการ cleanup สำหรับ listener ใหม่ ---
        socketClient.off("reconnected", handleReconnected);
        socketClient.off("reconnectFailed", handleReconnectFailed);
        // --- สิ้นสุดการ cleanup ---

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
  }, [myPlayerId, name, roomId, currentTurnId, playerData, isConnected]);

  useEffect(() => {
    // Countdown timer effect

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
        // ตรวจสอบก่อน emit

        addMessage("หมดเวลา! ทำการ 'อยู่' อัตโนมัติ", "info");

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

    addMessage,
  ]); // เพิ่ม addMessage ถ้าใช้ใน effect

  useEffect(() => {
    // useEffect สำหรับคำนวณ transferSummary

    if (showSummary && summaryData.length > 0 && myPlayerId) {
      const currentUserSummary = summaryData.find((p) => p.id === myPlayerId);

      if (!currentUserSummary) {
        console.warn(
          "[Client] Cannot find current user in summaryData for transfer calculation."
        );

        setTransferSummary({ toPay: [], toReceive: [] });

        return;
      } // ใช้ isDealer จาก currentUserSummary ที่ Server ส่งมาใน summaryData

      const amIDealer = currentUserSummary.isDealer;

      const toPayList = [];

      const toReceiveList = [];

      if (!amIDealer) {
        if (currentUserSummary.netChange < 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);

          if (dealer) {
            toPayList.push({
              name: dealer.name,

              role: dealer.role,

              amount: Math.abs(currentUserSummary.netChange),
            });
          }
        } else if (currentUserSummary.netChange > 0) {
          const dealer = summaryData.find((p) => p.isDealer === true);

          if (dealer) {
            toReceiveList.push({
              name: dealer.name,

              role: dealer.role,

              amount: currentUserSummary.netChange,
            });
          }
        }
      } else {
        summaryData.forEach((player) => {
          if (player.id === myPlayerId) return;

          if (player.netChange > 0) {
            toPayList.push({
              name: player.name,

              role: player.role,

              amount: player.netChange,
            });
          } else if (player.netChange < 0) {
            toReceiveList.push({
              name: player.name,

              role: player.role,

              amount: Math.abs(player.netChange),
            });
          }
        });
      }

      setTransferSummary({ toPay: toPayList, toReceive: toReceiveList });
    } else if (!showSummary) {
      setTransferSummary({ toPay: [], toReceive: [] });
    }
  }, [showSummary, summaryData, myPlayerId]); // isDealer ไม่จำเป็นถ้า summaryData มีข้อมูล isDealer แล้ว

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

        socketClient.emit("setBetAmount", { roomId, amount });
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

      .catch((err) => {
        console.error("คัดลอกไม่สำเร็จ:", err);

        addMessage("คัดลอกเลขห้องไม่สำเร็จ", "error");
      });
  };

  const handleStartGame = () => {
    if (socketClient && socketClient.connected && roomId && isDealer) {
      if (betAmount <= 0) {
        addMessage("กรุณากำหนดเงินเดิมพันก่อนเริ่มเกม", "error");

        return;
      }

      console.log(
        "[Client] Attempting 'startGame'. RoomId:",

        roomId,

        "IsDealer:",

        isDealer
      );

      socketClient.emit("startGame", roomId);
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
      console.log("[Client] Emitting 'drawCard' in room:", roomId);

      socketClient.emit("drawCard", roomId);
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
      console.log("[Client] Emitting 'stay' in room:", roomId);

      socketClient.emit("stay", roomId);

      setHasStayed(true); // Optimistic update
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
      console.log("[Client] Emitting 'showResult' for room:", roomId);

      socketClient.emit("showResult", roomId);
    } else {
      addMessage("ไม่สามารถแสดงผลได้ในขณะนี้", "error");
    }
  };

  const handleResetGameHandler = () => {
    if (socketClient && socketClient.connected && isDealer) {
      console.log("[Client] Emitting 'resetGame' for room:", roomId);

      socketClient.emit("resetGame", roomId);
    }
  };

  const handleEndGame = () => {
    if (socketClient && socketClient.connected && isDealer) {
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

    console.warn("[Client] getCardDisplay received invalid card object:", card);

    return "?";
  };

  const getCardPoint = (
    v // ฟังก์ชันนี้ของคุณถูกต้องดีแล้ว
  ) => (["J", "Q", "K", "10"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v));

  const calculateRankForDisplay = (cardsToRank) => {
    if (!cardsToRank || cardsToRank.length === 0)
      return { score: 0, type: "ยังไม่มีไพ่" };

    const calculatedScore =
      cardsToRank.reduce((sum, c) => sum + getCardPoint(c.value), 0) % 10;

    let type = `${calculatedScore} แต้ม`; // ประเภทเริ่มต้น

    if (cardsToRank.length === 2) {
      const isPok = calculatedScore === 8 || calculatedScore === 9;

      const isDeng =
        cardsToRank[0].suit === cardsToRank[1].suit ||
        cardsToRank[0].value === cardsToRank[1].value;

      if (isPok) {
        type = `ป๊อก ${calculatedScore}`;

        if (isDeng) type += " สองเด้ง";
      } else if (isDeng) {
        if (calculatedScore === 0) {
          type = "บอด";
        } else {
          // ปรับปรุงการแสดงผล สองเด้ง ให้ละเอียดขึ้น (ถ้าต้องการ)

          const isPair_2card = cardsToRank[0].value === cardsToRank[1].value;

          const isSameSuit_2card = cardsToRank[0].suit === cardsToRank[1].suit;

          if (isPair_2card && isSameSuit_2card) {
            type = `${calculatedScore} แต้มสองเด้ง`; // หรือจะใช้แบบเดิม `${calculatedScore} แต้มสองเด้ง` ก็ได้
          } else if (isPair_2card) {
            type = `${calculatedScore} แต้มสองเด้ง`; // หรือ `${calculatedScore} แต้มสองเด้ง`
          } else if (isSameSuit_2card) {
            type = `${calculatedScore} แต้มสองเด้ง`; // หรือ `${calculatedScore} แต้มสองเด้ง`
          } // หรือถ้าต้องการแบบง่ายๆ ที่คุณมีล่าสุด: // type = `${calculatedScore} แต้มสองเด้ง`;
        }
      } else {
        // ไพ่ 2 ใบธรรมดา

        if (calculatedScore === 0) {
          type = "บอด";
        } else {
          type = `${calculatedScore} แต้ม`;
        }
      }
    } else if (cardsToRank.length === 3) {
      const suits = cardsToRank.map((c) => c.suit);

      const card_raw_values = cardsToRank.map((c) => c.value); // ใช้ค่าดิบในการตรวจสอบบางอย่าง

      const isSameSuit = suits.every((s) => s === suits[0]); // การตรวจสอบตอง ควรใช้ค่าดิบเพื่อความแม่นยำ ไม่ต้อง sort ก่อน

      const isTaong = card_raw_values.every(
        (val) => val === card_raw_values[0]
      );

      const n_vals_for_straight = [...card_raw_values] // สร้างสำเนาเพื่อ sort โดยไม่กระทบ card_raw_values

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
          // สเตรทปกติ (ไม่รวม A23)

          n_vals_for_straight[1] === n_vals_for_straight[0] + 1 &&
          n_vals_for_straight[2] === n_vals_for_straight[1] + 1
        ) {
          if (
            !(
              // ไม่ใช่ A23

              (
                n_vals_for_straight[0] === 1 &&
                n_vals_for_straight[1] === 2 &&
                n_vals_for_straight[2] === 3
              )
            )
          ) {
            is_straight_result = true;
          }
        }

        if (
          // สเตรท QKA (A=1, Q=12, K=13)

          n_vals_for_straight[0] === 1 &&
          n_vals_for_straight[1] === 12 &&
          n_vals_for_straight[2] === 13
        ) {
          is_straight_result = true;
        }
      }

      const is_sian_result = card_raw_values.every((v_str) =>
        ["J", "Q", "K"].includes(v_str)
      ); // ลำดับการตรวจสอบสำคัญมาก

      if (isTaong) {
        type = `ตอง ${card_raw_values[0]}`; // แสดงค่าตอง
      } else if (is_straight_result && isSameSuit) {
        type = "สเตรทฟลัช";
      } else if (is_sian_result) {
        type = "เซียน";
      } else if (is_straight_result) {
        type = "เรียง";
      } else if (isSameSuit) {
        // สามเด้ง (Flush)

        if (calculatedScore === 0) {
          type = "บอด"; // หรือ "สามเด้ง (บอด)" ถ้าต้องการคงข้อมูลว่าเป็นสามเด้ง
        } else {
          type = `${calculatedScore} แต้มสามเด้ง`; // หรือ `${calculatedScore} แต้มสามเด้ง` ให้ตรงกับ Server
        }
      } else {
        // ไพ่ 3 ใบธรรมดา

        if (calculatedScore === 9) {
          type = "9 หลัง";
        } else if (calculatedScore === 8) {
          type = "8 หลัง";
        } else if (calculatedScore === 0) {
          type = "บอด";
        } else {
          type = `${calculatedScore} แต้ม`;
        }
      }
    } // ตรวจสอบสุดท้าย: หาก type ยังคงเป็น "0 แต้ม" (เช่น กรณีไพ่ 1 ใบ)

    if (type === "0 แต้ม") {
      type = "บอด";
    }

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

  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed; // JSX

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
          ออกจากเกม{" "}
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
