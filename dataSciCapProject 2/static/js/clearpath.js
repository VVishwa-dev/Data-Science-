const planApi = "/api/plan";
const defaultPlan = {
	incomes: [
		{ id: "income-salary", category: "Salary", amount: 150000, note: "Take-home salary" },
		{ id: "income-pocket", category: "Pocket money", amount: 30000, note: "Other monthly income" },
	],
	expenses: [
		{ id: "expense-housing", category: "House", amount: 28000, note: "Housing and rent" },
		{ id: "expense-food", category: "Food", amount: 18000, note: "Groceries and meals" },
		{ id: "expense-transport", category: "Transport", amount: 7000, note: "Commute and travel" },
		{ id: "expense-utilities", category: "Utilities", amount: 9000, note: "Bills and internet" },
		{ id: "expense-health", category: "Health", amount: 3000, note: "Health and care" },
		{ id: "expense-other", category: "Other", amount: 3000, note: "Other essentials" },
	],
	savings: 150000,
	goals: [{ id: "goal-reserve", name: "Build a safety reserve", target: 500000, dueDate: `${new Date().getFullYear() + (new Date().getMonth() > 3 ? 1 : 0)}-04-30`, contributions: [] }],
	loans: [
		{ id: "loan-home", name: "A place of our own", type: "Home loan", principal: 2600000, outstanding: 1800000, emi: 32000, rate: 8.7, months: 84, fees: 12000 },
		{ id: "loan-vehicle", name: "The family car", type: "Vehicle loan", principal: 1200000, outstanding: 900000, emi: 23000, rate: 10.4, months: 48, fees: 16000 },
		{ id: "loan-personal", name: "Personal loan", type: "Personal loan", principal: 900000, outstanding: 900000, emi: 22500, rate: 16.5, months: 60, fees: 8000 },
	],
};
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const preciseCurrency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const accountPage = document.body.dataset.authenticated === "true";
let csrfToken = csrfMeta?.content || "";
let plan = normalizePlan(structuredClone(defaultPlan));
const chartInstances = new Map();
let projectDataset = null;

function blankPlan() {
	return { incomes: [], expenses: [], savings: 0, goals: [], loans: [] };
}

