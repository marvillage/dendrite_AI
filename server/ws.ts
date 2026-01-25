import { WebSocketServer } from "ws";

const port = Number(process.env.WS_PORT ?? 8080);

const wss = new WebSocketServer({ port });

const broadcast = (data: string) => {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  });
};

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "status",
      payload: { message: "connected" }
    })
  );

  socket.on("message", (raw) => {
    const message = raw.toString();
    broadcast(message);
  });
});

console.log(`WebSocket server running on ws://localhost:${port}`);