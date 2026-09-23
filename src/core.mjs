export const STAGES = [
  { key: "saved", label: "Saved", group: "search" },
  { key: "verified", label: "Source checked", group: "search" },
  { key: "applied", label: "Applied", group: "hiring" },
  { key: "assessment", label: "Assessment", group: "hiring" },
  { key: "selected", label: "Selected", group: "hiring" },
  { key: "contract", label: "Contract", group: "work" },
  { key: "onboarded", label: "Onboarded", group: "work" },
  { key: "assigned", label: "Task assigned", group: "work" },
  { key: "delivered", label: "Work submitted", group: "work" },
  { key: "approved", label: "Approved", group: "work" },
  { key: "paid", label: "Paid", group: "work" },
];

export const STAGE_LABELS = Object.fromEntries(STAGES.map(({ key, label }) => [key, label]));
export const PROJECT_VERSION = 1;
export const MAX_IMPORT_BYTES = 1_000_000;

const REQUIRED_EVIDENCE = new Set(["verified", "applied", "assessment", "selected", "contract", "onboarded", "assigned", "delivered", "approved", "paid"]);
const RISK_LABELS = {
  asksForMoney: "The role asks you to pay a fee, deposit, or purchase a kit.",
  payToUnlock: "You must deposit or pay money to unlock tasks or withdraw earnings.",
  cryptoPayment: "The request involves crypto or a wallet transfer.",
  unofficialContact: "The contact route or sender domain has not been verified against an official source.",
  vagueTerms: "The pay, work scope, or payment timing is not clear in writing.",
  sensitiveDocsEarly: "Sensitive identity or bank documents are requested before the offer is independently verified.",
  oversizedUnpaidTest: "The screening asks for substantial unpaid work; clarify the limit and whether it is paid.",
};

