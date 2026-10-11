"""Basic integration checks for the Clearpath Flask app. Run: python -m pytest -q"""
import os
from pathlib import Path

import pytest

import app as clearpath


@pytest.fixture()
def client(tmp_path, monkeypatch):
    database = tmp_path / "test-clearpath.sqlite3"
    monkeypatch.setitem(clearpath.app.config, "DATABASE", str(database))
    clearpath.initialize_database()
    clearpath.app.config.update(TESTING=True, SECRET_KEY="test-only-secret")
    with clearpath.app.test_client() as test_client:
        yield test_client


def signup(client):
    with client.session_transaction() as session:
        token = session.get("csrf_token")
    if not token:
        client.get("/signup")
        with client.session_transaction() as session:
            token = session.get("csrf_token")
    return client.post("/signup", data={
        "csrf_token": token, "name": "Test User",
        "email": "clearpath-test@example.com", "password": "test-password-123"
    }, follow_redirects=True)


def test_home_page_loads(client):
    response = client.get("/")
    assert response.status_code == 200
    assert b"clearpath" in response.data.lower()


def test_signup_and_authenticated_model_info(client):
    response = signup(client)
    assert response.status_code == 200
    assert client.get("/api/model-info").status_code in (200, 404)


def test_predict_requires_csrf(client):
    signup(client)
    response = client.post("/api/predict-benefit", json={})
    assert response.status_code == 400


def test_prediction_returns_score_not_currency(client):
    signup(client)
    model_path = Path(clearpath.app.root_path) / "preclosure_model.pkl"
    if not model_path.exists():
        pytest.skip("Train the model first with python train_model.py")
    with client.session_transaction() as session:
        token = session.get("csrf_token")
    payload = {
        "Loan_Type": "Personal Loan", "Principal_Amount": 250000,
        "Outstanding_Amount": 180000, "Monthly_EMI": 8500,
        "Annual_Interest_Rate": 14, "Remaining_Tenure_Months": 24,
        "Monthly_Income": 45000, "Monthly_Expenses": 18000,
        "Other_EMI_Amount": 2500, "Savings": 50000,
        "Preclosure_Charges": 3000, "Credit_Score": 740
    }
    response = client.post("/api/predict-benefit", json=payload, headers={"X-CSRF-Token": token})
    assert response.status_code == 200
    body = response.get_json()
    assert 0 <= body["predicted_benefit"] <= 100
    assert "not a rupee savings estimate" in body["note"]
