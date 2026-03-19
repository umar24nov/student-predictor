"""
ProgressAI — Student Performance Prediction API
================================================
Author  : Mohammad Umar — B.Tech CSE
Dataset : UCI Student Performance (Math) — student-mat.csv
Model   : Random Forest Classifier (200 trees, 81% accuracy)

Endpoints:
  GET  /              → health check
  POST /predict       → predict student performance
  POST /save-response → save anonymous quiz response
  POST /retrain       → retrain model with collected responses
  GET  /model-info    → model metadata and stats
  GET  /stats         → collected response statistics
"""

import os, json, csv, logging
from datetime import datetime
from typing import Any, Dict, Optional

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ─── Logging setup ────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH     = os.path.join(BASE_DIR, "model.pkl")
SCALER_PATH    = os.path.join(BASE_DIR, "scaler.pkl")
TARGET_ENC_PATH= os.path.join(BASE_DIR, "target_encoder.pkl")
LABEL_ENC_PATH = os.path.join(BASE_DIR, "label_encoders.pkl")
METADATA_PATH  = os.path.join(BASE_DIR, "model_metadata.json")
RESPONSES_PATH = os.path.join(BASE_DIR, "student_responses.csv")
ORIGINAL_DATA  = os.path.join(BASE_DIR, "..", "data", "student-mat.csv")

# ─── Load model artifacts ─────────────────────────────────────────────────────
# All files are saved by the Jupyter notebook during training.
# If you retrain, just re-run the notebook and restart this server.
def load_model_artifacts():
    """Load all ML artifacts from disk. Called on startup and after retraining."""
    global model, scaler, target_encoder, label_encoders, metadata, FEATURES, CATEGORICAL_COLS

    model          = joblib.load(MODEL_PATH)
    scaler         = joblib.load(SCALER_PATH)
    target_encoder = joblib.load(TARGET_ENC_PATH)
    label_encoders = joblib.load(LABEL_ENC_PATH)

    with open(METADATA_PATH) as f:
        metadata = json.load(f)

    FEATURES       = metadata["features"]
    CATEGORICAL_COLS = metadata["categorical_cols"]

    log.info(f"Model loaded: {metadata['model_type']}, accuracy={metadata['accuracy']*100:.1f}%")
    log.info(f"Classes: {metadata['target_classes']}")

load_model_artifacts()

# ─── FastAPI app ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="ProgressAI — Student Performance API",
    description="Predicts whether a student will Pass, Fail, or be At-Risk based on academic and personal background.",
    version="2.0.0"
)

# Allow the React frontend to call this API from any origin.
# For production, replace "*" with your actual Vercel URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # e.g. ["https://progressai.vercel.app"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request / Response schemas ───────────────────────────────────────────────

class StudentInput(BaseModel):
    """
    All features a student provides through the quiz.
    Each field maps directly to a column in the training dataset.
    
    ── To add new fields when you replace the dataset: ──
    Add new fields here and update the feature encoding section in /predict.
    """
    # Personal background
    sex:        str  = Field(..., description="M or F")
    age:        int  = Field(..., ge=15, le=25)
    address:    str  = Field(..., description="U=urban, R=rural")
    famsize:    str  = Field(..., description="GT3 or LE3")
    Pstatus:    str  = Field(..., description="T=together, A=apart")

    # Parent education (0=none, 1=primary, 2=middle, 3=secondary, 4=higher)
    Medu:  int = Field(..., ge=0, le=4)
    Fedu:  int = Field(..., ge=0, le=4)
    Mjob:  str = Field(..., description="at_home/health/other/services/teacher")
    Fjob:  str = Field(..., description="at_home/health/other/services/teacher")

    # School context
    reason:     str  = Field(..., description="course/home/other/reputation")
    guardian:   str  = Field(..., description="mother/father/other")
    traveltime: int  = Field(..., ge=1, le=4)
    studytime:  int  = Field(..., ge=1, le=4)
    failures:   int  = Field(..., ge=0, le=4)

    # Yes/No fields
    schoolsup:  str  = Field(..., description="yes or no")
    famsup:     str  = Field(..., description="yes or no")
    paid:       str  = Field(..., description="yes or no")
    activities: str  = Field(..., description="yes or no")
    nursery:    str  = Field(..., description="yes or no")
    higher:     str  = Field(..., description="yes or no")
    internet:   str  = Field(..., description="yes or no")
    romantic:   str  = Field(..., description="yes or no")

    # Social/lifestyle ratings (1-5)
    famrel:   int = Field(..., ge=1, le=5)
    freetime: int = Field(..., ge=1, le=5)
    goout:    int = Field(..., ge=1, le=5)
    Dalc:     int = Field(..., ge=1, le=5)
    Walc:     int = Field(..., ge=1, le=5)
    health:   int = Field(..., ge=1, le=5)

    # Academic
    absences: int   = Field(..., ge=0, le=100)
    G1:       int   = Field(..., ge=0, le=20, description="First period grade")
    G2:       int   = Field(..., ge=0, le=20, description="Second period grade")


