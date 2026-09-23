import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpportunity, createSampleProject, deriveWorkStatus, evaluateOffer,
  compareTerms, recordStageEvent, overviewMetrics, exportProject, importProject,
  MAX_IMPORT_BYTES,
} from "../src/core.mjs";

const make = (options = {}) => createOpportunity({ id: "one", employer: "Example Co", role: "QA helper", ...options }, "2026-09-20T12:00:00Z");
const evidence = (reference, overrides = {}) => ({ evidenceType: "Platform confirmation", reference, ...overrides });

test("selected and onboarded do not count as an assigned task or paid work", () => {
  const sample = createSampleProject().opportunities.find((item) => item.id === "op-northstar");
  assert.equal(sample.stage, "onboarded");
  assert.equal(deriveWorkStatus(sample), "Selected or onboarded; no task assignment recorded yet");
  assert.equal(overviewMetrics([sample]).paid, 0);
});

test("upfront deposit or pay-to-unlock makes the result pause-and-verify", () => {
  const item = make({ risk: { asksForMoney: true, payToUnlock: true, sourceVerified: "no" } });
  const result = evaluateOffer(item);
  assert.equal(result.state, "pause_and_verify");
  assert.equal(result.hardStop, true);
  assert.match(result.label, /Pause and verify/);
});

test("an empty checklist cannot claim an offer is safe", () => {
  const result = evaluateOffer(make());
  assert.equal(result.state, "more_evidence_needed");
  assert.match(result.disclaimer, /not a guarantee/i);
});

test("complete manual checks only say no listed warning was found", () => {
  const result = evaluateOffer(make({ risk: { sourceVerified: "yes", writtenTerms: "complete" } }));
  assert.equal(result.state, "no_warning_found");
  assert.equal(result.label, "No listed warning found");
  assert.match(result.disclaimer, /cannot prove/i);
});

test("advertised versus agreed rate compares values and preserves unknowns", () => {
  assert.equal(compareTerms(make()).state, "unknown");
  const changed = compareTerms(make({ listedRate: 20, agreedRate: 15, currency: "USD" }));
  assert.equal(changed.state, "changed");
  assert.equal(changed.difference, -5);
  assert.match(changed.message, /-5 USD\/hour/);
});

test("work cannot be submitted before a task is assigned", () => {
  const item = make();
  assert.throws(() => recordStageEvent(item, "delivered", evidence("delivery-1"), "2026-09-21T12:00:00Z"), /assignment/i);
});

test("a task requires a reference and cannot be marked assigned with no evidence", () => {
  const item = make({ stage: "contract", events: [{ stage: "contract", at: "2026-09-20T12:00:00Z", reference: "C-1" }] });
  assert.throws(() => recordStageEvent(item, "assigned", { note: "I think it started" }), /task or assignment reference/i);
  const assigned = recordStageEvent(item, "assigned", evidence("TASK-42"), "2026-09-21T12:00:00Z");
  assert.equal(assigned.stage, "assigned");
  assert.match(deriveWorkStatus(assigned), /payment is not recorded/i);
});

test("payment cannot be recorded before submitted work and approval", () => {
  const item = make({ stage: "assigned", events: [{ stage: "assigned", at: "2026-09-20T12:00:00Z", reference: "TASK-4" }] });
  assert.throws(() => recordStageEvent(item, "paid", evidence("PAY-1", { paymentAmount: 20 }), "2026-09-22T12:00:00Z"), /approval/i);
});

test("full assignment-to-payment path requires references and positive received amount", () => {
  let item = make();
  item = recordStageEvent(item, "assigned", evidence("TASK-10"), "2026-09-20T12:00:00Z");
  item = recordStageEvent(item, "delivered", evidence("DEL-10"), "2026-09-21T12:00:00Z");
  item = recordStageEvent(item, "approved", evidence("APP-10"), "2026-09-22T12:00:00Z");
  assert.throws(() => recordStageEvent(item, "paid", evidence("PAY-10", { paymentAmount: 0 }), "2026-09-23T12:00:00Z"), /positive amount/i);
  item = recordStageEvent(item, "paid", evidence("PAY-10", { paymentAmount: 95, currency: "USD" }), "2026-09-23T12:00:00Z");
  assert.equal(item.stage, "paid");
  assert.equal(deriveWorkStatus(item), "Payment recorded by you");
});

test("milestones are append-only and cannot be moved backwards", () => {
  const item = make({ stage: "onboarded", events: [{ stage: "onboarded", at: "2026-09-20T12:00:00Z", reference: "onboard" }] });
  assert.throws(() => recordStageEvent(item, "selected", evidence("select")), /later milestone/i);
});

test("malformed URL is discarded and creation requires employer and role", () => {
  assert.equal(make({ listingUrl: "javascript:alert(1)" }).listingUrl, "");
  assert.throws(() => createOpportunity({ employer: "Only employer" }), /organization and a role/i);
});

test("redacted export omits notes and private URL paths, then imports supported records", () => {
  let item = make({ listingUrl: "https://private.example/jobs/secret-id", events: [] });
  item = recordStageEvent(item, "applied", evidence("REF-927194", { note: "Contains personal content" }), "2026-09-21T12:00:00Z");
  const exported = exportProject({ opportunities: [item] });
  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(serialized, /Contains personal content|REF-927194|secret-id/);
  const imported = importProject(exported);
  assert.equal(imported.opportunities.length, 1);
  assert.equal(imported.opportunities[0].employer, "Example Co");
});

test("invalid or oversized import fails before replacing application state", () => {
  assert.throws(() => importProject("not json"), /valid JSON/i);
  assert.throws(() => importProject({ schema: "other", version: 1, opportunities: [] }), /supported TaskLatch backup/i);
  assert.throws(() => importProject("x".repeat(MAX_IMPORT_BYTES + 1)), /larger than 1 MB/i);
  assert.throws(() => importProject({ schema: "tasklatch-project", version: 1, opportunities: [{ id: "same", employer: "X", role: "Y", stage: "saved", events: [] }, { id: "same", employer: "A", role: "B", stage: "saved", events: [] }] }), /duplicate record IDs/i);
});

test("overview metrics are stage-based and count only recorded payments", () => {
  const list = createSampleProject().opportunities;
  const result = overviewMetrics(list);
  assert.equal(result.opportunities, 5);
  assert.equal(result.waitingForTask, 1);
  assert.equal(result.taskInProgress, 1);
  assert.equal(result.paid, 1);
  assert.equal(result.pauseAndVerify, 1);
});