function id() {
	return globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

function setText(selector, value) {
	const element = document.querySelector(selector);
	if (element) element.textContent = value;
}

function localDateString(date = new Date()) {
	const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return offsetDate.toISOString().slice(0, 10);
}

function currentMonthString() {
	return localDateString().slice(0, 7);
}

let selectedMonth = currentMonthString();

function itemsForMonth(items, month = selectedMonth) {
	return items.filter((item) => !item.date || item.date.startsWith(month));
}

function sumEntries(items, month = selectedMonth) {
	return itemsForMonth(items, month).reduce((total, item) => total + Number(item.amount || 0), 0);
}

function monthlyIncome() { return sumEntries(plan.incomes); }
function monthlyExpenses() { return sumEntries(plan.expenses); }
function monthlyEmis() { return plan.loans.reduce((total, loan) => total + Number(loan.emi || 0), 0); }
function goalDepositsForMonth(month = selectedMonth) { return plan.goals.reduce((total, goal) => total + sumEntries(goal.contributions || [], month), 0); }
function monthlySurplus() { return monthlyIncome() - monthlyExpenses() - monthlyEmis() - goalDepositsForMonth(); }
function loanDifference(loan) { return Number(loan.emi) * Number(loan.months) - Number(loan.outstanding) - Number(loan.fees); }
function rankedLoans() { return [...plan.loans].sort((first, second) => loanDifference(second) - loanDifference(first) || Number(second.rate) - Number(first.rate)); }
function formatSignedCurrency(value) { return value > 0 ? `+${currency.format(value)}` : value < 0 ? `−${currency.format(Math.abs(value))}` : currency.format(0); }

function normalizePlan(savedPlan) {
	const normalized = { ...blankPlan(), ...savedPlan };
	const today = localDateString();
	normalized.incomes = normalized.incomes.map((item) => ({ ...item, date: item.date || today }));
	normalized.expenses = normalized.expenses.map((item) => ({ ...item, date: item.date || today }));
	normalized.goals = (normalized.goals || []).map((goal) => ({ ...goal, dueDate: goal.dueDate || today, contributions: (goal.contributions || []).map((item) => ({ ...item, date: item.date || today })) }));
	normalized.loans = normalized.loans.map((loan) => ({ ...loan, principal: Number(loan.principal || loan.outstanding) }));
	return normalized;
}

async function fetchPlan() {
	if (!accountPage) return;
	try {
		const response = await fetch(planApi, { credentials: "same-origin" });
		if (!response.ok) throw new Error("Your account plan could not be loaded.");
		const payload = await response.json();
		csrfToken = payload.csrf_token;
		if (csrfMeta) csrfMeta.content = csrfToken;
		plan = normalizePlan(payload.plan);
	} catch (error) {
		console.error(error);
		showFeedback("Your plan could not be loaded. Check that the Clearpath server is running and log in again.");
	}
	renderPlan();
	initializeTrackerControls();
}

let saveChain = Promise.resolve();
function savePlan() {
	if (!accountPage) return Promise.resolve(false);
	const snapshot = JSON.stringify(plan);
	saveChain = saveChain.then(async () => {
		try {
			const response = await fetch(planApi, {
				method: "PUT",
				credentials: "same-origin",
				headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
				body: snapshot,
			});
			if (!response.ok) throw new Error("Your changes could not be saved.");
			return true;
		} catch (error) {
			console.error(error);
			showFeedback("Your changes couldn't be saved. Refresh and try again.");
			return false;
		}
	});
	return saveChain;
}

function showFeedback(message) {
	const feedback = document.querySelector("#entry-feedback, #loan-feedback");
	if (feedback) feedback.textContent = message;
}

function setActivePage() {
	document.querySelectorAll("[data-page-link]").forEach((link) => {
		if (link.dataset.pageLink === document.body.dataset.page) link.setAttribute("aria-current", "page");
	});
}

function renderTransactionList(type) {
	const container = document.querySelector(`#${type}-entries`);
	if (!container) return;
	const entries = itemsForMonth(plan[type]).sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")));
	 container.innerHTML = entries.length ? entries.map((entry) => `<article class="entry-item"><span class="entry-category-mark" aria-hidden="true">${type === "incomes" ? "↗" : "↘"}</span><span class="entry-description"><strong>${escapeHtml(entry.category)}</strong><small>${escapeHtml(entry.note || "Monthly entry")} · <time datetime="${escapeHtml(entry.date)}">${formatDate(entry.date)}</time></small></span><strong class="entry-amount">${currency.format(entry.amount)}</strong><button class="icon-action delete" type="button" data-delete-entry="${type}:${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.category)} entry">×</button></article>`).join("") : `<p class="entry-empty">No ${type} entries for ${escapeHtml(selectedMonth)} yet.</p>`;
}

function formatDate(value, options = { day: "numeric", month: "short", year: "numeric" }) {
	const parsed = new Date(`${value}T12:00:00`);
	return Number.isNaN(parsed.getTime()) ? String(value || "") : parsed.toLocaleDateString("en-IN", options);
}

function formatLoggedAt(value) {
	if (!value) return "Earlier entry";
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? "Earlier entry" : `Logged ${parsed.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
}

function renderTrackerLedger() {
	const list = document.querySelector("#tracker-ledger-list");
	if (!list) return;
	const entries = [
		...itemsForMonth(plan.incomes).map((item) => ({ ...item, kind: "income" })),
		...itemsForMonth(plan.expenses).map((item) => ({ ...item, kind: "expense" })),
	].sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")));
	setText("#tracker-entry-count", `${entries.length} ${entries.length === 1 ? "ENTRY" : "ENTRIES"}`);
	setText("#tracker-income-count", `${itemsForMonth(plan.incomes).length} ${itemsForMonth(plan.incomes).length === 1 ? "entry" : "entries"} this month`);
	setText("#tracker-expense-count", `${itemsForMonth(plan.expenses).length} ${itemsForMonth(plan.expenses).length === 1 ? "entry" : "entries"} this month`);
	list.innerHTML = entries.length ? entries.map((item) => `<article class="tracker-ledger-row ${item.kind}"><time datetime="${escapeHtml(item.date)}"><strong>${formatDate(item.date, { day: "numeric" })}</strong><small>${formatDate(item.date, { month: "short", year: "numeric" })}</small></time><span class="ledger-direction" aria-hidden="true">${item.kind === "income" ? "↗" : "↘"}</span><span class="entry-description"><strong>${escapeHtml(item.category)}</strong><small>${escapeHtml(item.note || (item.kind === "income" ? "Income" : "Expense"))}<span class="entry-recorded">${formatLoggedAt(item.createdAt)}</span></small></span><strong class="entry-amount">${item.kind === "income" ? "+" : "−"}${currency.format(item.amount)}</strong><button class="icon-action delete" type="button" data-delete-entry="${item.kind === "income" ? "incomes" : "expenses"}:${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.category)} entry from ${formatDate(item.date)}">×</button></article>`).join("") : '<p class="tracker-empty">No entries in this month yet. Log your first income or expense above.</p>';
}

function renderGoalCards() {
	const container = document.querySelector("#goal-cards");
	if (!container) return;
	setText("#goal-count", `${String(plan.goals.length).padStart(2, "0")} ${plan.goals.length === 1 ? "GOAL" : "GOALS"}`);
	if (!plan.goals.length) {
		container.innerHTML = '<div class="empty-loans goal-empty">No goals yet.<br>Choose a target, set a date, and log deposits as they happen.</div>';
		return;
	}
	container.innerHTML = plan.goals.map((goal, index) => {
		const saved = goal.contributions.reduce((total, item) => total + Number(item.amount), 0);
		const remaining = Math.max(0, goal.target - saved);
		const percent = goal.target > 0 ? Math.min(100, saved / goal.target * 100) : 0;
		const dueIn = Math.ceil((new Date(`${goal.dueDate}T12:00:00`) - new Date(`${localDateString()}T12:00:00`)) / 86400000);
		const recentDate = new Date();
		recentDate.setMonth(recentDate.getMonth() - 3);
		const recent = goal.contributions.filter((item) => new Date(`${item.date}T12:00:00`) >= recentDate);
		const monthlyPace = recent.reduce((total, item) => total + Number(item.amount), 0) / 3;
		const projectedDate = monthlyPace > 0 && remaining > 0 ? new Date(Date.now() + Math.ceil(remaining / monthlyPace) * 30.44 * 86400000) : null;
		const pace = saved >= goal.target ? "Target reached" : monthlyPace > 0 ? `At this pace · ${formatDate(localDateString(projectedDate), { month: "short", year: "numeric" })}` : "Log a deposit to estimate your pace";
		const history = [...goal.contributions].sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")));
		return `<article class="goal-card panel" style="animation-delay:${index * 80}ms"><div class="goal-card-heading"><div><span class="calculator-kicker">TARGET DATE · ${formatDate(goal.dueDate)}</span><h3>${escapeHtml(goal.name)}</h3></div><button class="icon-action delete" type="button" data-delete-goal="${escapeHtml(goal.id)}" aria-label="Remove ${escapeHtml(goal.name)}">×</button></div><div class="goal-progress-label"><strong>${currency.format(saved)}</strong><span>of ${currency.format(goal.target)}</span><b>${percent.toFixed(0)}%</b></div><div class="goal-track" role="img" aria-label="${escapeHtml(goal.name)} is ${percent.toFixed(0)} percent funded"><span style="--goal-progress:${percent}%"></span></div><div class="goal-meta"><span>${currency.format(remaining)} to go</span><span>${dueIn < 0 ? `${Math.abs(dueIn)} days past target` : `${dueIn} days remaining`}</span></div><p class="goal-projection">${escapeHtml(pace)}</p><form class="goal-contribution-form" data-goal-contribution="${escapeHtml(goal.id)}"><label class="visually-hidden" for="goal-deposit-${escapeHtml(goal.id)}">Deposit amount</label><span class="input-wrap"><span aria-hidden="true">₹</span><input id="goal-deposit-${escapeHtml(goal.id)}" name="amount" type="number" min="1" step="1" placeholder="Add a deposit" required></span><label class="visually-hidden" for="goal-deposit-date-${escapeHtml(goal.id)}">Deposit date</label><input class="plain-input" id="goal-deposit-date-${escapeHtml(goal.id)}" name="date" type="date" value="${localDateString()}" required><button class="button button-dark" type="submit" aria-label="Add a dated deposit to ${escapeHtml(goal.name)}">＋</button></form><details class="goal-history"><summary>${history.length} dated ${history.length === 1 ? "deposit" : "deposits"}</summary>${history.length ? `<ul>${history.map((item) => `<li><time datetime="${escapeHtml(item.date)}">${formatDate(item.date)}</time><span>${escapeHtml(item.note || "Deposit")}<small class="entry-recorded">${formatLoggedAt(item.createdAt)}</small></span><strong>${currency.format(item.amount)}</strong></li>`).join("")}</ul>` : "<p>No deposits logged yet.</p>"}</details></article>`;
	}).join("");
}

function renderLoanCards() {
	const container = document.querySelector("#loan-cards");
	if (!container) return;
	if (!plan.loans.length) {
		container.innerHTML = '<div class="empty-loans">Your plan is clear for now.<br>Add a loan to see its monthly payment and payoff comparison here.</div>';
		return;
	}
	container.innerHTML = plan.loans.map((loan, index) => `<article class="managed-loan" style="animation-delay:${index * 60}ms"><div class="managed-loan-name"><strong>${escapeHtml(loan.name)}</strong><small>${escapeHtml(loan.type)} · ${Number(loan.rate).toFixed(2)}% p.a. · Original ${currency.format(loan.principal || loan.outstanding)}</small></div><div class="loan-mini-metric"><span>OUTSTANDING</span><strong>${currency.format(loan.outstanding)}</strong></div><div class="loan-mini-metric"><span>MONTHLY EMI</span><strong>${currency.format(loan.emi)}</strong></div><div class="loan-mini-metric"><span>EST. DIFFERENCE</span><strong class="${loanDifference(loan) < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(loanDifference(loan))}</strong></div><div class="loan-actions"><button class="icon-action" type="button" data-edit-loan="${escapeHtml(loan.id)}" aria-label="Edit ${escapeHtml(loan.name)}" title="Edit loan">✎</button><button class="icon-action delete" type="button" data-delete-loan="${escapeHtml(loan.id)}" aria-label="Remove ${escapeHtml(loan.name)}" title="Remove loan">×</button></div></article>`).join("");
}

function renderDashboardTable() {
	const rows = document.querySelector("#dashboard-loans");
	const mobileRows = document.querySelector("#mobile-dashboard-loans");
	const chart = document.querySelector("#priority-chart");
	if (!rows || !mobileRows || !chart) return;
	const sorted = rankedLoans();
	if (!sorted.length) {
		chart.innerHTML = '<p class="empty-loans">Your payoff comparison will appear once you add a loan.</p>';
		chart.setAttribute("aria-label", "No loan payoff comparison yet. This account can be used as a daily expense tracker.");
		rows.innerHTML = '<tr><td colspan="6">No loans yet. Add one in Analyzer to see a comparison.</td></tr>';
		mobileRows.innerHTML = "";
		document.querySelector(".priority-tip")?.remove();
		return;
	}
	const largest = Math.max(...sorted.map((loan) => Math.abs(loanDifference(loan))), 1);
	chart.innerHTML = sorted.map((loan, index) => {
		const difference = loanDifference(loan);
		return `<div class="chart-row"><span class="chart-name" title="${escapeHtml(loan.name)}">${escapeHtml(loan.name)}</span><span class="chart-track"><span class="chart-fill${difference < 0 ? " is-negative" : ""}" style="--bar-width:${Math.max(Math.abs(difference) / largest * 100, 2)}%;--bar-delay:${index * 90}ms"></span></span><span class="chart-value ${difference < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(difference)}</span></div>`;
	}).join("");
	chart.setAttribute("aria-label", `Estimated payment differences: ${sorted.map((loan) => `${loan.name} ${formatSignedCurrency(loanDifference(loan))}`).join(", ")}`);
	let tip = document.querySelector(".priority-tip");
	if (!tip) {
		tip = document.createElement("div");
		tip.className = "priority-tip";
		document.querySelector("#priority-list")?.append(tip);
	}
	const firstPositive = sorted.find((loan) => loanDifference(loan) > 0);
	tip.innerHTML = firstPositive
		? `<span aria-hidden="true">↗</span><p><strong>${escapeHtml(firstPositive.name)}</strong> has the largest estimated difference: ${currency.format(loanDifference(firstPositive))}. Ask the lender for today's settlement quote before acting.</p>`
		: '<span aria-hidden="true">!</span><p>None of the entered loans shows a positive difference. Confirm current settlement figures before prioritizing a payoff.</p>';
	rows.innerHTML = sorted.map((loan, index) => {
		const difference = loanDifference(loan);
		return `<tr><td>${escapeHtml(loan.name)}<span class="loan-type-label">${escapeHtml(loan.type)}</span></td><td>${Number(loan.rate).toFixed(2)}%</td><td>${currency.format(loan.emi)}</td><td>${currency.format(loan.outstanding)}</td><td class="${difference < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(difference)}</td><td><span class="rank-chip${difference < 0 ? " rank-later" : ""}">${difference > 0 ? `#${index + 1}` : "Review"}</span></td></tr>`;
	}).join("");
	mobileRows.innerHTML = sorted.map((loan, index) => {
		const difference = loanDifference(loan);
		return `<article class="mobile-loan-row"><strong>${escapeHtml(loan.name)}</strong><span>${escapeHtml(loan.type)} · ${Number(loan.rate).toFixed(2)}%</span><span>${currency.format(loan.emi)}/mo · ${currency.format(loan.outstanding)} left</span><b class="${difference < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(difference)} difference <i>${difference > 0 ? `#${index + 1}` : "Review"}</i></b></article>`;
	}).join("");
}

const chartColors = ["#693ca5", "#f287a0", "#f2c570", "#8adbd9", "#956ac7", "#7682ba", "#dfa06e", "#c9db73"];
function destroyChart(key) {
	if (!chartInstances.has(key)) return;
	chartInstances.get(key).destroy();
	chartInstances.delete(key);
}

function drawDoughnut(canvasId, key, items, type) {
	const canvas = document.querySelector(`#${canvasId}`);
	if (!canvas || !window.Chart) return;
	destroyChart(key);
	const totals = new Map();
	itemsForMonth(items).forEach((item) => totals.set(item.category, (totals.get(item.category) || 0) + Number(item.amount)));
	const pairs = [...totals.entries()].filter(([, amount]) => amount > 0);
	chartInstances.set(key, new Chart(canvas, {
		type: "doughnut",
		data: { labels: pairs.length ? pairs.map(([label]) => label) : ["No entries yet"], datasets: [{ data: pairs.length ? pairs.map(([, amount]) => amount) : [1], backgroundColor: pairs.length ? chartColors : ["#e8e9dd"], borderColor: "#f8f7f0", borderWidth: 3, hoverOffset: 8 }] },
		options: { responsive: true, maintainAspectRatio: false, cutout: "66%", animation: { animateRotate: true, duration: 1050, easing: "easeOutQuart" }, plugins: { legend: { position: "right", labels: { color: getComputedStyle(document.body).getPropertyValue("--ink").trim(), usePointStyle: true, pointStyle: "circle", boxWidth: 7, padding: 13, font: { family: "DM Sans", size: 10 } } }, tooltip: { callbacks: { label: (context) => `${context.label}: ${currency.format(context.parsed)}` } } } },
	}));
	canvas.setAttribute("aria-label", `${type} by category: ${pairs.map(([label, amount]) => `${label}, ${currency.format(amount)}`).join("; ") || "no entries"}`);
}

function drawCategoryCharts() {
	drawDoughnut("expense-chart", "expense", plan.expenses, "Monthly expenses");
	drawDoughnut("income-chart", "income", plan.incomes, "Monthly income");
	drawDoughnut("tracker-expense-chart", "tracker-expense", plan.expenses, "Monthly spending");
	drawDoughnut("tracker-income-chart", "tracker-income", plan.incomes, "Monthly income");
	setText("#tracker-expense-chart-month", selectedMonth);
	setText("#tracker-income-chart-month", selectedMonth);
}

function updateMetrics() {
	const income = monthlyIncome();
	const expenses = monthlyExpenses();
	const emis = monthlyEmis();
	const goalDeposits = goalDepositsForMonth();
	const surplus = income - expenses - emis - goalDeposits;
	setText("#home-loan-count", String(plan.loans.length));
	setText("#home-income", currency.format(income));
	setText("#home-surplus", currency.format(surplus));
	setText("#dash-loan-count", String(plan.loans.length));
	setText("#dash-emis", currency.format(emis));
	setText("#dash-surplus", currency.format(surplus));
	setText("#dash-outstanding", currency.format(plan.loans.reduce((total, loan) => total + Number(loan.outstanding), 0)));
	setText("#dash-dti", `${income ? Math.round(emis / income * 100) : 0}% of take-home income`);
	setText("#dash-surplus-note", surplus < 0 ? "Monthly gap after expenses, EMIs and goals" : "After expenses, EMIs and goal deposits");
	setText("#cashflow-income", currency.format(income));
	setText("#cashflow-expenses-value", currency.format(expenses));
	setText("#cashflow-emis-value", currency.format(emis));
	setText("#cashflow-goals-value", currency.format(goalDepositsForMonth()));
	setText("#cashflow-surplus-value", currency.format(Math.abs(surplus)));
	setText("#cashflow-surplus-label", surplus < 0 ? "Monthly gap" : "Room to breathe");
	setText("#cashflow-note", surplus < 0 ? "Entered spending, loan EMIs, and goal deposits exceed income. Review the plan before considering extra repayments." : `${currency.format(goalDeposits)} is already assigned to goals this month. Available savings remain separate from goal balances.`);
	setText("#income-total", currency.format(income));
	setText("#expense-total", currency.format(expenses));
	setText("#manager-count", `${String(plan.loans.length).padStart(2, "0")} ${plan.loans.length === 1 ? "LOAN" : "LOANS"}`);
	const graph = document.querySelector("#cashflow-track");
	if (graph) {
		let goalSegment = graph.querySelector(".cashflow-goals");
		if (!goalSegment) {
			goalSegment = document.createElement("span");
			goalSegment.className = "cashflow-goals";
			graph.insertBefore(goalSegment, graph.querySelector(".cashflow-surplus"));
		}
		const legend = document.querySelector(".cashflow-legend");
		if (legend && !legend.querySelector(".legend-goal")) {
			const goalLegend = document.createElement("span");
			goalLegend.innerHTML = '<i class="legend-goal"></i><span>Goal deposits</span><b id="cashflow-goals-value"></b>';
			legend.append(goalLegend);
		}
		setText("#cashflow-goals-value", currency.format(goalDeposits));
		const totalOutflow = expenses + emis + goalDeposits;
		const scale = Math.max(income, totalOutflow, 1);
		graph.querySelector(".cashflow-expenses").style.setProperty("--share", `${expenses / scale * 100}%`);
		graph.querySelector(".cashflow-emis").style.setProperty("--share", `${emis / scale * 100}%`);
		goalSegment.style.setProperty("--share", `${goalDeposits / scale * 100}%`);
		graph.querySelector(".cashflow-surplus").style.setProperty("--share", `${Math.max(surplus, 0) / scale * 100}%`);
		graph.querySelector(".cashflow-surplus").classList.toggle("is-deficit", surplus < 0);
		document.querySelector(".cashflow-note")?.classList.toggle("is-deficit", surplus < 0);
		graph.setAttribute("aria-label", `Monthly income ${currency.format(income)}, expenses ${currency.format(expenses)}, loan EMIs ${currency.format(emis)}, goal deposits ${currency.format(goalDeposits)}, ${surplus < 0 ? "monthly gap" : "remaining"} ${currency.format(Math.abs(surplus))}`);
	}
	setText("#tracker-income-total", currency.format(income));
	setText("#tracker-expense-total", currency.format(expenses));
	setText("#tracker-emis-total", currency.format(emis));
	setText("#tracker-loan-count", `${plan.loans.length} ${plan.loans.length === 1 ? "loan" : "loans"} in this plan`);
	setText("#tracker-free-cash", currency.format(surplus));
	setText("#tracker-income-form-total", currency.format(income));
	setText("#tracker-expense-form-total", currency.format(expenses));
}

function renderPlan() {
	updateMetrics();
	renderTransactionList("incomes");
	renderTransactionList("expenses");
	renderTrackerLedger();
	renderGoalCards();
	renderLoanCards();
	renderDashboardTable();
	renderReportLoanOptions();
	drawCategoryCharts();
}

function renderReportLoanOptions() {
	const select = document.querySelector("#report-loan");
	if (!select) return;
	const previous = select.value;
	select.innerHTML = '<option value="">Budget only · no loan selected</option>' + rankedLoans().map((loan) => `<option value="${escapeHtml(loan.id)}">${escapeHtml(loan.name)} · ${currency.format(loan.outstanding)} left</option>`).join("");
	if (plan.loans.some((loan) => loan.id === previous)) select.value = previous;
}

function estimatePayoffMonths(loan, cashAvailable, monthlyContribution) {
	const closeAmount = Number(loan.outstanding) + Number(loan.fees);
	let balance = Math.max(0, closeAmount - cashAvailable);
	if (!balance) return { months: 0, interest: 0 };
	const monthlyRate = Number(loan.rate) / 1200;
	if (monthlyContribution <= balance * monthlyRate) return null;
	let interestPaid = 0;
	for (let months = 1; months <= 1200 && balance > 0; months += 1) {
		const interest = balance * monthlyRate;
		interestPaid += interest;
		balance = Math.max(0, balance + interest - monthlyContribution);
		if (!balance) return { months, interest: interestPaid };
	}
	return null;
}

function initializeTrackerControls() {
	if (!document.querySelector("#tracker-month")) return;
	const monthPicker = document.querySelector("#tracker-month");
	monthPicker.value = selectedMonth;
	const today = localDateString();
	document.querySelectorAll("#income-date, #expense-date, #goal-starting-date").forEach((input) => {
		if (input && !input.value) input.value = today;
	});
	const dueDate = document.querySelector("#goal-due");
	if (dueDate && !dueDate.value) {
		const target = new Date();
		target.setFullYear(target.getFullYear() + 1);
		dueDate.value = localDateString(target);
	}
	const savingInput = document.querySelector("#report-monthly-save");
	if (savingInput && Number(savingInput.value) === 0) savingInput.value = String(Math.max(0, monthlySurplus()));
	const cashInput = document.querySelector("#report-current-savings");
	if (cashInput) cashInput.value = String(plan.savings || 0);
	monthPicker.addEventListener("change", () => {
		selectedMonth = monthPicker.value || currentMonthString();
		const defaultDate = `${selectedMonth}-01`;
		document.querySelectorAll("#income-date, #expense-date").forEach((input) => { input.value = defaultDate; });
		renderPlan();
	});
}

function buildMonthlyReport() {
	const income = monthlyIncome();
	const expenses = monthlyExpenses();
	const emis = monthlyEmis();
	const goalDeposits = goalDepositsForMonth();
	const freeCash = income - expenses - emis - goalDeposits;
	const loanId = document.querySelector("#report-loan")?.value;
	const loan = plan.loans.find((item) => item.id === loanId);
	const extraSaving = Number(document.querySelector("#report-monthly-save")?.value || 0);
	const availableCash = Number(document.querySelector("#report-current-savings")?.value || 0);
	plan.savings = availableCash;
	savePlan();
	setText("#report-generated-date", `${formatDate(localDateString())} · ${formatDate(`${selectedMonth}-01`, { month: "long", year: "numeric" })}`);
	const equation = document.querySelector("#report-equation");
	if (equation) equation.innerHTML = `<span><small>INCOME</small><strong>${currency.format(income)}</strong></span><b>−</b><span><small>SPENDING</small><strong>${currency.format(expenses)}</strong></span><b>−</b><span><small>LOAN EMIS</small><strong>${currency.format(emis)}</strong></span><b>−</b><span><small>GOAL DEPOSITS</small><strong>${currency.format(goalDeposits)}</strong></span><b>=</b><span class="equation-result ${freeCash < 0 ? "is-negative" : ""}"><small>${freeCash < 0 ? "MONTHLY GAP" : "LEFT THIS MONTH"}</small><strong>${formatSignedCurrency(freeCash)}</strong></span>`;
	const story = document.querySelector("#report-story");
	if (story) {
		if (!loan) {
			story.innerHTML = `<strong>${freeCash < 0 ? "Your outflow is above income." : plan.loans.length ? "Your monthly buffer is mapped." : "A clear budget does not need a loan."}</strong><span>${freeCash < 0 ? `Review the ${currency.format(Math.abs(freeCash))} monthly gap before committing to extra saving.` : `${currency.format(Math.max(0, freeCash))} remains after recorded spending, ${plan.loans.length ? "loan EMIs, and goal deposits" : "and goal deposits"}. Your Tracker works with zero loans; goal contributions and daily records are still included.`}</span>`;
		} else {
			const minimum = calculateLoanPayment(loan.outstanding, loan.rate, loan.months);
			const remainingPayments = loan.emi * loan.months;
			const payoffMonths = estimatePayoffMonths(loan, availableCash, extraSaving);
			const savedDifference = loanDifference(loan);
			const overBudgetSaving = Math.max(0, extraSaving - Math.max(0, freeCash));
			const budgetWarning = overBudgetSaving > 0 ? ` Warning: this set-aside is ${currency.format(overBudgetSaving)} above this month's available cash and would create a shortfall.` : "";
			const monthLabel = payoffMonths ? new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(new Date().getFullYear(), new Date().getMonth() + payoffMonths.months, 1)) : "not reached at this monthly amount";
			story.innerHTML = `<strong>${escapeHtml(loan.name)} · payoff scenario</strong><span>At ${Number(loan.rate).toFixed(2)}% p.a., the current ${currency.format(loan.emi)} EMI is ${loan.emi + .01 < minimum ? "below" : "consistent with"} an estimated ${preciseCurrency.format(minimum)} amortizing payment for the stated balance and term. Saving ${currency.format(extraSaving)} monthly with ${currency.format(availableCash)} available cash could cover the entered payoff amount in ${payoffMonths ? `${payoffMonths.months} month${payoffMonths.months === 1 ? "" : "s"} (around ${monthLabel}), including about ${currency.format(payoffMonths.interest)} projected interest` : monthLabel}. The scheduled-payment comparison is ${formatSignedCurrency(savedDifference)} before lender-specific terms.${budgetWarning}</span>`;
		}
	}
	const categories = document.querySelector("#report-breakdown");
	if (categories) {
		const groups = [
			["Income", itemsForMonth(plan.incomes)],
			["Spending", itemsForMonth(plan.expenses)],
			["Goal deposits", plan.goals.flatMap((goal) => itemsForMonth(goal.contributions || []).map((item) => ({ ...item, category: goal.name })))],
		];
		const sections = groups.map(([title, items]) => {
			const totals = [...items.reduce((map, item) => map.set(item.category, (map.get(item.category) || 0) + Number(item.amount)), new Map())].sort((first, second) => second[1] - first[1]);
			return `<section><span>${title}</span>${totals.length ? totals.map(([category, amount]) => `<div><small>${escapeHtml(category)}</small><b>${currency.format(amount)}</b></div>`).join("") : "<small>No entries this month</small>"}</section>`;
		}).join("");
		categories.innerHTML = `${sections}${loan ? `<section><span>Selected loan</span><div><small>Original principal</small><b>${currency.format(loan.principal || loan.outstanding)}</b></div><div><small>Current balance</small><b>${currency.format(loan.outstanding)}</b></div><div><small>EMI / remaining term</small><b>${currency.format(loan.emi)} × ${loan.months}</b></div><div><small>Balance + closure fee</small><b>${currency.format(loan.outstanding + loan.fees)}</b></div></section>` : `<section><span>Loan commitments</span><div><small>Active loans</small><b>${plan.loans.length}</b></div><div><small>Monthly EMI total</small><b>${currency.format(emis)}</b></div></section>`}`;
	}
	const report = document.querySelector("#analysis-report");
	if (report) {
		report.hidden = false;
		report.scrollIntoView({ behavior: "smooth", block: "nearest" });
	}
}

