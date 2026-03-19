# 🎓 AcademicAI — Student Performance Predictor

> An AI-powered full-stack web app that predicts whether a university student will **Pass**, **Fail**, or be **At-Risk** — based on grades, attendance, study habits, and background.

![Frontend](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Tailwind%20CSS-blue)
![Backend](https://img.shields.io/badge/Backend-FastAPI%20%2B%20Python%203.11-green)
![Model](https://img.shields.io/badge/Model-Random%20Forest%20%7C%2081%25%20Accuracy-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## 📌 Table of Contents

- [Project Overview](#-project-overview)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Set Up the Backend](#2-set-up-the-backend)
  - [3. Set Up the Frontend](#3-set-up-the-frontend)
  - [4. Run the App](#4-run-the-app)
- [Environment Variables](#-environment-variables)
- [How It Works](#-how-it-works)
- [API Reference](#-api-reference)
- [Model Details](#-model-details)
- [Deployment](#-deployment)
- [Troubleshooting](#-troubleshooting)
- [Author](#-author)

---

## 📖 Project Overview

AcademicAI collects student information through a conversational quiz — study time, attendance, semester grades, family background — and runs it through a trained **Random Forest classifier** to predict the student's likely academic outcome with a confidence score.

- **3 outcome classes:** Pass · Fail · At-Risk
- **81% test accuracy**, 86.8% cross-validated accuracy
- **Dynamic quiz** — adapts grade questions based on current semester
- **Anonymous data collection** for continuous model retraining
- **Mobile-first** responsive design

---

## 🛠 Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | React 18, Tailwind CSS v4, Vite 5 |
| Backend  | FastAPI, Python 3.11, uvicorn     |
| ML Model | scikit-learn, Random Forest       |
| Data     | pandas, numpy, joblib             |
| Dataset  | UCI Student Performance (Math)    |

---

## 📁 Project Structure

```
student-predictor/
│
├── backend/
│   ├── main.py                  # FastAPI app — all endpoints
│   ├── model.pkl                # Trained Random Forest model
│   ├── scaler.pkl               # Fitted StandardScaler
│   ├── label_encoders.pkl       # Fitted LabelEncoders for categorical features
│   ├── target_encoder.pkl       # LabelEncoder for target variable
│   ├── model_metadata.json      # Model info (accuracy, features, date)
│   ├── requirements.txt         # Python dependencies
│   └── Procfile                 # For Railway deployment
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main React component (entire app)
│   │   ├── main.jsx             # React entry point
│   │   └── index.css            # Global styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── .env                     # VITE_API_URL (you create this)
│
├── notebook/
│   └── train_model.ipynb        # Model training notebook
│
├── data/
│   └── student-mat.csv          # UCI dataset
│
└── README.md
```

---

## ✅ Prerequisites

Make sure you have these installed before starting:

| Tool   | Version       | Check command      |
|--------|---------------|--------------------|
| Python | 3.11 or above | `python --version` |
| pip    | Latest        | `pip --version`    |
| Node.js| 18.x or above | `node --version`   |
| npm    | 9.x or above  | `npm --version`    |
| Git    | Any           | `git --version`    |

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/umar24nov/student-predictor.git
cd student-predictor
```

---

### 2. Set Up the Backend

#### a. Navigate to the backend folder

```bash
cd backend
```

#### b. Create and activate a virtual environment

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

You should see `(venv)` appear at the start of your terminal prompt.

#### c. Install Python dependencies

```bash
pip install -r requirements.txt
```

#### d. Verify model files are present

The following files must exist inside the `backend/` folder:

```
model.pkl
scaler.pkl
label_encoders.pkl
target_encoder.pkl
model_metadata.json
```

> **If any of these files are missing**, run the training notebook first:
> ```bash
> cd ../notebook
> jupyter notebook train_model.ipynb
> ```
> Run all cells — this generates the `.pkl` files and saves them to `backend/`.

#### e. Start the backend server

```bash
uvicorn main:app --reload
```

You should see:

```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

> ✅ The backend is now live at **http://127.0.0.1:8000**

---

### 3. Set Up the Frontend

Open a **new terminal window** — keep the backend terminal running.

#### a. Navigate to the frontend folder

```bash
cd frontend
```

#### b. Create the environment file

Create a file named `.env` inside the `frontend/` folder and add this line:

```
VITE_API_URL=http://127.0.0.1:8000
```

> This tells the React app where to send prediction requests.

#### c. Install Node dependencies

```bash
npm install
```

---

### 4. Run the App

```bash
npm run dev
```

You should see:

```
  VITE v5.x.x  ready in Xms

  ➜  Local:   http://localhost:5173/
```

Open **http://localhost:5173** in your browser — AcademicAI is running! 🎉

---

## 🔑 Environment Variables

### `frontend/.env`

| Variable       | Default                 | Description                |
|----------------|-------------------------|----------------------------|
| `VITE_API_URL` | `http://127.0.0.1:8000` | URL of the FastAPI backend |

> For production, replace this with your deployed backend URL (e.g. your Railway URL).

---

## ⚙️ How It Works

```
Student fills the quiz
        ↓
React builds a 31-feature JSON payload
        ↓
POST /predict  →  FastAPI backend
        ↓
LabelEncoders encode categorical fields
StandardScaler normalises all features
        ↓
Random Forest predicts class + probabilities
        ↓
JSON response: { prediction, confidence, confidence_scores, tip }
        ↓
React displays the result card with probability bars
```

**Quiz question order:**

1. **About You** — gender, age, home location, current semester
2. **Academics** — weekly study hours, past failures, attendance percentage
3. **Your Grades** — adaptive sliders (board scores for Sem 1 & 2 · semester grades for Sem 3+)
4. **Family Background** — parent education levels and occupations
5. **Future / Health** — higher education plans, internet access, health status

---

## 📡 API Reference

All endpoints are served at `http://127.0.0.1:8000`

| Method | Endpoint         | Description                                               |
|--------|------------------|-----------------------------------------------------------|
| GET    | `/`              | Health check — returns model version and accuracy         |
| POST   | `/predict`       | Submit student features, receive prediction + confidence  |
| POST   | `/save-response` | Save anonymised quiz response for future retraining       |
| POST   | `/retrain`       | Trigger background model retraining with saved responses  |
| GET    | `/model-info`    | Returns model metadata (accuracy, features, training date)|
| GET    | `/stats`         | Returns count of collected student responses              |

> 📄 **Interactive API docs** are auto-generated by FastAPI — visit **http://127.0.0.1:8000/docs** while the backend is running.

---

### POST `/predict` — Example Request Body

```json
{
  "sex": "M",
  "age": 20,
  "address": "U",
  "famsize": "GT3",
  "Pstatus": "T",
  "Medu": 3,
  "Fedu": 2,
  "Mjob": "teacher",
  "Fjob": "other",
  "reason": "course",
  "guardian": "mother",
  "traveltime": 1,
  "studytime": 2,
  "failures": 0,
  "schoolsup": "no",
  "famsup": "yes",
  "paid": "no",
  "activities": "no",
  "nursery": "yes",
  "higher": "yes",
  "internet": "yes",
  "romantic": "no",
  "famrel": 4,
  "freetime": 3,
  "goout": 3,
  "Dalc": 1,
  "Walc": 1,
  "health": 4,
  "absences": 4,
  "G1": 14,
  "G2": 13
}
```

### POST `/predict` — Example Response

```json
{
  "prediction": "Pass",
  "confidence": 88.5,
  "confidence_scores": {
    "Pass": 88.5,
    "Fail": 9.0,
    "At-Risk": 2.5
  },
  "tip": "You're on a great track! Keep up your attendance and study consistency.",
  "emoji": "🎓",
  "model_accuracy": "81%",
  "dataset_size": 395
}
```

---

## 🤖 Model Details

| Property                 | Value                          |
|--------------------------|--------------------------------|
| Algorithm                | Random Forest Classifier       |
| Training dataset         | UCI Student Performance (Math) |
| Total records            | 395                            |
| Features used            | 31                             |
| Target classes           | Pass · Fail · At-Risk          |
| Test set accuracy        | 81.0%                          |
| Cross-validated accuracy | 86.8% ± 3.7% (5-fold)         |
| Number of trees          | 200                            |
| Max depth                | 12                             |
| Class weighting          | Balanced                       |
| Top predictor            | G2 — 2nd term grade (38.1%)   |

**Top 5 features by importance:**

```
G2 (2nd term grade)    ████████████████████  38.1%
absences               ████████              14.2%
G1 (1st term grade)    ██████                11.8%
failures               ████                   8.7%
Medu (mother's edu.)   ██                     5.2%
```

### Retraining the Model

**Option 1 — via API (runs in background):**
```bash
curl -X POST http://127.0.0.1:8000/retrain
```

**Option 2 — manually via notebook:**
```bash
cd notebook
jupyter notebook train_model.ipynb
# Run all cells — new .pkl files will be saved to backend/
```

---

## ☁️ Deployment

### Backend — Railway

1. Push the project to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Set the **Root Directory** to `backend`
4. Railway auto-detects the `Procfile`:
   ```
   web: uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. Copy the generated Railway URL (e.g. `https://your-app.up.railway.app`)

### Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project** → Import from GitHub
2. Set the **Root Directory** to `frontend`
3. Add an environment variable in the Vercel dashboard:
   ```
   VITE_API_URL = https://your-app.up.railway.app
   ```
4. Deploy — Vercel auto-detects Vite and builds automatically

### After Deploying — Update CORS

In `backend/main.py`, add your Vercel URL to `allow_origins`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://your-app.vercel.app",  # ← add your Vercel URL
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Redeploy the backend after this change.

---

## 🔧 Troubleshooting

**`ModuleNotFoundError` when starting the backend**

```bash
# Make sure your virtual environment is activated
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows

pip install -r requirements.txt
```

---

**`model.pkl not found` error**

```bash
# Model files are missing — run the training notebook
cd notebook
jupyter notebook train_model.ipynb
# Run all cells to generate model.pkl, scaler.pkl, etc. in backend/
```

---

**Frontend shows `Network Error` or can't reach the backend**

- Confirm the backend is running at `http://127.0.0.1:8000`
- Check `frontend/.env` contains exactly:
  ```
  VITE_API_URL=http://127.0.0.1:8000
  ```
- Restart the frontend dev server after editing `.env`

---

**Port 8000 is already in use**

```bash
# Run the backend on a different port
uvicorn main:app --reload --port 8001

# Update frontend/.env to match
VITE_API_URL=http://127.0.0.1:8001
```

---

**`npm install` fails**

```bash
# Confirm Node.js 18+ is installed
node --version

# Clear npm cache and retry
npm cache clean --force
npm install
```

---

## 👤 Author

**Mohammad Umar**
B.Tech — Computer Science and Engineering, COER University, Roorkee

[![GitHub](https://img.shields.io/badge/GitHub-umar24nov-black?logo=github)](https://github.com/umar24nov)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-mohammadumarfarook-blue?logo=linkedin)](https://www.linkedin.com/in/mohammadumarfarook)
[![Email](https://img.shields.io/badge/Email-umar24nov%40gmail.com-red?logo=gmail)](mailto:umar24nov@gmail.com)

---

> Built with ❤️ as a B.Tech CSE project · COER University · 2025