class SaveResponseRequest(BaseModel):
    """Anonymous user response saved for future retraining."""
    answers:           Dict[str, Any]
    prediction:        str
    confidence:        float
    confidence_scores: Dict[str, float]
    timestamp:         str


# ─── Helper: encode one student input ────────────────────────────────────────

def encode_input(data: StudentInput) -> pd.DataFrame:
    """
    Convert StudentInput into a scaled DataFrame ready for model.predict().
    Applies the same label encoders and scaler used during training.
    """
    # Build raw dict from pydantic model
    raw = {
        'sex': data.sex, 'age': data.age, 'address': data.address,
        'famsize': data.famsize, 'Pstatus': data.Pstatus,
        'Medu': data.Medu, 'Fedu': data.Fedu, 'Mjob': data.Mjob, 'Fjob': data.Fjob,
        'reason': data.reason, 'guardian': data.guardian,
        'traveltime': data.traveltime, 'studytime': data.studytime,
        'failures': data.failures, 'schoolsup': data.schoolsup,
        'famsup': data.famsup, 'paid': data.paid, 'activities': data.activities,
        'nursery': data.nursery, 'higher': data.higher,
        'internet': data.internet, 'romantic': data.romantic,
        'famrel': data.famrel, 'freetime': data.freetime, 'goout': data.goout,
        'Dalc': data.Dalc, 'Walc': data.Walc, 'health': data.health,
        'absences': data.absences, 'G1': data.G1, 'G2': data.G2,
    }

    df = pd.DataFrame([raw])

    # Apply label encoding to categorical columns
    for col in CATEGORICAL_COLS:
        if col in label_encoders:
            try:
                df[col] = label_encoders[col].transform(df[col])
            except ValueError:
                # Unknown category — use most common class (0)
                log.warning(f"Unknown value for {col}: {df[col].values[0]}, defaulting to 0")
                df[col] = 0

    # Reorder to match training column order
    df = df[FEATURES]

    # Scale
    return scaler.transform(df)


# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/", summary="Health check")
def root():
    """Returns API status and model accuracy."""
    return {
        "status":         "✅ ProgressAI API is running!",
        "model":          metadata["model_type"],
        "accuracy":       f"{metadata['accuracy'] * 100:.1f}%",
        "cv_accuracy":    f"{metadata['cv_accuracy'] * 100:.1f}%",
        "dataset_size":   metadata["dataset_size"],
        "docs":           "/docs"
    }