function drawDatasetCharts(data) {
	projectDataset = data;
	const summary = data.summary;
	setText("#data-record-count", summary.rows.toLocaleString("en-IN"));
	setText("#data-type-count", String(summary.types));
	setText("#data-positive-rate", `${(summary.positive_rate * 100).toFixed(1)}%`);
	setText("#data-median-error", summary.median_absolute_error === null ? "N/A" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(summary.median_absolute_error));
	if (!window.Chart) {
		setText("#dataset-insight", "Chart.js could not load. Check your internet connection to view the interactive charts.");
		return;
	}
	const groups = data.groups;
	chartInstances.set("dataset-types", new Chart(document.querySelector("#dataset-type-chart"), {
		type: "doughnut",
		data: { labels: groups.map((item) => item.type), datasets: [{ data: groups.map((item) => item.count), backgroundColor: chartColors, borderColor: "#f8f7f0", borderWidth: 3, hoverOffset: 8 }] },
		options: { responsive: true, maintainAspectRatio: false, cutout: "58%", animation: { animateRotate: true, duration: 1100 }, plugins: { legend: { position: "right", labels: { usePointStyle: true, boxWidth: 7, padding: 13, font: { family: "DM Sans", size: 10 } } }, tooltip: { callbacks: { label: (context) => `${context.label}: ${context.parsed} loans` } } } },
	}));
	chartInstances.set("dataset-benefits", new Chart(document.querySelector("#dataset-benefit-chart"), {
		type: "bar",
		data: { labels: groups.map((item) => item.type), datasets: [{ label: "Mean preclosure benefit", data: groups.map((item) => item.average_benefit), backgroundColor: groups.map((_, index) => chartColors[index % chartColors.length]), borderRadius: 2 }] },
		options: { responsive: true, maintainAspectRatio: false, animation: { duration: 1000, easing: "easeOutQuart" }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `Mean: ${currency.format(context.parsed.y)}` } } }, scales: { x: { ticks: { maxRotation: 35, minRotation: 0, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { callback: (value) => currency.format(value), font: { size: 8 } }, grid: { color: "rgba(25,39,32,.09)" } } } },
	}));
	const types = [...new Set(data.predictions.map((item) => item.type))];
	const predictionCanvas = document.querySelector("#dataset-prediction-chart");
	if (data.predictions.length) {
		chartInstances.set("dataset-predictions", new Chart(predictionCanvas, {
			type: "scatter",
			data: { datasets: [
				...types.map((type, index) => ({ label: type, data: data.predictions.filter((item) => item.type === type).map((item) => ({ x: item.actual, y: item.predicted })), backgroundColor: chartColors[index % chartColors.length], pointRadius: 4, pointHoverRadius: 6 })),
				{ label: "Perfect prediction", data: [{ x: data.predictions.reduce((minimum, point) => Math.min(minimum, point.actual, point.predicted), Infinity), y: data.predictions.reduce((minimum, point) => Math.min(minimum, point.actual, point.predicted), Infinity) }, { x: data.predictions.reduce((maximum, point) => Math.max(maximum, point.actual, point.predicted), -Infinity), y: data.predictions.reduce((maximum, point) => Math.max(maximum, point.actual, point.predicted), -Infinity) }], type: "line", borderColor: "#879188", borderDash: [6, 5], pointRadius: 0, borderWidth: 1 }], },
			options: { responsive: true, maintainAspectRatio: false, animation: { duration: 900 }, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, font: { size: 9 } } }, tooltip: { callbacks: { label: (context) => `${context.dataset.label}: actual ${currency.format(context.parsed.x)}, predicted ${currency.format(context.parsed.y)}` } } }, scales: { x: { title: { display: true, text: "Observed preclosure benefit (₹)" }, ticks: { callback: (value) => currency.format(value), font: { size: 8 } } }, y: { title: { display: true, text: "Predicted preclosure benefit (₹)" }, ticks: { callback: (value) => currency.format(value), font: { size: 8 } } } } },
		}));
	} else {
		predictionCanvas.hidden = true;
		setText("#prediction-chart-note", "Prediction columns are not available in the analysis-results CSV yet.");
	}
	const highestBenefit = [...groups].sort((first, second) => second.average_benefit - first.average_benefit)[0];
	const highestRate = [...groups].sort((first, second) => second.average_rate - first.average_rate)[0];
	setText("#dataset-insight", `${highestBenefit.type} has the highest mean benefit label (${currency.format(highestBenefit.average_benefit)}). ${highestRate.type} has the highest mean annual rate (${highestRate.average_rate.toFixed(2)}%). These are associations in the supplied sample, not causal or personal recommendations.`);
}

