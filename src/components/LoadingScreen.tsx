const LoadingScreen = () => {
  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-12 col-lg-6">
          <div className="card-surface p-4 p-lg-5 text-center">
            <div className="spinner-border text-primary mb-3" role="status" />
            <h2 className="brand-title h5 mb-1">Checking session</h2>
            <p className="subtitle mb-0">Connecting to Keycloak...</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingScreen;