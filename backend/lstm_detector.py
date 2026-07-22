"""
LSTM Temporal Anomaly Detector (Real-Time)
==========================================
Maintains a sliding window of the last N telemetry packets and scores
each new packet using the trained model artifact (lstm_model.pkl).
Compatible with both LSTM Autoencoder and statistical temporal models.
"""

import numpy as np
import joblib
import os
from collections import deque

MODEL_FILE = "lstm_model.pkl"


class LSTMDetector:
    def __init__(self, model_file=MODEL_FILE):
        self.model_type = None
        self.keras_model = None
        self.mean = None
        self.std = None
        self.threshold = 1.0
        self.window_size = 10
        self.n_features = 6
        self.window = deque(maxlen=10)
        self._ready = False

        self._load(model_file)

    # ─── Model Loading ─────────────────────────────────────────────────────

    def _load(self, model_file):
        if not os.path.exists(model_file):
            print(f"[LSTM Detector] No model found at '{model_file}'. Run lstm_trainer.py first.")
            return

        artifact = joblib.load(model_file)
        self.model_type = artifact.get('type', 'statistical_temporal')
        self.mean = artifact['mean']
        self.std = artifact['std']
        self.threshold = artifact['threshold']
        self.window_size = artifact.get('window_size', 10)
        self.n_features = artifact.get('n_features', 6)
        self.window = deque(maxlen=self.window_size)

        if self.model_type == 'lstm_autoencoder':
            try:
                from tensorflow.keras.models import model_from_json
                self.keras_model = model_from_json(artifact['model_config'])
                self.keras_model.set_weights(artifact['model_weights'])
                self.keras_model.compile(optimizer='adam', loss='mse')
                print(f"[LSTM Detector] ✓ LSTM Autoencoder loaded (threshold={self.threshold:.6f})")
            except Exception as e:
                print(f"[LSTM Detector] Keras load failed ({e}) — falling back to statistical model.")
                self.model_type = 'statistical_temporal'
        else:
            print(f"[LSTM Detector] ✓ Statistical temporal model loaded (threshold={self.threshold:.6f})")

        self._ready = True

    def is_ready(self):
        return self._ready and self.mean is not None

    # ─── Real-Time Scoring ─────────────────────────────────────────────────

    def update_and_score(self, lat, lon, alt, vel_x, vel_y, vel_z):
        """
        Insert a new telemetry point and compute temporal anomaly score.

        Returns:
            (is_anomalous: bool, score: float, confidence: float 0-1)
        """
        if not self.is_ready():
            return False, 0.0, 0.0

        features = np.array([lat, lon, alt, vel_x, vel_y, vel_z], dtype=float)
        normalized = (features - self.mean) / (self.std + 1e-8)
        self.window.append(normalized)

        # Need a full window before scoring
        if len(self.window) < self.window_size:
            return False, 0.0, 0.0

        window_arr = np.array(list(self.window))  # shape: (window_size, n_features)

        if self.model_type == 'lstm_autoencoder' and self.keras_model is not None:
            score = self._lstm_score(window_arr)
        else:
            score = self._statistical_score(window_arr)

        is_anomalous = score > self.threshold
        # Confidence: how far beyond threshold (capped at 1.0)
        confidence = min(1.0, score / (self.threshold + 1e-8)) if is_anomalous else 0.0

        return is_anomalous, float(score), float(confidence)

    def _lstm_score(self, window_arr):
        """LSTM Autoencoder reconstruction error."""
        X = window_arr.reshape(1, self.window_size, self.n_features)
        pred = self.keras_model.predict(X, verbose=0)
        return float(np.mean(np.power(X - pred, 2)))

    def _statistical_score(self, window_arr):
        """Statistical score: std of inter-frame deltas (measures erratic sequence changes)."""
        diffs = np.diff(window_arr, axis=0)  # shape: (window_size-1, n_features)
        return float(np.std(diffs))

    def reset_window(self):
        """Clear the sliding window (e.g., on connection reset)."""
        self.window.clear()