async function loadDatasetVisualizations() {
	if (!document.querySelector("#dataset-type-chart")) return;
	try {
		const response = await fetch("/api/project-data", { credentials: "same-origin" });
		if (!response.ok) throw new Error("Could not load the project CSV files.");
		drawDatasetCharts(await response.json());
	} catch (error) {
		console.error(error);
		setText("#dataset-insight", "The project CSV files could not be loaded. Confirm they are present under dataset/ and reload this page.");
	}
}

function setTheme(theme) {
	document.documentElement.dataset.theme = theme;
	const button = document.querySelector("#theme-toggle");
	if (button) {
		const dark = theme === "dark";
		button.textContent = dark ? "☀" : "☾";
		button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
		button.title = dark ? "Switch to light theme" : "Switch to dark theme";
	}
	chartInstances.forEach((chart) => {
		if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = getComputedStyle(document.body).getPropertyValue("--ink").trim();
		chart.update("none");
	});
}

const menuToggle = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-navigation");
menuToggle?.addEventListener("click", () => {
	const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
	menuToggle.setAttribute("aria-expanded", String(!isExpanded));
	menuToggle.setAttribute("aria-label", isExpanded ? "Open menu" : "Close menu");
	navigation?.classList.toggle("is-open", !isExpanded);
});
navigation?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
	menuToggle?.setAttribute("aria-expanded", "false");
	menuToggle?.setAttribute("aria-label", "Open menu");
	navigation?.classList.remove("is-open");
}));
setActivePage();
document.querySelectorAll(".current-year").forEach((year) => { year.textContent = String(new Date().getFullYear()); });

