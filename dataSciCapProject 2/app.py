import json
import math
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, redirect, render_template, request, send_file, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash


app = Flask(__name__, template_folder="template", static_folder="static", instance_relative_config=True)
app.config.update(
	SECRET_KEY=os.environ.get("CLEARPATH_SECRET_KEY") or secrets.token_hex(32),
	DATABASE=os.environ.get("CLEARPATH_DATABASE") or str(Path(app.root_path) / ".clearpath" / "clearpath.sqlite3"),
	SESSION_COOKIE_HTTPONLY=True,
	SESSION_COOKIE_SAMESITE="Lax",
	SESSION_COOKIE_SECURE=os.environ.get("CLEARPATH_HTTPS", "0") == "1",
	MAX_CONTENT_LENGTH=128 * 1024,
)

Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

DEFAULT_PLAN = {
	"incomes": [
		{"id": "income-salary", "category": "Salary", "amount": 150000, "note": "Take-home salary", "date": date.today().isoformat()},
		{"id": "income-pocket", "category": "Pocket money", "amount": 30000, "note": "Other monthly income", "date": date.today().isoformat()},
	],
	"expenses": [
		{"id": "expense-housing", "category": "House", "amount": 28000, "note": "Housing and rent", "date": date.today().isoformat()},
		{"id": "expense-food", "category": "Food", "amount": 18000, "note": "Groceries and meals", "date": date.today().isoformat()},
		{"id": "expense-transport", "category": "Transport", "amount": 7000, "note": "Commute and travel", "date": date.today().isoformat()},
		{"id": "expense-utilities", "category": "Utilities", "amount": 9000, "note": "Bills and internet", "date": date.today().isoformat()},
		{"id": "expense-health", "category": "Health", "amount": 3000, "note": "Health and care", "date": date.today().isoformat()},
		{"id": "expense-other", "category": "Other", "amount": 3000, "note": "Other essentials", "date": date.today().isoformat()},
	],
	"savings": 150000,
	"goals": [
		{"id": "goal-reserve", "name": "Build a safety reserve", "target": 500000, "dueDate": f"{date.today().year + (date.today().month > 4)}-04-30", "contributions": []},
	],
	"loans": [
		{"id": "loan-home", "name": "A place of our own", "type": "Home loan", "principal": 2600000, "outstanding": 1800000, "emi": 32000, "rate": 8.7, "months": 84, "fees": 12000},
		{"id": "loan-vehicle", "name": "The family car", "type": "Vehicle loan", "principal": 1200000, "outstanding": 900000, "emi": 23000, "rate": 10.4, "months": 48, "fees": 16000},
		{"id": "loan-personal", "name": "Personal loan", "type": "Personal loan", "principal": 900000, "outstanding": 900000, "emi": 22500, "rate": 16.5, "months": 60, "fees": 8000},
	],
}
EMPTY_ACCOUNT_PLAN = {"incomes": [], "expenses": [], "savings": 0, "goals": [], "loans": []}

INCOME_CATEGORIES = {"Salary", "Pocket money", "Business", "Freelance", "Rental income", "Investments", "Other"}
EXPENSE_CATEGORIES = {"Food", "House", "Utilities", "Transport", "Health", "Education", "Shopping", "Family", "Entertainment", "Other"}
LOAN_TYPES = {"Home loan", "Vehicle loan", "Personal loan", "Education loan", "Credit card", "Other"}


def get_db() -> sqlite3.Connection:
	if "db" not in g:
		connection = sqlite3.connect(app.config["DATABASE"])
		connection.row_factory = sqlite3.Row
		g.db = connection
	return g.db


def initialize_database() -> None:
	with sqlite3.connect(app.config["DATABASE"]) as connection:
		connection.execute("PRAGMA journal_mode=WAL")
		connection.executescript(
			"""
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT NOT NULL UNIQUE,
				password_hash TEXT NOT NULL,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			);
			CREATE TABLE IF NOT EXISTS plans (
				user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
				data TEXT NOT NULL,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			);
			"""
		)


def csrf_token() -> str:
	if "csrf_token" not in session:
		session["csrf_token"] = secrets.token_urlsafe(32)
	return session["csrf_token"]


