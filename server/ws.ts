import { WebSocketServer, type WebSocket } from "ws";

const port = Number(process.env.WS_PORT ?? 8080);

const wss = new WebSocketServer({ port });
const clientRooms = new Map<WebSocket, string | null>();
const roomState = new Map<string, Map<string, unknown>>();

const safeParse = (raw: string) => {
  try {
    return JSON.parse(raw) as { type?: string; payload?: unknown };
  } catch {
    return null;
  }
};

const broadcastToRoom = (roomId: string, data: string) => {
  wss.clients.forEach((client) => {
    if (client.readyState !== client.OPEN) {
      return;
    }
    if (clientRooms.get(client) === roomId) {
      client.send(data);
    }
  });
};

const getRoom = (roomId: string) => {
  let room = roomState.get(roomId);
  if (!room) {
    room = new Map<string, unknown>();
    roomState.set(roomId, room);
  }
  return room;
};

wss.on("connection", (socket) => {
  clientRooms.set(socket, null);

  socket.send(
    JSON.stringify({
      type: "status",
      payload: { message: "connected" }
    })
  );

  socket.on("message", (raw) => {
    const message = raw.toString();
    const parsed = safeParse(message);
    if (!parsed || !parsed.type) {
      return;
    }

    if (parsed.type === "join") {
      const payload = parsed.payload as { roomId?: string };
      if (!payload?.roomId) {
        return;
      }
      clientRooms.set(socket, payload.roomId);
      const room = getRoom(payload.roomId);
      const historyPayload = {
        roomId: payload.roomId,
        paths: Array.from(room.values()).sort((a, b) => {
          const aTime = (a as { createdAt?: number }).createdAt ?? 0;
          const bTime = (b as { createdAt?: number }).createdAt ?? 0;
          return aTime - bTime;
        })
      };
      socket.send(
        JSON.stringify({
          type: "history",
          payload: historyPayload
        })
      );
      broadcastToRoom(payload.roomId, message);
      return;
    }

    if (parsed.type === "draw") {
      const payload = parsed.payload as { roomId?: string; pathId?: string };
      if (!payload?.roomId || !payload?.pathId) {
        return;
      }
      const room = getRoom(payload.roomId);
      room.set(payload.pathId, parsed.payload as unknown);
      broadcastToRoom(payload.roomId, message);
      return;
    }

    if (parsed.type === "undo") {
      const payload = parsed.payload as { roomId?: string; pathId?: string };
      if (!payload?.roomId || !payload?.pathId) {
        return;
      }
      const room = getRoom(payload.roomId);
      room.delete(payload.pathId);
      broadcastToRoom(payload.roomId, message);
      return;
    }

    if (parsed.type === "clear") {
      const payload = parsed.payload as { roomId?: string; clientId?: string };
      if (!payload?.roomId || !payload?.clientId) {
        return;
      }
      const room = getRoom(payload.roomId);
      room.forEach((value, key) => {
        const draw = value as { clientId?: string };
        if (draw.clientId === payload.clientId) {
          room.delete(key);
        }
      });
      broadcastToRoom(payload.roomId, message);
      return;
    }

    const payload = parsed.payload as { roomId?: string };
    const roomId = payload?.roomId ?? clientRooms.get(socket);
    if (!roomId) {
      return;
    }
    broadcastToRoom(roomId, message);
  });

  socket.on("close", () => {
    clientRooms.delete(socket);
  });
});

console.log(`WebSocket server running on ws://localhost:${port}`);