function addEntry(type, form) {
	if (!form.reportValidity()) return;
	const fields = new FormData(form);
	plan[type].push({ id: id(), category: String(fields.get("category")), amount: Number(fields.get("amount")), note: String(fields.get("note") || "").trim(), date: String(fields.get("date") || localDateString()), createdAt: new Date().toISOString() });
	form.reset();
	const dateInput = form.elements.namedItem("date");
	if (dateInput) dateInput.value = localDateString();
	renderPlan();
	savePlan();
	const feedback = document.querySelector("#entry-feedback");
	if (feedback) feedback.textContent = `${type === "incomes" ? "Income" : "Expense"} added to your monthly plan.`;
}

document.querySelector("#income-form")?.addEventListener("submit", (event) => { event.preventDefault(); addEntry("incomes", event.currentTarget); });
document.querySelector("#expense-form")?.addEventListener("submit", (event) => { event.preventDefault(); addEntry("expenses", event.currentTarget); });

document.querySelector("#goal-form")?.addEventListener("submit", (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	if (!form.reportValidity()) return;
	const fields = new FormData(form);
	const starting = Number(fields.get("starting") || 0);
	const contributions = starting > 0 ? [{ id: id(), amount: starting, date: String(fields.get("startingDate")), createdAt: new Date().toISOString(), note: "Already saved" }] : [];
	plan.goals.push({ id: id(), name: String(fields.get("name")).trim(), target: Number(fields.get("target")), dueDate: String(fields.get("dueDate")), contributions });
	form.reset();
	const dateField = form.elements.namedItem("startingDate");
	if (dateField) dateField.value = localDateString();
	const startingField = form.elements.namedItem("starting");
	if (startingField) startingField.value = "0";
	renderPlan();
	savePlan();
	showFeedback("Your goal meter is live. Add dated deposits as you save.");
});

