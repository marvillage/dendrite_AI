import { useAuth } from "../auth/AuthProvider";

const LoginScreen = () => {
  const { login, register } = useAuth();

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-6">
          <div className="card-surface p-4 p-lg-5">
            <span className="badge badge-soft rounded-pill px-3 py-2 mb-3">
              Whiteboard ML Studio
            </span>
            <h1 className="brand-title mb-2">Welcome back</h1>
            <p className="subtitle mb-4">
              Sign in with Keycloak to access the whiteboard and live image
              classification.
            </p>
            <div className="d-grid gap-2">
              <button className="btn btn-primary btn-lg" onClick={login}>
                Sign in
              </button>
              <button className="btn btn-outline-primary" onClick={register}>
                Create account
              </button>
            </div>
            <div className="text-muted small mt-4">
              You will be redirected to the secure Keycloak login page.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;