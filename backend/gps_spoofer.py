import random
import json
import os
import threading
import time

ATTACK_CONFIG_FILE = "attack_config.json"

ATTACK_TYPES = {
    'spike':            'GPS Spike (Teleportation)',
    'drift':            'GPS Drift (Meaconing)',
    'replay':           'Replay Attack (Frozen Position)',
    'velocity_inject':  'Velocity Injection',
    'altitude_bomb':    'Altitude Bomb (Crash Sim)',
    'jamming':          'Signal Jamming (Packet Loss)',
    'cmd_inject':       'Command Injection',
}


class GPSSpoofer:
    def __init__(self):
        self.attack_active = False
        self.attack_type = None
        self.attack_duration = 0
        self.drift_offset_lat = 0.0
        self.drift_offset_lon = 0.0
        self.replay_buffer = None
        self.jamming_end_time = 0
        self._lock = threading.Lock()
        # Track if API externally triggered the attack
        self._api_controlled = False

    # ─── Manual API control ────────────────────────────────────────────────

    def trigger_attack(self, attack_type: str, duration: int = 30):
        """Trigger a specific attack type for a given duration (seconds)."""
        with self._lock:
            self.attack_active = True
            self.attack_type = attack_type
            self.attack_duration = duration
            self.drift_offset_lat = 0.0
            self.drift_offset_lon = 0.0
            self._api_controlled = True
            if attack_type == 'jamming':
                self.jamming_end_time = time.time() + duration
        label = ATTACK_TYPES.get(attack_type, attack_type)
        print(f"[⚡ ATTACKER] {label.upper()} activated for {duration}s")

    def stop_attack(self):
        """Stop any active attack."""
        with self._lock:
            self.attack_active = False
            self.attack_type = None
            self.drift_offset_lat = 0.0
            self.drift_offset_lon = 0.0
            self._api_controlled = False
        print("[ATTACKER] Attack deactivated — GPS nominal")

    def get_status(self):
        with self._lock:
            return {
                'active': self.attack_active,
                'type': self.attack_type,
                'duration_remaining': self.attack_duration,
                'label': ATTACK_TYPES.get(self.attack_type, '—') if self.attack_type else '—',
            }

    # ─── Auto-trigger (used when no API control) ───────────────────────────

    def try_trigger_attack(self, probability=0.015):
        """Randomly start or stop attacks — only when not API-controlled."""
        # Check attack_config.json for API-triggered attacks
        self._check_api_config()

        with self._lock:
            if self._api_controlled:
                # Count down duration
                if self.attack_active:
                    self.attack_duration -= 1
                    if self.attack_duration <= 0:
                        self.attack_active = False
                        self.attack_type = None
                        self._api_controlled = False
                        
                        # Clear the config file so it doesn't infinitely loop
                        try:
                            with open('attack_config.json', 'w') as f:
                                json.dump({'active': False, 'type': None, 'duration': 0}, f)
                        except Exception:
                            pass
                return

            if not self.attack_active:
                if random.random() < probability:
                    auto_types = ['spike', 'drift', 'velocity_inject', 'altitude_bomb']
                    atk = random.choice(auto_types)
                    dur = random.randint(3, 8)
                    self.attack_active = True
                    self.attack_type = atk
                    self.attack_duration = dur
                    self.drift_offset_lat = 0.0
                    self.drift_offset_lon = 0.0
                    print(f"[⚡ AUTO-ATTACK] {atk.upper()} triggered for {dur}s")
            else:
                self.attack_duration -= 1
                if self.attack_duration <= 0:
                    self.attack_active = False
                    self.attack_type = None
                    print("[ATTACKER] Auto-attack expired — GPS recovered")

    def _check_api_config(self):
        """Read attack_config.json if it exists and apply the requested attack."""
        if not os.path.exists(ATTACK_CONFIG_FILE):
            return
        try:
            with open(ATTACK_CONFIG_FILE, 'r') as f:
                config = json.load(f)
            if config.get('active') and config.get('type'):
                atk = config['type']
                dur = int(config.get('duration', 30))
                with self._lock:
                    if not self._api_controlled or self.attack_type != atk:
                        self.attack_active = True
                        self.attack_type = atk
                        self.attack_duration = dur
                        self._api_controlled = True
                        self.drift_offset_lat = 0.0
                        self.drift_offset_lon = 0.0
                        if atk == 'jamming':
                            self.jamming_end_time = time.time() + dur
            elif not config.get('active'):
                with self._lock:
                    if self._api_controlled and self.attack_active:
                        self.attack_active = False
                        self.attack_type = None
                        self._api_controlled = False
        except Exception:
            pass

    # ─── Core spoof logic ─────────────────────────────────────────────────

    def spoof_telemetry(self, lat, lon, alt, vel=None):
        """
        Apply active attack manipulation to the telemetry.
        Returns: (lat, lon, alt, vel, is_spoofed, attack_type_str)
        """
        vel = list(vel) if vel is not None else [0.0, 0.0, 0.0]

        with self._lock:
            if not self.attack_active:
                # Keep replay buffer fresh
                self.replay_buffer = {'lat': lat, 'lon': lon, 'alt': alt}
                return lat, lon, alt, vel, False, None

            attack = self.attack_type

        # --- GPS SPIKE: instant teleportation ---
        if attack == 'spike':
            lat += random.uniform(-5.0, 5.0)
            lon += random.uniform(-5.0, 5.0)
            alt += random.uniform(100, 500)
            return lat, lon, alt, vel, True, 'spike'

        # --- GPS DRIFT: gradual, compounding offset ---
        elif attack == 'drift':
            with self._lock:
                self.drift_offset_lat += random.uniform(0.00008, 0.0003)
                self.drift_offset_lon += random.uniform(0.00008, 0.0003)
                dlat = self.drift_offset_lat
                dlon = self.drift_offset_lon
            return lat + dlat, lon + dlon, alt, vel, True, 'drift'

        # --- REPLAY: freeze position to old buffer ---
        elif attack == 'replay':
            buf = self.replay_buffer
            if buf:
                return buf['lat'], buf['lon'], buf['alt'], vel, True, 'replay'
            return lat, lon, alt, vel, True, 'replay'

        # --- VELOCITY INJECTION: corrupt velocity vector ---
        elif attack == 'velocity_inject':
            fake_vel = [
                random.uniform(-50.0, 50.0),
                random.uniform(-50.0, 50.0),
                random.uniform(-15.0, 15.0),
            ]
            return lat, lon, alt, fake_vel, True, 'velocity_inject'

        # --- ALTITUDE BOMB: fake crash altitude ---
        elif attack == 'altitude_bomb':
            alt = random.uniform(-3.0, 3.0)
            return lat, lon, alt, vel, True, 'altitude_bomb'

        # --- JAMMING: signal loss (drone_node should drop packet) ---
        elif attack == 'jamming':
            return lat, lon, alt, vel, True, 'jamming'

        # --- CMD INJECT: pass through to drone_node for formatting ---
        elif attack == 'cmd_inject':
            return lat, lon, alt, vel, True, 'cmd_inject'

        return lat, lon, alt, vel, False, None
