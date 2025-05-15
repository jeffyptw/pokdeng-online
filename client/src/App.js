// App.js

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css"; // ตรวจสอบว่าคุณมีไฟล์นี้ หรือลบการ import ถ้าไม่ใช้

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // สำหรับทดสอบ Local
let socketClient = null;
const DEFAULT_TURN_DURATION = 30;

// MODIFICATION: Helper function for Local Storage key
const getLocalStorageSummaryKey = (roomId) => `pokdeng_summary_${roomId}`;

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
      setMyPlayerId(socketClient.id);
      setIsConnected(true);
      addMessage("เชื่อมต่อกับ Server สำเร็จแล้ว!", "success");
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
      setShowSummary(false);
      setSummaryData([]);
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
      setShowSummary(false);
      setSummaryData([]);
    });

    socketClient.on("playersData", (activePlayers) => {
      console.log("[Client] Received 'playersData':", activePlayers);
      setPlayerData(activePlayers);
      const me = activePlayers.find((p) => p.id === myPlayerId);
      if (me) {
        setIsDealer(me.isDealer);
        if (typeof me.hasStayed === "boolean") {
          setHasStayed(me.hasStayed);
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
      setResult([]);
      setHasStayed(false);
      setShowResultBtn(false);
      setShowSummary(false);
      setRevealedPokPlayers({});
      setGameRound(0);
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
      setRevealedPokPlayers({});
      setShowSummary(false);
      setGameRound(0);
    });

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

    socketClient.on("gameEnded", (gameSummaryFromServer) => {
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummaryFromServer);
      // Server should ideally send isDealer status for each player in gameSummaryFromServer
      // The mapping below is a client-side fallback
      const processedGameSummary = gameSummaryFromServer.map((p) => ({
        ...p,
        isDealer:
          playerData.find((pd) => pd.id === p.id)?.isDealer || // Check current playerData
          p.isDealer || // Check if server already provided it
          p.role === "เจ้ามือ", // Fallback based on role name
      }));

      setSummaryData(processedGameSummary); // This will trigger the useEffect to save to LS
      setShowSummary(true);
      setGameStarted(false);
      setResult([]); // Clear last round's result display
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
        setBetAmount(settings.betAmount);
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
  }, [myPlayerId, name, roomId, currentTurnId, playerData]);

  // MODIFICATION: useEffect to save summaryData to Local Storage
  useEffect(() => {
    if (roomId && summaryData && summaryData.length > 0) {
      try {
        const key = getLocalStorageSummaryKey(roomId);
        console.log(`[Client] Saving summaryData for room ${roomId} to Local Storage (Key: ${key}):`, summaryData);
        localStorage.setItem(key, JSON.stringify(summaryData));
      } catch (e) {
        console.error("[Client] Error saving summaryData to Local Storage:", e);
        addMessage("ไม่สามารถบันทึกสรุปเกมลงใน Local Storage", "error");
      }
    }
  }, [summaryData, roomId]);


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
      // Ensure isDealer is correctly identified for the current user from summaryData
      const amIDealer = currentUserSummary.isDealer;
      const toPayList = [];
      const toReceiveList = [];

      if (!amIDealer) { // Current user is a Player
        if (currentUserSummary.netChange < 0) { // Player lost money
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer) {
            toPayList.push({ // Player pays dealer
              name: dealer.name,
              role: dealer.role, // Should be "เจ้ามือ"
              amount: Math.abs(currentUserSummary.netChange),
            });
          }
        } else if (currentUserSummary.netChange > 0) { // Player won money
          const dealer = summaryData.find((p) => p.isDealer === true);
          if (dealer) {
            toReceiveList.push({ // Player receives from dealer
              name: dealer.name,
              role: dealer.role, // Should be "เจ้ามือ"
              amount: currentUserSummary.netChange,
            });
          }
        }
      } else { // Current user is the Dealer
        summaryData.forEach((player) => {
          if (player.id === myPlayerId || player.isDealer) return; // Skip self or other potential dealers if any

          // player.netChange is from the perspective of that player
          if (player.netChange > 0) { // This player won (means dealer lost to this player)
            toPayList.push({ // Dealer pays this player
              name: player.name,
              role: player.role,
              amount: player.netChange,
            });
          } else if (player.netChange < 0) { // This player lost (means dealer won against this player)
            toReceiveList.push({ // Dealer receives from this player
              name: player.name,
              role: player.role,
              amount: Math.abs(player.netChange),
            });
          }
        });
      }
      setTransferSummary({ toPay: toPayList, toReceive: toReceiveList });
    } else if (!showSummary || summaryData.length === 0) {
        setTransferSummary({ toPay: [], toReceive: [] });
    }
  }, [showSummary, summaryData, myPlayerId]);

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

  // MODIFICATION: handleEndGame to load from Local Storage and then emit to server
  const handleEndGame = () => {
    if (!roomId) {
        addMessage("ไม่ได้อยู่ในห้อง หรือยังไม่ได้เชื่อมต่อ", "error");
        return;
    }

    const localStorageKey = getLocalStorageSummaryKey(roomId);
    const storedSummaryJson = localStorage.getItem(localStorageKey);

    if (isDealer) { // Action for Dealer
        console.log("[Client] 'End Game & Show Summary' clicked by dealer for room:", roomId);
        if (storedSummaryJson) {
            try {
                const parsedSummary = JSON.parse(storedSummaryJson);
                if (Array.isArray(parsedSummary) && parsedSummary.length > 0) {
                    console.log("[Client] Dealer loaded summaryData from Local Storage for display:", parsedSummary);
                    setSummaryData(parsedSummary);
                } else {
                    console.log("[Client] Dealer: Local Storage summary was empty/invalid for key:", localStorageKey);
                    setSummaryData([]);
                }
            } catch (e) {
                console.error("[Client] Dealer: Error parsing summaryData from LS (key: " + localStorageKey + "):", e);
                setSummaryData([]);
            }
        } else {
            console.log("[Client] Dealer: No summaryData in LS for this room (key:", localStorageKey, "). Requesting from server.");
        }

        setShowSummary(true);

        if (socketClient && socketClient.connected) {
            socketClient.emit("endGame", roomId);
        } else {
            addMessage("การเชื่อมต่อ Server หลุด ไม่สามารถส่งคำสั่งจบเกมได้ (แสดงผลจากข้อมูลล่าสุดที่มี)", "warning");
        }

    } else { // Action for Player
        console.log("[Client] Player clicked 'View Summary' for room:", roomId);
        if (storedSummaryJson) {
            try {
                const parsedSummary = JSON.parse(storedSummaryJson);
                if (Array.isArray(parsedSummary) && parsedSummary.length > 0) {
                    console.log("[Client] Player loaded summaryData from Local Storage:", parsedSummary);
                    setSummaryData(parsedSummary);
                    setShowSummary(true);
                } else {
                    addMessage("ยังไม่มีข้อมูลสรุปเกมที่บันทึกไว้ หรือข้อมูลไม่ถูกต้อง", "info");
                    setShowSummary(false);
                }
            } catch (e) {
                console.error("[Client] Player: Error parsing summaryData from LS (key: " + localStorageKey + "):", e);
                addMessage("เกิดข้อผิดพลาดในการโหลดข้อมูลสรุปจาก Local Storage", "error");
                setShowSummary(false);
            }
        } else {
            addMessage("ยังไม่มีข้อมูลสรุปเกมใน Local Storage กรุณารอเจ้ามือจบเกม หรือตรวจสอบการเชื่อมต่อ", "info");
            setShowSummary(false);
        }
    }
  };


  const handleExitGame = () => {
    if (roomId) {
      const localStorageKey = getLocalStorageSummaryKey(roomId);
      console.log("[Client] Exiting game, removing summary from Local Storage for key:", localStorageKey);
      localStorage.removeItem(localStorageKey);
    }
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
    v
  ) => (["J", "Q", "K", "10"].includes(v) ? 0 : v === "A" ? 1 : parseInt(v));

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
        if (calculatedScore === 0) {
          type = "บอดสองเด้ง"; // Clarified for "บอดสองเด้ง"
        } else {
          type = `${calculatedScore} แต้มสองเด้ง`;
        }
      } else {
        if (calculatedScore === 0) {
          type = "บอด";
        } else {
          type = `${calculatedScore} แต้ม`;
        }
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
        // Normal straight (e.g., 2-3-4, 9-10-J)
        if (
          n_vals_for_straight[1] === n_vals_for_straight[0] + 1 &&
          n_vals_for_straight[2] === n_vals_for_straight[1] + 1 &&
          // Exclude A-2-3 for this specific check, handle K-A-2 or A-2-3 if needed as special cases
          !(n_vals_for_straight[0] === 1 && n_vals_for_straight[1] === 2 && n_vals_for_straight[2] === 3)
        ) {
          is_straight_result = true;
        }
        // Straight A-K-Q (1, 13, 12 after sort: 1, 12, 13)
        if (
          n_vals_for_straight[0] === 1 &&
          n_vals_for_straight[1] === 12 &&
          n_vals_for_straight[2] === 13
        ) {
          is_straight_result = true;
        }
         // Straight K-Q-J (13,12,11 after sort: 11,12,13) - covered by normal straight check
      }
      const is_sian_result = card_raw_values.every((v_str) =>
        ["J", "Q", "K"].includes(v_str)
      ); // J, Q, K of any suit

      if (isTaong) { // Highest
        type = `ตอง ${card_raw_values[0]}`;
      } else if (is_straight_result && isSameSuit) {
        type = "สเตรทฟลัช";
      } else if (is_sian_result) { // JQK, not necessarily same suit or straight
        type = "เซียน";
      } else if (is_straight_result) {
        type = "เรียง"; // Straight (not flush)
      } else if (isSameSuit) { // Flush (not straight, not taong)
        if (calculatedScore === 0) {
          type = "บอดสามเด้ง"; // Clarified for "บอดสามเด้ง"
        } else {
          type = `${calculatedScore} แต้มสามเด้ง`;
        }
      } else { // Normal 3 cards, no special hands
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
    }
    if (type === "0 แต้ม" && cardsToRank.length > 0) { // Catchall if somehow missed
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
  const isMyTurn = currentTurnId === myPlayerId && gameStarted && !hasStayed;

  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId);
    const totalToReceive = transferSummary.toReceive.reduce((sum, item) => sum + item.amount, 0);
    const totalToPay = transferSummary.toPay.reduce((sum, item) => sum + item.amount, 0);

    return (
      <div className="App-summary">
        <h2>สรุปยอดต้องโอนให้และต้องได้ (ห้อง: {roomId})</h2>
        <h3>
          ชื่อผู้เล่น: {me?.name || name} (
          {me?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")}) {/* Ensure 'me' is used for role display if available */}
        </h3>
        <hr />
        {transferSummary.toReceive.length > 0 && (
          <>
            <h3 style={{ color: "green", marginTop: "20px" }}>
              ยอดที่จะได้รับ (รวม: {totalToReceive.toLocaleString()} บาท):
            </h3>
            {transferSummary.toReceive.map((item, index) => (
              <p
                key={`receive-${index}`}
                style={{ color: "green", marginLeft: "20px" }}
              >
                - จาก {item.name} ({item.role}): {item.amount.toLocaleString()}
                บาท
              </p>
            ))}
            <hr />
          </>
        )}
        {transferSummary.toPay.length > 0 && (
          <>
            <h3 style={{ color: "red", marginTop: "20px" }}>
             ยอดที่ต้องโอน (รวม: {totalToPay.toLocaleString()} บาท):
            </h3>
            {transferSummary.toPay.map((item, index) => (
              <p
                key={`pay-${index}`}
                style={{ color: "red", marginLeft: "20px" }}
              >
                - ให้ {item.name} ({item.role}): {item.amount.toLocaleString()}
                บาท
              </p>
            ))}
            <hr />
          </>
        )}
        {(transferSummary.toReceive.length === 0 &&
          transferSummary.toPay.length === 0) && ( // Corrected condition
            <p style={{ textAlign: "center", marginTop: "20px" }}>
              ไม่มีรายการได้เสียสำหรับคุณในรอบนี้
            </p>
          )}
        <h3 style={{ marginTop: "20px" }}>
          ยอดเงินคงเหลือของคุณ:{" "}
          {(me?.finalBalance !== undefined
            ? me.finalBalance
            : (myCurrentPlayerData?.balance !== undefined ? myCurrentPlayerData.balance : parseInt(money)) // Fallback logic
          )?.toLocaleString()}{" "}
          บาท
        </h3>
        {me && (
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
              {me.netChange > 0
                ? `+${me.netChange?.toLocaleString()}`
                : me.netChange?.toLocaleString() || "0"}{" "}
              บาท
            </span>
            )
          </p>
        )}
        <button className="btn-inroom-endgame" onClick={handleExitGame}>
          ออกจากเกม (เริ่มใหม่)
        </button>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="messages-container">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.type}`}>
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {errorMsg && <div className={`snackbar show ${errorMsg.includes("Error") || errorMsg.includes("ไม่สำเร็จ") || errorMsg.includes("หลุด") || errorMsg.includes("ไม่สามารถ") || errorMsg.includes("ผิดพลาด") ? 'error' : 'info'}`}>{errorMsg}</div>}

      {!inRoom && !showSummary && (
        <div className="App-lobby">
          <h1>ป๊อกเด้งหรรษา</h1>
          {!isConnected && <p>กำลังเชื่อมต่อกับ Server...</p>}
          <input
            type="text"
            placeholder="ชื่อของคุณ"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={15}
          />
          <input
            type="number"
            placeholder="เงินเริ่มต้น (ขั้นต่ำ 50)"
            value={money}
            onChange={(e) => setMoney(e.target.value)}
            step={10}
            min="10" // Min for join is 10, for create is 50. Set lowest common.
          />
          <button onClick={handleCreateRoom} disabled={!isConnected || !name || parseInt(money) < 50}>
            สร้างห้องใหม่
          </button>
          <hr />
          <input
            type="text"
            placeholder="รหัสห้อง (ถ้ามี)"
            value={inputRoomId}
            onChange={(e) => setInputRoomId(e.target.value)}
            maxLength={6}
          />
          <button onClick={handleJoinRoom} disabled={!isConnected || !name || parseInt(money) < 10 || !inputRoomId}>
            เข้าร่วมห้อง
          </button>
        </div>
      )}

      {inRoom && !showSummary && (
        <div className="App-inroom">
          <h2>ห้อง: {roomId} <button onClick={handleCopyRoomId} title="คัดลอกรหัสห้อง">📋</button></h2>
          <p>ชื่อ: {name} ({isDealer ? "คุณเป็นเจ้ามือ" : "คุณเป็นขาไพ่"}) | เงินปัจจุบัน: {myCurrentPlayerData?.balance?.toLocaleString() || parseInt(money).toLocaleString()} บาท</p>
          {isDealer && !gameStarted && (
            <div className="dealer-controls">
              <input
                type="number"
                value={inputBetAmount}
                onChange={(e) => setInputBetAmount(e.target.value)}
                min="5"
                step="5"
                disabled={gameStarted}
              />
              <button onClick={handleSetBet} disabled={gameStarted}>
                ตั้งค่าเดิมพัน (ปัจจุบัน: {betAmount > 0 ? betAmount.toLocaleString() : "ยังไม่ได้ตั้ง"})
              </button>
              <button onClick={handleToggleLockRoom} disabled={gameStarted}>
                {roomLocked ? "ปลดล็อคห้อง" : "ล็อคห้อง"}
              </button>
              <button className="btn-inroom-startgame" onClick={handleStartGame} disabled={gameStarted || roomLocked || betAmount <= 0 || playerData.length <=1}>
                เริ่มเกม
              </button>
            </div>
          )}

          <div className="player-list">
            <h3>รายชื่อในห้อง ({playerData.length} คน):</h3>
            <ul>
              {playerData.map((p) => (
                <li key={p.id} className={`${p.id === myPlayerId ? 'me' : ''} ${currentTurnId === p.id ? 'current-turn-player' : ''}`}>
                  {p.name} ({p.isDealer ? "เจ้ามือ" : `ขา ${p.playerNumber || ''}`}) - {p.balance?.toLocaleString()} บาท
                  {currentTurnId === p.id && gameStarted && " 🤔"}
                  {p.hasStayed && gameStarted && !result.length && " ✔️"}
                  {revealedPokPlayers[p.id] && (
                     ` (${revealedPokPlayers[p.id].handDetails.name} ${revealedPokPlayers[p.id].cards.map(getCardDisplay).join(' ')})`
                  )}
                </li>
              ))}
            </ul>
          </div>

          {gameStarted && currentTurnInfo.name && (
            <div className="turn-info">
              <p>ตาของ: {currentTurnInfo.name} ({currentTurnInfo.role})
                 {currentTurnId === myPlayerId && !hasStayed && ` (${countdown} วิ)`}
                 {currentTurnId !== myPlayerId && currentTurnInfo.timeLeft > 0 && ` (เหลือ ${currentTurnInfo.timeLeft} วิ)`}
              </p>
            </div>
          )}


          {myCards.length > 0 && gameStarted && !result.length && (
            <div className="my-cards">
              <h3>ไพ่ของคุณ ({myHandType}):</h3>
              <div className="cards-display">
                {myCards.map((card, index) => (
                  <span key={index} className={`card ${card.suit === '♥' || card.suit === '♦' ? 'red-card' : 'black-card'}`}>
                    {getCardDisplay(card)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isMyTurn && myCards.length > 0 && myCards.length < 3 && !hasStayed && (
            <button className="btn-inroom-action" onClick={handleDrawCard} disabled={myCards.length >= 3}>
              จั่วไพ่
            </button>
          )}
          {isMyTurn && myCards.length >= 2 && !hasStayed && (
            <button className="btn-inroom-action" onClick={handleStay}>
              อยู่
            </button>
          )}

          {isDealer && gameStarted && showResultBtn && !result.length && (
            <button className="btn-inroom-endgame2" onClick={handleShowResult}>
              เปิดไพ่ดวล
            </button>
          )}

          {result.length > 0 && (
            <div className="results-display">
              <h3>ผลลัพธ์รอบที่ {gameRound}: (เดิมพัน: {betAmount.toLocaleString()})</h3>
              {result.map((r, index) => (
                <div key={index} className={`result-player ${r.netChange > 0 ? 'win' : r.netChange < 0 ? 'lose' : 'draw'}`}>
                  <p>
                    <strong>{r.name} ({r.role})</strong>:
                    <span className="cards-in-result">
                        {r.cards.map((card, cardIdx) => (
                            <span key={cardIdx} className={`card-small ${card.suit === '♥' || card.suit === '♦' ? 'red-card' : 'black-card'}`}>
                                {getCardDisplay(card)}
                            </span>
                        ))}
                    </span>
                     ({r.handDetails?.name || r.scoreDisplay})
                    <br/>
                    {r.netChange > 0 ? `ได้ +${r.netChange.toLocaleString()}` : r.netChange < 0 ? `เสีย ${r.netChange.toLocaleString()}` : "เจ๊า"}
                    (ยอดคงเหลือ: {r.currentBalance?.toLocaleString()})
                  </p>
                </div>
              ))}
              {isDealer && ( // Only dealer can start next round or end game session
                 <button className="btn-inroom-nextround" onClick={handleResetGameHandler}>เริ่มรอบใหม่</button>
              )}
            </div>
          )}

          {/* Button to End Game / View Summary */}
          {inRoom && (isDealer || (!gameStarted && result.length > 0)) && (
            <button
              className="btn-inroom-result"
              onClick={handleEndGame}
              disabled={isDealer && gameStarted && !result.length} // Dealer can't end mid-round before results are shown
            >
              {isDealer ? "จบเกม&ดูสรุปยอด" : "ดูสรุปยอด"}
            </button>
          )}


          <button className="btn-inroom-exit" onClick={handleExitGame}>
            ออกจากห้อง (กลับไป Lobby)
          </button>
        </div>
      )}
    </div>
  );
}
export default App;
