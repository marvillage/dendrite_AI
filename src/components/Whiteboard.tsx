import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent
} from "react";
import { Canvas, FabricObject, PencilBrush, Path } from "fabric";
import { jsPDF } from "jspdf";
import type {
  ChatPayload,
  CursorPayload,
  ClearPayload,
  DrawPayload,
  HistoryPayload,
  InvitePayload,
  PresencePayload,
  RoomJoinPayload,
  SocketMessage,
  UndoPayload
} from "../types";

const colors = [
  "#2e6cf6",
  "#111827",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6"
];

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8080";

const STORAGE_KEYS = {
  brushColor: "whiteboard:brushColor",
  brushSize: "whiteboard:brushSize",
  displayName: "whiteboard:displayName",
  cursorColor: "whiteboard:cursorColor"
};

type CollaboratorState = {
  clientId: string;
  name: string;
  color: string;
  x: number | null;
  y: number | null;
  drawing: boolean;
  lastSeen: number;
};

type DrawEvent = {
  createdAt: number;
  path: Record<string, unknown>;
  pathId: string;
  ownerId: string;
};

const readStoredValue = (key: string, fallback: string) => {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const readStoredNumber = (key: string, fallback: number) => {
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

const persistValue = (key: string, value: string) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc.)
  }
};

const pickInitialColor = () => {
  const stored = readStoredValue(STORAGE_KEYS.cursorColor, "");
  if (stored) {
    return stored;
  }
  return colors[Math.floor(Math.random() * colors.length)];
};

