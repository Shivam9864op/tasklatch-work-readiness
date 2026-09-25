const duration = 20;
const scenes = [...document.querySelectorAll(".scene")];
const chapterLabel = document.querySelector("#chapter-label");
const progressFill = document.querySelector("#progress-fill");
const frame = document.querySelector("#tasklatch-demo-frame");
const windowState = document.querySelector("#window-state");
const productWindow = document.querySelector("#product-window");
const paymentSpotlight = document.querySelector("#payment-spotlight");
const glow = document.querySelector(".glow-one");
const grid = document.querySelector(".backdrop-grid");
const chapters = [
  "01 · The waiting gap",
  "02 · Separate milestones",
  "03 · Meet TaskLatch",
  "04 · Record the task",
  "05 · Keep payment honest",
  "06 · The takeaway",
];
const startTimes = [0, 3.2, 6, 9.8, 13.2, 16.6];
let startedAt = performance.now();
let manualPause = false;
let taskWasRecorded = false;
let spotlightAdded = false;
let frameRequest = 0;

const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => {
  const t = clamp(value);
  return 1 - Math.pow(1 - t, 3);
};

function beatFor(time) {
  for (let index = startTimes.length - 1; index >= 0; index--) {
    if (time >= startTimes[index]) return index;
  }
  return 0;
}

function paint(element, localTime, delay = 0, durationSeconds = 0.42, x = 0, y = 0, scale = 0.985) {
  if (!element) return 0;
  const progress = ease((localTime - delay) / durationSeconds);
  element.style.opacity = progress.toFixed(4);
  element.style.transform = `translate3d(${((1 - progress) * x).toFixed(2)}px, ${((1 - progress) * y).toFixed(2)}px, 0) scale(${(scale + (1 - scale) * progress).toFixed(4)})`;
  return progress;
}

function paintProductCopy(element, localTime) {
  if (!element) return;
  const progress = ease(localTime / 0.38);
  element.style.opacity = progress.toFixed(4);
  element.style.transform = `translate3d(${((-1 + progress) * 44).toFixed(2)}px, -44%, 0) scale(${(0.985 + 0.015 * progress).toFixed(4)})`;
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
      style.textContent = ".payment-card[data-motion-focus='true']{border-color:#e1a949!important;box-shadow:0 0 0 4px rgba(225,169,73,.22),0 12px 34px rgba(146,103,40,.15)!important}";
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
  const localTime = seconds - startTimes[beat];
  document.body.dataset.scene = String(beat);
  scenes.forEach((scene, index) => {
    const active = index === beat;
    scene.classList.toggle("active", active);
    scene.setAttribute("aria-hidden", active ? "false" : "true");
    scene.style.visibility = active ? "visible" : "hidden";
    scene.style.opacity = active ? "1" : "0";
    scene.style.transform = "none";
  });
  chapterLabel.textContent = chapters[beat];
  progressFill.style.width = ((seconds / duration) * 100).toFixed(3) + "%";
  grid.style.backgroundPosition = `0px ${(seconds * 17).toFixed(1)}px, ${(seconds * 17).toFixed(1)}px 0px`;
  glow.style.transform = `translate3d(${Math.sin(seconds * 0.42) * 70 - 170}px, ${Math.cos(seconds * 0.34) * 55 + 135}px, 0) scale(${0.94 + Math.sin(seconds * 0.28) * 0.06})`;

  if (beat === 0) {
    paint(scenes[0].querySelector(".hook-copy"), localTime, 0.02, 0.38, -48, 0, 0.99);
    paint(scenes[0].querySelector(".signal-board"), localTime, 0.08, 0.48, 58, 0, 0.98);
    scenes[0].querySelectorAll(".signal-card").forEach((card, index) => {
      paint(card, localTime, 0.24 + index * 0.18, 0.34, 26, 0, 0.99);
    });
    scenes[0].querySelectorAll(".signal-orbit").forEach((orbit, index) => {
      orbit.style.transform = `rotate(${(-22 + seconds * (index ? -2 : 3)).toFixed(2)}deg)`;
    });
    paint(scenes[0].querySelector(".signal-foot"), localTime, 0.48, 0.3, 0, 8, 1);
  }

  if (beat === 1) {
    paint(scenes[1].querySelector(".center-copy"), localTime, 0, 0.36, 0, 30, 0.99);
    const ribbonProgress = paint(scenes[1].querySelector(".milestone-ribbon"), localTime, 0.12, 0.42, 0, 36, 0.99);
    scenes[1].querySelectorAll(".ribbon-card").forEach((card, index) => {
      paint(card, localTime, 0.28 + index * 0.12, 0.3, 0, 18, 0.99);
    });
    const ribbonFill = scenes[1].querySelector(".ribbon-fill");
    if (ribbonFill) ribbonFill.style.width = (ribbonProgress * 100).toFixed(1) + "%";
  }

  if (beat >= 2 && beat <= 4) {
    const productProgress = ease((seconds - startTimes[2]) / 0.46);
    productWindow.style.visibility = "visible";
    productWindow.style.opacity = productProgress.toFixed(4);
    productWindow.style.transform = `translate3d(${((1 - productProgress) * 62).toFixed(2)}px, -47%, 0) scale(${(0.978 + 0.022 * productProgress).toFixed(4)})`;
    paintProductCopy(scenes[beat].querySelector(".product-copy"), localTime);
    if (beat === 3) {
      paint(scenes[3].querySelector(".success-tag"), localTime, 0.34, 0.3, 0, 7, 1);
    }
  } else {
    productWindow.style.visibility = "hidden";
    productWindow.style.opacity = "0";
  }

  if (beat === 4) {
    const spotlightProgress = ease(localTime / 0.34);
    paymentSpotlight.style.opacity = spotlightProgress.toFixed(4);
    paymentSpotlight.style.transform = `translate3d(${((1 - spotlightProgress) * 12).toFixed(2)}px, ${((1 - spotlightProgress) * 8).toFixed(2)}px, 0) scale(${(0.97 + 0.03 * spotlightProgress).toFixed(4)})`;
  } else {
    paymentSpotlight.style.opacity = "0";
  }

  if (beat === 5) {
    paint(scenes[5].querySelector(".brand-end"), localTime, 0, 0.46, 0, 25, 0.985);
    scenes[5].querySelectorAll(".brand-end-orbit").forEach((orbit, index) => {
      const progress = ease(localTime / (index ? 0.7 : 0.56));
      orbit.style.opacity = progress.toFixed(4);
      orbit.style.transform = `scale(${(0.84 + progress * 0.16).toFixed(4)}) rotate(${(seconds * (index ? -2 : 2)).toFixed(2)}deg)`;
    });
  }

  if (seconds >= 9.8) recordSyntheticAssignment();
  if (seconds >= 13.2) spotlightPayment();
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
