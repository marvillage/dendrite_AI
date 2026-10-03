import ImageClassifier from "./components/ImageClassifier";
import Whiteboard from "./components/Whiteboard";
import { useAuth } from "./auth/AuthProvider";
import { keycloakConfig } from "./config";

// Stable reference so auth changes don't re-run classification.
const ignorePrediction = () => {};

// Sign-in is optional: the board is always usable, Keycloak only adds identity.
const AccountStatus = () => {
  const { status, canSignIn, profile, login, register, logout } = useAuth();

  if (status === "authenticated") {
    return (
      <div className="d-flex align-items-center gap-3">
        <div className="text-end">
          <div className="fw-semibold">
            {profile?.firstName || profile?.username || "User"}
          </div>
          <div className="small text-muted">Authenticated via Keycloak</div>
        </div>
        <button className="btn btn-outline-dark btn-sm" onClick={logout}>
          Sign out
        </button>
      </div>
    );
  }

  const note =
    status === "checking"
      ? "Checking session..."
      : canSignIn
        ? "Not signed in"
        : keycloakConfig
          ? "Guest mode · sign-in unavailable"
          : "Guest mode";

  return (
    <div className="d-flex align-items-center gap-3">
      <div className="text-end">
        <div className="fw-semibold">Guest</div>
        <div className="small text-muted">{note}</div>
      </div>
      {canSignIn && (
        <div className="d-flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={login}>
            Sign in
          </button>
          <button className="btn btn-outline-primary btn-sm" onClick={register}>
            Create account
          </button>
        </div>
      )}
    </div>
  );
};

const App = () => {
  return (
    <div className="app-shell">
      <header className="py-4 border-bottom border-light">
        <div className="container">
          <div className="d-flex flex-column flex-lg-row gap-3 align-items-start align-items-lg-center justify-content-between">
            <div>
              <span className="badge badge-soft rounded-pill px-3 py-2 mb-2">
                Real-Time Collaborative Whiteboard
              </span>
              <h1 className="brand-title mb-1">Live Visual Intelligence</h1>
              <p className="subtitle mb-0">
                Upload an image, get instant predictions, and capture ideas on a
                clean digital whiteboard.
              </p>
            </div>
            <AccountStatus />
          </div>
        </div>
      </header>

      <main className="flex-grow-1 py-4">
        <div className="container">
          <div className="row g-4">
            <div className="col-12 col-lg-5">
              <div className="d-flex flex-column gap-4">
                <ImageClassifier onPrediction={ignorePrediction} />
              </div>
            </div>
            <div className="col-12 col-lg-7">
              <Whiteboard />
            </div>
          </div>
        </div>
      </main>

      <footer className="py-4">
        <div className="container text-center text-muted small">
          Built with React, TensorFlow.js, Fabric.js, and Bootstrap 5.
        </div>
      </footer>
    </div>
  );
};

export default App;
