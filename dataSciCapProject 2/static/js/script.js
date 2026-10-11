const storageKey = "clearpath-household-plan-v2";
const currency = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0,
});

const examplePlan = {
	income: 180000,
	expenses: 68000,
	savings: 150000,
	loans: [
		{ id: "loan-home", name: "A place of our own", type: "Home loan", outstanding: 1800000, emi: 32000, rate: 8.7, months: 84, fees: 12000 },
		{ id: "loan-vehicle", name: "The family car", type: "Vehicle loan", outstanding: 920000, emi: 23000, rate: 10.4, months: 48, fees: 16000 },
		{ id: "loan-personal", name: "Personal loan", type: "Personal loan", outstanding: 900000, emi: 14000, rate: 16.5, months: 60, fees: 8000 },
	],
};

function createEmptyPlan() {
	return { income: 0, expenses: 0, savings: 0, loans: [] };
}

function loadPlan() {
	try {
		const storedPlan = localStorage.getItem(storageKey);
		return storedPlan ? { ...createEmptyPlan(), ...JSON.parse(storedPlan) } : structuredClone(examplePlan);
	} catch {
		return structuredClone(examplePlan);
	}
}

let plan = loadPlan();

function savePlan() {
	try {
		localStorage.setItem(storageKey, JSON.stringify(plan));
	} catch {
		return false;
	}
	return true;
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;",
	})[character]);
}

function loanDifference(loan) {
	return loan.emi * loan.months - loan.outstanding - loan.fees;
}

function rankedLoans() {
	return [...plan.loans].sort((first, second) => loanDifference(second) - loanDifference(first) || second.rate - first.rate);
}

function setText(selector, value) {
	const element = document.querySelector(selector);
	if (element) element.textContent = value;
}

function formatSignedCurrency(value) {
	const amount = currency.format(Math.abs(value));
	return value > 0 ? `+${amount}` : value < 0 ? `−${amount}` : amount;
}

function updateSharedMetrics() {
	const totalEmis = plan.loans.reduce((total, loan) => total + loan.emi, 0);
	const surplus = plan.income - plan.expenses - totalEmis;
	setText("#home-loan-count", String(plan.loans.length));
	setText("#home-income", currency.format(plan.income));
	setText("#home-surplus", currency.format(surplus));
	setText("#dash-loan-count", String(plan.loans.length));
	setText("#dash-emis", currency.format(totalEmis));
	setText("#dash-surplus", currency.format(surplus));
	setText("#dash-outstanding", currency.format(plan.loans.reduce((total, loan) => total + loan.outstanding, 0)));
	setText("#dash-dti", `${plan.income > 0 ? Math.round(totalEmis / plan.income * 100) : 0}% of take-home income`);
	setText("#cashflow-income", currency.format(plan.income));
	setText("#cashflow-expenses-value", currency.format(plan.expenses));
	setText("#cashflow-emis-value", currency.format(totalEmis));
	setText("#cashflow-surplus-value", currency.format(Math.abs(surplus)));
	setText("#cashflow-surplus-label", surplus < 0 ? "Monthly gap" : "Room to breathe");
	setText("#dash-surplus-note", surplus < 0 ? "Monthly gap after expenses and EMIs" : "After regular expenses and EMIs");
	setText("#cashflow-note", surplus < 0
		? "Your entered expenses and EMIs are above take-home income. Review the plan before considering any payoff."
		: `Savings entered: ${currency.format(plan.savings)}. This planner doesn't assume savings are available for payoff.`);
	setText("#manager-count", `${String(plan.loans.length).padStart(2, "0")} ${plan.loans.length === 1 ? "LOAN" : "LOANS"}`);

	const graph = document.querySelector("#cashflow-track");
	if (graph) {
		const totalOutflow = plan.expenses + totalEmis;
		const scale = surplus < 0 ? Math.max(totalOutflow, 1) : Math.max(plan.income, 1);
		const positiveSurplus = Math.max(0, surplus);
		graph.querySelector(".cashflow-expenses").style.setProperty("--share", `${plan.expenses / scale * 100}%`);
		graph.querySelector(".cashflow-emis").style.setProperty("--share", `${totalEmis / scale * 100}%`);
		graph.querySelector(".cashflow-surplus").style.setProperty("--share", `${positiveSurplus / scale * 100}%`);
		graph.querySelector(".cashflow-surplus").classList.toggle("is-deficit", surplus < 0);
		document.querySelector(".cashflow-note")?.classList.toggle("is-deficit", surplus < 0);
		graph.setAttribute("aria-label", `Monthly income ${currency.format(plan.income)}, living expenses ${currency.format(plan.expenses)}, loan EMIs ${currency.format(totalEmis)}, ${surplus < 0 ? "monthly gap" : "remaining"} ${currency.format(Math.abs(surplus))}`);
	}
}

