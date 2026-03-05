from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import joblib
import numpy as np
import json
import os

# ── Load model files ──────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

model        = joblib.load(os.path.join(BASE_DIR, "model.pkl"))
scaler       = joblib.load(os.path.join(BASE_DIR, "scaler.pkl"))
label_encoder= joblib.load(os.path.join(BASE_DIR, "label_encoder.pkl"))

with open(os.path.join(BASE_DIR, "model_metadata.json")) as f:
    metadata = json.load(f)

FEATURE_NAMES = metadata["feature_names"]

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Student Dropout Predictor API",
    description="Predicts whether a student will Graduate, Dropout, or remain Enrolled.",
    version="1.0.0"
)

# Allow React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # In production, replace * with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Request schema ────────────────────────────────────────────────────────────
class StudentData(BaseModel):
    marital_status: int                             # 1–6
    application_mode: int                           # e.g. 1,2,5,7...
    application_order: int                          # 0–9
    course: int                                     # course code
    daytime_evening_attendance: int                 # 1=daytime, 0=evening
    previous_qualification: int                     # code
    previous_qualification_grade: float            # 0–200
    nacionality: int                                # code
    mothers_qualification: int                      # 0–34
    fathers_qualification: int                      # 0–34
    mothers_occupation: int                         # 0–9
    fathers_occupation: int                         # 0–9
    admission_grade: float                          # 0–200
    displaced: int                                  # 0 or 1
    educational_special_needs: int                  # 0 or 1
    debtor: int                                     # 0 or 1
    tuition_fees_up_to_date: int                    # 0 or 1
    gender: int                                     # 1=male, 0=female
    scholarship_holder: int                         # 0 or 1
    age_at_enrollment: int                          # e.g. 17–70
    international: int                              # 0 or 1
    curricular_units_1st_sem_credited: int
    curricular_units_1st_sem_enrolled: int
    curricular_units_1st_sem_evaluations: int
    curricular_units_1st_sem_approved: int
    curricular_units_1st_sem_grade: float
    curricular_units_1st_sem_without_evaluations: int
    curricular_units_2nd_sem_credited: int
    curricular_units_2nd_sem_enrolled: int
    curricular_units_2nd_sem_evaluations: int
    curricular_units_2nd_sem_approved: int
    curricular_units_2nd_sem_grade: float
    curricular_units_2nd_sem_without_evaluations: int
    unemployment_rate: float
    inflation_rate: float
    gdp: float

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {
        "message": "✅ Student Dropout Predictor API is running!",
        "docs": "Visit /docs to test the API",
        "model_accuracy": f"{metadata['accuracy'] * 100:.1f}%"
    }


@app.post("/predict")
def predict(data: StudentData):
    try:
        # Build feature array in the exact order the model was trained on
        features = [
            data.marital_status,
            data.application_mode,
            data.application_order,
            data.course,
            data.daytime_evening_attendance,
            data.previous_qualification,
            data.previous_qualification_grade,
            data.nacionality,
            data.mothers_qualification,
            data.fathers_qualification,
            data.mothers_occupation,
            data.fathers_occupation,
            data.admission_grade,
            data.displaced,
            data.educational_special_needs,
            data.debtor,
            data.tuition_fees_up_to_date,
            data.gender,
            data.scholarship_holder,
            data.age_at_enrollment,
            data.international,
            data.curricular_units_1st_sem_credited,
            data.curricular_units_1st_sem_enrolled,
            data.curricular_units_1st_sem_evaluations,
            data.curricular_units_1st_sem_approved,
            data.curricular_units_1st_sem_grade,
            data.curricular_units_1st_sem_without_evaluations,
            data.curricular_units_2nd_sem_credited,
            data.curricular_units_2nd_sem_enrolled,
            data.curricular_units_2nd_sem_evaluations,
            data.curricular_units_2nd_sem_approved,
            data.curricular_units_2nd_sem_grade,
            data.curricular_units_2nd_sem_without_evaluations,
            data.unemployment_rate,
            data.inflation_rate,
            data.gdp,
        ]

        # Scale & predict
        X = np.array(features).reshape(1, -1)
        X_scaled = scaler.transform(X)

        prediction_encoded = model.predict(X_scaled)[0]
        probabilities      = model.predict_proba(X_scaled)[0]

        predicted_class = label_encoder.inverse_transform([prediction_encoded])[0]

        # Build confidence scores for all classes
        confidence_scores = {
            label_encoder.classes_[i]: round(float(probabilities[i]) * 100, 2)
            for i in range(len(label_encoder.classes_))
        }

        # Emoji for fun UI display
        emoji_map = {
            "Graduate": "🎓",
            "Dropout":  "⚠️",
            "Enrolled": "📚"
        }

        return {
            "prediction":        predicted_class,
            "emoji":             emoji_map.get(predicted_class, ""),
            "confidence":        round(float(probabilities[prediction_encoded]) * 100, 2),
            "confidence_scores": confidence_scores,
            "model_accuracy":    f"{metadata['accuracy'] * 100:.1f}%"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/model-info")
def model_info():
    return {
        "model_type":    metadata["model_type"],
        "accuracy":      f"{metadata['accuracy'] * 100:.1f}%",
        "classes":       metadata["classes"],
        "top_features":  metadata["top_features"],
        "total_features": len(FEATURE_NAMES)
    }


# ── Save Response Endpoint ────────────────────────────────────────────────────
from typing import Any, Dict
import csv
from datetime import datetime

class ResponseData(BaseModel):
    answers: Dict[str, Any]
    prediction: str
    confidence: float
    confidence_scores: Dict[str, float]
    timestamp: str

RESPONSES_FILE = os.path.join(BASE_DIR, "student_responses.csv")

@app.post("/save-response")
def save_response(data: ResponseData):
    try:
        file_exists = os.path.isfile(RESPONSES_FILE)
        row = {
            "timestamp": data.timestamp,
            "prediction": data.prediction,
            "confidence": data.confidence,
            **{f"ans_{k}": v for k, v in data.answers.items()},
            **{f"prob_{k}": v for k, v in data.confidence_scores.items()},
        }
        with open(RESPONSES_FILE, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=row.keys())
            if not file_exists:
                writer.writeheader()
            writer.writerow(row)
        return {"status": "saved"}
    except Exception as e:
        # Never block the user — just log and return ok
        print(f"Save error: {e}")
        return {"status": "skipped"}