const formatTimestamp = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const normalizeRoomId = (value: string) => value.trim().toUpperCase();
const createRoomId = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();
const createPathId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `path-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const serializePath = (path: Path, data?: Record<string, unknown>) => {
  const serialized = (path.toObject() as unknown as Record<string, unknown>) ?? {};
  if (data) {
    serialized.data = data;
  }
  return serialized;
};

const Whiteboard = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const isApplyingRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const undoStack = useRef<FabricObject[]>([]);
  const redoStack = useRef<FabricObject[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const cursorFrameRef = useRef<number | null>(null);
  const cursorPositionRef = useRef({ x: 0.5, y: 0.5 });
  const isDrawingRef = useRef(false);
  const chatIdsRef = useRef(new Set<string>());
  const inviteIdsRef = useRef(new Set<string>());
  const drawEventsRef = useRef<DrawEvent[]>([]);
  const roomIdRef = useRef<string>("");
  const sendPresenceRef = useRef<() => void>(() => {});
  const clientIdRef = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const [brushColor, setBrushColor] = useState(() =>
    readStoredValue(STORAGE_KEYS.brushColor, colors[0])
  );
  const [brushSize, setBrushSize] = useState(() =>
    readStoredNumber(STORAGE_KEYS.brushSize, 6)
  );
  const [historyVersion, setHistoryVersion] = useState(0);
  const [displayName, setDisplayName] = useState(() =>
    readStoredValue(STORAGE_KEYS.displayName, "Guest")
  );
  const [cursorColor, setCursorColor] = useState(() => pickInitialColor());
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "online" | "offline"
  >("connecting");
  const [collaborators, setCollaborators] = useState<
    Record<string, CollaboratorState>
  >({});
  const [chatMessages, setChatMessages] = useState<ChatPayload[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [inviteLog, setInviteLog] = useState<InvitePayload[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [roomDraft, setRoomDraft] = useState("");
  const [drawEventCount, setDrawEventCount] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const clientId = clientIdRef.current;

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const canUndo = useMemo(
    () => undoStack.current.length > 0,
    [historyVersion]
  );
  const canRedo = useMemo(
    () => redoStack.current.length > 0,
    [historyVersion]
  );

  const bumpHistory = useCallback(() => {
    setHistoryVersion((version) => version + 1);
  }, []);

  const pushDrawEvent = useCallback((event: DrawEvent) => {
    drawEventsRef.current.push(event);
    setDrawEventCount(drawEventsRef.current.length);
  }, []);

  const removeDrawEvent = useCallback((pathId: string) => {
    drawEventsRef.current = drawEventsRef.current.filter(
      (event) => event.pathId !== pathId
    );
    setDrawEventCount(drawEventsRef.current.length);
  }, []);

  const removeDrawEventsByOwner = useCallback((ownerId: string) => {
    drawEventsRef.current = drawEventsRef.current.filter(
      (event) => event.ownerId !== ownerId
    );
    setDrawEventCount(drawEventsRef.current.length);
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) {
      return;
    }
    canvas.getObjects().forEach((object) => canvas.remove(object));
    canvas.renderAll();
    undoStack.current = [];
    redoStack.current = [];
    bumpHistory();
  }, [bumpHistory]);

  const updateCollaborator = useCallback((payload: Partial<CollaboratorState>) => {
    if (!payload.clientId) {
      return;
    }
    setCollaborators((current) => {
      const existing = current[payload.clientId as string];
      return {
        ...current,
        [payload.clientId as string]: {
          clientId: payload.clientId as string,
          name: payload.name ?? existing?.name ?? "Guest",
          color: payload.color ?? existing?.color ?? "#2e6cf6",
          x: payload.x ?? existing?.x ?? null,
          y: payload.y ?? existing?.y ?? null,
          drawing: payload.drawing ?? existing?.drawing ?? false,
          lastSeen: payload.lastSeen ?? existing?.lastSeen ?? Date.now()
        }
      };
    });
  }, []);

  const sendSocketMessage = useCallback((message: SocketMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }, []);

  useEffect(() => {
    sendPresenceRef.current = () => {
      const activeRoom = roomIdRef.current;
      if (!activeRoom) {
        return;
      }
      const payload: PresencePayload = {
        clientId,
        name: displayName.trim() || "Guest",
        color: cursorColor,
        roomId: activeRoom,
        lastActive: Date.now()
      };
      sendSocketMessage({ type: "presence", payload });
    };
  }, [clientId, cursorColor, displayName, sendSocketMessage]);

  const sendPresence = useCallback(() => {
    sendPresenceRef.current();
  }, []);

  const sendJoin = useCallback(
    (nextRoomId: string) => {
      const payload: RoomJoinPayload = {
        clientId,
        name: displayName.trim() || "Guest",
        color: cursorColor,
        roomId: nextRoomId,
        joinedAt: Date.now()
      };
      sendSocketMessage({ type: "join", payload });
    },
    [clientId, cursorColor, displayName, sendSocketMessage]
  );

  const joinRoom = useCallback(
    (nextRoomId: string) => {
      const normalized = normalizeRoomId(nextRoomId);
      if (!normalized) {
        return;
      }
      roomIdRef.current = normalized;
      setRoomId(normalized);
      setRoomDraft(normalized);
      clearCanvas();
      setCollaborators({});
      setChatMessages([]);
      setInviteLog([]);
      chatIdsRef.current = new Set();
      inviteIdsRef.current = new Set();
      drawEventsRef.current = [];
      setDrawEventCount(0);
      sendJoin(normalized);
      sendPresenceRef.current();
    },
    [clearCanvas, sendJoin]
  );

  const leaveRoom = useCallback(() => {
    roomIdRef.current = "";
    setRoomId("");
    setRoomDraft("");
    clearCanvas();
    setCollaborators({});
    setChatMessages([]);
    setInviteLog([]);
    chatIdsRef.current = new Set();
    inviteIdsRef.current = new Set();
    drawEventsRef.current = [];
    setDrawEventCount(0);
  }, [clearCanvas]);

  const sendCursor = useCallback(
    (x: number, y: number, drawing: boolean) => {
      const activeRoom = roomIdRef.current;
      if (!activeRoom) {
        return;
      }
      const payload: CursorPayload = {
        clientId,
        name: displayName.trim() || "Guest",
        color: cursorColor,
        roomId: activeRoom,
        x,
        y,
        drawing,
        updatedAt: Date.now()
      };
      sendSocketMessage({ type: "cursor", payload });
    },
    [clientId, cursorColor, displayName, sendSocketMessage]
  );

  const scheduleCursorSend = useCallback(
    (x: number, y: number) => {
      cursorPositionRef.current = { x, y };
      if (cursorFrameRef.current !== null) {
        return;
      }
      cursorFrameRef.current = window.requestAnimationFrame(() => {
        cursorFrameRef.current = null;
        const position = cursorPositionRef.current;
        sendCursor(position.x, position.y, isDrawingRef.current);
      });
    },
    [sendCursor]
  );

  const applyBrush = () => {
    const canvas = fabricRef.current;
    if (!canvas) {
      return;
    }
    if (!canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush = new PencilBrush(canvas);
    }
    const brush = canvas.freeDrawingBrush as PencilBrush;
    brush.color = brushColor;
    brush.width = brushSize;
  };

  useEffect(() => {
    if (!canvasRef.current) {
      return undefined;
    }

    const canvas = new Canvas(canvasRef.current, {
      isDrawingMode: true,
      selection: false,
      preserveObjectStacking: true
    });

    fabricRef.current = canvas;

    canvas.freeDrawingBrush = new PencilBrush(canvas);
    applyBrush();

    const handleResize = () => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      if (
        width === sizeRef.current.width &&
        height === sizeRef.current.height
      ) {
        return;
      }
      sizeRef.current = { width, height };
      canvas.setWidth(width);
      canvas.setHeight(height);
      canvas.renderAll();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    const handlePathCreated = (event: { path: FabricObject }) => {
      const stroke = event.path as Path;
      if (!stroke.path) {
        return;
      }
      const activeRoom = roomIdRef.current;
      const pathId = createPathId();
      const meta = { ownerId: clientId, roomId: activeRoom, pathId };
      (stroke as FabricObject & { data?: typeof meta }).data = meta;
      undoStack.current.push(stroke);
      redoStack.current = [];
      bumpHistory();
      const createdAt = Date.now();
      const serialized = serializePath(stroke, meta);
      pushDrawEvent({
        createdAt,
        path: serialized,
        pathId,
        ownerId: clientId
      });
      if (!activeRoom) {
        return;
      }
      const payload: DrawPayload = {
        clientId,
        roomId: activeRoom,
        pathId,
        path: serialized,
        createdAt
      };
      sendSocketMessage({ type: "draw", payload });
    };

    canvas.on("path:created", handlePathCreated);
    canvas.on("object:modified", bumpHistory);

    handleResize();
    bumpHistory();

    return () => {
      resizeObserver.disconnect();
      canvas.off("path:created", handlePathCreated);
      canvas.off("object:modified", bumpHistory);
      canvas.dispose();
    };
  }, []);

  useEffect(() => {
    applyBrush();
  }, [brushColor, brushSize]);

  useEffect(() => {
    persistValue(STORAGE_KEYS.brushColor, brushColor);
  }, [brushColor]);

  useEffect(() => {
    persistValue(STORAGE_KEYS.brushSize, String(brushSize));
  }, [brushSize]);

  useEffect(() => {
    persistValue(STORAGE_KEYS.displayName, displayName);
    if (connectionStatus === "online") {
      sendPresence();
    }
  }, [displayName, connectionStatus, sendPresence]);

  useEffect(() => {
    persistValue(STORAGE_KEYS.cursorColor, cursorColor);
    if (connectionStatus === "online") {
      sendPresence();
    }
  }, [cursorColor, connectionStatus, sendPresence]);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;
    setConnectionStatus("connecting");

    const handleOpen = () => {
      setConnectionStatus("online");
      if (roomIdRef.current) {
        sendJoin(roomIdRef.current);
        sendPresence();
      }
    };

    const handleClose = () => {
      setConnectionStatus("offline");
    };

    const handleMessage = (event: MessageEvent) => {
      let parsed: SocketMessage | null = null;
      try {
        parsed = JSON.parse(event.data) as SocketMessage;
      } catch {
        parsed = null;
      }
      if (!parsed || !parsed.type) {
        return;
      }
        if (parsed.type === "cursor") {
          const payload = parsed.payload as CursorPayload;
          if (payload.clientId === clientId) {
            return;
          }
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          updateCollaborator({
            clientId: payload.clientId,
            name: payload.name,
            color: payload.color,
            x: payload.x,
          y: payload.y,
          drawing: payload.drawing,
          lastSeen: payload.updatedAt
        });
      }
        if (parsed.type === "presence") {
          const payload = parsed.payload as PresencePayload;
          if (payload.clientId === clientId) {
            return;
          }
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          updateCollaborator({
            clientId: payload.clientId,
            name: payload.name,
            color: payload.color,
            lastSeen: payload.lastActive
          });
        }
        if (parsed.type === "history") {
          const payload = parsed.payload as HistoryPayload;
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          const canvas = fabricRef.current;
          if (!canvas) {
            return;
          }
          isApplyingRef.current = true;
          canvas.getObjects().forEach((object) => canvas.remove(object));
          const events: DrawEvent[] = [];
          payload.paths.forEach((draw) => {
            const pathData = draw.path as Record<string, unknown> & {
              path?: Path["path"];
            };
            if (!pathData?.path) {
              return;
            }
            const path = new Path(
              pathData.path,
              pathData as unknown as Record<string, unknown>
            );
            const existingData =
              typeof pathData.data === "object" && pathData.data
                ? pathData.data
                : {};
            (path as FabricObject & { data?: Record<string, unknown> }).data = {
              ...existingData,
              ownerId: draw.clientId,
              roomId: draw.roomId,
              pathId: draw.pathId
            };
            canvas.add(path);
            events.push({
              createdAt: draw.createdAt,
              path: draw.path,
              pathId: draw.pathId,
              ownerId: draw.clientId
            });
          });
          canvas.renderAll();
          isApplyingRef.current = false;
          drawEventsRef.current = events;
          setDrawEventCount(events.length);
          undoStack.current = [];
          redoStack.current = [];
          bumpHistory();
        }
        if (parsed.type === "draw") {
          const payload = parsed.payload as DrawPayload;
          if (payload.clientId === clientId) {
            return;
          }
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          const canvas = fabricRef.current;
          if (!canvas) {
            return;
          }
          const pathData = payload.path as Record<string, unknown> & {
            path?: Path["path"];
          };
          if (!pathData?.path) {
            return;
          }
          isApplyingRef.current = true;
          const path = new Path(
            pathData.path,
            pathData as unknown as Record<string, unknown>
          );
          const existingData =
            typeof pathData.data === "object" && pathData.data
              ? pathData.data
              : {};
          (path as FabricObject & { data?: Record<string, unknown> }).data = {
            ...existingData,
            ownerId: payload.clientId,
            roomId: payload.roomId,
            pathId: payload.pathId
          };
          canvas.add(path);
          canvas.renderAll();
          isApplyingRef.current = false;
          pushDrawEvent({
            createdAt: payload.createdAt,
            path: payload.path,
            pathId: payload.pathId,
            ownerId: payload.clientId
          });
        }
        if (parsed.type === "undo") {
          const payload = parsed.payload as UndoPayload;
          if (payload.clientId === clientId) {
            return;
          }
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          const canvas = fabricRef.current;
          if (!canvas) {
            return;
          }
          const toRemove = canvas.getObjects().find((object) => {
            const data = (object as FabricObject & {
              data?: { pathId?: string };
            }).data;
            return data?.pathId === payload.pathId;
          });
          if (toRemove) {
            canvas.remove(toRemove);
            canvas.renderAll();
          }
          removeDrawEvent(payload.pathId);
        }
        if (parsed.type === "clear") {
          const payload = parsed.payload as ClearPayload;
          if (payload.clientId === clientId) {
            return;
          }
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          const canvas = fabricRef.current;
          if (!canvas) {
            return;
          }
          const toRemove = canvas.getObjects().filter((object) => {
            const ownerId = (object as FabricObject & {
              data?: { ownerId?: string };
            }).data?.ownerId;
            return ownerId === payload.clientId;
          });
          toRemove.forEach((object) => canvas.remove(object));
          canvas.renderAll();
          removeDrawEventsByOwner(payload.clientId);
        }
        if (parsed.type === "chat") {
          const payload = parsed.payload as ChatPayload;
          if (payload.clientId === clientId) {
            return;
          }
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          if (chatIdsRef.current.has(payload.id)) {
            return;
          }
        chatIdsRef.current.add(payload.id);
        setChatMessages((current) => [...current, payload].slice(-200));
      }
        if (parsed.type === "invite") {
          const payload = parsed.payload as InvitePayload;
          if (payload.clientId === clientId) {
            return;
          }
          if (payload.roomId !== roomIdRef.current) {
            return;
          }
          if (inviteIdsRef.current.has(payload.id)) {
            return;
          }
        inviteIdsRef.current.add(payload.id);
        setInviteLog((current) => [payload, ...current].slice(0, 8));
      }
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("message", handleMessage);
      socket.close();
    };
  }, [
    bumpHistory,
    clientId,
    pushDrawEvent,
    removeDrawEvent,
    removeDrawEventsByOwner,
    sendJoin,
    sendPresence,
    updateCollaborator
  ]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (connectionStatus !== "online") {
        return;
      }
      sendPresence();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [connectionStatus, sendPresence]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 20000;
      setCollaborators((current) => {
        const next: Record<string, CollaboratorState> = {};
        Object.values(current).forEach((collaborator) => {
          if (collaborator.lastSeen >= cutoff) {
            next[collaborator.clientId] = collaborator;
          }
        });
        return next;
      });
    }, 6000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const handleUndo = () => {
    const canvas = fabricRef.current;
    const stack = undoStack.current;
    if (!canvas || stack.length === 0) {
      return;
    }
    const last = stack.pop();
    if (!last) {
      return;
    }
    const pathId = (last as FabricObject & { data?: { pathId?: string } }).data
      ?.pathId;
    canvas.remove(last);
    canvas.renderAll();
    redoStack.current.push(last);
    if (pathId) {
      removeDrawEvent(pathId);
      const activeRoom = roomIdRef.current;
      if (activeRoom) {
        const payload: UndoPayload = {
          clientId,
          roomId: activeRoom,
          pathId,
          createdAt: Date.now()
        };
        sendSocketMessage({ type: "undo", payload });
      }
    }
    bumpHistory();
  };

  const handleRedo = () => {
    const canvas = fabricRef.current;
    const stack = redoStack.current;
    const restored = stack.pop();
    if (!canvas || !restored) {
      return;
    }
    const restoredPath = restored as Path;
    const existingData =
      (restoredPath as FabricObject & { data?: Record<string, unknown> }).data ??
      {};
    const pathId =
      (existingData as { pathId?: string }).pathId ?? createPathId();
    (restoredPath as FabricObject & { data?: Record<string, unknown> }).data = {
      ...existingData,
      ownerId: clientId,
      roomId: roomIdRef.current,
      pathId
    };
    canvas.add(restored);
    canvas.renderAll();
    undoStack.current.push(restored);
    const createdAt = Date.now();
    const serialized = serializePath(
      restoredPath,
      (restoredPath as FabricObject & { data?: Record<string, unknown> }).data
    );
    pushDrawEvent({
      createdAt,
      path: serialized,
      pathId,
      ownerId: clientId
    });
    const activeRoom = roomIdRef.current;
    if (activeRoom) {
      const payload: DrawPayload = {
        clientId,
        roomId: activeRoom,
        pathId,
        path: serialized,
        createdAt
      };
      sendSocketMessage({ type: "draw", payload });
    }
    bumpHistory();
  };

  const handleClear = () => {
    const canvas = fabricRef.current;
    if (!canvas) {
      return;
    }
    const ownObjects = canvas.getObjects().filter((object) => {
      const ownerId = (object as FabricObject & { data?: { ownerId?: string } })
        .data?.ownerId;
      return ownerId === clientId;
    });
    ownObjects.forEach((object: FabricObject) => canvas.remove(object));
    canvas.renderAll();
    undoStack.current = [];
    redoStack.current = [];
    removeDrawEventsByOwner(clientId);
    const activeRoom = roomIdRef.current;
    if (activeRoom && ownObjects.length > 0) {
      const payload: ClearPayload = {
        clientId,
        roomId: activeRoom,
        createdAt: Date.now()
      };
      sendSocketMessage({ type: "clear", payload });
    }
    bumpHistory();
  };

  const handleSaveImage = () => {
    const canvas = fabricRef.current;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "whiteboard.png";
    link.click();
  };

  const handleSavePdf = () => {
    const canvas = fabricRef.current;
    if (!canvas) {
      return;
    }
    const dataUrl = canvas.toDataURL({ format: "png", multiplier: 2 });
    const width = canvas.getWidth();
    const height = canvas.getHeight();
    const pdf = new jsPDF({
      orientation: width > height ? "landscape" : "portrait",
      unit: "px",
      format: [width, height]
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
    pdf.save("whiteboard.pdf");
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const x = clamp((event.clientX - rect.left) / rect.width);
    const y = clamp((event.clientY - rect.top) / rect.height);
    cursorPositionRef.current = { x, y };
    scheduleCursorSend(x, y);
  };

  const stopDrawing = () => {
    if (!isDrawingRef.current) {
      return;
    }
    isDrawingRef.current = false;
    setIsDrawing(false);
    const position = cursorPositionRef.current;
    sendCursor(position.x, position.y, false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    isDrawingRef.current = true;
    setIsDrawing(true);
    handlePointerMove(event);
  };

  const handlePointerUp = () => {
    stopDrawing();
  };

  const handlePointerLeave = () => {
    stopDrawing();
  };

  const handleChatSubmit = (event: FormEvent) => {
    event.preventDefault();
    const activeRoom = roomIdRef.current;
    const message = chatDraft.trim();
    if (!message || !activeRoom) {
      return;
    }
    const payload: ChatPayload = {
      id: `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      clientId,
      name: displayName.trim() || "Guest",
      roomId: activeRoom,
      message,
      createdAt: Date.now()
    };
    chatIdsRef.current.add(payload.id);
    setChatMessages((current) => [...current, payload].slice(-200));
    sendSocketMessage({ type: "chat", payload });
    setChatDraft("");
  };

  const handleInviteSubmit = (event: FormEvent) => {
    event.preventDefault();
    const activeRoom = roomIdRef.current;
    const email = inviteEmail.trim();
    if (!email || !activeRoom) {
      return;
    }
    const payload: InvitePayload = {
      id: `invite-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      clientId,
      name: displayName.trim() || "Guest",
      roomId: activeRoom,
      email,
      note: inviteNote.trim(),
      createdAt: Date.now()
    };

    const subject = encodeURIComponent(
      `${payload.name} invited you to a whiteboard session`
    );
    const body = encodeURIComponent(
      `${payload.note || "Join me on the live whiteboard."}\n\nSession: ${window.location.href}`
    );
    window.open(`mailto:${email}?subject=${subject}&body=${body}`, "_blank");

    inviteIdsRef.current.add(payload.id);
    setInviteLog((current) => [payload, ...current].slice(0, 8));
    sendSocketMessage({ type: "invite", payload });
    setInviteEmail("");
  };

  const handleCreateRoom = () => {
    joinRoom(createRoomId());
  };

  const handleJoinRoom = (event: FormEvent) => {
    event.preventDefault();
    joinRoom(roomDraft);
  };

  const handleLeaveRoom = () => {
    leaveRoom();
  };

  const handleCopyRoom = async () => {
    if (!roomId) {
      return;
    }
    if (!navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(roomId);
    } catch {
      // Ignore clipboard errors
    }
  };

  const isInRoom = roomId.length > 0;
  const canExportVideo = drawEventCount > 0 && !isExporting;

  const handleExportVideo = useCallback(async () => {
    if (!("MediaRecorder" in window)) {
      return;
    }
    const canvas = fabricRef.current;
    if (!canvas) {
      return;
    }
    const events = [...drawEventsRef.current].sort(
      (a, b) => a.createdAt - b.createdAt
    );
    if (events.length === 0) {
      return;
    }
    setIsExporting(true);
    let playbackCanvas: Canvas | null = null;
    let stream: MediaStream | null = null;
    try {
      const width = canvas.getWidth();
      const height = canvas.getHeight();
      const playbackCanvasEl = document.createElement("canvas");
      playbackCanvasEl.width = width;
      playbackCanvasEl.height = height;
      playbackCanvas = new Canvas(playbackCanvasEl, {
        selection: false,
        preserveObjectStacking: true
      });
      playbackCanvas.setWidth(width);
      playbackCanvas.setHeight(height);
      playbackCanvas.backgroundColor = "#ffffff";
      playbackCanvas.renderAll();

      stream = playbackCanvasEl.captureStream(30);
      const mimeTypes = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
      ];
      const mimeType = mimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start();

      const startTime = events[0].createdAt;
      let lastTime = startTime;
      for (const event of events) {
        const delay = Math.max(0, event.createdAt - lastTime);
        if (delay > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, delay));
        }
        const pathData = event.path as Record<string, unknown> & {
          path?: Path["path"];
        };
        if (pathData?.path) {
          const path = new Path(
            pathData.path,
            pathData as unknown as Record<string, unknown>
          );
          playbackCanvas.add(path);
          playbackCanvas.renderAll();
        }
        lastTime = event.createdAt;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, {
        type: recorder.mimeType || "video/webm"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `whiteboard-${roomId || "session"}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      playbackCanvas?.dispose();
      stream?.getTracks().forEach((track) => track.stop());
      setIsExporting(false);
    }
  }, [roomId]);

  const collaboratorList = useMemo(() => {
    if (!isInRoom) {
      return [];
    }
    const others = Object.values(collaborators).filter(
      (collaborator) => collaborator.clientId !== clientId
    );
    return [
      {
        clientId,
        name: displayName.trim() || "You",
        color: cursorColor,
        drawing: isDrawing,
        self: true
      },
      ...others.map((collaborator) => ({
        clientId: collaborator.clientId,
        name: collaborator.name,
        color: collaborator.color,
        drawing: collaborator.drawing,
        self: false
      }))
    ];
  }, [collaborators, cursorColor, displayName, isDrawing, clientId, isInRoom]);

  const remoteCursors = useMemo(
    () =>
      isInRoom
        ? Object.values(collaborators).filter(
            (collaborator) =>
              collaborator.clientId !== clientId &&
              collaborator.x !== null &&
              collaborator.y !== null
          )
        : [],
    [collaborators, clientId, isInRoom]
  );

  return (
    <div className="board-frame h-100 d-flex flex-column">
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
        <div>
          <h3 className="brand-title h5 mb-1">Whiteboard</h3>
          <p className="subtitle mb-0">
            Draw, undo, and export your ideas instantly.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleUndo}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            className="btn btn-outline-secondary btn-sm"
            onClick={handleRedo}
            disabled={!canRedo}
          >
            Redo
          </button>
          <button className="btn btn-outline-dark btn-sm" onClick={handleClear}>
            Clear
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSaveImage}>
            Save PNG
          </button>
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={handleSavePdf}
          >
            Save PDF
          </button>
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={handleExportVideo}
            disabled={!canExportVideo}
          >
            {isExporting ? "Exporting..." : "Export video"}
          </button>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-3 align-items-center mb-3">
        <div>
          <div className="control-label mb-2">Brush color</div>
          <div className="d-flex gap-2 align-items-center">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={`btn p-0 rounded-circle ${
                  brushColor === color ? "border border-dark" : "border-0"
                }`}
                style={{
                  width: 28,
                  height: 28,
                  backgroundColor: color
                }}
                onClick={() => setBrushColor(color)}
              />
            ))}
            <input
              type="color"
              className="form-control form-control-color"
              value={brushColor}
              onChange={(event) => setBrushColor(event.target.value)}
              title="Pick a custom color"
            />
          </div>
        </div>

        <div>
          <div className="control-label mb-2">Brush size</div>
          <div className="d-flex align-items-center gap-3">
            <input
              type="range"
              className="form-range"
              min={2}
              max={28}
              value={brushSize}
              onChange={(event) => setBrushSize(Number(event.target.value))}
            />
            <span className="badge bg-light text-dark border">
              {brushSize}px
            </span>
          </div>
        </div>
      </div>

      <div className="row g-3 flex-grow-1">
        <div className="col-12 col-xl-8">
          <div
            ref={containerRef}
            className="board-grid"
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
          >
            {!isInRoom && (
              <div className="room-hint">
                Drawing locally. Join a room to collaborate.
              </div>
            )}
            <canvas ref={canvasRef} className="board-surface" />
            <div className="board-cursors">
              {remoteCursors.map((collaborator) => (
                <div
                  key={collaborator.clientId}
                  className={`cursor-marker ${
                    collaborator.drawing ? "cursor-drawing" : ""
                  }`}
                  style={{
                    left: `${(collaborator.x ?? 0) * 100}%`,
                    top: `${(collaborator.y ?? 0) * 100}%`
                  }}
                >
                  <span
                    className="cursor-dot"
                    style={{ backgroundColor: collaborator.color }}
                  />
                  <span className="cursor-label">{collaborator.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-4">
          <div className="collab-panel h-100">
            <div className="collab-card">
              <div className="control-label mb-2">Room access</div>
              {isInRoom ? (
                <div>
                  <div className="room-code">{roomId}</div>
                  <div className="d-flex gap-2 mt-2">
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm"
                      onClick={handleCopyRoom}
                    >
                      Copy code
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={handleLeaveRoom}
                    >
                      Leave
                    </button>
                  </div>
                  <div className="small text-muted mt-2">
                    Share this code to invite someone to the same board.
                  </div>
                </div>
              ) : (
                <form onSubmit={handleJoinRoom} className="d-grid gap-2">
                  <input
                    className="form-control"
                    value={roomDraft}
                    onChange={(event) => setRoomDraft(event.target.value)}
                    placeholder="Enter room code"
                  />
                  <div className="d-flex gap-2">
                    <button className="btn btn-primary btn-sm" type="submit">
                      Join
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      type="button"
                      onClick={handleCreateRoom}
                    >
                      Create room
                    </button>
                  </div>
                </form>
              )}
            </div>
            <div className="collab-card">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="control-label">Collaboration</span>
                <span className="small text-muted">
                  {isInRoom ? `${collaboratorList.length} online` : "Join a room"}
                </span>
              </div>
              <div className="d-flex align-items-center gap-2 mb-3">
                <span
                  className={`status-dot ${
                    connectionStatus === "online"
                      ? "status-online"
                      : "status-offline"
                  }`}
                />
                <span className="small text-muted">
                  {connectionStatus === "online"
                    ? isInRoom
                      ? "Live cursor sharing"
                      : "Waiting for a room"
                    : "Offline (start the WS server)"}
                </span>
              </div>
              <div className="mb-3">
                <label className="control-label mb-2" htmlFor="displayName">
                  Display name
                </label>
                <input
                  id="displayName"
                  className="form-control"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="mb-3">
                <label className="control-label mb-2" htmlFor="cursorColor">
                  Cursor color
                </label>
                <input
                  id="cursorColor"
                  type="color"
                  className="form-control form-control-color"
                  value={cursorColor}
                  onChange={(event) => setCursorColor(event.target.value)}
                />
              </div>
              <div className="collab-list">
                {!isInRoom ? (
                  <div className="text-muted small">
                    Join a room to see collaborators.
                  </div>
                ) : (
                  collaboratorList.map((collaborator) => (
                    <div key={collaborator.clientId} className="collab-item">
                      <span
                        className="collab-dot"
                        style={{ backgroundColor: collaborator.color }}
                      />
                      <span className="small">
                        {collaborator.self
                          ? `${collaborator.name} (You)`
                          : collaborator.name}
                      </span>
                      {collaborator.drawing && (
                        <span className="badge bg-light text-dark border ms-auto">
                          Drawing
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="collab-card chat-card">
              <div className="control-label mb-2">Live chat</div>
              <div className="chat-log">
                {!isInRoom ? (
                  <div className="text-muted small">
                    Join a room to start chatting.
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="text-muted small">No messages yet.</div>
                ) : (
                  chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`chat-message ${
                        message.clientId === clientId ? "chat-self" : ""
                      }`}
                    >
                      <div className="chat-meta">
                        <span className="chat-author">
                          {message.clientId === clientId ? "You" : message.name}
                        </span>
                        <span className="chat-time">
                          {formatTimestamp(message.createdAt)}
                        </span>
                      </div>
                      <div className="chat-text">{message.message}</div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleChatSubmit} className="d-flex gap-2 mt-2">
                <input
                  className="form-control"
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder={
                    isInRoom ? "Message the team" : "Join a room to chat"
                  }
                  disabled={!isInRoom}
                />
                <button
                  className="btn btn-outline-primary"
                  type="submit"
                  disabled={!isInRoom}
                >
                  Send
                </button>
              </form>
            </div>

            <div className="collab-card">
              <div className="control-label mb-2">Invite by email</div>
              <form onSubmit={handleInviteSubmit} className="d-grid gap-2">
                <input
                  className="form-control"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="name@example.com"
                  required
                  disabled={!isInRoom}
                />
                <textarea
                  className="form-control"
                  rows={2}
                  value={inviteNote}
                  onChange={(event) => setInviteNote(event.target.value)}
                  placeholder="Add a personal note"
                  disabled={!isInRoom}
                />
                <button className="btn btn-primary" type="submit" disabled={!isInRoom}>
                  Send invite
                </button>
              </form>
              <div className="invite-note small text-muted mt-2">
                {isInRoom
                  ? "Opens your default email client with a join link."
                  : "Join a room to enable invites."}
              </div>
              {inviteLog.length > 0 && (
                <div className="invite-log mt-3">
                  {inviteLog.map((invite) => (
                    <div key={invite.id} className="invite-item">
                      <div className="small fw-semibold">{invite.email}</div>
                      <div className="text-muted small">
                        {formatTimestamp(invite.createdAt)} · Sent by {invite.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Whiteboard;
