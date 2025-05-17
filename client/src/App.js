// App.js

import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import "./App.css"; // ตรวจสอบว่าคุณมีไฟล์นี้ หรือลบการ import ถ้าไม่ใช้

const SERVER_URL = "https://pokdeng-online-th.onrender.com";
// const SERVER_URL = "http://localhost:3001"; // สำหรับทดสอบ Local

let socketClient = null;
const DEFAULT_TURN_DURATION = 30;
const MAX_ROUNDS_TO_STORE_IN_LS = 10; // จำกัดจำนวนรอบที่เก็บใน LS

// --- Local Storage Utility Functions ---
const getLocalStorageKey = (roomId, playerId) => {
  if (!roomId || !playerId) return null;
  return `pokdeng_game_state_${roomId}_${playerId}`;
};

const saveGameStateToLocalStorage = (roomId, playerId, gameStateUpdate) => {
  const key = getLocalStorageKey(roomId, playerId);
  if (!key) return;
  try {
    const currentData = loadGameStateFromLocalStorage(roomId, playerId) || {};
    const newData = {
      ...currentData,
      ...gameStateUpdate,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(newData));
    console.log("[LS] Game state saved for", key, newData);
  } catch (error) {
    console.error("[LS] Error saving game state:", error);
  }
};

const loadGameStateFromLocalStorage = (roomId, playerId) => {
  const key = getLocalStorageKey(roomId, playerId);
  if (!key) return null;
  try {
    const data = localStorage.getItem(key);
    if (data) {
      const parsedData = JSON.parse(data);
      console.log("[LS] Game state loaded for", key, parsedData);
      return parsedData;
    }
    return null;
  } catch (error) {
    console.error("[LS] Error loading game state:", error);
    return null;
  }
};

