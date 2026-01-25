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
  x: number;
  y: number;
  drawing: boolean;
  updatedAt: number;
};

export type ChatPayload = {
  id: string;
  clientId: string;
  name: string;
  message: string;
  createdAt: number;
};

export type InvitePayload = {
  id: string;
  clientId: string;
  name: string;
  email: string;
  note?: string;
  createdAt: number;
};

export type PresencePayload = {
  clientId: string;
  name: string;
  color: string;
  lastActive: number;
};

export type SocketMessage =
  | { type: "prediction"; payload: LivePrediction }
  | { type: "status"; payload: { message: string } }
  | { type: "cursor"; payload: CursorPayload }
  | { type: "chat"; payload: ChatPayload }
  | { type: "invite"; payload: InvitePayload }
  | { type: "presence"; payload: PresencePayload };
