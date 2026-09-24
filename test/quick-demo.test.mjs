import test from "node:test";
import assert from "node:assert/strict";
import { assignQuickDemoTask, createQuickDemoState, QUICK_DEMO_REFERENCE, quickDemoSummary } from "../src/quick-demo.mjs";

test("guided demo starts onboarded without an assigned task or payment", () => {
  const summary = quickDemoSummary(createQuickDemoState());
  assert.equal(summary.stage, "onboarded");
  assert.match(summary.status, /no task assignment recorded/i);
  assert.equal(summary.paymentRecorded, false);
  assert.equal(summary.assignmentReference, "");
});

test("recording the fictional task changes assignment status but never records payment", () => {
  const state = createQuickDemoState();
  const assigned = assignQuickDemoTask(state, "2026-09-24T12:00:00.000Z");
  const summary = quickDemoSummary(assigned);
  assert.equal(summary.stage, "assigned");
  assert.match(summary.status, /payment is not recorded/i);
  assert.equal(summary.paymentRecorded, false);
  assert.equal(summary.assignmentReference, QUICK_DEMO_REFERENCE);
});

test("the guided demo cannot add a duplicate assignment on a second click", () => {
  const first = assignQuickDemoTask(createQuickDemoState(), "2026-09-24T12:00:00.000Z");
  const second = assignQuickDemoTask(first, "2026-09-24T12:01:00.000Z");
  assert.equal(second, first);
  assert.equal(second.opportunity.events.filter((event) => event.reference === QUICK_DEMO_REFERENCE).length, 1);
});
