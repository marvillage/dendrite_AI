import { useEffect, useRef, useState, type ChangeEvent } from "react";
import * as mobilenet from "@tensorflow-models/mobilenet";
import "@tensorflow/tfjs";
import { LivePrediction, Prediction } from "../types";

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
const modelStatusLabels = {
  loading: "Loading model",
  ready: "Model Ready",
  error: "Model error"
} as const;

type ImageClassifierProps = {
  onPrediction: (payload: Omit<LivePrediction, "id" | "createdAt">) => void;
};

const ImageClassifier = ({ onPrediction }: ImageClassifierProps) => {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [model, setModel] = useState<mobilenet.MobileNet | null>(null);
  const [modelStatus, setModelStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageReady, setImageReady] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isPredicting, setIsPredicting] = useState(false);

  useEffect(() => {
    let active = true;
    mobilenet
      .load()
      .then((loadedModel) => {
        if (!active) {
          return;
        }
        setModel(loadedModel);
        setModelStatus("ready");
      })
      .catch(() => {
        if (active) {
          setModelStatus("error");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!imageSrc) {
      return undefined;
    }
    return () => {
      URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageSrc(null);
      setImageName("");
      setPredictions([]);
      setImageReady(false);
      return;
    }
    setImageSrc(URL.createObjectURL(file));
    setImageName(file.name);
    setPredictions([]);
    setImageReady(false);
  };

  useEffect(() => {
    if (!model || !imageReady || !imageRef.current) {
      return;
    }
    let active = true;
    setIsPredicting(true);
    void model
      .classify(imageRef.current, 5)
      .then((results) => {
        if (!active) {
          return;
        }
        const formatted = results.map((item) => ({
          className: item.className,
          probability: item.probability
        }));
        setPredictions(formatted);
        onPrediction({
          imageName,
          results: formatted
        });
      })
      .finally(() => {
        if (active) {
          setIsPredicting(false);
        }
      });

    return () => {
      active = false;
    };
  }, [imageReady, model, imageName, onPrediction]);

  const topPrediction = predictions[0];

  return (
    <div className="card-surface p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 className="brand-title h5 mb-1">Image Classifier</h3>
        </div>
        <span className="badge bg-light text-dark border">
          {modelStatusLabels[modelStatus]}
        </span>
      </div>

      <div className="mb-3">
        <label className="control-label mb-2" htmlFor="imageUpload">
          Upload image
        </label>
        <input
          className="form-control"
          type="file"
          accept="image/*"
          id="imageUpload"
          onChange={handleFileChange}
        />
      </div>

      <div className="mb-3">
        {imageSrc ? (
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Uploaded preview"
            className="w-100 image-preview"
            onLoad={() => setImageReady(true)}
          />
        ) : (
          <div className="border rounded-3 p-4 text-center text-muted">
            Upload an image to see predictions.
          </div>
        )}
      </div>

      {isPredicting && (
        <div className="alert alert-info py-2" role="alert">
          Generating predictions...
        </div>
      )}

      {topPrediction && (
        <div className="alert alert-success py-2" role="alert">
          Top match: <strong>{topPrediction.className}</strong>
        </div>
      )}

      <div>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="control-label">Predictions</span>
          <span className="small text-muted">
            {imageName ? `Source: ${imageName}` : "No file selected"}
          </span>
        </div>
        {predictions.length === 0 ? (
          <p className="text-muted mb-0">
            Predictions will appear here once the model runs.
          </p>
        ) : (
          <div>
            {predictions.map((prediction) => (
              <div key={prediction.className} className="prediction-pill">
                <span>{prediction.className}</span>
                <span className="prediction-score">
                  {formatPercent(prediction.probability)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageClassifier;