document.querySelector("#goal-cards")?.addEventListener("submit", (event) => {
	const form = event.target.closest("[data-goal-contribution]");
	if (!form) return;
	event.preventDefault();
	if (!form.reportValidity()) return;
	const fields = new FormData(form);
	const goal = plan.goals.find((item) => item.id === form.dataset.goalContribution);
	if (!goal) return;
	goal.contributions.push({ id: id(), amount: Number(fields.get("amount")), date: String(fields.get("date")), createdAt: new Date().toISOString(), note: "Goal deposit" });
	renderPlan();
	savePlan();
	showFeedback(`Deposit added to ${goal.name}.`);
});

document.querySelector("#goal-cards")?.addEventListener("click", (event) => {
	const button = event.target.closest("[data-delete-goal]");
	if (!button) return;
	plan.goals = plan.goals.filter((goal) => goal.id !== button.dataset.deleteGoal);
	renderPlan();
	savePlan();
});

document.querySelector("#analyze-plan")?.addEventListener("click", buildMonthlyReport);
document.querySelector("#report-current-savings")?.addEventListener("change", (event) => {
	plan.savings = Math.max(0, Number(event.currentTarget.value));
	savePlan();
});

document.querySelector("#income-entries, #expense-entries")?.addEventListener("click", (event) => {
	const button = event.target.closest("[data-delete-entry]");
	if (!button) return;
	const [type, entryId] = button.dataset.deleteEntry.split(":");
	plan[type] = plan[type].filter((item) => item.id !== entryId);
	renderPlan();
	savePlan();
});

const loanForm = document.querySelector("#loan-form");
const loanFeedback = document.querySelector("#loan-feedback");
const loanValidation = document.querySelector("#loan-validation");
const editCancel = document.querySelector("#cancel-edit");
const principalSource = document.querySelector("#loan-principal-source");
if (loanForm && principalSource) {
	const principalField = principalSource.querySelector("label");
	const principalGuidance = principalSource.querySelector(".profile-hint");
	const validationMessage = principalSource.querySelector("#loan-validation");
	const fieldPair = loanForm.querySelector(".field-pair");
	const formActions = loanForm.querySelector(".form-actions");
	if (principalField && fieldPair) {
		principalField.classList.add("principal-field");
		fieldPair.prepend(principalField);
	}
	if (formActions && principalGuidance) loanForm.insertBefore(principalGuidance, formActions);
	if (formActions && validationMessage) loanForm.insertBefore(validationMessage, formActions);
	principalSource.remove();
}
function resetLoanForm() {
	loanForm?.reset();
	const idField = loanForm?.elements.namedItem("id");
	if (idField) idField.value = "";
	setText("#loan-form-mode", "ADD TO YOUR PLAN");
	setText("#loan-form-title", "A new loan");
	const submit = document.querySelector("#loan-submit");
	if (submit) submit.innerHTML = 'Add this loan <span aria-hidden="true">↗</span>';
	if (loanValidation) loanValidation.textContent = "";
	if (editCancel) editCancel.hidden = true;
}

loanForm?.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!loanForm.reportValidity()) return;
	const fields = new FormData(loanForm);
	const loanId = String(fields.get("id") || id());
	const principal = Number(fields.get("principal"));
	const outstanding = Number(fields.get("outstanding"));
	const emi = Number(fields.get("emi"));
	const rate = Number(fields.get("rate"));
	const months = Number(fields.get("months"));
	if (loanValidation) loanValidation.textContent = "";
	if (principal < outstanding) {
		if (loanValidation) loanValidation.textContent = "Original principal cannot be lower than the current outstanding balance.";
		return;
	}
	const minimumEmi = calculateLoanPayment(outstanding, rate, months);
	if (emi + 0.01 < minimumEmi) {
		if (loanValidation) loanValidation.textContent = `This EMI cannot repay ${currency.format(outstanding)} in ${months} months at ${rate.toFixed(2)}%. The estimated minimum is ${preciseCurrency.format(minimumEmi)} per month, before lender-specific charges.`;
		return;
	}
	const loan = { id: loanId, name: String(fields.get("name")).trim(), type: String(fields.get("type")), principal, outstanding, emi, rate, months, fees: Number(fields.get("fees")) };
	const existingIndex = plan.loans.findIndex((item) => item.id === loanId);
	if (existingIndex >= 0) plan.loans[existingIndex] = loan;
	else plan.loans.push(loan);
	renderPlan();
	savePlan();
	resetLoanForm();
	if (loanFeedback) loanFeedback.textContent = existingIndex >= 0 ? "Loan updated in your plan." : `${loan.name} added to your plan.`;
});

