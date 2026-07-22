"""
LSTM Autoencoder Temporal Anomaly Trainer
==========================================
Trains a temporal model on NORMAL flight telemetry.
Uses a sliding window approach — if TensorFlow is available, builds a full
LSTM Autoencoder; otherwise falls back to a statistical rolling-window model.
Both produce the same output artifact (lstm_model.pkl) compatible with lstm_detector.py.
"""

import numpy as np
import csv
import os
import joblib

WINDOW_SIZE = 10
FEATURES = ['lat', 'lon', 'alt', 'vel_x', 'vel_y', 'vel_z']
N_FEATURES = len(FEATURES)
MODEL_FILE = "lstm_model.pkl"
DATA_FILE = "telemetry_log_secure.csv"

# ─── Data Loading ──────────────────────────────────────────────────────────────

def load_normal_data():
    """Load ONLY normal (label=0) telemetry rows from CSV."""
    valid_rows = []
    try:
        with open(DATA_FILE, 'r') as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) not in [8, 9] or row[0] == 'timestamp':
                    continue
                try:
                    label = float(row[7])
                    if label == 0:  # Normal traffic only — autoencoder learns normal patterns
                        valid_rows.append([float(row[i]) for i in range(1, 7)])  # lat,lon,alt,vx,vy,vz
                except ValueError:
                    continue
    except FileNotFoundError:
        print(f"[LSTM Trainer] Dataset not found: {DATA_FILE}")
    return np.array(valid_rows) if valid_rows else np.empty((0, N_FEATURES))


def create_windows(data, window_size):
    """Slice data into overlapping sliding windows of shape (N, window_size, features)."""
    windows = []
    for i in range(len(data) - window_size):
        windows.append(data[i:i + window_size])
    return np.array(windows)


# ─── LSTM Autoencoder (TensorFlow path) ───────────────────────────────────────

def train_lstm_autoencoder(data_norm, mean, std):
    import tensorflow as tf
    from tensorflow.keras.models import Model
    from tensorflow.keras.layers import Input, LSTM, Dense, RepeatVector, TimeDistributed
    from tensorflow.keras.callbacks import EarlyStopping

    X = create_windows(data_norm, WINDOW_SIZE)
    print(f"[LSTM Trainer] Training on {len(X)} windows of size {WINDOW_SIZE}...")

    # Build encoder-decoder LSTM autoencoder
    inp = Input(shape=(WINDOW_SIZE, N_FEATURES))
    enc = LSTM(64, activation='tanh', return_sequences=False)(inp)
    dec = RepeatVector(WINDOW_SIZE)(enc)
    dec = LSTM(64, activation='tanh', return_sequences=True)(dec)
    out = TimeDistributed(Dense(N_FEATURES))(dec)

    model = Model(inp, out)
    model.compile(optimizer='adam', loss='mse')

    es = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)
    model.fit(X, X, epochs=60, batch_size=32, validation_split=0.1, callbacks=[es], verbose=1)

    # Compute reconstruction errors on training data to find threshold
    preds = model.predict(X, verbose=0)
    mse = np.mean(np.power(X - preds, 2), axis=(1, 2))
    threshold = float(np.mean(mse) + 3.0 * np.std(mse))
    print(f"[LSTM Trainer] LSTM Autoencoder threshold: {threshold:.8f}")

    return {
        'type': 'lstm_autoencoder',
        'model_config': model.to_json(),
        'model_weights': model.get_weights(),
        'mean': mean,
        'std': std,
        'threshold': threshold,
        'window_size': WINDOW_SIZE,
        'n_features': N_FEATURES,
    }


# ─── Statistical Temporal Model (fallback — no TensorFlow needed) ─────────────

def train_statistical_model(data_norm, data_raw, mean, std):
    """
    Rolling-window z-score model.
    Computes the standard deviation of inter-frame deltas within each window.
    A high std-of-deltas means the sequence is erratic — anomalous.
    """
    windows = create_windows(data_norm, WINDOW_SIZE)
    print(f"[LSTM Trainer] Training statistical temporal model on {len(windows)} windows...")

    # Compute velocity-of-velocity (2nd derivative) for each window
    diffs = np.diff(windows, axis=1)          # shape: (N, window_size-1, features)
    scores = np.std(diffs, axis=(1, 2))       # Scalar score per window

    threshold = float(np.mean(scores) + 3.0 * np.std(scores))
    print(f"[LSTM Trainer] Statistical threshold: {threshold:.8f}")

    return {
        'type': 'statistical_temporal',
        'mean': mean,
        'std': std,
        'threshold': threshold,
        'window_size': WINDOW_SIZE,
        'n_features': N_FEATURES,
    }


# ─── Main entry point ──────────────────────────────────────────────────────────

def train_model():
    print("=" * 60)
    print("  LSTM TEMPORAL ANOMALY TRAINER")
    print("=" * 60)

    data = load_normal_data()
    if len(data) < WINDOW_SIZE + 20:
        print(f"[LSTM Trainer] Insufficient data ({len(data)} rows). Need ≥ {WINDOW_SIZE + 20}.")
        print("  Run gcs_node.py + drone_node.py first to collect more telemetry.")
        return

    # Normalize
    mean = data.mean(axis=0)
    std = data.std(axis=0) + 1e-8
    data_norm = (data - mean) / std

    # Try LSTM, fall back to statistical
    try:
        import tensorflow as tf
        print(f"[LSTM Trainer] TensorFlow {tf.__version__} detected — training full LSTM Autoencoder.")
        artifact = train_lstm_autoencoder(data_norm, mean, std)
    except ImportError:
        print("[LSTM Trainer] TensorFlow not found — training statistical temporal model.")
        artifact = train_statistical_model(data_norm, data, mean, std)

    joblib.dump(artifact, MODEL_FILE)
    print(f"\n[LSTM Trainer] ✓ Model saved to '{MODEL_FILE}' (type: {artifact['type']})")
    print("=" * 60)


if __name__ == "__main__":
    train_model()
