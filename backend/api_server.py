import math
import time
import threading
import json
import os
from flask import Flask, jsonify, Response, request
from flask_socketio import SocketIO
from flask_cors import CORS
from telemetry_logger import TelemetryLogger

app = Flask(__name__)
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', logger=False, engineio_logger=False)

logger = TelemetryLogger("telemetry_log_secure.csv")

ATTACK_CONFIG_FILE = "attack_config.json"

# ── In-memory attack state ────────────────────────────────────────────────────
_attack_state = {'active': False, 'type': None, 'duration': 0, 'started_at': None}
_attack_lock = threading.Lock()

# ── CSV watcher state for WebSocket push ──────────────────────────────────────
_last_mtime = [0]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi    = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def analyze_attack(logs):
    """Classify GPS attack type and estimate disturbance from a log sequence."""
    alerts = []
    prev = None
    for row in logs:
        try:
            lat   = float(row['lat'])
            lon   = float(row['lon'])
            alt   = float(row['alt'])
            label = int(row['label'])
            ts    = float(row['timestamp'])

            if label == 1 and prev is not None:
                dist      = haversine_distance(prev['lat'], prev['lon'], lat, lon)
                alt_delta = abs(alt - prev['alt'])
                atk_type  = row.get('attack_type', '')

                # Use stored attack_type if available; fall back to haversine heuristics
                if atk_type in ('spike',):
                    attack_type = "SPIKE"
                    reason      = f"Teleportation detected — jumped {dist:.0f}m instantly."
                    source      = "GPS RF Jamming / Satellite Signal Spoofing"
                elif atk_type in ('drift',):
                    attack_type = "DRIFT"
                    reason      = f"Gradual drift — shifted {dist:.1f}m compounding each packet."
                    source      = "Meaconing (repeater-based GPS drift)"
                elif atk_type == 'replay':
                    attack_type = "REPLAY"
                    reason      = "Position frozen — stale GPS packets being replayed."
                    source      = "Signal replay attack"
                elif atk_type == 'velocity_inject':
                    attack_type = "VELOCITY INJ."
                    reason      = "Velocity vector inconsistent with reported position changes."
                    source      = "Inertial navigation spoofing"
                elif atk_type == 'altitude_bomb':
                    attack_type = "ALT BOMB"
                    reason      = f"Altitude crashed to {alt:.1f}m — fake crash event."
                    source      = "Barometric / GPS altitude manipulation"
                elif atk_type == 'cmd_inject':
                    attack_type = "CMD INJECT"
                    reason      = "Malicious shell/OS command signatures detected in payload."
                    source      = "Network/Telemetry Payload Injection"
                elif dist > 500:
                    attack_type = "SPIKE"
                    reason      = f"Teleportation detected — position jumped {dist:.0f}m instantly."
                    source      = "GPS RF Jamming / Satellite Signal Spoofing"
                elif dist > 5:
                    attack_type = "DRIFT"
                    reason      = f"Gradual drift detected — shifted {dist:.1f}m since last packet."
                    source      = "Meaconing (repeater-based GPS drift)"
                else:
                    attack_type = "SUBTLE"
                    reason      = f"Anomalous pattern flagged by ML ensemble (Δ{dist:.2f}m)."
                    source      = "Unknown spoofing vector — AI physics violation"

                alerts.append({
                    **row,
                    'attack_type':        attack_type,
                    'jump_meters':        round(dist, 2),
                    'alt_delta':          round(alt_delta, 2),
                    'reason':             reason,
                    'disturbance_source': source,
                })

            prev = {'lat': lat, 'lon': lon, 'alt': alt}
        except (ValueError, KeyError):
            continue
    return alerts


def build_telemetry_payload(logs):
    """Build the full telemetry payload dict from logs."""
    # Sync attack state with what the spoofer actually says
    try:
        if os.path.exists(ATTACK_CONFIG_FILE):
            with open(ATTACK_CONFIG_FILE, 'r') as f:
                cfg = json.load(f)
            with _attack_lock:
                _attack_state['active'] = cfg.get('active', False)
                _attack_state['type'] = cfg.get('type')
                if not _attack_state['active']:
                    _attack_state['duration'] = 0
    except Exception:
        pass

    latest       = logs[-1] if logs else None
    alerts       = analyze_attack(logs[-100:])
    latest_alert = alerts[-1] if alerts else None
    total        = len(logs)
    anomalies    = sum(1 for r in logs if int(r.get('label', 0)) == 1)

    # Attack type distribution
    attack_counts = {}
    for a in alerts:
        k = a.get('attack_type', 'UNKNOWN')
        attack_counts[k] = attack_counts.get(k, 0) + 1

    return {
        'status':        'success',
        'data':          logs[-20:],
        'flight_path':   logs[-500:],
        'latest':        latest,
        'latest_alert':  latest_alert,
        'alerts':        alerts[-50:],
        'attack_counts': attack_counts,
        'stats': {
            'total_packets':     total,
            'anomalies_detected': anomalies,
            'threat_level':      'HIGH' if anomalies > 5 else ('MEDIUM' if anomalies > 0 else 'SECURE'),
        },
        'attack_state': _attack_state,
    }


# ─── Background WebSocket emitter ────────────────────────────────────────────

