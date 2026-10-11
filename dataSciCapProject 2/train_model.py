"""Train and save the Clearpath preclosure-benefit model.
Run: python train_model.py
"""
from pathlib import Path
import pickle
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "dataset/emi_preclosure_analysis_results.csv"
MODEL_PATH = ROOT / "preclosure_model.pkl"
FEATURES = [
    "Loan_Type", "Principal_Amount", "Outstanding_Amount", "Monthly_EMI",
    "Annual_Interest_Rate", "Remaining_Tenure_Months", "Monthly_Income",
    "Monthly_Expenses", "Other_EMI_Amount", "Savings", "Preclosure_Charges",
    "Credit_Score",
]
TARGET = "Preclosure_Benefit"


def main():
    df = pd.read_csv(DATA)
    df = df[FEATURES + [TARGET]].copy()
    df[TARGET] = pd.to_numeric(df[TARGET], errors="coerce")
    numeric = [c for c in FEATURES if c != "Loan_Type"]
    for col in numeric:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=[TARGET])
    for col in numeric:
        df[col] = df[col].fillna(df[col].median())
    df["Loan_Type"] = df["Loan_Type"].fillna("Other").astype(str)

    preprocessor = ColumnTransformer([
        ("loan_type", OneHotEncoder(handle_unknown="ignore"), ["Loan_Type"]),
        ("numeric", "passthrough", numeric),
    ])
    pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("model", RandomForestRegressor(n_estimators=250, min_samples_leaf=2, random_state=42, n_jobs=-1)),
    ])
    X_train, X_test, y_train, y_test = train_test_split(df[FEATURES], df[TARGET], test_size=0.2, random_state=42)
    pipeline.fit(X_train, y_train)
    predictions = pipeline.predict(X_test)
    metrics = {
        "r2": round(float(r2_score(y_test, predictions)), 4),
        "mae": round(float(mean_absolute_error(y_test, predictions)), 4),
        "rmse": round(float(mean_squared_error(y_test, predictions) ** 0.5), 4),
        "training_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "target": TARGET,
        "features": FEATURES,
    }
    with MODEL_PATH.open("wb") as file:
        pickle.dump({"model": pipeline, "metrics": metrics, "features": FEATURES}, file)
    print(f"Saved model to: {MODEL_PATH}")
    print("Holdout metrics:", metrics)

if __name__ == "__main__":
    main()
