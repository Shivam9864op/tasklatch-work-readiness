const duration = 36;
const scenes = [...document.querySelectorAll(".scene")];
const chapterLabel = document.querySelector("#chapter-label");
const progressFill = document.querySelector("#progress-fill");
const frame = document.querySelector("#tasklatch-demo-frame");
const windowState = document.querySelector("#window-state");
const paymentSpotlight = document.querySelector("#payment-spotlight");
const chapters = [
  "01 · The waiting gap",
  "02 · Separate milestones",
  "03 · Meet TaskLatch",
  "04 · Record the task",
  "05 · Keep payment honest",
  "06 · The takeaway",
];
const startTimes = [0, 5.5, 11, 18, 24, 30];
let startedAt = performance.now();
let manualPause = false;
let taskWasRecorded = false;
let spotlightAdded = false;
let frameRequest = 0;

function beatFor(time) {
  for (let index = startTimes.length - 1; index >= 0; index--) {
    if (time >= startTimes[index]) return index;
  }
  return 0;
}

function recordSyntheticAssignment() {
  if (taskWasRecorded) return;
  try {
    const doc = frame.contentDocument;
    const button = doc?.querySelector("#record-sample");
    if (!button || button.disabled) return;
    button.click();
    taskWasRecorded = doc.querySelector("#status-heading")?.textContent.trim() === "Task assigned";
    if (taskWasRecorded) windowState.textContent = "TASK ASSIGNED · DEMO-TASK-17";
  } catch {
    // The film remains understandable if a browser blocks cross-frame access.
  }
}

function spotlightPayment() {
  if (spotlightAdded) return;
  try {
    const doc = frame.contentDocument;
    const paymentCard = doc?.querySelector(".payment-card");
    if (!paymentCard) return;
    paymentCard.dataset.motionFocus = "true";
    let style = doc.querySelector("#motion-film-highlight");
    if (!style) {
      style = doc.createElement("style");
      style.id = "motion-film-highlight";
      style.textContent = ".payment-card[data-motion-focus='true']{border-color:#e1a949!important;box-shadow:0 0 0 4px rgba(225,169,73,.22),0 12px 34px rgba(146,103,40,.15)!important;transition:box-shadow .4s ease,border-color .4s ease}";
      doc.head.append(style);
    }
    spotlightAdded = true;
  } catch {
    // The text callout remains available when frame styling is unavailable.
  }
}

function render(time) {
  const seconds = Math.max(0, Math.min(duration, time));
  const beat = beatFor(seconds);
  document.body.dataset.scene = String(beat);
  scenes.forEach((scene, index) => {
    scene.classList.toggle("active", index === beat);
    scene.setAttribute("aria-hidden", index === beat ? "false" : "true");
  });
  chapterLabel.textContent = chapters[beat];
  progressFill.style.width = ((seconds / duration) * 100).toFixed(3) + "%";
  if (seconds >= 18) recordSyntheticAssignment();
  if (seconds >= 24) {
    spotlightPayment();
    paymentSpotlight.classList.add("visible");
  } else {
    paymentSpotlight.classList.remove("visible");
  }
}

function animate(now) {
  if (manualPause) return;
  const elapsed = (now - startedAt) / 1000;
  render(elapsed);
  if (elapsed < duration) frameRequest = requestAnimationFrame(animate);
}

function restart() {
  cancelAnimationFrame(frameRequest);
  try {
    frame.contentDocument?.querySelector("#reset-sample")?.click();
    frame.contentDocument?.querySelector(".payment-card")?.removeAttribute("data-motion-focus");
    frame.contentDocument?.querySelector("#motion-film-highlight")?.remove();
  } catch {
    // A page reload restores the clean sample if the iframe is not ready yet.
  }
  taskWasRecorded = false;
  spotlightAdded = false;
  manualPause = false;
  startedAt = performance.now();
  render(0);
  frameRequest = requestAnimationFrame(animate);
}

function seek(time) {
  cancelAnimationFrame(frameRequest);
  manualPause = true;
  render(time);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !manualPause && !frameRequest) {
    startedAt = performance.now();
    frameRequest = requestAnimationFrame(animate);
  }
});
window.__taskLatchMotion = { duration, seek, restart };
frame.addEventListener("load", () => {
  if (!manualPause) render((performance.now() - startedAt) / 1000);
});
frameRequest = requestAnimationFrame(animate);