editCancel?.addEventListener("click", resetLoanForm);
document.querySelector("#loan-cards")?.addEventListener("click", (event) => {
	const editButton = event.target.closest("[data-edit-loan]");
	const deleteButton = event.target.closest("[data-delete-loan]");
	if (editButton) {
		const loan = plan.loans.find((item) => item.id === editButton.dataset.editLoan);
		if (!loan || !loanForm) return;
		for (const [key, value] of Object.entries({ id: loan.id, name: loan.name, type: loan.type, principal: loan.principal || loan.outstanding, outstanding: loan.outstanding, emi: loan.emi, rate: loan.rate, months: loan.months, fees: loan.fees })) {
			const field = loanForm.elements.namedItem(key);
			if (field) field.value = String(value);
		}
		setText("#loan-form-mode", "UPDATE YOUR PLAN");
		setText("#loan-form-title", "Edit this loan");
		const submit = document.querySelector("#loan-submit");
		if (submit) submit.innerHTML = 'Save changes <span aria-hidden="true">↗</span>';
		if (editCancel) editCancel.hidden = false;
		loanForm.scrollIntoView({ behavior: "smooth", block: "center" });
	} else if (deleteButton) {
		plan.loans = plan.loans.filter((loan) => loan.id !== deleteButton.dataset.deleteLoan);
		renderPlan();
		savePlan();
		if (loanFeedback) loanFeedback.textContent = "Loan removed from your plan.";
	}
});

document.querySelector("#reset-plan")?.addEventListener("click", async (event) => {
	const resetButton = event.currentTarget;
	if (!window.confirm("Clear all income, expenses, savings, and loans from your account?")) return;
	plan = blankPlan();
	renderPlan();
	if (document.querySelector("#profile-form")) document.querySelector("#profile-form").reset();
	resetLoanForm();
	await savePlan();
	if (loanFeedback) loanFeedback.textContent = "Your plan is clear. Add your details when you're ready.";
	resetButton.textContent = "Plan cleared";
	window.setTimeout(() => { resetButton.textContent = "Clear all plan data"; }, 1600);
});

document.querySelector("#emi-calculator")?.addEventListener("submit", (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	if (!form.reportValidity()) return;
	const fields = new FormData(form);
	const principal = Number(fields.get("principal"));
	const monthlyRate = Number(fields.get("rate")) / 1200;
	const months = Number(fields.get("months"));
	const monthlyPayment = monthlyRate === 0 ? principal / months : principal * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1);
	const totalPayment = monthlyPayment * months;
	const estimatedInterest = Math.max(0, totalPayment - principal);
	const surplusAfterNewPayment = monthlySurplus() - monthlyPayment;
	setText("#calc-emi", currency.format(monthlyPayment));
	setText("#calc-interest", currency.format(estimatedInterest));
	setText("#calc-total", currency.format(totalPayment));
	setText("#calc-affordability", monthlyIncome() <= 0
		? "Add monthly income and expense categories to check this payment against your budget."
		: surplusAfterNewPayment >= 0
			? `Budget check: YES, ${currency.format(surplusAfterNewPayment)} remains after entered expenses and loan EMIs. This is not loan approval.`
			: `Budget check: NO, your current plan would be short by ${currency.format(Math.abs(surplusAfterNewPayment))} each month. This is not a lender decision.`);
	const results = document.querySelector("#calc-results");
	if (results) results.hidden = false;
});

function calculateLoanPayment(principal, annualRate, months) {
	const monthlyRate = annualRate / 1200;
	return monthlyRate === 0 ? principal / months : principal * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1);
}

function installAssistant() {
	const launcher = document.querySelector("#assistant-launcher");
	const panel = document.querySelector("#assistant-panel");
	const form = document.querySelector("#assistant-form");
	const input = document.querySelector("#assistant-question");
	const messages = document.querySelector("#assistant-messages");
	if (!launcher || !panel || !form || !messages || !input) return;
	const closeButton = document.querySelector("#assistant-close");
	const setOpen = (open) => {
		panel.hidden = !open;
		launcher.setAttribute("aria-expanded", String(open));
		if (open) input.focus();
	};
	launcher.addEventListener("click", () => setOpen(panel.hidden));
	closeButton?.addEventListener("click", () => setOpen(false));
	document.querySelectorAll("[data-assistant-prompt]").forEach((button) => button.addEventListener("click", () => {
		input.value = button.dataset.assistantPrompt;
		form.requestSubmit();
	}));
	form.addEventListener("submit", (event) => {
		event.preventDefault();
		const question = input.value.trim();
		if (!question) return;
		appendMessage(question, "user");
		input.value = "";
		window.setTimeout(() => appendMessage(answerQuestion(question), "bot"), 220);
	});
	function appendMessage(text, author) {
		const message = document.createElement("div");
		message.className = `assistant-message assistant-message-${author}`;
		message.textContent = text;
		messages.append(message);
		messages.scrollTop = messages.scrollHeight;
	}
}

