import collections
import collections.abc
collections.MutableMapping = collections.abc.MutableMapping

import time
import json
import socket
import os
import argparse
from dronekit import connect
from crypto_utils import CryptoManager
from gps_spoofer import GPSSpoofer

GCS_IP   = "127.0.0.1"
GCS_PORT = 5005


def run_drone_node(connection_string='tcp:127.0.0.1:5760'):
    print("=" * 60)
    print("  DRONE NODE (Onboard Computer) — v2.0")
    print("  Attack-config aware | Extended attack types")
    print("=" * 60)

    crypto_mgr = CryptoManager()
    spoofer = GPSSpoofer()
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    print(f"[Drone] Connecting to SITL at {connection_string}...")
    try:
        vehicle = connect(connection_string, wait_ready=True)
    except Exception as e:
        print(f"[Drone] SITL connection failed: {e}")
        return

    print("[Drone] Vehicle connected!\n")
    print("-" * 60)

    try:
        while True:
            loc = vehicle.location.global_frame
            vel = vehicle.velocity

            lat = loc.lat if loc.lat is not None else 0.0
            lon = loc.lon if loc.lon is not None else 0.0
            alt = loc.alt if loc.alt is not None else 0.0
            vel = list(vel) if vel is not None else [0.0, 0.0, 0.0]

            # Check auto-trigger + API attack_config.json
            spoofer.try_trigger_attack(probability=0.0)

            # Apply spoofing (now returns 6-tuple with attack_type)
            lat, lon, alt, vel, is_spoofed, attack_type = spoofer.spoof_telemetry(lat, lon, alt, vel)

            # Drop packet if jamming is active (simulate signal loss)
            if attack_type == 'jamming':
                print("[Drone] 📡 JAMMED — Packet suppressed (signal loss simulation)")
                time.sleep(1)
                continue

            # ─── PHYSICAL HIJACKING (Make ArduPilot actually react!) ───
            if is_spoofed:
                from dronekit import VehicleMode, LocationGlobalRelative
                try:
                    if attack_type == 'altitude_bomb' and vehicle.mode.name != 'LAND':
                        print("[Drone] 💣 HIJACK: Forcing physical drone into LAND mode!")
                        vehicle.mode = VehicleMode("LAND")
                        
                    elif attack_type == 'spike' and vehicle.mode.name != 'GUIDED':
                        print("[Drone] ⚡ HIJACK: Overriding flight path! Forcing GUIDED mode.")
                        vehicle.mode = VehicleMode("GUIDED")
                        vehicle.simple_goto(LocationGlobalRelative(lat, lon, alt))
                        
                    elif attack_type == 'cmd_inject' and vehicle.armed:
                        print("[Drone] 💻 HIJACK: Malicious 'kill' payload executed. Disarming motors!")
                        vehicle.armed = False
                except Exception as e:
                    pass
            # ───────────────────────────────────────────────────────────

            telemetry = {
                "lat": lat,
                "lon": lon,
                "alt": alt,
                "vel": vel,
                "is_spoofed": is_spoofed,
                "attack_type": attack_type,
            }

            if attack_type == 'cmd_inject':
                # Inject a typical command injection payload into the altitude field
                telemetry["alt"] = "100.0; cat /etc/shadow"

            payload = json.dumps(telemetry).encode('utf-8')
            encrypted = crypto_mgr.encrypt_telemetry(payload)
            sock.sendto(encrypted, (GCS_IP, GCS_PORT))
            print(f"[Drone] TX {len(encrypted)}B | {'🔴 SPOOFED: ' + str(attack_type) if is_spoofed else '🟢 Normal'}")
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[Drone] Node shutting down.")
    finally:
        vehicle.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Secure Drone System - Drone Node")
    parser.add_argument("--connect", default="tcp:127.0.0.1:5760", help="Vehicle connection target string. If using Mission Planner, try tcp:127.0.0.1:5762")
    args = parser.parse_args()
    
    run_drone_node(args.connect)
