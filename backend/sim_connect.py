import collections
import collections.abc
# Patch for dronekit with python 3.10+
collections.MutableMapping = collections.abc.MutableMapping

import time
from dronekit import connect, VehicleMode
from telemetry_logger import TelemetryLogger

import dronekit_sitl

def connect_to_drone(connection_string='tcp:127.0.0.1:5762'):
    """
    Connects to the ArduPilot SITL instance.
    When using Mission Planner SITL, secondary telemetry is exposed on tcp:127.0.0.1:5762
    """
    print(f"Connecting to vehicle on: {connection_string}")
    vehicle = connect(connection_string, wait_ready=True)

    print("\nSuccessfully connected to vehicle!")
    print(f"Vehicle Type: {vehicle._vehicle_type}")
    print(f"Armed: {vehicle.armed}")
    print(f"System status: {vehicle.system_status.state}")
    print(f"GPS: {vehicle.gps_0}")
    print(f"Altitude: {vehicle.location.global_frame.alt}")
    return vehicle

if __name__ == "__main__":
    print("==================================================")
    print(" NOTICE: THIS SCRIPT IS DEPRECATED (Phase 1 Only)")
    print("==================================================")
    print("The Secure Drone System has moved to Phase 2 (Encrypted Communication Layer).")
    print("Instead of running this monolithic script, please run:")
    print("  1. gcs_node.py   (The receiver ground control station)")
    print("  2. drone_node.py (The encrypted drone transmitter)")
    print("\nPlease start `python gcs_node.py` and `python drone_node.py` in separate terminals.")
    print("==================================================\n")
    
    # We still keep the code for reference, but we exit here
    import sys
    sys.exit(0)
