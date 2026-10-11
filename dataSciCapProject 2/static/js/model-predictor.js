(() => {
  const form = document.querySelector('#ml-predict-form');
  if (!form) return;
  const statusText = document.querySelector('#model-status-text');
  const metrics = document.querySelector('#model-metrics');
  const result = document.querySelector('#ml-result');
  const error = document.querySelector('#ml-error');
  const formatScore = (value) => `${Number(value).toFixed(2)} pts`;

  fetch('/api/model-info', {headers:{Accept:'application/json'}})
    .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error || 'Model unavailable'); return data; })
    .then(data => {
      statusText.textContent = 'Saved model ready · trained on project dataset';
      const m = data.metrics || {};
      metrics.innerHTML = `<div><small>HOLDOUT R²</small><strong>${m.r2 ?? '—'}</strong></div><div><small>MAE</small><strong>${m.mae == null ? '—' : formatScore(m.mae)}</strong></div><div><small>RMSE</small><strong>${m.rmse == null ? '—' : formatScore(m.rmse)}</strong></div>`;
    }).catch(() => { statusText.textContent = 'Model file not found · run python train_model.py'; });

  form.addEventListener('submit', async (event) => {
    event.preventDefault(); error.textContent = ''; result.hidden = true;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true; submit.classList.add('is-loading');
    const payload = Object.fromEntries(new FormData(form).entries());
    for (const key of Object.keys(payload)) if (key !== 'Loan_Type') payload[key] = Number(payload[key]);
    try {
      const response = await fetch('/api/predict-benefit', {method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json', 'X-CSRF-Token':document.querySelector('meta[name="csrf-token"]')?.content || ''}, body:JSON.stringify(payload)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Prediction could not be completed.');
      document.querySelector('#ml-result-value').textContent = `${Number(data.predicted_benefit).toFixed(2)} / 100`; 
      document.querySelector('#ml-result-note').textContent = data.note;
      result.hidden = false;
      result.classList.remove('result-pop'); void result.offsetWidth; result.classList.add('result-pop');
    } catch (err) { error.textContent = err.message || 'Something went wrong. Please try again.'; }
    finally { submit.disabled = false; submit.classList.remove('is-loading'); }
  });
})();
