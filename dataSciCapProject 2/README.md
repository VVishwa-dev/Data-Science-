# Clearpath — Smart EMI & Preclosure Analyzer

A Flask-based personal-finance prototype with account login, loan and budget tracking, visual analytics, EMI calculations, and a scikit-learn model lab.

## What's included

- **Flask app** with signup/login, per-account plans, SQLite persistence, CSRF checks, and JSON APIs.
- **Premium interface** with responsive glass-style panels, gradient lighting, chart-friendly visualizations, hover motion, theme support, and reduced-motion accessibility.
- **Machine-learning pipeline** (`train_model.py`) that preprocesses loan type + numeric inputs and trains a Random Forest regressor.
- **Saved model** (`preclosure_model.pkl`) so the model lab can work immediately after dependencies are installed.
- Raw dataset, analysis-results CSVs, and Jupyter notebooks in `dataset/` and `notebook/`.
- Basic integration tests in `tests/`.

## Run on macOS

**Easy option:** double-click `run_mac.command`. If macOS blocks it, right-click the file, choose Open, and confirm.

**Terminal option:** open this folder in VS Code, choose Terminal → New Terminal, then run:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python train_model.py
python app.py
```

## Run on Windows

Double-click `run_windows.bat`, or run these commands in PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python train_model.py
python app.py
```

Then visit **http://127.0.0.1:5000**, create an account, and open **Analyzer → Model Lab**. Use Python 3.11 or newer. Internet access is needed the first time to install packages.

## Model meaning — important

The target column `Preclosure_Benefit` in the included dataset ranges from 0 to 100, so Clearpath displays the prediction as a **benefit score out of 100**, not as rupees saved. The app does not promise actual savings. Ask the lender for a foreclosure quote and compare the outstanding amount, fees, and remaining scheduled payments before making a decision.

The training script uses an 80/20 train/test split. It saves R², MAE, RMSE, and row counts inside the model bundle. The included model was retrained from the bundled raw CSV; reported holdout metrics are dataset-specific and are not proof of real-world performance.

## Retrain and test

```bash
python train_model.py
python -m pytest -q
```

If the dataset changes, retrain the model before using predictions. Only load `.pkl` files you trust; pickle files can execute code when loaded.

## Privacy and deployment notes

The personal SQLite database is created locally at `.clearpath/clearpath.sqlite3` the first time the app runs and is intentionally **not included** in this ZIP. Keep `.clearpath/` private and backed up if you use the app for real records.

For local development the app generates a temporary secret key if `CLEARPATH_SECRET_KEY` is not set. For a deployment, set a stable random secret key, enable HTTPS (`CLEARPATH_HTTPS=1`), and run behind a production WSGI server. Do not expose Flask's development server directly to the public internet.
