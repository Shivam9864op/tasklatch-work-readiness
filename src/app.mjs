import {
  STAGES, STAGE_LABELS, createOpportunity, createSampleProject, deriveWorkStatus,
  evaluateOffer, overviewMetrics, compareTerms, recordStageEvent, exportProject,
  importProject, normalizeUrl,
} from "./core.mjs";

const STORAGE_KEY = "tasklatch.project.v1";
const content = document.querySelector("#content");
const topTitle = document.querySelector("#top-title");
const toastElement = document.querySelector("#toast");
let view = "overview";
let selectedId = "op-northstar";
let toastTimer;
let storageError = false;
let project = loadProject();

function loadProject() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createSampleProject();
    return importProject(saved);
  } catch {
    storageError = true;
    return createSampleProject();
  }
}

function save() {
  if (storageError) {
    showToast("Saved data could not be read. Export or import a backup, or confirm Reset sample to replace it.");
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: "tasklatch-project", version: 1, opportunities: project.opportunities }));
  } catch {
    showToast("Could not save in this browser. Export a backup before leaving.");
  }
  document.querySelector("#nav-count").textContent = String(project.opportunities.length);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function selectedOpportunity() {
  return project.opportunities.find((item) => item.id === selectedId) ?? project.opportunities[0] ?? null;
}

function badgeFor(item) {
  const risk = evaluateOffer(item);
  if (risk.hardStop) return `<span class="tag tag-stop">Pause &amp; verify</span>`;
  if (["selected", "contract", "onboarded"].includes(item.stage)) return `<span class="tag tag-wait">Awaiting task</span>`;
  if (["assigned", "delivered", "approved"].includes(item.stage)) return `<span class="tag tag-active">Task in progress</span>`;
  if (item.stage === "paid") return `<span class="tag tag-paid">Paid recorded</span>`;
  if (risk.state === "more_evidence_needed") return `<span class="tag tag-neutral">Needs checking</span>`;
  return `<span class="tag tag-neutral">${escapeHtml(STAGE_LABELS[item.stage] ?? "Saved")}</span>`;
}

function stageProgress(stage) {
  const key = stage === "paid" ? "paid" : ["assigned", "delivered", "approved"].includes(stage) ? stage : ["selected", "contract", "onboarded"].includes(stage) ? stage : stage;
  const currentIndex = Math.max(0, STAGES.findIndex((entry) => entry.key === key));
  const shown = ["applied", "selected", "contract", "onboarded", "assigned", "paid"];
  return `<div class="stage-track" aria-label="Work milestone path">${shown.map((step, index) => {
    const indexInAll = STAGES.findIndex((entry) => entry.key === step);
    const state = indexInAll < currentIndex ? "done" : indexInAll === currentIndex ? "current" : "";
    return `<div class="stage-node ${state}"><span class="stage-circle">${indexInAll < currentIndex ? "✓" : index + 1}</span><span class="stage-caption">${escapeHtml(STAGE_LABELS[step])}</span></div>`;
  }).join("")}</div>`;
}