@app.post("/predict", summary="Predict student performance")
def predict(data: StudentInput):
    """
    Takes student background and returns:
    - prediction: Pass / Fail / At-Risk
    - confidence: % confidence in top prediction
    - confidence_scores: % for all three classes
    - tips: personalised advice based on outcome
    """
    try:
        X_scaled = encode_input(data)

        # Get prediction and probabilities
        pred_encoded  = model.predict(X_scaled)[0]
        probabilities = model.predict_proba(X_scaled)[0]
        pred_class    = target_encoder.inverse_transform([pred_encoded])[0]

        # All class probabilities
        confidence_scores = {
            cls: round(float(prob) * 100, 1)
            for cls, prob in zip(target_encoder.classes_, probabilities)
        }

        # Personalised tip per outcome
        tips = {
            "Pass":    "Great foundation! Maintain your attendance, clear any pending fees, and keep reviewing consistently. You're on the right path. 🎓",
            "Fail":    "Don't give up — this is a warning, not a verdict. Focus on reducing absences, increasing study time, and seeking help from teachers. Change is possible now. 💪",
            "At-Risk": "Urgent: your profile matches students who have withdrawn or failed critically. Please speak with your academic advisor immediately. Consider scholarship options and attend every class. 🚨",
        }

        # Emoji per outcome
        emojis = {"Pass": "🎓", "Fail": "📉", "At-Risk": "⚠️"}

        log.info(f"Prediction: {pred_class} ({confidence_scores[pred_class]}%)")

        return {
            "prediction":        pred_class,
            "emoji":             emojis.get(pred_class, "🎓"),
            "confidence":        round(float(probabilities[pred_encoded]) * 100, 1),
            "confidence_scores": confidence_scores,
            "tip":               tips.get(pred_class, ""),
            "model_accuracy":    f"{metadata['accuracy'] * 100:.1f}%",
            "cv_accuracy":       f"{metadata['cv_accuracy'] * 100:.1f}%",
        }

    except Exception as e:
        log.error(f"Prediction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@app.post("/save-response", summary="Save anonymous user response")
def save_response(data: SaveResponseRequest):
    """
    Saves each user's anonymous quiz answers + prediction result to a CSV.
    This data is used for model retraining via /retrain.
    No personal identifiers are collected.
    """
    try:
        file_exists = os.path.isfile(RESPONSES_PATH)

        # Build the row to save
        row = {
            "timestamp":  data.timestamp,
            "prediction": data.prediction,
            "confidence": data.confidence,
            # Probability scores for each class
            **{f"prob_{k}": v for k, v in data.confidence_scores.items()},
            # All quiz answers
            **{f"ans_{k}": v for k, v in data.answers.items()},
        }

        with open(RESPONSES_PATH, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=row.keys())
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)

        log.info(f"Response saved: {data.prediction}")
        return {"status": "saved"}

    except Exception as e:
        # Never block UX — silently log and continue
        log.error(f"Save response error: {e}")
        return {"status": "skipped", "reason": str(e)}


@app.get("/stats", summary="Collected responses statistics")
def get_stats():
    """Returns statistics about collected user responses (for admin review)."""
    if not os.path.isfile(RESPONSES_PATH):
        return {"total_responses": 0, "message": "No responses collected yet"}

    try:
        df = pd.read_csv(RESPONSES_PATH)
        dist = df["prediction"].value_counts().to_dict() if "prediction" in df.columns else {}
        return {
            "total_responses": len(df),
            "prediction_distribution": dist,
            "latest_response": df["timestamp"].max() if "timestamp" in df.columns else None,
        }
    except Exception as e:
        return {"error": str(e)}


@app.post("/retrain", summary="Retrain model with collected responses")
def retrain(background_tasks: BackgroundTasks):
    """
    Triggers model retraining using:
    1. Original UCI dataset
    2. All collected user responses from /save-response

    This runs in the background — use GET /model-info to check when it's done.
    
    ── Future: Replace original dataset with your university's Google Form data ──
    Just update ORIGINAL_DATA path in main.py.
    """
    if not os.path.isfile(RESPONSES_PATH):
        raise HTTPException(status_code=400, detail="No collected responses yet. Use the app to gather data first.")

    background_tasks.add_task(_retrain_background)
    return {"status": "Retraining started in background. Check /model-info for updates."}