const text = (value, max = 240) => typeof value === "string" ? value.trim().slice(0, max) : "";
const numeric = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const isDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function normalizeUrl(value) {
  const raw = text(value, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

export function createOpportunity(input, now = new Date().toISOString()) {
  const employer = text(input?.employer, 100);
  const role = text(input?.role, 120);
  if (!employer || !role) throw new Error("Add both an organization and a role title.");
  const stage = STAGES.some((entry) => entry.key === input?.stage) ? input.stage : "saved";
  const createdAt = isDate(input?.createdAt) ? new Date(input.createdAt).toISOString() : now;
  const listingUrl = normalizeUrl(input?.listingUrl);
  const listedRate = numeric(input?.listedRate);
  const agreedRate = numeric(input?.agreedRate);
  return {
    id: text(input?.id, 80) || `opp-${crypto.randomUUID()}`,
    employer,
    role,
    source: text(input?.source, 80) || "Other",
    listingUrl,
    region: text(input?.region, 80),
    workType: text(input?.workType, 60) || "Not stated",
    listedRate: listedRate !== null && listedRate >= 0 ? listedRate : null,
    agreedRate: agreedRate !== null && agreedRate >= 0 ? agreedRate : null,
    currency: text(input?.currency, 8) || "USD",
    hoursPerWeek: numeric(input?.hoursPerWeek),
    stage,
    risk: normalizeRisk(input?.risk),
    events: Array.isArray(input?.events) ? input.events.map(normalizeEvent).filter(Boolean) : [],
    nextAction: text(input?.nextAction, 220),
    followUpOn: isDate(input?.followUpOn) ? new Date(input.followUpOn).toISOString().slice(0, 10) : "",
    note: text(input?.note, 800),
    createdAt,
    updatedAt: isDate(input?.updatedAt) ? new Date(input.updatedAt).toISOString() : createdAt,
  };
}

function normalizeRisk(value = {}) {
  return {
    sourceVerified: ["yes", "no", "unknown"].includes(value.sourceVerified) ? value.sourceVerified : "unknown",
    writtenTerms: ["complete", "partial", "missing"].includes(value.writtenTerms) ? value.writtenTerms : "missing",
    asksForMoney: value.asksForMoney === true,
    payToUnlock: value.payToUnlock === true,
    cryptoPayment: value.cryptoPayment === true,
    unofficialContact: value.unofficialContact === true,
    vagueTerms: value.vagueTerms === true,
    sensitiveDocsEarly: value.sensitiveDocsEarly === true,
    oversizedUnpaidTest: value.oversizedUnpaidTest === true,
    unpaidTestHours: numeric(value.unpaidTestHours),
  };
}

function normalizeEvent(event) {
  if (!event || !STAGE_LABELS[event.stage] || !isDate(event.at)) return null;
  return {
    id: text(event.id, 80) || `event-${crypto.randomUUID()}`,
    stage: event.stage,
    at: new Date(event.at).toISOString(),
    evidenceType: text(event.evidenceType, 80) || "Personal note",
    reference: text(event.reference, 240),
    note: text(event.note, 500),
    paymentAmount: numeric(event.paymentAmount),
    currency: text(event.currency, 8) || "USD",
  };
}

export function recordStageEvent(opportunity, stage, input, now = new Date().toISOString()) {
  if (!STAGE_LABELS[stage]) throw new Error("Choose a valid stage.");
  const currentRank = STAGES.findIndex((item) => item.key === opportunity.stage);
  const targetRank = STAGES.findIndex((item) => item.key === stage);
  if (targetRank <= currentRank) throw new Error("Choose a later milestone. Correct earlier details in your note instead of rewriting the history.");
  if (REQUIRED_EVIDENCE.has(stage) && !text(input?.reference, 240) && !text(input?.note, 500)) {
    throw new Error("Add a short reference or note for this milestone. Do not paste private documents or codes.");
  }
  if (stage === "assigned" && !text(input?.reference, 240)) throw new Error("Add a non-sensitive task or assignment reference before marking work assigned.");
  if (stage === "paid" && !(numeric(input?.paymentAmount) > 0)) throw new Error("Enter a positive amount received before recording paid work.");
  const prior = opportunity.events ?? [];
  if (stage === "delivered" && !prior.some((item) => item.stage === "assigned")) throw new Error("Record a task assignment before marking work submitted.");
  if (stage === "approved" && !prior.some((item) => item.stage === "delivered")) throw new Error("Record submitted work before marking it approved.");
  if (stage === "paid" && !prior.some((item) => item.stage === "approved")) throw new Error("Record an approval before marking a task paid.");

  const event = normalizeEvent({
    id: `event-${crypto.randomUUID()}`,
    stage,
    at: now,
    evidenceType: input?.evidenceType,
    reference: input?.reference,
    note: input?.note,
    paymentAmount: input?.paymentAmount,
    currency: input?.currency || opportunity.currency,
  });
  return { ...opportunity, stage, events: [...prior, event], updatedAt: now };
}

export function evaluateOffer(opportunity) {
  const risk = normalizeRisk(opportunity.risk);
  const flags = [];
  const hardStop = [];
  if (risk.asksForMoney) hardStop.push(RISK_LABELS.asksForMoney);
  if (risk.payToUnlock) hardStop.push(RISK_LABELS.payToUnlock);
  if (risk.cryptoPayment) hardStop.push(RISK_LABELS.cryptoPayment);
  if (risk.unofficialContact) flags.push(RISK_LABELS.unofficialContact);
  if (risk.vagueTerms || risk.writtenTerms !== "complete") flags.push(RISK_LABELS.vagueTerms);
  if (risk.sensitiveDocsEarly) flags.push(RISK_LABELS.sensitiveDocsEarly);
  if (risk.oversizedUnpaidTest) flags.push(RISK_LABELS.oversizedUnpaidTest);
  if (risk.sourceVerified !== "yes") flags.push("The employer or listing source still needs an independent check.");

  let state = "no_warning_found";
  let label = "No listed warning found";
  if (hardStop.length) {
    state = "pause_and_verify";
    label = "Pause and verify before sending money or continuing";
  } else if (flags.length) {
    state = "more_evidence_needed";
    label = "More evidence needed";
  }
  const workStatus = deriveWorkStatus(opportunity);
  return {
    state,
    label,
    flags: [...hardStop, ...flags],
    hardStop: hardStop.length > 0,
    workStatus,
    disclaimer: "This checklist cannot prove that an employer or offer is legitimate. A clear result is not a guarantee.",
  };
}

export function deriveWorkStatus(opportunity) {
  const stage = opportunity.stage;
  if (stage === "paid") return "Payment recorded by you";
  if (["assigned", "delivered", "approved"].includes(stage)) return "A task is recorded; payment is not recorded yet";
  if (["contract", "onboarded", "selected"].includes(stage)) return "Selected or onboarded; no task assignment recorded yet";
  return "No paid assignment recorded";
}

export function compareTerms(opportunity) {
  const listed = numeric(opportunity.listedRate);
  const agreed = numeric(opportunity.agreedRate);
  if (listed === null || agreed === null) return { state: "unknown", difference: null, message: "Enter both rates to compare; missing values are not treated as zero." };
  const difference = agreed - listed;
  if (difference === 0) return { state: "same", difference, message: "The recorded rates match. Confirm hours and payment timing separately." };
  return {
    state: "changed",
    difference,
    message: `Recorded rate changed by ${difference > 0 ? "+" : ""}${difference} ${opportunity.currency}/hour. Confirm the written terms before relying on them.`,
  };
}

export function overviewMetrics(opportunities) {
  return {
    opportunities: opportunities.length,
    waitingForTask: opportunities.filter((item) => ["selected", "contract", "onboarded"].includes(item.stage)).length,
    taskInProgress: opportunities.filter((item) => ["assigned", "delivered", "approved"].includes(item.stage)).length,
    paid: opportunities.filter((item) => item.stage === "paid").length,
    pauseAndVerify: opportunities.filter((item) => evaluateOffer(item).hardStop).length,
  };
}

export function exportProject(state, { redactNotes = true } = {}) {
  const opportunities = state.opportunities.map((item) => ({
    ...item,
    listingUrl: redactNotes ? redactUrl(item.listingUrl) : item.listingUrl,
    note: redactNotes ? "" : item.note,
    events: item.events.map((event) => ({
      ...event,
      reference: redactNotes ? redactReference(event.reference) : event.reference,
      note: redactNotes ? "" : event.note,
    })),
  }));
  return { schema: "tasklatch-project", version: PROJECT_VERSION, exportedAt: new Date().toISOString(), opportunities };
}

function redactReference(value) {
  const input = text(value, 240);
  if (!input) return "";
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      return `${url.origin}/…`;
    } catch { return "[redacted reference]"; }
  }
  return input.length > 12 ? `${input.slice(0, 4)}…${input.slice(-3)}` : "[redacted reference]";
}