// const clearGameStateFromLocalStorage = (roomId, playerId) => {
//   const key = getLocalStorageKey(roomId, playerId);
//   if (!key) return;
//   localStorage.removeItem(key);
//   console.log("[LS] Game state cleared for", key);
// };
// --- End Local Storage Utility Functions ---

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
  const endGameFallbackTimerRef = useRef(null);

  useEffect(() => {
    // messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // Effect for initial load from Local Storage
  useEffect(() => {
    if (roomId && myPlayerId && inRoom) {
      // Ensure player is in a specific room
      const savedState = loadGameStateFromLocalStorage(roomId, myPlayerId);
      if (savedState) {
        addMessage("ตรวจพบข้อมูลเกมที่บันทึกไว้ กำลังกู้คืน...", "info");
        if (typeof savedState.gameRound === "number") {
          setGameRound(savedState.gameRound);
        }
        if (
          !result.length &&
          savedState.allRoundResults &&
          savedState.allRoundResults.length > 0
        ) {
          // Restore last round's result if not already shown and game might have been interrupted
          const latestRoundData =
            savedState.allRoundResults[savedState.allRoundResults.length - 1];
          if (latestRoundData && latestRoundData.data) {
            // Check if this result corresponds to the current gameRound or next expected one
            if (latestRoundData.round === savedState.gameRound) {
              // Or some logic to ensure it's relevant
              setResult(latestRoundData.data);
              // If game was not started but result is there, means it was end of last round
              if (!gameStarted) {
                addMessage(
                  `กู้คืนผลลัพธ์รอบที่ ${latestRoundData.round} จาก Local Storage`,
                  "info"
                );
              }
            }
          }
        }
        // If summary was shown before reload and summaryData is available in LS
        // This part is tricky, as `showSummary` is usually triggered by server.
        // If `handleEndGame` is the primary way to show summary from LS on failure, this might be less critical.
        // However, if the page was reloaded WHILE summary was shown:
        if (
          savedState.lastGameSummary &&
          summaryData.length === 0 &&
          !gameStarted &&
          result.length > 0
        ) {
          // A heuristic: if game is not started, but there are results, player might have been on summary
          // Or, if a flag in LS indicated summary was active. For now, this is a simple check.
          // A more robust way would be to save `showSummary` state to LS too.
          // For now, if lastGameSummary exists, we allow handleEndGame to potentially load it.
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myPlayerId, inRoom]); // Add other relevant states if needed for re-triggering restoration logic

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
      setShowSummary(false); // Reset summary on new game start
      setRevealedPokPlayers({});
      // Clear previous game summary from LS for this player/room when a new game truly starts
      // Or, keep it as "lastGameSummary" and it will be overwritten when the current game ends.
      // For now, let's rely on gameEnded to update lastGameSummary.
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
      let sortedResults = [];
      if (Array.isArray(roundResultsFromServer)) {
        sortedResults = [...roundResultsFromServer].sort((a, b) => {
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
      }

      setResult(sortedResults);
      const updatedGameRound = gameRound + 1; // Calculate new round number before state update
      setGameRound(updatedGameRound);

      // Save to Local Storage
      if (roomId && myPlayerId && sortedResults.length > 0) {
        const currentSavedState = loadGameStateFromLocalStorage(
          roomId,
          myPlayerId
        ) || { allRoundResults: [] };
        const newRoundResultEntry = {
          round: updatedGameRound,
          data: sortedResults,
          timestamp: new Date().toISOString(),
        };

        let updatedRoundResultsList = (
          currentSavedState.allRoundResults || []
        ).filter((r) => r.round !== updatedGameRound);
        updatedRoundResultsList.push(newRoundResultEntry);

        if (updatedRoundResultsList.length > MAX_ROUNDS_TO_STORE_IN_LS) {
          updatedRoundResultsList = updatedRoundResultsList.slice(
            -MAX_ROUNDS_TO_STORE_IN_LS
          );
        }
        saveGameStateToLocalStorage(roomId, myPlayerId, {
          gameRound: updatedGameRound,
          allRoundResults: updatedRoundResultsList,
        });
      }

      setGameStarted(false);
      setCurrentTurnId(null);
      setCurrentTurnInfo({ name: "", role: "", timeLeft: 0 });
      setShowResultBtn(false);
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
      // Optionally clear round results from LS or reset gameRound if needed
      // saveGameStateToLocalStorage(roomId, myPlayerId, { allRoundResults: [], gameRound: 0 });
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

    socketClient.on("gameEnded", (gameSummary) => {
      console.log("[Client] Event 'gameEnded'. Summary:", gameSummary);
      if (endGameFallbackTimerRef.current) {
        // Clear fallback timer if server responded
        clearTimeout(endGameFallbackTimerRef.current);
        endGameFallbackTimerRef.current = null;
      }

      const processedSummary = gameSummary.map((p) => ({
        ...p,
        isDealer:
          playerData.find((pd) => pd.id === p.id)?.isDealer ||
          p.role === "เจ้ามือ",
      }));
      setSummaryData(processedSummary);
      setShowSummary(true);
      setGameStarted(false);
      setResult([]); // Clear round result when game truly ends
      setCurrentTurnId(null);

      // Save summary to Local Storage
      if (roomId && myPlayerId) {
        saveGameStateToLocalStorage(roomId, myPlayerId, {
          lastGameSummary: processedSummary,
          // Optional: clear allRoundResults now that the game is over,
          // or keep them as history of the game that just ended.
          // allRoundResults: [] // If you want to clear round history after game ends
        });
      }
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
      if (endGameFallbackTimerRef.current) {
        // Cleanup timer on component unmount or effect re-run
        clearTimeout(endGameFallbackTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    myPlayerId,
    name,
    roomId,
    currentTurnId,
    playerData,
    gameRound,
    addMessage,
  ]); // Added gameRound, addMessage

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
    addMessage, // addMessage is used in this effect
  ]);

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
      }
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
        // Current user is the dealer
        summaryData.forEach((player) => {
          if (player.id === myPlayerId || player.isDealer) return; // Skip self and other potential dealers (though usually one)
          if (player.netChange > 0) {
            // Player won money from dealer
            toPayList.push({
              // Dealer has to pay this player
              name: player.name,
              role: player.role,
              amount: player.netChange,
            });
          } else if (player.netChange < 0) {
            // Player lost money to dealer
            toReceiveList.push({
              // Dealer will receive this from player
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
      socketClient.emit("showResult", roomId); // Server will send "result" event
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
    if (isDealer && roomId && myPlayerId) {
      // Check if user is dealer and in a room
      if (socketClient && socketClient.connected) {
        console.log("[Client] Emitting 'endGame' for room:", roomId);
        socketClient.emit("endGame", roomId);

        // Clear previous timer if any
        if (endGameFallbackTimerRef.current) {
          clearTimeout(endGameFallbackTimerRef.current);
        }

        // Set a fallback timer in case server doesn't respond
        endGameFallbackTimerRef.current = setTimeout(() => {
          // Check if summary is already shown (e.g. server responded quickly)
          // Need to access current value of showSummary, not the one from closure.
          // A state check or ref would be better, but for now, this is illustrative.
          // This requires `showSummary` to be accurate at the time of timeout.
          if (!document.querySelector(".App-summary")) {
            // A simple check if summary UI is not yet rendered
            addMessage(
              "Server ไม่ตอบสนองการจบเกม. กำลังโหลดสรุปจาก Local Storage...",
              "warning"
            );
            const savedState = loadGameStateFromLocalStorage(
              roomId,
              myPlayerId
            );
            if (savedState && savedState.lastGameSummary) {
              setSummaryData(savedState.lastGameSummary);
              setShowSummary(true);
              // Common state resets for game end
              setGameStarted(false);
              setResult([]);
              setCurrentTurnId(null);
              addMessage("แสดงสรุปเกมจากข้อมูลสำรอง (Local Storage)", "info");
            } else {
              addMessage(
                "ไม่พบข้อมูลสรุปเกมใน Local Storage เพื่อแสดงผล",
                "error"
              );
            }
          }
        }, 3000); // 3 seconds timeout
      } else {
        // Socket not connected, try to load directly from LS
        addMessage(
          "ไม่ได้เชื่อมต่อกับ Server. กำลังโหลดสรุปจาก Local Storage...",
          "info"
        );
        const savedState = loadGameStateFromLocalStorage(roomId, myPlayerId);
        if (savedState && savedState.lastGameSummary) {
          setSummaryData(savedState.lastGameSummary);
          setShowSummary(true);
          setGameStarted(false);
          setResult([]);
          setCurrentTurnId(null);
          addMessage("แสดงสรุปเกมจากข้อมูลสำรอง (Local Storage)", "info");
        } else {
          addMessage("ไม่พบข้อมูลสรุปเกมใน Local Storage", "error");
        }
      }
    } else {
      addMessage(
        "เฉพาะเจ้ามือเท่านั้นที่สามารถกดจบเกมได้ หรือคุณยังไม่ได้เข้าร่วมห้อง",
        "error"
      );
    }
  };

  const handleExitGame = () => {
    // Optional: clear local storage for this room if desired
    // if (roomId && myPlayerId) {
    //   clearGameStateFromLocalStorage(roomId, myPlayerId);
    //   addMessage("ออกจากเกมและล้างข้อมูล Local Storage ของห้องนี้", "info");
    // }
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
        if (calculatedScore === 0) {
          type = "บอดสองเด้ง"; // Corrected: Busted but still two of a kind or same suit
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
        if (
          n_vals_for_straight[1] === n_vals_for_straight[0] + 1 &&
          n_vals_for_straight[2] === n_vals_for_straight[1] + 1
        ) {
          if (
            !(
              n_vals_for_straight[0] === 1 &&
              n_vals_for_straight[1] === 2 &&
              n_vals_for_straight[2] === 3
            )
          ) {
            is_straight_result = true;
          }
        }
        if (
          // A23 also straight for some rules, but QKA is more common for high straight
          n_vals_for_straight[0] === 1 &&
          n_vals_for_straight[1] === 12 && // Q
          n_vals_for_straight[2] === 13 // K  (A,K,Q)
        ) {
          is_straight_result = true;
        } else if (
          // A,2,3
          n_vals_for_straight[0] === 1 &&
          n_vals_for_straight[1] === 2 &&
          n_vals_for_straight[2] === 3
        ) {
          is_straight_result = true; // Assuming A23 is a straight
        }
      }
      const is_sian_result = card_raw_values.every((v_str) =>
        ["J", "Q", "K"].includes(v_str)
      );
      if (isTaong) {
        type = `ตอง ${card_raw_values[0]}`;
      } else if (is_straight_result && isSameSuit) {
        type = "สเตรทฟลัช";
      } else if (is_sian_result) {
        type = "เซียน";
      } else if (is_straight_result) {
        type = "เรียง";
      } else if (isSameSuit) {
        if (calculatedScore === 0) {
          type = "สามเด้ง (บอด)";
        } else {
          type = `${calculatedScore} แต้มสามเด้ง`;
        }
      } else {
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
    if (type === "0 แต้ม" && cardsToRank.length > 0 && calculatedScore === 0) {
      // Ensure it's explicitly 'บอด' if 0 points
      if (
        cardsToRank.length === 2 &&
        (cardsToRank[0].suit === cardsToRank[1].suit ||
          cardsToRank[0].value === cardsToRank[1].value)
      ) {
        // Already handled as "บอดสองเด้ง"
      } else if (
        cardsToRank.length === 3 &&
        cardsToRank.map((c) => c.suit).every((s, _, arr) => s === arr[0])
      ) {
        // Already handled as "สามเด้ง (บอด)"
      } else {
        type = "บอด";
      }
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

  // JSX part - Render UI
  if (showSummary) {
    const me = summaryData.find((p) => p.id === myPlayerId);
    return (
      <div className="App-summary">
        <h2>สรุปยอดต้องโอนให้และต้องได้ (ห้อง: {roomId})</h2>
        <h3>
          ชื่อขาไพ่: {me?.name || name} (
          {me?.role || (isDealer ? "เจ้ามือ" : "ขาไพ่")})
        </h3>
        <hr />
        {transferSummary.toReceive.length > 0 && (
          <>
            <h3 style={{ color: "green", marginTop: "20px" }}>
              ยอดที่จะได้รับ:
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
            <h3 style={{ color: "red", marginTop: "20px" }}>ยอดที่ต้องโอน:</h3>
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
        {transferSummary.toReceive.length === 0 &&
          transferSummary.toPay.length === 0 && (
            <p style={{ textAlign: "center", marginTop: "20px" }}>
              ไม่มีรายการได้เสียสำหรับคุณในรอบนี้
            </p>
          )}
        <h3 style={{ marginTop: "20px" }}>
          ยอดเงินคงเหลือของคุณ:{" "}
          {(me?.finalBalance !== undefined ? me.finalBalance : parseInt(money)) // Fallback to initial money if finalBalance not in summary (should not happen with good data)
            ?.toLocaleString()}{" "}
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
        {!isDealer && (
          <button className="btn-inroom-endgame" onClick={handleEndGame}>
            ออกจากห้อง
          </button>
        )}
        {isDealer &&
          (!gameStarted || (result && result.length > 0)) &&
          !showSummary && (
            <button className="btn-inroom-endgame" onClick={handleEndGame}>
              จบเกม&ดูสรุปยอด
            </button>
          )}
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