def _retrain_background():
    """
    Background task: combine original data + user responses, retrain, save.
    Called automatically when /retrain endpoint is hit.
    """
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import train_test_split, cross_val_score, StratifiedKFold
    from sklearn.preprocessing import LabelEncoder, StandardScaler
    from sklearn.metrics import accuracy_score

    log.info("Starting background retraining...")

    try:
        # ── Load original dataset ────────────────────────────────────────────
        df_orig = pd.read_csv(ORIGINAL_DATA, sep=';')
        df_orig['target'] = df_orig['G3'].apply(
            lambda g: 'At-Risk' if g == 0 else ('Fail' if g < 10 else 'Pass')
        )

        # ── Load and convert collected responses ──────────────────────────────
        df_resp = pd.read_csv(RESPONSES_PATH)
        log.info(f"Combining {len(df_orig)} original + {len(df_resp)} collected samples")

        # Map response columns (ans_fieldname → fieldname) to match training features
        resp_cols = {}
        for feat in FEATURES:
            col = f"ans_{feat}"
            if col in df_resp.columns:
                resp_cols[col] = feat

        if resp_cols:
            df_resp_mapped = df_resp.rename(columns=resp_cols)
            df_resp_mapped = df_resp_mapped.rename(columns={"prediction": "target"})

            # Only keep rows that have all required features
            available = [f for f in FEATURES if f in df_resp_mapped.columns]
            if len(available) >= len(FEATURES) * 0.7:   # at least 70% features present
                df_combined = pd.concat(
                    [df_orig[FEATURES + ['target']], df_resp_mapped[available + ['target']]],
                    ignore_index=True
                ).dropna()
            else:
                df_combined = df_orig[FEATURES + ['target']].copy()
                log.warning("Not enough matching features in responses — using only original data")
        else:
            df_combined = df_orig[FEATURES + ['target']].copy()

        # ── Encode features ──────────────────────────────────────────────────
        X = df_combined[FEATURES].copy()
        y = df_combined['target'].copy()

        new_label_encoders = {}
        for col in CATEGORICAL_COLS:
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            new_label_encoders[col] = le

        new_target_encoder = LabelEncoder()
        y_encoded = new_target_encoder.fit_transform(y)

        # ── Train ────────────────────────────────────────────────────────────
        X_train, X_test, y_train, y_test = train_test_split(
            X, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )
        new_scaler = StandardScaler()
        X_train_s = new_scaler.fit_transform(X_train)
        X_test_s  = new_scaler.transform(X_test)

        new_model = RandomForestClassifier(
            n_estimators=200, max_depth=12, min_samples_split=4,
            class_weight='balanced', random_state=42, n_jobs=-1
        )
        new_model.fit(X_train_s, y_train)

        # ── Evaluate ─────────────────────────────────────────────────────────
        acc    = accuracy_score(y_test, new_model.predict(X_test_s))
        cv     = StratifiedKFold(5, shuffle=True, random_state=42)
        cv_acc = cross_val_score(new_model, new_scaler.transform(X), y_encoded, cv=cv)

        log.info(f"Retrained model accuracy: {acc*100:.1f}% (CV: {cv_acc.mean()*100:.1f}%)")

        # ── Save updated artifacts ────────────────────────────────────────────
        joblib.dump(new_model,          MODEL_PATH)
        joblib.dump(new_scaler,         SCALER_PATH)
        joblib.dump(new_target_encoder, TARGET_ENC_PATH)
        joblib.dump(new_label_encoders, LABEL_ENC_PATH)

        # Update metadata
        feat_imp = sorted(zip(FEATURES, new_model.feature_importances_), key=lambda x: x[1], reverse=True)
        metadata_new = {
            **metadata,
            "accuracy":       round(float(acc), 4),
            "cv_accuracy":    round(float(cv_acc.mean()), 4),
            "cv_std":         round(float(cv_acc.std()), 4),
            "dataset_size":   int(len(df_combined)),
            "top_features":   [f for f, _ in feat_imp[:10]],
            "last_retrained": datetime.now().isoformat(),
        }
        with open(METADATA_PATH, "w") as f:
            json.dump(metadata_new, f, indent=2)

        # Reload into memory
        load_model_artifacts()
        log.info("✅ Retraining complete — model reloaded")

    except Exception as e:
        log.error(f"Retraining failed: {e}", exc_info=True)


@app.get("/model-info", summary="Model metadata and performance stats")
def model_info():
    """Returns current model type, accuracy, top features, and dataset info."""
    return {
        "model_type":      metadata["model_type"],
        "accuracy":        f"{metadata['accuracy'] * 100:.1f}%",
        "cv_accuracy":     f"{metadata['cv_accuracy'] * 100:.1f}%",
        "cv_std":          f"{metadata.get('cv_std', 0) * 100:.1f}%",
        "n_features":      metadata["n_features"],
        "target_classes":  metadata["target_classes"],
        "dataset_size":    metadata["dataset_size"],
        "top_features":    metadata["top_features"],
        "last_retrained":  metadata.get("last_retrained", "original training"),
        "dataset":         metadata.get("dataset", "UCI Student Performance"),
    }