function redactUrl(value) {
  const safe = normalizeUrl(value);
  if (!safe) return "";
  try { return `${new URL(safe).origin}/…`; }
  catch { return ""; }
}

export function importProject(raw) {
  const textValue = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (new TextEncoder().encode(textValue).length > MAX_IMPORT_BYTES) throw new Error("Backup is larger than 1 MB.");
  let input;
  try { input = typeof raw === "string" ? JSON.parse(raw) : raw; }
  catch { throw new Error("That file is not valid JSON."); }
  if (!input || input.schema !== "tasklatch-project" || input.version !== PROJECT_VERSION || !Array.isArray(input.opportunities)) {
    throw new Error("This is not a supported TaskLatch backup. Your current data has not changed.");
  }
  if (input.opportunities.length > 300) throw new Error("This backup has too many records (limit: 300).");
  const opportunities = input.opportunities.map((item) => {
    if (!item || !STAGE_LABELS[item.stage] || !Array.isArray(item.events)) throw new Error("A record has an unsupported stage or event list. Your current data has not changed.");
    let replay = createOpportunity({ ...item, stage: "saved", events: [] });
    for (const rawEvent of item.events) {
      const event = normalizeEvent(rawEvent);
      if (!event) throw new Error("A milestone has invalid fields. Your current data has not changed.");
      replay = recordStageEvent(replay, event.stage, event, event.at);
    }
    if (replay.stage !== item.stage) throw new Error("A record's current stage does not match its milestone history. Your current data has not changed.");
    const normalized = createOpportunity({ ...item, events: replay.events });
    return { ...normalized, stage: replay.stage, events: replay.events };
  });
  const ids = new Set();
  for (const item of opportunities) {
    if (ids.has(item.id)) throw new Error("This backup contains duplicate record IDs. Your current data has not changed.");
    ids.add(item.id);
  }
  return { schema: "tasklatch-project", version: PROJECT_VERSION, opportunities };
}