function pageHead(eyebrow, title, description, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${escapeHtml(eyebrow)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div>${action}</div>`;
}

function row(item) {
  const rate = item.agreedRate !== null ? `${escapeHtml(item.currency)} ${escapeHtml(item.agreedRate)}/h agreed` : item.listedRate !== null ? `${escapeHtml(item.currency)} ${escapeHtml(item.listedRate)}/h listed` : "Pay not recorded";
  return `<button class="opp-row" type="button" data-open-opp="${escapeHtml(item.id)}"><div><div class="opp-title">${escapeHtml(item.role)} <span class="opp-meta">· ${escapeHtml(item.employer)}</span></div><div class="opp-meta">${escapeHtml(item.source)} · ${escapeHtml(item.region || "Location not recorded")}</div></div><div class="opp-status">${badgeFor(item)}<div class="opp-rate">${rate}</div></div></button>`;
}

function overviewView() {
  const metrics = overviewMetrics(project.opportunities);
  const mostRecent = [...project.opportunities].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 4);
  const primary = selectedOpportunity();
  return `${pageHead("FIELD NOTES · WORK STATUS", "Selected is not the same as paid work.", "TaskLatch keeps the steps separate: verified role, application, selection, contract, assigned task, approval and payment. It records what you know; it does not guess what an employer meant.", `<button class="button button-primary" data-go="offer-check" type="button">Check an offer <span aria-hidden="true">→</span></button>`)}
    <section class="hero-card"><div class="hero-copy"><div class="eyebrow">THE GAP BETWEEN YES AND YOUR FIRST TASK</div><h1>A signed form can still leave you waiting for work.</h1><p>Track the evidence, spot risky money requests, and see the next step without treating onboarding or a talent-pool email as income.</p><div class="hero-actions"><button class="button button-primary" data-go="work-trail" type="button">Open the work trail</button><button class="button button-secondary" data-go="opportunities" type="button">Add an opportunity</button></div></div><div class="hero-note">Private · Local-first · No account</div></section>
    <section class="card guided-demo-callout"><div><div class="mini-label">QUICK PRODUCT DEMO</div><strong>Onboarded. Still no task assigned.</strong><span>A focused, interactive example with fictional data.</span></div><a class="button button-secondary" href="./quick-demo.html">Open the demo <span aria-hidden="true">→</span></a></section>
    <div class="stats-grid">
      <div class="card stat-card"><div class="stat-label">OPPORTUNITIES</div><div class="stat-value">${metrics.opportunities}</div><div class="stat-sub">saved in this browser</div></div>
      <div class="card stat-card warn"><div class="stat-label">WAITING FOR TASK</div><div class="stat-value">${metrics.waitingForTask}</div><div class="stat-sub">selected / contract / onboarded</div></div>
      <div class="card stat-card"><div class="stat-label">TASK RECORDED</div><div class="stat-value">${metrics.taskInProgress}</div><div class="stat-sub">assignment to approval</div></div>
      <div class="card stat-card good"><div class="stat-label">PAYMENT RECORDED</div><div class="stat-value">${metrics.paid}</div><div class="stat-sub">manually marked received</div></div>
      <div class="card stat-card ${metrics.pauseAndVerify ? "warn" : ""}"><div class="stat-label">PAUSE &amp; VERIFY</div><div class="stat-value">${metrics.pauseAndVerify}</div><div class="stat-sub">money-to-unlock flags</div></div>
    </div>
    <div class="dashboard-grid">
      <section class="card section-card"><div class="card-heading"><div><h2>Your next decisions</h2><p>Keep the actual evidence in view; sample records are fictional.</p></div><button class="text-button" data-go="opportunities" type="button">All opportunities →</button></div><div class="opp-list">${mostRecent.length ? mostRecent.map(row).join("") : `<div class="empty-state">No opportunities yet. Add one to begin.</div>`}</div></section>
      <section class="card section-card"><div class="card-heading"><div><h2>What the stages mean</h2><p>No automatic job or payment promises.</p></div></div>
        <div class="insight-card"><div class="mini-label">SELECTION</div><div class="insight-title">A selection email is a signal, not a task.</div><div class="insight-text">Keep “selected” separate from a signed agreement or an actual assignment.</div></div>
        <div class="insight-card"><div class="mini-label">ASSIGNMENT</div><div class="insight-title">Work begins when a task is actually assigned.</div><div class="insight-text">Record a non-sensitive task reference. Do not upload private contract or identity files.</div></div>
        <div class="insight-card"><div class="mini-label">PAYMENT</div><div class="insight-title">Only mark paid after money arrives.</div><div class="insight-text">The dashboard does not count offers, onboarding, or expected pay as earnings.</div></div>
      </section>
    </div>
    ${primary ? `<section class="card section-card" style="margin-top:16px"><div class="card-heading"><div><h2>Current focus · ${escapeHtml(primary.employer)}</h2><p>${escapeHtml(primary.role)}</p></div>${badgeFor(primary)}</div>${stageProgress(primary.stage)}<div class="notice ${primary.stage === "paid" ? "notice-ok" : ["selected", "contract", "onboarded"].includes(primary.stage) ? "notice-warn" : "notice-info"}"><strong>${escapeHtml(deriveWorkStatus(primary))}</strong>${escapeHtml(primary.nextAction || "Choose a next step or add the evidence you have.")}</div></section>` : ""}
    <section class="card video-card" style="margin-top:16px"><div class="video-heading"><div><h2>Watch the real app walkthrough</h2><div class="opp-meta">A short local demo: offer check → task assignment → evidence trail.</div></div><span class="tag tag-neutral">VIDEO · NO IMAGE COVER</span></div><div class="video-frame"><video controls preload="metadata" playsinline aria-label="TaskLatch work-readiness workflow walkthrough"><source src="./media/tasklatch-walkthrough.mp4" type="video/mp4"><track kind="captions" src="./media/tasklatch-walkthrough.en.vtt" srclang="en" label="English captions" default>Your browser does not support the video element.</video></div><div class="video-foot"><span>Recorded from the working app · all records are synthetic</span><span>Personal open-source project · not client work</span></div></section>`;
}

function opportunitiesView() {
  return `${pageHead("RECORDS", "Keep each opportunity honest.", "Save the role, the advertised terms, the terms you were actually offered, and the next action. No browser scraping or inbox connection.")}
    <div class="two-col">
      <section class="card section-card"><div class="card-heading"><div><h2>Opportunity list</h2><p>${project.opportunities.length} records · stored locally in this browser</p></div></div>
       <div class="table-wrap"><table class="data-table"><thead><tr><th>Role / organization</th><th>Stage</th><th>Work status</th><th>Rate</th></tr></thead><tbody>${project.opportunities.map((item) => `<tr data-row-opp="${escapeHtml(item.id)}"><td><button class="text-button employer" data-open-opp="${escapeHtml(item.id)}" type="button">${escapeHtml(item.role)}</button><div class="opp-meta">${escapeHtml(item.employer)} · ${escapeHtml(item.source)}</div></td><td>${escapeHtml(STAGE_LABELS[item.stage] ?? "Saved")}</td><td>${escapeHtml(deriveWorkStatus(item))}</td><td>${item.agreedRate !== null ? `${escapeHtml(item.currency)} ${escapeHtml(item.agreedRate)}/h` : item.listedRate !== null ? `${escapeHtml(item.currency)} ${escapeHtml(item.listedRate)}/h listed` : "Not recorded"}</td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="card section-card"><div class="card-heading"><div><h2>Add an opportunity</h2><p>Start with a listing or offer you can point back to.</p></div></div>
        <form id="add-opportunity" class="form-grid">
          <div class="field"><label for="new-employer">Organization</label><input id="new-employer" name="employer" maxlength="100" required placeholder="Example: Northstar Labs"></div>
          <div class="field"><label for="new-role">Role / project</label><input id="new-role" name="role" maxlength="120" required placeholder="Example: Hindi response reviewer"></div>
          <div class="field"><label for="new-source">Where did you find it?</label><select id="new-source" name="source"><option>LinkedIn</option><option>Company career page</option><option>Recruiter message</option><option>Freelance platform</option><option>Email referral</option><option>Other</option></select></div>
          <div class="field"><label for="new-region">Country / work location</label><input id="new-region" name="region" maxlength="80" placeholder="India · Remote"></div>
          <div class="field"><label for="new-url">Official role link (optional)</label><input id="new-url" name="listingUrl" type="url" placeholder="https://..."><small>HTTP/HTTPS only; avoid links with passwords or codes.</small></div>
          <div class="field"><label for="new-work-type">Work type</label><select id="new-work-type" name="workType"><option>Hourly contract</option><option>Part-time</option><option>Freelance</option><option>Full-time</option><option>Task-based</option><option>Not stated</option></select></div>
          <div class="field"><label for="new-rate">Advertised hourly rate</label><input id="new-rate" name="listedRate" type="number" min="0" step="0.01" placeholder="Leave blank if unknown"></div>
          <div class="field"><label for="new-currency">Currency label</label><input id="new-currency" name="currency" maxlength="8" value="USD"></div>
          <div class="field full"><label for="new-action">One next action</label><input id="new-action" name="nextAction" maxlength="220" placeholder="Ask for expected weekly hours and pay timing"></div>
          <div class="field full"><button class="button button-primary" type="submit">Save locally <span aria-hidden="true">→</span></button></div>
        </form>
      </section>
    </div>`;
}

function offerCheckView() {
  const item = selectedOpportunity();
  if (!item) return `${pageHead("OFFER CHECK", "Add an opportunity first.", "The checklist needs a role or offer record.")}<div class="empty-state"><button class="button button-primary" data-go="opportunities" type="button">Add an opportunity</button></div>`;
  const result = evaluateOffer(item);
  const selectedOptions = project.opportunities.map((opp) => `<option value="${escapeHtml(opp.id)}" ${opp.id === item.id ? "selected" : ""}>${escapeHtml(opp.employer)} — ${escapeHtml(opp.role)}</option>`).join("");
  const checked = (key) => item.risk[key] ? "checked" : "";
  const selectOption = (key, value) => item.risk[key] === value ? "selected" : "";
  const termComparison = compareTerms(item);
  return `${pageHead("OFFER CHECK", "Pause before you pay or share.", "A short, explainable checklist for remote work offers. It flags questions to investigate; it cannot confirm that a company or role is genuine.")}
    <div class="field risk-select" style="margin-bottom:14px"><label for="check-opp">Check this opportunity</label><select id="check-opp">${selectedOptions}</select></div>
    <div class="two-col">
      <section class="card section-card"><div class="card-heading"><div><h2>Offer details you can verify</h2><p>Record what the source actually says. “Unknown” is a valid answer.</p></div></div>
        <form id="risk-form">
          <div class="form-grid" style="margin-bottom:14px">
            <div class="field"><label for="source-verified">Did you verify the source independently?</label><select id="source-verified" name="sourceVerified"><option value="unknown" ${selectOption("sourceVerified", "unknown")}>Not checked yet</option><option value="yes" ${selectOption("sourceVerified", "yes")}>Yes · official company/platform path</option><option value="no" ${selectOption("sourceVerified", "no")}>No · unverified sender or link</option></select></div>
            <div class="field"><label for="terms-state">Are the scope, rate and payment timing in writing?</label><select id="terms-state" name="writtenTerms"><option value="missing" ${selectOption("writtenTerms", "missing")}>Not yet</option><option value="partial" ${selectOption("writtenTerms", "partial")}>Some terms are missing</option><option value="complete" ${selectOption("writtenTerms", "complete")}>Yes · terms are clear</option></select></div>
          </div>
          <div class="checklist">
            ${riskCheck("asksForMoney", "They ask you to pay a fee, deposit or training / joining kit", "Stop and verify independently before sending money.", checked("asksForMoney"))}
            ${riskCheck("payToUnlock", "They ask for a deposit / recharge to unlock tasks or withdraw earnings", "A task queue or displayed balance is not proof you can get paid.", checked("payToUnlock"))}
            ${riskCheck("cryptoPayment", "They require crypto, gift cards or a wallet transfer", "Treat this as a strong warning and do not send funds until independently verified.", checked("cryptoPayment"))}
            ${riskCheck("unofficialContact", "The sender, domain or apply link does not match an official source", "Reach the employer through a contact route you find independently.", checked("unofficialContact"))}
            ${riskCheck("vagueTerms", "Hours, pay, work scope or payment date are unclear", "Ask for the missing terms in writing before relying on the offer.", checked("vagueTerms"))}
            ${riskCheck("sensitiveDocsEarly", "They ask for sensitive identity or bank documents before a verified offer", "Do not add document numbers or upload private files to this demo.", checked("sensitiveDocsEarly"))}
            ${riskCheck("oversizedUnpaidTest", "The test looks like substantial unpaid production work", "Clarify the time limit, use of the work, and whether it is paid.", checked("oversizedUnpaidTest"))}
          </div>
          <div class="form-actions"><button class="button button-primary" type="submit">Update checklist</button></div>
        </form>
      </section>
      <aside class="card section-card"><div class="card-heading"><div><h2>Review result</h2><p>Based only on the boxes and terms you recorded.</p></div></div>
        <div class="notice ${result.hardStop ? "notice-danger" : result.flags.length ? "notice-warn" : "notice-ok"}"><strong>${escapeHtml(result.label)}</strong>${escapeHtml(result.disclaimer)}</div>
        ${result.flags.length ? `<div class="rule-list">${result.flags.map((flag) => `<div class="rule-item"><span class="rule-sign">!</span><span>${escapeHtml(flag)}</span></div>`).join("")}</div>` : `<div class="rule-list"><div class="rule-item"><span class="rule-sign">✓</span><span>No listed warning was selected. This is not a guarantee or independent verification.</span></div></div>`}
        <div class="spacer-12"></div><div class="mini-label">CURRENT WORK STAGE</div><div class="insight-title" style="margin-top:5px">${escapeHtml(result.workStatus)}</div><div class="insight-text">Selected or onboarded without an assigned task is not paid work. Mark a task only when you have its assignment details.</div>
        <div class="spacer-12"></div><div class="mini-label">RATE CHANGE CHECK</div><div class="insight-title" style="margin-top:5px">${escapeHtml(termComparison.message)}</div>
        <div class="spacer-12"></div><div class="notice notice-info"><strong>Need an official source?</strong>Find the company's website yourself, navigate to its careers page, and compare the role and sender details. TaskLatch does not open listings or check companies online.</div>
      </aside>
    </div>`;
}

function riskCheck(key, label, help, checkedValue) {
  return `<label class="check-row"><input type="checkbox" name="${escapeHtml(key)}" ${checkedValue}><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></span></label>`;
}

function workTrailView() {
  const item = selectedOpportunity();
  if (!item) return `${pageHead("WORK TRAIL", "No opportunity selected", "Add a role first.")}`;
  const currentIndex = STAGES.findIndex((stage) => stage.key === item.stage);
  const nextStages = STAGES.slice(currentIndex + 1).filter((stage) => !["verified", "applied", "assessment", "selected", "contract", "onboarded", "assigned", "delivered", "approved", "paid"].includes(stage.key) || stage.key !== item.stage);
  const options = project.opportunities.map((opp) => `<option value="${escapeHtml(opp.id)}" ${opp.id === item.id ? "selected" : ""}>${escapeHtml(opp.employer)} — ${escapeHtml(opp.role)}</option>`).join("");
  const events = [...item.events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const sampleComplete = item.stage === "paid";
  return `${pageHead("WORK TRAIL", "Follow the evidence to the first task.", "Record the milestone and a non-sensitive reference. A contract or onboarding checklist does not automatically mean an assignment exists.")}
    <div class="field risk-select" style="margin-bottom:14px"><label for="trail-opp">Selected opportunity</label><select id="trail-opp">${options}</select></div>
    <div class="two-col">
      <section class="card section-card"><div class="card-heading"><div><h2>${escapeHtml(item.employer)} · ${escapeHtml(item.role)}</h2><p>${escapeHtml(item.workType)} · ${escapeHtml(item.region || "Location not recorded")}</p></div>${badgeFor(item)}</div>
        ${stageProgress(item.stage)}
        <div class="notice ${sampleComplete ? "notice-ok" : ["selected", "contract", "onboarded"].includes(item.stage) ? "notice-warn" : "notice-info"}"><strong>${escapeHtml(deriveWorkStatus(item))}</strong>${escapeHtml(item.nextAction || "Use the step form to add the next piece of evidence.")}</div>
        <div class="spacer-12"></div><div class="mini-label">RECORDED MILESTONES</div>
        <div class="trail-list" style="margin-top:12px">${events.length ? events.map((event, index) => `<div class="trail-item ${index === 0 ? "is-current" : ""}"><div class="trail-mark"><span class="trail-dot"></span></div><div class="trail-copy"><strong>${escapeHtml(STAGE_LABELS[event.stage])} <span class="opp-meta">· ${escapeHtml(new Date(event.at).toLocaleDateString())}</span></strong><small>${escapeHtml(event.evidenceType)}${event.reference ? ` · Ref ${escapeHtml(event.reference)}` : ""}</small><p>${escapeHtml(event.note || "No private document attached; reference is stored only in this browser.")}${event.paymentAmount ? ` · ${escapeHtml(event.currency)} ${escapeHtml(event.paymentAmount)} recorded` : ""}</p></div></div>`).join("") : `<div class="empty-state">No milestone evidence yet.</div>`}</div>
      </section>
      <section class="card section-card"><div class="card-heading"><div><h2>Record the next milestone</h2><p>Do not paste passwords, OTPs, PAN, bank details, or private contract text.</p></div></div>
        <form id="stage-form" class="form-grid">
          <div class="field full"><label for="stage-select">New milestone</label><select id="stage-select" name="stage">${STAGES.map((stage) => `<option value="${escapeHtml(stage.key)}" ${currentIndex >= STAGES.findIndex((s) => s.key === stage.key) ? "disabled" : ""}>${escapeHtml(stage.label)}${currentIndex >= STAGES.findIndex((s) => s.key === stage.key) ? " · already passed" : ""}</option>`).join("")}</select></div>
          <div class="field"><label for="event-type">Evidence source</label><select name="evidenceType" id="event-type"><option>Platform confirmation</option><option>Official company email</option><option>Written contract seen</option><option>Assignment card / task ID</option><option>Delivery receipt</option><option>Approval notice</option><option>Payment confirmation</option><option>Personal note</option></select></div>
          <div class="field"><label for="event-reference">Non-sensitive reference</label><input name="reference" id="event-reference" maxlength="240" placeholder="e.g. application ID or task ID"><small>Use an ID or source name, not a private code or document.</small></div>
          <div class="field" id="payment-amount-wrap" hidden><label for="payment-amount">Amount received</label><input name="paymentAmount" id="payment-amount" type="number" min="0.01" step="0.01" placeholder="Amount actually received"></div>
          <div class="field" id="payment-currency-wrap" hidden><label for="payment-currency">Currency</label><input name="currency" id="payment-currency" maxlength="8" value="${escapeHtml(item.currency)}"></div>
          <div class="field full"><label for="event-note">Short note (optional)</label><textarea name="note" id="event-note" maxlength="500" placeholder="What changed? Keep it brief and non-sensitive."></textarea></div>
          <div class="field full"><button class="button button-primary" type="submit">Record milestone</button><div class="limit-note" id="stage-error" aria-live="polite"></div></div>
        </form>
      </section>
    </div>`;
}

function opportunitiesFilterView() { return ""; }

function exportView() {
  const backup = exportProject(project, { redactNotes: true });
  const preview = JSON.stringify(backup, null, 2);
  return `${pageHead("DATA CONTROL", "Your data stays yours.", "TaskLatch stores records in this browser only. It has no account, mail connection, analytics, external AI, or server upload.")}
    <div class="two-col-export">
      <section class="card section-card"><div class="card-heading"><div><h2>Portable backup</h2><p>Export removes notes and shortens reference IDs by default.</p></div></div>
        <div class="notice notice-info"><strong>Review before sharing</strong>Even a redacted backup may reveal employer names, role history and dates. Keep it private unless you review the contents.</div>
        <div class="spacer-12"></div><div class="quick-actions"><button class="button button-primary" id="export-json" type="button">Download redacted backup</button><label class="button button-secondary" for="import-file">Import a backup<input class="sr-only" id="import-file" type="file" accept="application/json,.json"></label><button class="button button-danger" id="clear-records" type="button">Clear my records</button></div>
        <p class="limit-note">Import is limited to 1 MB and 300 records. A file is checked before it replaces anything. Nothing is uploaded.</p>
        <div class="spacer-12"></div><div class="mini-label">PRIVACY BOUNDARY</div><div class="rule-list"><div class="rule-item"><span class="rule-sign">✓</span><span>Use a task ID or confirmation ID instead of storing original emails or contracts.</span></div><div class="rule-item"><span class="rule-sign">✓</span><span>The sample uses fictional employers and synthetic event history.</span></div><div class="rule-item"><span class="rule-sign">✓</span><span>No third-party fonts, images, trackers, logins, API keys, or AI calls.</span></div><div class="rule-item"><span class="rule-sign">✓</span><span>Any follow-up message is only a draft outside this app; nothing is sent.</span></div></div>
      </section>
      <section class="card section-card"><div class="card-heading"><div><h2>Redacted export preview</h2><p>Notes are omitted; sensitive-looking IDs are shortened.</p></div></div><pre class="export-preview">${escapeHtml(preview)}</pre></section>
    </div>`;
}

const views = {
  overview: ["Overview", overviewView],
  opportunities: ["Opportunities", opportunitiesView],
  "offer-check": ["Offer check", offerCheckView],
  "work-trail": ["Work trail", workTrailView],
  export: ["Export & privacy", exportView],
};

function render() {
  const [title, viewFn] = views[view] ?? views.overview;
  topTitle.textContent = title;
  content.innerHTML = viewFn();
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  bindViewActions();
  document.querySelector("#nav-count").textContent = String(project.opportunities.length);
}

function bindViewActions() {
  content.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.go)));
  content.querySelectorAll("[data-open-opp]").forEach((button) => button.addEventListener("click", () => {
    selectedId = button.dataset.openOpp;
    switchView("work-trail");
  }));
  content.querySelectorAll("#check-opp, #trail-opp").forEach((select) => select.addEventListener("change", () => { selectedId = select.value; render(); }));

  const addForm = content.querySelector("#add-opportunity");
  addForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(addForm);
    const rawUrl = String(form.get("listingUrl") ?? "").trim();
    if (rawUrl && !normalizeUrl(rawUrl)) { showToast("Use a valid http or https listing URL without login codes."); return; }
    try {
      const item = createOpportunity({
        employer: form.get("employer"), role: form.get("role"), source: form.get("source"),
        listingUrl: rawUrl, region: form.get("region"), workType: form.get("workType"),
        listedRate: form.get("listedRate"), currency: form.get("currency"), nextAction: form.get("nextAction"),
      });
      project.opportunities.unshift(item);
      selectedId = item.id;
      save();
      showToast("Opportunity saved on this device.");
      switchView("work-trail");
    } catch (error) { showToast(error.message); }
  });

  content.querySelector("#risk-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = selectedOpportunity();
    item.risk = {
      ...item.risk,
      sourceVerified: form.get("sourceVerified"),
      writtenTerms: form.get("writtenTerms"),
      asksForMoney: form.has("asksForMoney"),
      payToUnlock: form.has("payToUnlock"),
      cryptoPayment: form.has("cryptoPayment"),
      unofficialContact: form.has("unofficialContact"),
      vagueTerms: form.has("vagueTerms"),
      sensitiveDocsEarly: form.has("sensitiveDocsEarly"),
      oversizedUnpaidTest: form.has("oversizedUnpaidTest"),
    };
    item.updatedAt = new Date().toISOString();
    save();
    showToast("Checklist updated. This is not an external verification.");
    render();
  });

  const stageSelect = content.querySelector("#stage-select");
  const paymentWrap = content.querySelector("#payment-amount-wrap");
  const currencyWrap = content.querySelector("#payment-currency-wrap");
  const updatePaymentFields = () => {
    const visible = stageSelect?.value === "paid";
    if (paymentWrap) paymentWrap.hidden = !visible;
    if (currencyWrap) currencyWrap.hidden = !visible;
  };
  stageSelect?.addEventListener("change", updatePaymentFields);
  updatePaymentFields();

  content.querySelector("#stage-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const item = selectedOpportunity();
    try {
      const updated = recordStageEvent(item, String(form.get("stage")), {
        evidenceType: form.get("evidenceType"), reference: form.get("reference"),
        note: form.get("note"), paymentAmount: form.get("paymentAmount"), currency: form.get("currency"),
      });
      project.opportunities = project.opportunities.map((opp) => opp.id === item.id ? updated : opp);
      save(); showToast("Milestone recorded locally."); render();
    } catch (error) {
      const errorNode = content.querySelector("#stage-error");
      if (errorNode) errorNode.textContent = error.message;
      showToast(error.message);
    }
  });

  content.querySelector("#export-json")?.addEventListener("click", () => download("tasklatch-redacted-backup.json", JSON.stringify(exportProject(project, { redactNotes: true }), null, 2), "application/json"));
  content.querySelector("#import-file")?.addEventListener("change", importFile);
  content.querySelector("#clear-records")?.addEventListener("click", () => {
    if (!window.confirm("Clear all TaskLatch records saved in this browser? Export a backup first if you need them.")) return;
    project = { schema: "tasklatch-project", version: 1, opportunities: [] };
    selectedId = ""; storageError = false; save(); showToast("Local records cleared."); render();
  });
}

async function importFile(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 1_000_000) { showToast("That file is larger than 1 MB. Current records are unchanged."); input.value = ""; return; }
  try {
    const candidate = importProject(await file.text());
    project = candidate;
    storageError = false;
    selectedId = project.opportunities[0]?.id ?? "";
    save(); showToast("Backup imported locally."); render();
  } catch (error) { showToast(`${error.message} Current records are unchanged.`); }
  input.value = "";
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Download started.");
}

function switchView(next) {
  if (!views[next]) return;
  view = next; render();
  content.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  toastElement.textContent = message;
  toastElement.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove("is-visible"), 3000);
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
document.querySelector("#reset-demo").addEventListener("click", () => {
  if (!window.confirm("Replace the records saved in this browser with the fictional TaskLatch sample?")) return;
  project = createSampleProject(); selectedId = "op-northstar"; storageError = false; save(); showToast("Fictional sample restored."); render();
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault(); switchView("opportunities"); content.querySelector("#new-employer")?.focus();
  }
});
if (!storageError && !localStorage.getItem(STORAGE_KEY)) save();
render();
