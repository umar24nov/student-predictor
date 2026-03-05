import joblib, numpy as np, time, os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

print("Loading model...")
start = time.time()
model         = joblib.load(os.path.join(BASE_DIR, "model.pkl"))
scaler        = joblib.load(os.path.join(BASE_DIR, "scaler.pkl"))
label_encoder = joblib.load(os.path.join(BASE_DIR, "label_encoder.pkl"))
print(f"Load time: {time.time()-start:.2f}s")

print("Predicting...")
X = np.zeros((1, 36))
start = time.time()
X_scaled = scaler.transform(X)
model.predict(X_scaled)
print(f"Predict time: {time.time()-start:.2f}s")