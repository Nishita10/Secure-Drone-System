import csv
import os
import time


class TelemetryLogger:
    """
    Telemetry CSV logger with support for 8-column (legacy) and
    9-column (v2, with attack_type) formats for backward compatibility.
    """

    FIELDNAMES = ['timestamp', 'lat', 'lon', 'alt', 'vel_x', 'vel_y', 'vel_z', 'label', 'attack_type']

    def __init__(self, filename="telemetry_log.csv"):
        self.filename = filename
        file_exists = os.path.isfile(self.filename)
        with open(self.filename, 'a', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=self.FIELDNAMES)
            if not file_exists:
                writer.writeheader()

    def log(self, lat, lon, alt, velocity, is_spoofed=False, attack_type=None):
        """Log a single telemetry data point."""
        with open(self.filename, 'a', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=self.FIELDNAMES)
            writer.writerow({
                'timestamp': time.time(),
                'lat': lat,
                'lon': lon,
                'alt': alt,
                'vel_x': velocity[0] if velocity and len(velocity) > 0 else 0,
                'vel_y': velocity[1] if velocity and len(velocity) > 1 else 0,
                'vel_z': velocity[2] if velocity and len(velocity) > 2 else 0,
                'label': 1 if is_spoofed else 0,
                'attack_type': attack_type if attack_type else '',
            })

    def get_recent_logs(self, limit=100):
        """
        Read recent logs, handling both legacy 8-column and new 9-column formats.
        """
        logs = []
        if not os.path.exists(self.filename):
            return logs

        with open(self.filename, 'r') as f:
            reader = csv.reader(f)
            next(reader, None)  # skip header
            for row in reader:
                n = len(row)
                if n not in [8, 9]:
                    continue
                try:
                    logs.append({
                        'timestamp': row[0],
                        'lat': row[1],
                        'lon': row[2],
                        'alt': row[3],
                        'vel_x': row[4],
                        'vel_y': row[5],
                        'vel_z': row[6],
                        'label': row[7],
                        'attack_type': row[8] if n == 9 else '',
                    })
                except (IndexError, ValueError):
                    continue
        return logs[-limit:]