function answerQuestion(question) {
	const normalized = question.toLowerCase();
	const income = monthlyIncome();
	const surplus = monthlySurplus();
	const sorted = rankedLoans();
	if (document.body.dataset.page === "visualizations" && projectDataset && /data|dataset|model|prediction|error|accuracy|sample/.test(normalized)) {
		const { summary, groups } = projectDataset;
		const strongest = [...groups].sort((first, second) => second.average_benefit - first.average_benefit)[0];
		const highestRate = [...groups].sort((first, second) => second.average_rate - first.average_rate)[0];
		const medianError = summary.median_absolute_error === null ? "not available" : preciseCurrency.format(summary.median_absolute_error);
		return `This project sample contains ${summary.rows.toLocaleString("en-IN")} loans across ${summary.types} categories. ${summary.positive_rate * 100}% have a positive benefit label. ${strongest.type} has the highest mean benefit (${currency.format(strongest.average_benefit)}); ${highestRate.type} has the highest mean annual rate (${highestRate.average_rate.toFixed(2)}%). The median absolute prediction error is ${medianError}. These are sample associations, not causal claims or a personal payoff prediction.`;
	}
	if (/analy[sz]e|monthly report|cash.?flow report|summarize my plan|my whole plan/.test(normalized)) {
		const monthLabel = formatDate(`${selectedMonth}-01`, { month: "long", year: "numeric" });
		const goalDeposits = goalDepositsForMonth();
		const bestLoan = sorted.find((loan) => loanDifference(loan) > 0);
		return `${monthLabel}: income ${currency.format(income)} − spending ${currency.format(monthlyExpenses())} − loan EMIs ${currency.format(monthlyEmis())} − goal deposits ${currency.format(goalDeposits)} = ${currency.format(surplus)} ${surplus < 0 ? "monthly gap" : "left over"}. ${plan.loans.length ? bestLoan ? `The largest simple payoff difference is ${bestLoan.name} at ${currency.format(loanDifference(bestLoan))}.` : "No loan currently has a positive simple payoff difference." : "You have no active loans in this plan; your dated daily budget and goals still work."}`;
	}
	if (/goal|target|saving pace|goal meter/.test(normalized)) {
		if (!plan.goals.length) return "There are no savings goals in your plan yet. Add a target and due date in Tracker, then log each dated deposit to build its meter.";
		return plan.goals.map((goal) => {
			const saved = goal.contributions.reduce((total, item) => total + Number(item.amount), 0);
			const remaining = Math.max(0, goal.target - saved);
			return `${goal.name}: ${currency.format(saved)} of ${currency.format(goal.target)} (${goal.target ? Math.min(100, saved / goal.target * 100).toFixed(0) : 0}%), ${currency.format(remaining)} remaining, target ${formatDate(goal.dueDate)} across ${goal.contributions.length} dated deposits.`;
		}).join(" ");
	}
	if (/which loan|what loan|preclos|pre-clos|priorit|close first|pay off first|payoff order/.test(normalized)) {
		const firstPositive = sorted.find((loan) => loanDifference(loan) > 0);
		if (!firstPositive) return "With the balances, fees, and remaining EMIs entered, none of your loans has a positive estimated difference. Get a current settlement quote for each loan before deciding what to prioritize.";
		return `Based only on the numbers in your plan, start by reviewing “${firstPositive.name}”: its estimated difference is ${currency.format(loanDifference(firstPositive))} (${currency.format(firstPositive.emi * firstPositive.months)} in remaining EMIs minus ${currency.format(firstPositive.outstanding)} outstanding and ${currency.format(firstPositive.fees)} in fees). This is a comparison prompt, not a recommendation; confirm the settlement quote and protect your emergency savings.`;
	}
	if (/interest|breakdown|this month|monthly charge/.test(normalized)) {
		const chosen = sorted.find((loan) => normalized.includes(loan.name.toLowerCase())) || [...plan.loans].sort((first, second) => second.rate - first.rate)[0];
		if (!chosen) return "Add a loan with its balance and annual rate first, and I can estimate a month's interest.";
		const monthlyInterest = chosen.outstanding * chosen.rate / 1200;
		const principalPortion = chosen.emi - monthlyInterest;
		return `For “${chosen.name}” at ${Number(chosen.rate).toFixed(2)}% annually, one month's simple interest estimate is about ${currency.format(monthlyInterest)} (${currency.format(chosen.outstanding)} balance × rate ÷ 12). Against its ${currency.format(chosen.emi)} EMI, about ${currency.format(Math.max(0, principalPortion))} would go toward principal, before lender-specific schedules or fees. This is an estimate, not the lender's statement.`;
	}
	if (/expense|spend|income|salary|pocket money|budget categories/.test(normalized)) {
		const group = /income|salary|pocket money/.test(normalized) ? plan.incomes : plan.expenses;
		const label = group === plan.incomes ? "income" : "expenses";
		if (!group.length) return `There aren't any ${label} categories in your plan yet. Add them in Analyzer and I'll summarize them here.`;
		const breakdown = [...group.reduce((totals, item) => totals.set(item.category, (totals.get(item.category) || 0) + item.amount), new Map())].sort((first, second) => second[1] - first[1]).map(([category, amount]) => `${category}: ${currency.format(amount)}`).join("; ");
		return `Your monthly ${label} add up to ${currency.format(sumEntries(group))}: ${breakdown}. Your entered monthly room after all expenses and loan EMIs is ${currency.format(surplus)}.`;
	}
	if (/can i|should i|afford|take (?:a |this )?loan|new loan|borrow/.test(normalized)) {
		if (!income) return "Add monthly income and expenses first. I'll then say whether a proposed EMI fits the budget you entered.";
		const emiMatch = normalized.match(/(?:emi|monthly payment|monthly instal?ment)\D{0,24}(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)/i)
			|| question.match(/(?:₹|rs\.?\s*)([\d,]+(?:\.\d+)?)\s*(?:emi|monthly payment|monthly instal?ment|per month|a month|monthly)/i);
		let proposedEmi = emiMatch ? Number(emiMatch[1].replaceAll(",", "")) : NaN;
		let assumption = "using the EMI you gave";
		if (!Number.isFinite(proposedEmi)) {
			const principalMatch = question.match(/(?:borrow|loan amount|principal|take)\D{0,30}(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)/i);
			const rateMatch = question.match(/([\d.]+)\s*%/);
			const monthsMatch = question.match(/(\d+)\s*(?:months?|mos?\b)/i);
			if (principalMatch && rateMatch && monthsMatch) {
				const principal = Number(principalMatch[1].replaceAll(",", ""));
				const months = Number(monthsMatch[1]);
				const rate = Number(rateMatch[1]);
				if (principal > 0 && months > 0 && rate >= 0 && rate <= 100) {
					proposedEmi = calculateLoanPayment(principal, rate, months);
					assumption = `using a ₹${principal.toLocaleString("en-IN")} loan at ${rate}% for ${months} months (estimated EMI ${currency.format(proposedEmi)})`;
				}
			}
		}
		if (!Number.isFinite(proposedEmi) || proposedEmi <= 0) {
			return surplus < 0
				? `Budget check: NO, the current plan is already short by ${currency.format(Math.abs(surplus))} per month, so another payment would increase that gap. Share the proposed EMI or the amount, rate, and term for a more specific check.`
				: `Budget check: YES, the current plan has ${currency.format(surplus)} per month before any new loan. I can't assess this specific loan without its EMI; share the proposed payment or amount, annual rate, and term. This isn't lender approval.`;
		}
		const remaining = surplus - proposedEmi;
		return remaining >= 0
			? `Budget check: YES, ${assumption} would leave about ${currency.format(remaining)} per month after the income, expenses, and EMIs currently in your plan. That doesn't confirm lender approval or whether the loan fits your goals; keep an emergency cushion and compare the full repayment cost.`
			: `Budget check: NO, ${assumption} would leave your current monthly plan short by about ${currency.format(Math.abs(remaining))}. Based on the income and expenses entered, the existing commitments already use that money. This isn't a lender decision.`;
	}
	return "I can help prioritize your entered loans, estimate one month's interest, break down income and expenses, or check a proposed EMI against your budget. Ask me one of those, or try “Can I manage a ₹20,000 EMI?”";
}

installAssistant();

const rotatingWord = document.querySelector("#rotating-word");
if (rotatingWord && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
	const phrases = ["your next move.", "each scenario.", "the payoff path."];
	let phraseIndex = 0;
	window.setInterval(() => {
		rotatingWord.classList.remove("is-changing");
		void rotatingWord.offsetWidth;
		phraseIndex = (phraseIndex + 1) % phrases.length;
		rotatingWord.textContent = phrases[phraseIndex];
		rotatingWord.classList.add("is-changing");
	}, 3400);
}

const storedTheme = localStorage.getItem("clearpath-theme") || "light";
setTheme(storedTheme);
document.querySelector("#theme-toggle")?.addEventListener("click", (event) => {
	const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
	localStorage.setItem("clearpath-theme", nextTheme);
	setTheme(nextTheme);
	const button = event.currentTarget;
	button.classList.add("theme-change");
	window.setTimeout(() => button.classList.remove("theme-change"), 500);
});

document.querySelectorAll(".click-action").forEach((button) => button.addEventListener("click", (event) => {
	const bounds = button.getBoundingClientRect();
	const flare = document.createElement("span");
	flare.className = "button-flare";
	flare.style.left = `${event.clientX - bounds.left}px`;
	flare.style.top = `${event.clientY - bounds.top}px`;
	button.append(flare);
	window.setTimeout(() => flare.remove(), 650);
}));

if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
	const revealObserver = new IntersectionObserver((entries, observer) => {
		entries.forEach((entry) => {
			if (entry.isIntersecting) {
				entry.target.classList.add("is-visible");
				observer.unobserve(entry.target);
			}
		});
	}, { threshold: 0.13 });
	document.querySelectorAll("[data-reveal]").forEach((element) => revealObserver.observe(element));
} else {
	document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
}

function runProjectDataCharts() {
	if (document.body.dataset.page === "visualizations") loadDatasetVisualizations();
}

document.querySelectorAll(".current-year").forEach((year) => { year.textContent = String(new Date().getFullYear()); });
renderPlan();
fetchPlan().then(runProjectDataCharts);