def valid_csrf_token(candidate: str | None) -> bool:
	token = session.get("csrf_token", "")
	return bool(token and candidate and secrets.compare_digest(token, candidate))


@app.before_request
def load_current_user() -> None:
	user_id = session.get("user_id")
	g.current_user = get_db().execute("SELECT id, name, email FROM users WHERE id = ?", (user_id,)).fetchone() if user_id else None


@app.teardown_appcontext
def close_db(_error: BaseException | None = None) -> None:
	connection = g.pop("db", None)
	if connection is not None:
		connection.close()


@app.context_processor
def inject_template_context() -> dict[str, Any]:
	return {"current_user": g.get("current_user"), "csrf_token": csrf_token()}


def login_required(view):
	@wraps(view)
	def wrapped_view(*args, **kwargs):
		if g.current_user is None:
			return redirect(url_for("login", next=request.path))
		return view(*args, **kwargs)
	return wrapped_view


def render_page(template: str, page: str, **context):
	return render_template(template, active_page=page, **context)


def safe_next_path(candidate: str | None) -> str:
	if candidate and candidate.startswith("/") and not candidate.startswith("//"):
		return candidate
	return url_for("tracker")


@app.get("/")
def home():
	if g.current_user:
		return redirect(url_for("tracker"))
	return render_page("index.html", "home")


@app.get("/dashboard")
@login_required
def dashboard():
	return render_page("dashboard.html", "dashboard")


@app.get("/tracker")
@login_required
def tracker():
	return render_page("tracker.html", "tracker")


@app.get("/analyzer")
@login_required
def analyzer():
	return render_page("analyzer.html", "analyzer")


@app.get("/visualizations")
@login_required
def visualizations():
	return render_page("visualizations.html", "visualizations")


@app.get("/visualizations/notebook")
@login_required
def visualizations_notebook():
	notebook_path = Path(app.root_path) / "notebook" / "EMI_Preclose_Visualizations.ipynb"
	return send_file(notebook_path, as_attachment=True, download_name=notebook_path.name, mimetype="application/json")


@app.get("/about")
def about():
	return render_page("about.html", "about")


@app.route("/signup", methods=["GET", "POST"])
def signup():
	if g.current_user:
		return redirect(url_for("tracker"))
	if request.method == "POST":
		if not valid_csrf_token(request.form.get("csrf_token")):
			return render_page("signup.html", "signup", error="This form expired. Please try again."), 400
		name = " ".join(request.form.get("name", "").split())[:80]
		email = request.form.get("email", "").strip().lower()
		password = request.form.get("password", "")
		if not name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
			return render_page("signup.html", "signup", error="Enter your name and a valid email address."), 400
		if len(password) < 12:
			return render_page("signup.html", "signup", error="Choose a password with at least 12 characters."), 400
		try:
			cursor = get_db().execute(
				"INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
				(name, email, generate_password_hash(password)),
			)
			get_db().commit()
		except sqlite3.IntegrityError:
			return render_page("signup.html", "signup", error="An account already uses that email. Try logging in."), 409
		session.clear()
		session["user_id"] = cursor.lastrowid
		csrf_token()
		return redirect(url_for("tracker"))
	return render_page("signup.html", "signup")


@app.route("/login", methods=["GET", "POST"])
def login():
	if g.current_user:
		return redirect(url_for("tracker"))
	next_url = request.values.get("next", "")
	if request.method == "POST":
		if not valid_csrf_token(request.form.get("csrf_token")):
			return render_page("login.html", "login", error="This form expired. Please try again.", next_url=safe_next_path(next_url)), 400
		email = request.form.get("email", "").strip().lower()
		user = get_db().execute("SELECT id, password_hash FROM users WHERE email = ?", (email,)).fetchone()
		if user is None or not check_password_hash(user["password_hash"], request.form.get("password", "")):
			return render_page("login.html", "login", error="That email and password combination didn't match.", next_url=safe_next_path(next_url)), 401
		session.clear()
		session["user_id"] = user["id"]
		csrf_token()
		return redirect(safe_next_path(next_url))
	return render_page("login.html", "login", next_url=safe_next_path(next_url))


@app.post("/logout")
def logout():
	if not valid_csrf_token(request.form.get("csrf_token")):
		return "Invalid security token. Refresh the page and try again.", 400
	session.clear()
	return redirect(url_for("home"))


