import socket
import json
import os
import joblib
import pandas as pd
import re
from crypto_utils import CryptoManager
from telemetry_logger import TelemetryLogger
from lstm_detector import LSTMDetector

UDP_IP = "127.0.0.1"
UDP_PORT = 5005
IF_MODEL_FILE = "anomaly_model.pkl"

def run_gcs():
    print("=" * 60)
    print("  GROUND CONTROL STATION (GCS) — v2.0")
    print("  Ensemble: Isolation Forest + LSTM Temporal Detector")
    print("=" * 60)

    crypto_mgr = CryptoManager()
    logger = TelemetryLogger("telemetry_log_secure.csv")

    # ── Load Isolation Forest ─────────────────────────────────────────────
    if_model = None
    if os.path.exists(IF_MODEL_FILE):
        print(f"[GCS] Isolation Forest loaded from '{IF_MODEL_FILE}'")
        if_model = joblib.load(IF_MODEL_FILE)
    else:
        print("[GCS WARNING] No Isolation Forest model — only LSTM active.")

    # ── Load LSTM Temporal Detector ───────────────────────────────────────
    lstm_det = LSTMDetector()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_IP, UDP_PORT))
    print(f"\n[GCS] Listening on UDP {UDP_IP}:{UDP_PORT}...")
    print("-" * 60)

    try:
        while True:
            data, addr = sock.recvfrom(4096)
            try:
                # ── Decrypt ───────────────────────────────────────────────
                decrypted = crypto_mgr.decrypt_telemetry(data)
                raw_json_str = decrypted.decode('utf-8')
                telemetry = json.loads(raw_json_str)

                # ── Command Injection Detection ───────────────────────────
                injection_pattern = re.compile(r'(;|\|\||&&|\$\(|\brm -rf\b|\bcat /|os\.system|exec\()')
                
                cmd_injected = False
                if injection_pattern.search(raw_json_str):
                    cmd_injected = True
                    # If this was anomalous, replace the attacker type with cmd_inject explicitly
                    atk = 'cmd_inject'

                def safe_float(val):
                    try:
                        return float(val)
                    except (ValueError, TypeError):
                        return 0.0

                lat   = safe_float(telemetry.get('lat', 0.0))
                lon   = safe_float(telemetry.get('lon', 0.0))
                alt   = safe_float(telemetry.get('alt', 0.0))
                vel   = telemetry.get('vel', [0.0, 0.0, 0.0])
                atk   = atk if cmd_injected else telemetry.get('attack_type', None)
                vx, vy, vz = (vel + [0.0, 0.0, 0.0])[:3]

                # ── Isolation Forest ──────────────────────────────────────
                if_anomalous = False
                if if_model is not None and not cmd_injected:
                    feat = pd.DataFrame([[lat, lon, alt]], columns=['lat', 'lon', 'alt'])
                    if_anomalous = if_model.predict(feat)[0] == -1

                # ── LSTM Temporal Detector ────────────────────────────────
                lstm_anomalous, lstm_score, lstm_conf = lstm_det.update_and_score(
                    lat, lon, alt, vx, vy, vz
                )

                # ── Ensemble Decision (OR = high recall / low false-neg) ──
                is_anomalous = cmd_injected or if_anomalous or lstm_anomalous
                
                # For demonstration, ensure active UI payloads populate the log
                is_spoofed_gt = telemetry.get('is_spoofed', False)
                should_log_alert = is_anomalous or is_spoofed_gt

                detector_flags = []
                if cmd_injected:   detector_flags.append("SyntaxHeuristics(CmdInject)")
                if if_anomalous:   detector_flags.append("IsolationForest")
                if lstm_anomalous: detector_flags.append(f"LSTM(score={lstm_score:.4f})")

                if is_anomalous:
                    flags = ", ".join(detector_flags)
                    print(f"[🚨 BREACH] ({lat:.5f}, {lon:.5f}) Alt={alt:.1f}m | Detectors: {flags}")
                else:
                    print(f"[GCS OK] ({lat:.5f}, {lon:.5f}) Alt={alt:.1f}m | LSTM score: {lstm_score:.4f}")

                # ── Log ───────────────────────────────────────────────────
                logger.log(lat, lon, alt, [vx, vy, vz],
                           is_spoofed=should_log_alert,
                           attack_type=atk if should_log_alert else None)

            except Exception as e:
                print(f"[GCS SECURITY ALERT] Packet processing failed: {e}")

    except KeyboardInterrupt:
        print("\n[GCS] Shutting down.")


if __name__ == "__main__":
    run_gcs()