function renderDashboard() {
	const sorted = rankedLoans();
	const chart = document.querySelector("#priority-chart");
	const rows = document.querySelector("#dashboard-loans");
	const mobileRows = document.querySelector("#mobile-dashboard-loans");
	if (!chart || !rows || !mobileRows) return;

	if (sorted.length === 0) {
		chart.innerHTML = '<p class="empty-loans">Your payoff comparison will appear once you add a loan.</p>';
		rows.innerHTML = '<tr><td colspan="6">No loans in your plan yet. Add one in Analyzer.</td></tr>';
		mobileRows.innerHTML = "";
		document.querySelector(".priority-tip")?.remove();
		return;
	}

	const largestDifference = Math.max(...sorted.map((loan) => Math.abs(loanDifference(loan))), 1);
	chart.innerHTML = sorted.map((loan, index) => {
		const difference = loanDifference(loan);
		const width = Math.max(Math.abs(difference) / largestDifference * 100, 2);
		return `<div class="chart-row"><span class="chart-name" title="${escapeHtml(loan.name)}">${escapeHtml(loan.name)}</span><span class="chart-track"><span class="chart-fill${difference < 0 ? " is-negative" : ""}" style="--bar-width:${width}%;--bar-delay:${index * 90}ms"></span></span><span class="chart-value ${difference < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(difference)}</span></div>`;
	}).join("");
	chart.setAttribute("aria-label", `Estimated payment differences: ${sorted.map((loan) => `${loan.name} ${formatSignedCurrency(loanDifference(loan))}`).join(", ")}`);

	const firstPositive = sorted.find((loan) => loanDifference(loan) > 0);
	let tip = document.querySelector(".priority-tip");
	if (!tip) {
		tip = document.createElement("div");
		tip.className = "priority-tip";
		document.querySelector("#priority-list")?.append(tip);
	}
	tip.innerHTML = firstPositive
		? `<span aria-hidden="true">↗</span><p><strong>${escapeHtml(firstPositive.name)}</strong> has your largest estimated difference right now: ${currency.format(loanDifference(firstPositive))}. Compare a fresh lender quote before acting.</p>`
		: '<span aria-hidden="true">!</span><p>No positive difference with the values entered. Ask your lenders for current settlement figures before deciding what to prioritize.</p>';

	rows.innerHTML = sorted.map((loan, index) => {
		const difference = loanDifference(loan);
		const priority = difference > 0 ? `#${index + 1}` : "Review";
		return `<tr><td>${escapeHtml(loan.name)}<span class="loan-type-label">${escapeHtml(loan.type)}</span></td><td>${Number(loan.rate).toFixed(2)}%</td><td>${currency.format(loan.emi)}</td><td>${currency.format(loan.outstanding)}</td><td class="${difference < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(difference)}</td><td><span class="rank-chip${difference < 0 ? " rank-later" : ""}">${priority}</span></td></tr>`;
	}).join("");
	mobileRows.innerHTML = sorted.map((loan, index) => {
		const difference = loanDifference(loan);
		return `<article class="mobile-loan-row"><strong>${escapeHtml(loan.name)}</strong><span>${escapeHtml(loan.type)} · ${Number(loan.rate).toFixed(2)}%</span><span>${currency.format(loan.emi)}/mo · ${currency.format(loan.outstanding)} left</span><b class="${difference < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(difference)} estimated difference <i>${difference > 0 ? `#${index + 1}` : "Review"}</i></b></article>`;
	}).join("");
}

function renderLoanCards() {
	const container = document.querySelector("#loan-cards");
	if (!container) return;
	if (!plan.loans.length) {
		container.innerHTML = '<div class="empty-loans">Your plan is clear for now.<br>Add a loan to see its monthly payment and payoff comparison here.</div>';
		return;
	}
	container.innerHTML = plan.loans.map((loan, index) => `<article class="managed-loan" style="animation-delay:${index * 60}ms"><div class="managed-loan-name"><strong>${escapeHtml(loan.name)}</strong><small>${escapeHtml(loan.type)} · ${Number(loan.rate).toFixed(2)}% p.a.</small></div><div class="loan-mini-metric"><span>OUTSTANDING</span><strong>${currency.format(loan.outstanding)}</strong></div><div class="loan-mini-metric"><span>MONTHLY EMI</span><strong>${currency.format(loan.emi)}</strong></div><div class="loan-mini-metric"><span>EST. DIFFERENCE</span><strong class="${loanDifference(loan) < 0 ? "difference-negative" : "difference-positive"}">${formatSignedCurrency(loanDifference(loan))}</strong></div><div class="loan-actions"><button class="icon-action" type="button" data-edit-loan="${escapeHtml(loan.id)}" aria-label="Edit ${escapeHtml(loan.name)}" title="Edit loan">✎</button><button class="icon-action delete" type="button" data-delete-loan="${escapeHtml(loan.id)}" aria-label="Remove ${escapeHtml(loan.name)}" title="Remove loan">×</button></div></article>`).join("");
}

function renderPlan() {
	updateSharedMetrics();
	renderDashboard();
	renderLoanCards();
}

