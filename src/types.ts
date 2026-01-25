export type Prediction = {
  className: string;
  probability: number;
};

export type LivePrediction = {
  id: string;
  imageName: string;
  createdAt: number;
  results: Prediction[];
};

export type CursorPayload = {
  clientId: string;
  name: string;
  color: string;
  roomId: string;
  x: number;
  y: number;
  drawing: boolean;
  updatedAt: number;
};

export type ChatPayload = {
  id: string;
  clientId: string;
  name: string;
  roomId: string;
  message: string;
  createdAt: number;
};

export type InvitePayload = {
  id: string;
  clientId: string;
  name: string;
  roomId: string;
  email: string;
  note?: string;
  createdAt: number;
};

export type PresencePayload = {
  clientId: string;
  name: string;
  color: string;
  roomId: string;
  lastActive: number;
};

export type DrawPayload = {
  clientId: string;
  roomId: string;
  pathId: string;
  path: Record<string, unknown>;
  createdAt: number;
};

export type UndoPayload = {
  clientId: string;
  roomId: string;
  pathId: string;
  createdAt: number;
};

export type ClearPayload = {
  clientId: string;
  roomId: string;
  createdAt: number;
};

export type HistoryPayload = {
  roomId: string;
  paths: DrawPayload[];
};

export type RoomJoinPayload = {
  clientId: string;
  name: string;
  color: string;
  roomId: string;
  joinedAt: number;
};

export type SocketMessage =
  | { type: "prediction"; payload: LivePrediction }
  | { type: "status"; payload: { message: string } }
  | { type: "join"; payload: RoomJoinPayload }
  | { type: "history"; payload: HistoryPayload }
  | { type: "cursor"; payload: CursorPayload }
  | { type: "draw"; payload: DrawPayload }
  | { type: "undo"; payload: UndoPayload }
  | { type: "clear"; payload: ClearPayload }
  | { type: "chat"; payload: ChatPayload }
  | { type: "invite"; payload: InvitePayload }
  | { type: "presence"; payload: PresencePayload };
