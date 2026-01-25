# Whiteboard ML Studio

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start Keycloak with Docker:
   ```
   docker compose up -d
   ```

   Admin console: http://localhost:8080
   - Username: `admin`
   - Password: `admin`

3. Run the React app:
   ```
   npm run dev
   ```

## Authentication
- The app uses Keycloak (OIDC) for secure login and registration.
- Realm: `whiteboard`
- Client: `whiteboard-ui`

You can override defaults via `.env` (see `.env.example`).

## Notes
- Image classification uses TensorFlow.js MobileNet in the browser.
- The whiteboard uses Fabric.js for drawing, undo/redo, and export.