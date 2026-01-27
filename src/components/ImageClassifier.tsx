import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import * as mobilenet from "@tensorflow-models/mobilenet";
import "@tensorflow/tfjs";
import { LivePrediction, Prediction } from "../types";

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

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
  const [imageName, setImageName] = useState<string>("");
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
      return;
    }
    setImageSrc(URL.createObjectURL(file));
    setImageName(file.name);
    setPredictions([]);
    setImageReady(false);
  };

  useEffect(() => {
    const runPrediction = async () => {
      if (!model || !imageReady || !imageRef.current) {
        return;
      }
      setIsPredicting(true);
      try {
        const results = await model.classify(imageRef.current, 5);
        const formatted = results.map((item) => ({
          className: item.className,
          probability: item.probability
        }));
        setPredictions(formatted);
        onPrediction({
          imageName,
          results: formatted
        });
      } finally {
        setIsPredicting(false);
      }
    };

    runPrediction();
  }, [imageReady, model, imageName, onPrediction]);

  const predictionSummary = useMemo(() => {
    if (predictions.length === 0) {
      return "";
    }
    return predictions[0].className;
  }, [predictions]);

  return (
    <div className="card-surface p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h3 className="brand-title h5 mb-1">Image Classifier</h3>
        </div>
        <span className="badge bg-light text-dark border">
          {modelStatus === "ready"
            ? "Model Ready"
            : modelStatus === "loading"
            ? "Loading model"
            : "Model error"}
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

      {predictionSummary && (
        <div className="alert alert-success py-2" role="alert">
          Top match: <strong>{predictionSummary}</strong>
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
