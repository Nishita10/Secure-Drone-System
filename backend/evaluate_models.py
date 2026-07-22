import pandas as pd
import numpy as np
from sklearn.metrics import confusion_matrix, accuracy_score, precision_score, recall_score, f1_score
import joblib
import csv
import os

DATA_FILE = "telemetry_log_secure.csv"
IF_MODEL_FILE = "anomaly_model.pkl"

# 1. Load data
valid_rows = []
with open(DATA_FILE, 'r') as f:
    reader = csv.reader(f)
    for row in reader:
        if len(row) in [8, 9] and row[0] != 'timestamp':
            try:
                # lat, lon, alt, vel_x, vel_y, vel_z
                features = [float(row[1]), float(row[2]), float(row[3]), float(row[4]), float(row[5]), float(row[6])]
                label = float(row[7])
                valid_rows.append(features + [label])
            except ValueError:
                pass

df = pd.DataFrame(valid_rows, columns=['lat', 'lon', 'alt', 'vel_x', 'vel_y', 'vel_z', 'label'])
print(f"Loaded {len(df)} rows from {DATA_FILE}")
print(f"True anomalies in dataset: {df['label'].sum()}")

y_true = df['label'].values

# 2. Evaluate Isolation Forest
if_model = joblib.load(IF_MODEL_FILE)
X_if = df[['lat', 'lon', 'alt']]
preds_if = if_model.predict(X_if)
# Isolation forest: 1 = normal, -1 = anomaly
# We want: 0 = normal, 1 = anomaly
y_pred_if = np.where(preds_if == -1, 1, 0)

print("\n=== ISOLATION FOREST RESULTS ===")
cm_if = confusion_matrix(y_true, y_pred_if)
print("Confusion Matrix:")
print(cm_if)
print(f"Accuracy:  {accuracy_score(y_true, y_pred_if):.4f}")
print(f"Precision: {precision_score(y_true, y_pred_if, zero_division=0):.4f}")
print(f"Recall:    {recall_score(y_true, y_pred_if, zero_division=0):.4f}")
print(f"F1-Score:  {f1_score(y_true, y_pred_if, zero_division=0):.4f}")

# 3. Evaluate LSTM Detector
from lstm_detector import LSTMDetector
lstm = LSTMDetector()

y_pred_lstm = []
for i, row in df.iterrows():
    is_anomaly, _, _ = lstm.update_and_score(row['lat'], row['lon'], row['alt'], row['vel_x'], row['vel_y'], row['vel_z'])
    y_pred_lstm.append(1 if is_anomaly else 0)

y_pred_lstm = np.array(y_pred_lstm)

print("\n=== LSTM AUTOENCODER RESULTS ===")
cm_lstm = confusion_matrix(y_true, y_pred_lstm)
print("Confusion Matrix:")
print(cm_lstm)
print(f"Accuracy:  {accuracy_score(y_true, y_pred_lstm):.4f}")
print(f"Precision: {precision_score(y_true, y_pred_lstm, zero_division=0):.4f}")
print(f"Recall:    {recall_score(y_true, y_pred_lstm, zero_division=0):.4f}")
print(f"F1-Score:  {f1_score(y_true, y_pred_lstm, zero_division=0):.4f}")