export function createSampleProject() {
  const makeEvents = (prefix, keys, dateBase) => keys.map((stage, index) => ({
    id: `${prefix}-${index + 1}`,
    stage,
    at: new Date(Date.parse(dateBase) + index * 86_400_000).toISOString(),
    evidenceType: ["Official listing", "Application confirmation", "Platform notice", "Written terms", "Portal checklist", "Assignment card", "Delivery receipt", "Review notice", "Payment record"][index] || "Personal note",
    reference: `${prefix.toUpperCase()}-${100 + index}`,
    note: "Synthetic demo record",
    paymentAmount: stage === "paid" ? 180 : null,
    currency: "USD",
  }));
  return {
    schema: "tasklatch-project",
    version: PROJECT_VERSION,
    opportunities: [
      createOpportunity({
        id: "op-northstar", employer: "Northstar AI Lab", role: "Hindi AI Response Reviewer", source: "Company career page", listingUrl: "https://example.test/careers/hindi-reviewer", region: "India · Remote", workType: "Hourly contract", listedRate: 18, agreedRate: 18, currency: "USD", hoursPerWeek: 15, stage: "onboarded", risk: { sourceVerified: "yes", writtenTerms: "complete" }, events: makeEvents("northstar", ["verified", "applied", "assessment", "selected", "contract", "onboarded"], "2026-09-02T12:00:00Z"), nextAction: "Ask whether a project batch is available", followUpOn: "2026-09-25", note: "Fictional sample · synthetic data" }),
      createOpportunity({
        id: "op-riverstone", employer: "Riverstone QA", role: "Junior API Workflow Tester", source: "LinkedIn", listingUrl: "https://example.test/jobs/api-qa", region: "India · Remote", workType: "Part-time", listedRate: 15, agreedRate: 15, currency: "USD", hoursPerWeek: 10, stage: "assigned", risk: { sourceVerified: "yes", writtenTerms: "complete" }, events: makeEvents("riverstone", ["verified", "applied", "assessment", "selected", "contract", "assigned"], "2026-09-08T12:00:00Z"), nextAction: "Submit the bounded sample and wait for review", followUpOn: "2026-09-26", note: "Fictional sample · synthetic data" }),
      createOpportunity({
        id: "op-mint", employer: "Mint & Meter Studio", role: "Social Content Assistant", source: "Email referral", listingUrl: "https://example.test/jobs/content-assistant", region: "Remote · India", workType: "Freelance", listedRate: null, agreedRate: null, currency: "USD", stage: "applied", risk: { sourceVerified: "unknown", writtenTerms: "missing", vagueTerms: true }, events: makeEvents("mint", ["applied"], "2026-09-17T12:00:00Z"), nextAction: "Ask for expected hours, scope, and rate in writing", followUpOn: "2026-09-24", note: "Fictional sample · synthetic data" }),
      createOpportunity({
        id: "op-quicktask", employer: "QuickTask Rewards", role: "Remote Product Rating Tasks", source: "Unsolicited message", listingUrl: "https://example.test/offer", region: "Unknown", workType: "Task-based", listedRate: 40, currency: "USD", stage: "assessment", risk: { sourceVerified: "no", writtenTerms: "missing", asksForMoney: true, payToUnlock: true, cryptoPayment: true, unofficialContact: true, sensitiveDocsEarly: true }, events: makeEvents("quicktask", ["applied", "assessment"], "2026-09-20T12:00:00Z"), nextAction: "Pause. Do not deposit money; verify the company independently", followUpOn: "", note: "Fictional warning scenario · synthetic data" }),
      createOpportunity({
        id: "op-cedar", employer: "Cedar Support Co.", role: "Automation Support Contractor", source: "Company career page", listingUrl: "https://example.test/careers/support", region: "India · Remote", workType: "Hourly contract", listedRate: 14, agreedRate: 14, currency: "USD", hoursPerWeek: 8, stage: "paid", risk: { sourceVerified: "yes", writtenTerms: "complete" }, events: makeEvents("cedar", ["verified", "applied", "selected", "contract", "assigned", "delivered", "approved", "paid"], "2026-08-28T12:00:00Z"), nextAction: "Confirm next assignment date", followUpOn: "2026-09-30", note: "Fictional sample · synthetic data" }),
    ],
  };
}