document.querySelectorAll("[data-page-link]").forEach((link) => {
	if (link.dataset.pageLink === document.body.dataset.page) link.setAttribute("aria-current", "page");
});

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

document.querySelectorAll(".current-year").forEach((year) => { year.textContent = String(new Date().getFullYear()); });
renderPlan();

const profileForm = document.querySelector("#profile-form");
profileForm?.elements.namedItem("income") && (profileForm.elements.namedItem("income").value = plan.income || "");
profileForm?.elements.namedItem("expenses") && (profileForm.elements.namedItem("expenses").value = plan.expenses || "");
profileForm?.elements.namedItem("savings") && (profileForm.elements.namedItem("savings").value = plan.savings || "");
profileForm?.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!profileForm.reportValidity()) return;
	const fields = new FormData(profileForm);
	plan.income = Number(fields.get("income"));
	plan.expenses = Number(fields.get("expenses"));
	plan.savings = Number(fields.get("savings") || 0);
	savePlan();
	renderPlan();
	profileForm.querySelector("button")?.classList.add("is-success");
	window.setTimeout(() => profileForm.querySelector("button")?.classList.remove("is-success"), 500);
});

const loanForm = document.querySelector("#loan-form");
const loanFeedback = document.querySelector("#loan-feedback");
const editCancel = document.querySelector("#cancel-edit");
function resetLoanForm() {
	loanForm?.reset();
	const idField = loanForm?.elements.namedItem("id");
	if (idField) idField.value = "";
	setText("#loan-form-mode", "ADD TO YOUR PLAN");
	setText("#loan-form-title", "A new loan");
	setText("#loan-submit", "Add this loan ↗");
	if (editCancel) editCancel.hidden = true;
}

loanForm?.addEventListener("submit", (event) => {
	event.preventDefault();
	if (!loanForm.reportValidity()) return;
	const fields = new FormData(loanForm);
	const id = String(fields.get("id") || crypto.randomUUID());
	const loan = {
		id,
		name: String(fields.get("name")).trim(),
		type: String(fields.get("type")),
		outstanding: Number(fields.get("outstanding")),
		emi: Number(fields.get("emi")),
		rate: Number(fields.get("rate")),
		months: Number(fields.get("months")),
		fees: Number(fields.get("fees")),
	};
	const existingIndex = plan.loans.findIndex((item) => item.id === id);
	if (existingIndex >= 0) plan.loans[existingIndex] = loan;
	else plan.loans.push(loan);
	savePlan();
	renderPlan();
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
		for (const [key, value] of Object.entries({ id: loan.id, name: loan.name, type: loan.type, outstanding: loan.outstanding, emi: loan.emi, rate: loan.rate, months: loan.months, fees: loan.fees })) {
			const field = loanForm.elements.namedItem(key);
			if (field) field.value = String(value);
		}
		setText("#loan-form-mode", "UPDATE YOUR PLAN");
		setText("#loan-form-title", "Edit this loan");
		setText("#loan-submit", "Save changes ↗");
		if (editCancel) editCancel.hidden = false;
		loanForm.scrollIntoView({ behavior: "smooth", block: "center" });
	} else if (deleteButton) {
		plan.loans = plan.loans.filter((loan) => loan.id !== deleteButton.dataset.deleteLoan);
		savePlan();
		renderPlan();
		if (loanFeedback) loanFeedback.textContent = "Loan removed from your plan.";
	}
});

document.querySelector("#reset-plan")?.addEventListener("click", (event) => {
	const resetButton = event.currentTarget;
	plan = createEmptyPlan();
	savePlan();
	renderPlan();
	profileForm?.reset();
	resetLoanForm();
	if (loanFeedback) loanFeedback.textContent = "Your example plan is cleared. Add your details when you're ready.";
	resetButton.textContent = "Plan cleared";
	window.setTimeout(() => { resetButton.textContent = "Clear example plan"; }, 1600);
});

const rotatingWord = document.querySelector("#rotating-word");
const prefersLessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (rotatingWord && !prefersLessMotion) {
	const phrases = ["every loan.", "your next move.", "your whole plan."];
	let phraseIndex = 0;
	window.setInterval(() => {
		rotatingWord.classList.remove("is-changing");
		void rotatingWord.offsetWidth;
		phraseIndex = (phraseIndex + 1) % phrases.length;
		rotatingWord.textContent = phrases[phraseIndex];
		rotatingWord.classList.add("is-changing");
	}, 3300);
}

if ("IntersectionObserver" in window && !prefersLessMotion) {
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

document.querySelectorAll(".click-action").forEach((button) => button.addEventListener("click", (event) => {
	const bounds = button.getBoundingClientRect();
	const flare = document.createElement("span");
	flare.className = "button-flare";
	flare.style.left = `${event.clientX - bounds.left}px`;
	flare.style.top = `${event.clientY - bounds.top}px`;
	button.append(flare);
	window.setTimeout(() => flare.remove(), 650);
}));