def _background_emitter():
    """Push new telemetry to all connected WebSocket clients when CSV grows."""
    while True:
        try:
            mtime = os.path.getmtime(logger.filename)
            if mtime > _last_mtime[0]:
                _last_mtime[0] = mtime
                logs = logger.get_recent_logs(500)
                payload = build_telemetry_payload(logs)
                socketio.emit('telemetry_update', payload)
        except Exception:
            pass
        time.sleep(0.4)


threading.Thread(target=_background_emitter, daemon=True).start()


# ─── REST Endpoints ───────────────────────────────────────────────────────────

@app.route('/api/telemetry', methods=['GET'])
def get_telemetry():
    """REST fallback for clients that don't use WebSocket."""
    try:
        logs = logger.get_recent_logs(500)
        return jsonify(build_telemetry_payload(logs))
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/report', methods=['GET'])
def download_report():
    """Generate and download a comprehensive mission security report as CSV."""
    try:
        logs   = logger.get_recent_logs(10000)
        alerts = analyze_attack(logs)
        total     = len(logs)
        anomalies = sum(1 for r in logs if int(r.get('label', 0)) == 1)

        lines = [
            "# ==========================================================",
            "# SECURE DRONE MISSION REPORT v2.0",
            "# Ensemble Detection: Isolation Forest + LSTM Temporal Model",
            "# ==========================================================",
            f"# Total Telemetry Packets: {total}",
            f"# Anomalous Packets (ML): {anomalies}",
            f"# Threat Level: {'HIGH' if anomalies > 5 else 'MEDIUM' if anomalies > 0 else 'SECURE'}",
            "# Encryption: AES-256-GCM | Key Exchange: X25519 ECDH (PFS)",
            "# ==========================================================",
            "",
            "--- FULL TELEMETRY LOG ---",
            "timestamp,lat,lon,alt,vel_x,vel_y,vel_z,label,attack_type,status",
        ]
        for r in logs:
            status = "ANOMALY" if int(r.get('label', 0)) == 1 else "NORMAL"
            lines.append(
                f"{r['timestamp']},{r['lat']},{r['lon']},{r['alt']},"
                f"{r['vel_x']},{r['vel_y']},{r['vel_z']},{r['label']},"
                f"{r.get('attack_type', '')},{status}"
            )
        if alerts:
            lines += [
                "",
                "--- ATTACK INCIDENT LOG ---",
                "timestamp,attack_type,jump_meters,alt_delta,reason,disturbance_source",
            ]
            for a in alerts:
                lines.append(
                    f"{a['timestamp']},{a['attack_type']},{a['jump_meters']},{a['alt_delta']},"
                    f"\"{a['reason']}\",\"{a['disturbance_source']}\""
                )

        return Response(
            "\n".join(lines),
            mimetype='text/csv',
            headers={"Content-Disposition": "attachment; filename=drone_mission_report_v2.csv"},
        )
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ─── Attack Control Endpoints ─────────────────────────────────────────────────

@app.route('/api/attack/trigger', methods=['POST'])
def trigger_attack():
    """Trigger a specific GPS attack type on the drone node via shared config file."""
    body      = request.get_json(silent=True) or {}
    atk_type  = body.get('type', 'spike')
    duration  = int(body.get('duration', 30))

    # Write config for drone_node / spoofer to pick up
    with open(ATTACK_CONFIG_FILE, 'w') as f:
        json.dump({'active': True, 'type': atk_type, 'duration': duration}, f)

    with _attack_lock:
        _attack_state.update({'active': True, 'type': atk_type,
                               'duration': duration, 'started_at': time.time()})

    socketio.emit('attack_triggered', {'type': atk_type, 'duration': duration})
    return jsonify({'status': 'success', 'attack': atk_type, 'duration': duration})


@app.route('/api/attack/stop', methods=['POST'])
def stop_attack():
    """Stop any active attack."""
    with open(ATTACK_CONFIG_FILE, 'w') as f:
        json.dump({'active': False, 'type': None, 'duration': 0}, f)

    with _attack_lock:
        _attack_state.update({'active': False, 'type': None, 'duration': 0, 'started_at': None})

    socketio.emit('attack_stopped', {})
    return jsonify({'status': 'success', 'message': 'Attack stopped'})


@app.route('/api/attack/status', methods=['GET'])
def attack_status():
    return jsonify(_attack_state)


@app.route('/api/stats/timeline', methods=['GET'])
def stats_timeline():
    """Return time-series data for analytics charts."""
    limit = int(request.args.get('limit', 200))
    logs  = logger.get_recent_logs(limit)
    series = []
    for r in logs:
        try:
            series.append({
                'time':     float(r['timestamp']),
                'alt':      float(r['alt']),
                'lat':      float(r['lat']),
                'lon':      float(r['lon']),
                'vel_x':    float(r['vel_x']),
                'vel_y':    float(r['vel_y']),
                'vel_z':    float(r['vel_z']),
                'label':    int(r['label']),
                'atk_type': r.get('attack_type', ''),
            })
        except (ValueError, KeyError):
            continue
    return jsonify({'status': 'success', 'series': series})


# ─── WebSocket Events ─────────────────────────────────────────────────────────

@socketio.on('connect')
def on_connect():
    """Send current state on fresh connection."""
    try:
        logs    = logger.get_recent_logs(500)
        payload = build_telemetry_payload(logs)
        socketio.emit('telemetry_update', payload)
    except Exception:
        pass


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 60)
    print("  SECURE DRONE API SERVER v2.0 — Flask + SocketIO")
    print("  REST API + WebSocket push on port 5000")
    print("=" * 60)
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