def clean_amount(value: Any, *, allow_zero: bool = True) -> float:
	amount = float(value)
	if not math.isfinite(amount) or amount < 0 or (not allow_zero and amount == 0) or amount > 1_000_000_000_000:
		raise ValueError("Amount is outside the supported range.")
	return amount


def clean_date(value: Any) -> str:
	try:
		return date.fromisoformat(str(value)).isoformat()
	except (TypeError, ValueError):
		raise ValueError("Enter a valid transaction date.") from None


def clean_datetime(value: Any) -> str | None:
	if not value:
		return None
	try:
		parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
		if parsed.tzinfo is None:
			parsed = parsed.replace(tzinfo=timezone.utc)
		return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")
	except (TypeError, ValueError):
		raise ValueError("Enter a valid submission timestamp.") from None


def amortizing_emi(balance: float, annual_rate: float, months: int) -> float:
	monthly_rate = annual_rate / 1200
	if monthly_rate == 0:
		return balance / months
	return balance * monthly_rate * (1 + monthly_rate) ** months / ((1 + monthly_rate) ** months - 1)


def validate_plan(data: Any) -> dict[str, Any]:
	if not isinstance(data, dict):
		raise ValueError("Plan must be an object.")
	result: dict[str, Any] = {"incomes": [], "expenses": [], "savings": 0, "goals": [], "loans": []}
	result["savings"] = clean_amount(data.get("savings", 0))
	for key, categories in (("incomes", INCOME_CATEGORIES), ("expenses", EXPENSE_CATEGORIES)):
		items = data.get(key, [])
		if not isinstance(items, list) or len(items) > 500:
			raise ValueError("Add up to 500 categorized monthly entries per group.")
		for item in items:
			if not isinstance(item, dict) or item.get("category") not in categories:
				raise ValueError("Choose a category from the list.")
			result[key].append({
				"id": str(item.get("id", ""))[:80],
				"category": item["category"],
				"amount": clean_amount(item.get("amount", 0), allow_zero=False),
				"note": str(item.get("note", "")).strip()[:80],
				"date": clean_date(item.get("date", date.today().isoformat())),
				"createdAt": clean_datetime(item.get("createdAt")),
			})
	goals = data.get("goals", [])
	if not isinstance(goals, list) or len(goals) > 100:
		raise ValueError("Add up to 100 savings goals to a plan.")
	for goal in goals:
		if not isinstance(goal, dict):
			raise ValueError("Check the savings goal details.")
		goal_id = str(goal.get("id", ""))[:80]
		goal_name = " ".join(str(goal.get("name", "")).split())[:80]
		goal_due = clean_date(goal.get("dueDate", date.today().isoformat()))
		if not goal_id or not goal_name:
			raise ValueError("Every savings goal needs a name.")
		contributions = goal.get("contributions", [])
		if not isinstance(contributions, list) or len(contributions) > 1000:
			raise ValueError("A goal can have up to 1,000 dated contributions.")
		cleaned_contributions = []
		for contribution in contributions:
			if not isinstance(contribution, dict):
				raise ValueError("Check the dated goal contribution.")
			cleaned_contributions.append({
				"id": str(contribution.get("id", ""))[:80],
				"amount": clean_amount(contribution.get("amount", 0), allow_zero=False),
				"date": clean_date(contribution.get("date", date.today().isoformat())),
					"createdAt": clean_datetime(contribution.get("createdAt")),
				"note": str(contribution.get("note", "")).strip()[:80],
			})
		result["goals"].append({
			"id": goal_id,
			"name": goal_name,
			"target": clean_amount(goal.get("target", 0), allow_zero=False),
			"dueDate": goal_due,
			"contributions": cleaned_contributions,
		})
	loans = data.get("loans", [])
	if not isinstance(loans, list) or len(loans) > 100:
		raise ValueError("Add up to 100 loans to a plan.")
	seen_ids: set[str] = set()
	for loan in loans:
		if not isinstance(loan, dict) or loan.get("type") not in LOAN_TYPES:
			raise ValueError("Choose a loan type from the list.")
		loan_id = str(loan.get("id", ""))[:80]
		name = " ".join(str(loan.get("name", "")).split())[:80]
		if not loan_id or loan_id in seen_ids or not name:
			raise ValueError("Every loan needs a unique ID and a name.")
		seen_ids.add(loan_id)
		months = int(loan.get("months", 0))
		rate = clean_amount(loan.get("rate", 0))
		if not 1 <= months <= 600 or rate > 100:
			raise ValueError("Check the interest rate and remaining term.")
		outstanding = clean_amount(loan.get("outstanding", 0), allow_zero=False)
		principal = clean_amount(loan.get("principal", outstanding), allow_zero=False)
		emi = clean_amount(loan.get("emi", 0), allow_zero=False)
		if principal < outstanding:
			raise ValueError("Original loan amount cannot be less than the current outstanding balance.")
		minimum_emi = amortizing_emi(outstanding, rate, months)
		if emi + 0.01 < minimum_emi:
			raise ValueError(f"The EMI does not cover this balance in the remaining term. At this rate, enter at least ₹{minimum_emi:,.2f} per month for {months} months.")
		result["loans"].append({
			"id": loan_id,
			"name": name,
			"type": loan["type"],
			"principal": principal,
			"outstanding": outstanding,
			"emi": emi,
			"rate": rate,
			"months": months,
			"fees": clean_amount(loan.get("fees", 0)),
		})
	return result


