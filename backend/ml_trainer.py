import pandas as pd
from sklearn.ensemble import IsolationForest
import joblib
import os

MODEL_FILE = "anomaly_model.pkl"
DATA_FILE = "telemetry_log_secure.csv"

def train_model():
    if not os.path.exists(DATA_FILE):
        print(f"Error: Dataset {DATA_FILE} not found. Cannot train ML model.")
        return

    print("Loading telemetry dataset...")
    # The dataset has mixed row lengths because Phase 2 stored 7 columns, and Phase 3 stores 8.
    # We will manually read it to bypass Pandas ParserError and safely extract Phase 3 data.
    import csv
    valid_rows = []
    with open(DATA_FILE, 'r') as f:
        reader = csv.reader(f)
        for row in reader:
            # We only want rows that have the 8th column (the 'label')
            if len(row) == 8 and row[0] != 'timestamp':
                try:
                    # Convert to floats
                    valid_rows.append([float(x) for x in row])
                except ValueError:
                    pass
    
    if not valid_rows:
        print("Error: No valid labeled telemetry found. Please run the drone_node.py to generate data.")
        return
        
    df = pd.DataFrame(valid_rows, columns=['timestamp', 'lat', 'lon', 'alt', 'vel_x', 'vel_y', 'vel_z', 'label'])
    
    if len(df) < 50:
        print(f"Warning: Dataset only has {len(df)} rows. ML requires a larger dataset for optimal training.")
    
    # We will train on spatial features. 
    # IsolationForest will learn the relationships between coordinates.
    # Sudden jumps/spikes break the spatial relationship structure.
    features = ['lat', 'lon', 'alt']
    X = df[features]
    
    print(f"Training Isolation Forest model on {len(X)} data points...")
    # contamination represents the estimated percentage of anomalies in the dataset
    # Our GPS spoofer had a 10% trigger chance, so 0.1 is perfect.
    model = IsolationForest(n_estimators=100, contamination=0.1, random_state=42)
    
    # Fit the model
    model.fit(X)
    
    # Save the intelligent brain
    joblib.dump(model, MODEL_FILE)
    print(f"\nSuccess! Model trained and saved to '{MODEL_FILE}'.")
    
    # Quick sanity check on the actual dataset
    predictions = model.predict(X)
    anomalies_detected = (predictions == -1).sum()
    print(f"Self-Evaluation: Model flagged {anomalies_detected} out of {len(X)} historical points as anomalous.")

if __name__ == "__main__":
    print("-" * 50)
    print("Initiating ML Training sequence (Isolation Forest)...")
    train_model()
    print("-" * 50)
