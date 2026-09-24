import { createSampleProject, deriveWorkStatus, recordStageEvent } from "./core.mjs";

export const QUICK_DEMO_REFERENCE = "DEMO-TASK-17";

export function createQuickDemoState() {
  const opportunity = createSampleProject().opportunities.find((item) => item.id === "op-northstar");
  if (!opportunity) throw new Error("The fictional guided-demo record is missing.");
  return { opportunity };
}

export function assignQuickDemoTask(state, now = new Date().toISOString()) {
  if (state.opportunity.stage !== "onboarded") return state;
  const opportunity = recordStageEvent(state.opportunity, "assigned", {
    evidenceType: "Synthetic demo record",
    reference: QUICK_DEMO_REFERENCE,
    note: "Fictional task assignment for the guided demo.",
  }, now);
  return { opportunity };
}

export function quickDemoSummary(state) {
  return {
    stage: state.opportunity.stage,
    status: deriveWorkStatus(state.opportunity),
    paymentRecorded: state.opportunity.stage === "paid",
    assignmentReference: state.opportunity.events.find((event) => event.reference === QUICK_DEMO_REFERENCE)?.reference ?? "",
  };
}