@app.route("/api/plan", methods=["GET", "PUT"])
def account_plan():
	if g.current_user is None:
		return jsonify(error="Sign in to access your account plan."), 401
	if request.method == "GET":
		stored = get_db().execute("SELECT data FROM plans WHERE user_id = ?", (g.current_user["id"],)).fetchone()
		plan = json.loads(stored["data"]) if stored else EMPTY_ACCOUNT_PLAN
		return jsonify(plan=plan, csrf_token=csrf_token())
	if not valid_csrf_token(request.headers.get("X-CSRF-Token")):
		return jsonify(error="Invalid security token. Refresh and try again."), 400
	try:
		plan = validate_plan(request.get_json(silent=True))
	except (TypeError, ValueError, OverflowError) as error:
		return jsonify(error=str(error) or "Check the plan entries and try again."), 400
	get_db().execute(
		"INSERT INTO plans (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP",
		(g.current_user["id"], json.dumps(plan, separators=(",", ":"))),
	)
	get_db().commit()
	return jsonify(saved=True)


@app.get("/api/model-info")
@login_required
def model_info():
    """Expose training metrics for transparency; never treat these as a guarantee."""
    import pickle
    model_path = Path(app.root_path) / "preclosure_model.pkl"
    if not model_path.exists():
        return jsonify(available=False, message="Model file not found. Run python train_model.py first."), 404
    try:
        with model_path.open("rb") as file:
            bundle = pickle.load(file)
        return jsonify(available=True, metrics=bundle.get("metrics", {}))
    except (OSError, pickle.PickleError, EOFError, AttributeError, ValueError):
        return jsonify(available=False, message="The saved model could not be loaded. Run python train_model.py again."), 500


