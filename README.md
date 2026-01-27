# Whiteboard ML Studio

## Requirements
- Node.js 18+ (Vite 5)
- Docker Desktop (optional, for Keycloak auth)

## Run locally
1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables:
   ```
   copy .env.example .env
   ```
   Confirm `VITE_KEYCLOAK_URL` matches the Keycloak port (default is `http://localhost:8081`).

3. (Optional) Start Keycloak:
   ```
   docker compose up -d
   ```
   Admin console: http://localhost:8081 (user: `admin`, pass: `admin`)

4. Start the app:
   ```
   npm run dev
   ```
   Vite prints the local URL in the terminal (usually `http://localhost:5173`).

## Realtime whiteboard server
The collaboration server is a separate WebSocket process:
```
npm run ws
```
It listens on `WS_PORT` (or `PORT`), defaulting to `8080`.

## Build and preview
```
npm run build
npm run preview
```

## Notes
- Image classification uses TensorFlow.js MobileNet in the browser.
- The whiteboard uses Fabric.js for drawing, undo/redo, and export.
