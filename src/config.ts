// Optional backends, resolved from VITE_* env vars at build time.
// Keycloak and the realtime WebSocket server are both optional: when one is
// missing, the app runs as a guest / in solo mode instead of waiting for it.

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const pageIsLocal =
  typeof window !== "undefined" &&
  LOCAL_HOSTNAMES.has(window.location.hostname);

const readEnv = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

// Returns the URL if this page can sensibly use it, or "" if not. A deployed
// page never reaches for the visitor's own localhost (e.g. when a build was
// made with the .env.example defaults).
const usableUrl = (raw: string) => {
  if (!raw) {
    return "";
  }
  try {
    const { hostname } = new URL(raw);
    if (LOCAL_HOSTNAMES.has(hostname) && !pageIsLocal) {
      return "";
    }
    return raw;
  } catch {
    return "";
  }
};

const keycloakUrl = usableUrl(readEnv(import.meta.env.VITE_KEYCLOAK_URL));

// null = Keycloak not configured for this build: everyone is a guest.
export const keycloakConfig = keycloakUrl
  ? {
      url: keycloakUrl,
      realm: readEnv(import.meta.env.VITE_KEYCLOAK_REALM) || "whiteboard",
      clientId:
        readEnv(import.meta.env.VITE_KEYCLOAK_CLIENT_ID) || "whiteboard-ui"
    }
  : null;

// How long the UI waits on Keycloak before treating it as unavailable.
export const KEYCLOAK_TIMEOUT_MS = 4000;

// "" = no realtime server for this build: the board runs solo.
// Local dev falls back to `npm run ws` on port 8080.
export const wsUrl = usableUrl(
  readEnv(import.meta.env.VITE_WS_URL) || (pageIsLocal ? "ws://localhost:8080" : "")
);

// How long the board shows "connecting" before switching to solo mode.
export const WS_CONNECT_TIMEOUT_MS = 6000;