@app.post("/api/predict-benefit")
@login_required
def predict_benefit():
    """Predict the dataset's preclosure-benefit target from user-supplied loan variables."""
    import pickle
    import pandas as pd
    model_path = Path(app.root_path) / "preclosure_model.pkl"
    if not model_path.exists():
        return jsonify(error="The model is not trained yet. Run python train_model.py first."), 503
    if not valid_csrf_token(request.headers.get("X-CSRF-Token")):
        return jsonify(error="Invalid security token. Refresh the page and try again."), 400
    payload = request.get_json(silent=True) or {}
    features = [
        "Loan_Type", "Principal_Amount", "Outstanding_Amount", "Monthly_EMI",
        "Annual_Interest_Rate", "Remaining_Tenure_Months", "Monthly_Income",
        "Monthly_Expenses", "Other_EMI_Amount", "Savings", "Preclosure_Charges",
        "Credit_Score",
    ]
    try:
        row = {key: payload[key] for key in features}
        for key in features:
            if key == "Loan_Type":
                if not isinstance(row[key], str) or not row[key].strip():
                    raise ValueError("Choose a loan type.")
            else:
                row[key] = float(row[key])
                if not math.isfinite(row[key]) or row[key] < 0:
                    raise ValueError(f"{key.replace('_', ' ')} must be a valid non-negative number.")
        if row["Remaining_Tenure_Months"] < 1 or row["Remaining_Tenure_Months"] > 600 or row["Credit_Score"] > 900 or row["Annual_Interest_Rate"] > 100:
            raise ValueError("Check the remaining tenure (1–600 months), credit score (0–900), and interest rate (0–100%).")
        if row["Principal_Amount"] < 1:
            raise ValueError("Principal amount must be greater than zero.")
        if row["Principal_Amount"] < row["Outstanding_Amount"]:
            raise ValueError("Principal amount must be at least the outstanding balance.")
        if row["Monthly_EMI"] < 1:
            raise ValueError("Monthly EMI must be greater than zero.")
        if row["Outstanding_Amount"] > row["Principal_Amount"]:
            raise ValueError("Outstanding balance cannot exceed the original principal.")
        with model_path.open("rb") as file:
            bundle = pickle.load(file)
        prediction = float(bundle["model"].predict(pd.DataFrame([row], columns=features))[0])
        prediction = max(0.0, min(100.0, prediction))
        return jsonify(predicted_benefit=round(prediction, 2), metrics=bundle.get("metrics", {}),
                       note="This is a dataset-based benefit score (0–100), not a rupee savings estimate or lender quote. Confirm actual charges and savings with your lender.")
    except KeyError as error:
        return jsonify(error=f"Missing input: {error.args[0]}"), 400
    except (TypeError, ValueError, OverflowError) as error:
        return jsonify(error=str(error) or "Check the supplied values."), 400
    except (OSError, pickle.PickleError, EOFError, AttributeError):
        return jsonify(error="The saved model could not be loaded. Run python train_model.py again."), 500


@app.get("/api/project-data")
@login_required
def project_data():
	import pandas as pd

	data_directory = Path(app.root_path) / "dataset"
	raw = pd.read_csv(data_directory / "emi_preclosure_raw_data.csv")
	results_path = data_directory / "emi_preclosure_analysis_results.csv"
	results = pd.read_csv(results_path) if results_path.exists() else pd.DataFrame()
	grouped = raw.groupby("Loan_Type", dropna=False).agg(
		loan_count=("Loan_ID", "count"),
		outstanding=("Outstanding_Amount", "sum"),
		average_emi=("Monthly_EMI", "mean"),
		average_rate=("Annual_Interest_Rate", "mean"),
		average_benefit=("Preclosure_Benefit", "mean"),
	).reset_index()
	groups = [
		{
			"type": str(row.Loan_Type),
			"count": int(row.loan_count),
			"outstanding": round(float(row.outstanding), 2),
			"average_emi": round(float(row.average_emi), 2),
			"average_rate": round(float(row.average_rate), 3),
			"average_benefit": round(float(row.average_benefit), 2),
		}
		for row in grouped.itertuples(index=False)
	]
	prediction_columns = {"Preclosure_Benefit", "Predicted_Preclosure_Benefit"}
	predictions = []
	median_absolute_error = None
	if prediction_columns.issubset(results.columns):
		joined = results.dropna(subset=list(prediction_columns))
		predictions = [
			{"actual": round(float(row.Preclosure_Benefit), 2), "predicted": round(float(row.Predicted_Preclosure_Benefit), 2), "type": str(row.Loan_Type)}
			for row in joined.itertuples(index=False)
		]
		if len(joined):
			median_absolute_error = round(float((joined["Preclosure_Benefit"] - joined["Predicted_Preclosure_Benefit"]).abs().median()), 2)
	interest_points = raw[["Annual_Interest_Rate", "Preclosure_Benefit", "Loan_Type"]].dropna().to_dict(orient="records")
	return jsonify(
		summary={
			"rows": int(len(raw)),
			"types": int(raw["Loan_Type"].nunique()),
			"positive_rate": round(float((raw["Preclosure_Benefit"] > 0).mean()), 4),
			"median_absolute_error": median_absolute_error,
		},
		groups=groups,
		interest_points=interest_points,
		predictions=predictions,
	)


initialize_database()


if __name__ == "__main__":
	app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=os.environ.get("CLEARPATH_DEBUG", "0") == "1")
