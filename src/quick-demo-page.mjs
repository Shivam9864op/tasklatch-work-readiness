import { STAGES } from "./core.mjs";
import { assignQuickDemoTask, createQuickDemoState, quickDemoSummary } from "./quick-demo.mjs";

const track = document.querySelector("#milestone-track");
const stateHeading = document.querySelector("#status-heading");
const stateDescription = document.querySelector("#status-description");
const stateSymbol = document.querySelector("#state-symbol");
const stagePill = document.querySelector("#stage-pill");
const stagePillText = document.querySelector("#stage-pill-text");
const stageCount = document.querySelector("#milestone-count");
const nextStep = document.querySelector("#next-step");
const paymentLabel = document.querySelector("#payment-label");
const paymentDetail = document.querySelector("#payment-detail");
const assignmentNote = document.querySelector("#assignment-note");
const recordButton = document.querySelector("#record-sample");
const recordLabel = document.querySelector("#record-label");
const hint = document.querySelector("#action-hint");
let state = createQuickDemoState();

function render() {
  const summary = quickDemoSummary(state);
  const currentIndex = STAGES.findIndex((item) => item.key === summary.stage);
  const shown = [
    ["applied", "Applied"],
    ["selected", "Selected"],
    ["contract", "Contract"],
    ["onboarded", "Onboarded"],
    ["assigned", "Task assigned"],
    ["paid", "Paid"],
  ];
  track.innerHTML = shown.map(([key, label], index) => {
    const stageIndex = STAGES.findIndex((item) => item.key === key);
    const stateClass = stageIndex < currentIndex ? "done" : stageIndex === currentIndex ? "current" : "";
    const mark = stageIndex < currentIndex ? "✓" : String(index + 1);
    return '<li class="milestone ' + stateClass + '"><span class="milestone-circle">' + mark + '</span><span class="milestone-label">' + label + '</span></li>';
  }).join("");
  const assigned = summary.stage === "assigned";
  stateHeading.textContent = assigned ? "Task assigned" : "Onboarded";
  stateDescription.textContent = assigned
    ? "A sample task reference is recorded. Payment is still not recorded."
    : "No task assignment has been recorded yet.";
  stateSymbol.textContent = assigned ? "✓" : "…";
  stateSymbol.className = "state-symbol " + (assigned ? "assigned-symbol" : "waiting-symbol");
  stagePill.className = "status-pill " + (assigned ? "active" : "waiting");
  stagePillText.textContent = assigned ? "Task assigned · payment not recorded" : "Onboarded · awaiting task";
  const shownIndex = shown.findIndex(([key]) => key === summary.stage);
  stageCount.textContent = (shownIndex + 1) + " of " + shown.length;
  nextStep.textContent = assigned ? "Wait for work review and approval" : "Ask whether a task is available";
  paymentLabel.textContent = "Not recorded";
  paymentDetail.textContent = assigned ? "Task exists · payment still needs separate evidence" : "No payment evidence in this sample";
  assignmentNote.hidden = !summary.assignmentReference;
  recordButton.disabled = assigned;
  recordLabel.textContent = assigned ? "Task assignment recorded" : "Record sample task assignment";
  hint.textContent = assigned
    ? "The task is recorded; payment is deliberately unchanged."
    : "This only changes the fictional sample in this page.";
}

recordButton.addEventListener("click", () => {
  state = assignQuickDemoTask(state);
  render();
});

document.querySelector("#reset-sample").addEventListener("click", () => {
  state = createQuickDemoState();
  render();
});

render();
