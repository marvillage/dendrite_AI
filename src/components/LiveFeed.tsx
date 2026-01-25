import { LivePrediction } from "../types";

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

type LiveFeedProps = {
  items: LivePrediction[];
};

const LiveFeed = ({ items }: LiveFeedProps) => {
  return (
    <div className="card-surface p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 className="brand-title h5 mb-1">Live Predictions</h3>
          <p className="subtitle mb-0">
            Recent classifications from connected sessions.
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-muted mb-0">No live predictions yet.</p>
      ) : (
        <div className="d-flex flex-column gap-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="border rounded-3 p-3 bg-light"
            >
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong className="text-truncate" title={item.imageName}>
                  {item.imageName}
                </strong>
                <span className="small text-muted">
                  {formatTime(item.createdAt)}
                </span>
              </div>
              <div className="d-flex flex-wrap gap-2">
                {item.results.slice(0, 3).map((result) => (
                  <span
                    key={result.className}
                    className="badge rounded-pill bg-white text-dark border"
                  >
                    {result.className}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LiveFeed;