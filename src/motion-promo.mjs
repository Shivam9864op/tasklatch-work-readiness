const duration = 20;
const frame = document.querySelector("#tasklatch-demo-frame");
const canvas = document.querySelector("#motion-atmosphere");
const context = canvas.getContext("2d", { alpha: false });
const rig = document.querySelector("#camera-rig");
const opening = document.querySelector("#opening");
const milestones = document.querySelector("#milestones");
const cards = [...document.querySelectorAll(".milestone-card")];
const productCopy = document.querySelector("#product-copy");
const productWindow = document.querySelector("#product-window");
const paymentFocus = document.querySelector("#payment-focus");
const closing = document.querySelector("#closing");
const chapterLabel = document.querySelector("#chapter-label");
const progressFill = document.querySelector("#progress-fill");
const progressHead = document.querySelector("#progress-head");
const milestoneProgress = document.querySelector("#milestone-progress");
const copyTitle = document.querySelector("#copy-title");
const copyBody = document.querySelector("#copy-body");
const copyKicker = document.querySelector("#copy-kicker");
const copyIndex = document.querySelector("#copy-index");
const copyRuleFill = document.querySelector("#copy-rule-fill");
const windowState = document.querySelector("#window-state");
const lightSweep = document.querySelector("#light-sweep");
const chapters = [
  "The gap after onboarding",
  "Three steps. Three kinds of proof.",
  "One clear work trail",
  "Record the task reference",
  "Assigned is not paid",
  "Know what’s next",
];
const copyBeats = [
  { at: 4.65, index: "01", kicker: "YOUR WORK, IN CONTEXT", title: "One clear<br><em>work trail.</em>", body: "Record what is known, what is pending, and the next action—without guessing." },
  { at: 8.15, index: "02", kicker: "WHEN A TASK ARRIVES", title: "Log the<br><em>new task.</em>", body: "Add its reference to move the sample from waiting to assigned." },
  { at: 11.75, index: "03", kicker: "KEEP PAYMENT SEPARATE", title: "Assigned<br><em>isn’t paid.</em>", body: "Payment stays unrecorded until there is separate proof. No guessed status." },
];
let startedAt = performance.now();
let manualPause = false;
let taskWasRecorded = false;
let spotlightAdded = false;
let frameRequest = 0;

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const between = (time, from, to) => smooth((time - from) / (to - from));
const mix = (a, b, amount) => a + (b - a) * amount;
const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

function routePoint(progress) {
  const start = { x: -120, y: 695 };
  const joint = { x: 800, y: 512 };
  const end = { x: 2050, y: 412 };
  if (progress < 0.5) return cubic(start, { x: 235, y: 880 }, { x: 475, y: 372 }, joint, progress * 2);
  return cubic(joint, { x: 1045, y: 690 }, { x: 1432, y: 320 }, end, (progress - 0.5) * 2);
}

function traceRoute(progress) {
  const clamped = clamp(progress);
  context.beginPath();
  const steps = Math.max(1, Math.ceil(clamped * 180));
  for (let index = 0; index <= steps; index++) {
    const point = routePoint(clamped * index / steps);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
}

function drawNode(x, y, radius, alpha, hue = "cyan") {
  if (alpha <= 0) return;
  const color = hue === "amber" ? "243,197,125" : "149,226,231";
  context.save();
  context.globalAlpha = alpha;
  context.shadowColor = `rgba(${color},.9)`;
  context.shadowBlur = radius * 7;
  context.fillStyle = `rgba(${color},.9)`;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.strokeStyle = `rgba(${color},.42)`;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, radius * 2.2, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawAtmosphere(seconds) {
  const width = 1920;
  const height = 1080;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, "#050a12");
  base.addColorStop(.53, "#08101b");
  base.addColorStop(1, "#050913");
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);

  const glowX = 1180 + Math.sin(seconds * .17) * 165;
  const glowY = 425 + Math.cos(seconds * .15) * 70;
  const glow = context.createRadialGradient(glowX, glowY, 10, glowX, glowY, 790);
  glow.addColorStop(0, "rgba(49,118,159,.17)");
  glow.addColorStop(.48, "rgba(40,98,141,.07)");
  glow.addColorStop(1, "rgba(5,10,19,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalCompositeOperation = "screen";
  const routeAlpha = seconds < 6.3 ? .19 + between(seconds, 0, 6.3) * .42 : .12 + (1 - between(seconds, 15.2, 17.2)) * .08;
  traceRoute(1);
  context.strokeStyle = `rgba(115,196,221,${routeAlpha * .24})`;
  context.lineWidth = 1;
  context.stroke();
  const routeProgress = Math.min(1, seconds / 5.8);
  if (routeProgress > 0) {
    traceRoute(routeProgress);
    const sweep = context.createLinearGradient(0, 720, 1650, 315);
    sweep.addColorStop(0, "rgba(117,238,208,.04)");
    sweep.addColorStop(.54, `rgba(114,221,231,${routeAlpha * .42})`);
    sweep.addColorStop(1, `rgba(164,208,255,${routeAlpha * .78})`);
    context.strokeStyle = sweep;
    context.lineWidth = 2.2;
    context.shadowColor = "rgba(113,209,231,.52)";
    context.shadowBlur = 13;
    context.stroke();
    context.shadowBlur = 0;
    const head = routePoint(routeProgress);
    drawNode(head.x, head.y, 2.1 + Math.sin(seconds * 4.1) * .45, .25 + routeAlpha * .74);
  }

  const nodes = [
    { x: 382, y: 606, at: 1.0 },
    { x: 968, y: 532, at: 2.7 },
    { x: 1552, y: 489, at: 4.55 },
  ];
  for (const [index, node] of nodes.entries()) {
    const appear = between(seconds, node.at, node.at + .85);
    const pulse = 1 + Math.sin((seconds - node.at) * 2.4) * .16;
    drawNode(node.x, node.y, (index === 1 ? 3 : 2.5) * pulse, appear * (index === 2 && seconds > 3.8 ? .53 : .76), index === 2 ? "amber" : "cyan");
  }

  const screenReveal = between(seconds, 4.15, 6.1);
  if (screenReveal > 0 && seconds < 16.5) {
    context.save();
    context.translate(1220, 535);
    context.rotate(-.045 + Math.sin(seconds * .29) * .004);
    context.globalAlpha = .085 * screenReveal * (1 - between(seconds, 15.6, 16.5));
    context.strokeStyle = "rgba(145,207,255,.75)";
    context.lineWidth = 1;
    for (const radius of [415, 459, 503]) {
      context.beginPath();
      context.ellipse(0, 0, radius, radius * .49, 0, -.88, 2.12);
      context.stroke();
    }
    context.restore();
  }

  for (let index = 0; index < 72; index++) {
    const rate = 3.8 + (index % 8) * 1.5;
    const x = ((index * 347 + seconds * rate) % 2240) - 150;
    const y = (index * 173) % 1080 + Math.sin(seconds * .34 + index * 1.7) * 8;
    const size = index % 9 === 0 ? 1.2 : .55;
    const alpha = .08 + (index % 5) * .018;
    context.globalAlpha = alpha;
    context.fillStyle = index % 7 === 0 ? "#b9e4ff" : "#a4c4d9";
    context.beginPath();
    context.ellipse(x, y, size * 3.6, size, .02, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  const vignette = context.createRadialGradient(960, 510, 280, 960, 510, 1050);
  vignette.addColorStop(.45, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,.39)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
}

function setCopy(seconds) {
  let phase = 0;
  for (let index = 1; index < copyBeats.length; index++) {
    if (seconds >= copyBeats[index].at) phase = index;
  }
  const beat = copyBeats[phase];
  copyIndex.textContent = beat.index;
  copyKicker.textContent = beat.kicker;
  copyTitle.innerHTML = beat.title;
  copyBody.textContent = beat.body;
  let transition = 0;
  for (const next of copyBeats.slice(1)) {
    const distance = Math.abs(seconds - next.at);
    if (distance < .17) transition = Math.max(transition, 1 - distance / .17);
  }
  productCopy.style.opacity = String(clamp(between(seconds, 4.52, 5.55) * (1 - between(seconds, 15.3, 16.3)) * (1 - transition * .75)));
  const rise = seconds < 8.15 ? between(seconds, 4.5, 5.55) : seconds < 11.75 ? between(seconds, 8.1, 8.48) : between(seconds, 11.7, 12.05);
  productCopy.style.transform = `translate3d(0,calc(-44% + ${(1 - rise) * 12 + Math.sin(seconds * .48) * 2}px),0)`;
  copyRuleFill.style.width = `${clamp((seconds - 4.7) / 10.5) * 100}%`;
}

function recordSyntheticAssignment() {
  if (taskWasRecorded) return;
  try {
    const doc = frame.contentDocument;
    const button = doc?.querySelector("#record-sample");
    if (!button || button.disabled) return;
    button.click();
    taskWasRecorded = doc.querySelector("#status-heading")?.textContent.trim() === "Task assigned";
    if (taskWasRecorded) windowState.innerHTML = "TASK ASSIGNED <b>·</b> DEMO-TASK-17";
  } catch {
    // The film stays legible if an embedded browser blocks same-origin access.
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
    // The on-screen explanation remains available if frame styling is unavailable.
  }
}

function render(time) {
  const seconds = Math.max(0, Math.min(duration, time));
  drawAtmosphere(seconds);
  const entry = between(seconds, 0, .88);
  const leave = 1 - between(seconds, 4.25, 5.28);
  const openingOpacity = clamp(entry * leave);
  opening.style.opacity = String(openingOpacity);
  opening.style.transform = `translate3d(${(1 - entry) * -27}px,calc(-52% + ${Math.sin(seconds * .31) * 2}px),0) scale(${.988 + .012 * entry})`;
  opening.querySelectorAll("h1 span").forEach((line, index) => {
    const reveal = between(seconds, .38 + index * .32, .98 + index * .32);
    line.style.opacity = String(reveal * leave);
    line.style.transform = `translate3d(0,${(1 - reveal) * (index ? 25 : 19)}px,0)`;
    line.style.filter = `blur(${(1 - reveal) * 6}px)`;
  });
  const openingDetails = between(seconds, .8, 1.45) * leave;
  opening.querySelector(".opening-kicker").style.opacity = String(openingDetails);
  opening.querySelector("p").style.opacity = String(openingDetails);
  opening.querySelector(".opening-foot").style.opacity = String(between(seconds, 1.1, 1.65) * leave);

  const milestoneIn = between(seconds, 1.55, 2.5);
  const milestoneOut = 1 - between(seconds, 4.45, 5.35);
  const milestoneOpacity = milestoneIn * milestoneOut;
  milestones.style.opacity = String(milestoneOpacity);
  milestones.style.transform = `translate3d(0,${(1 - milestoneIn) * 17 + between(seconds, 5.1, 6.1) * -12}px,0)`;
  cards.forEach((card, index) => {
    const cardIn = between(seconds, 1.85 + index * .18, 2.5 + index * .18);
    card.style.opacity = String(cardIn * milestoneOut);
    card.style.transform = `translate3d(0,${(1 - cardIn) * 13}px,0)`;
  });
  milestoneProgress.style.width = `${between(seconds, 1.7, 3.4) * 100}%`;

  const windowIn = between(seconds, 4.15, 6.05);
  const windowOut = 1 - between(seconds, 15.65, 16.65);
  const productOpacity = windowIn * windowOut;
  productWindow.style.visibility = productOpacity > .001 ? "visible" : "hidden";
  productWindow.style.opacity = String(productOpacity);
  const moveIn = 1 - windowIn;
  const driftX = Math.sin(seconds * .42) * 2.2;
  const driftY = Math.sin(seconds * .31 + .6) * 2.1;
  const scale = .70 + windowIn * .30;
  const rotateY = -15 * moveIn + Math.sin(seconds * .23) * .16;
  const rotateX = 3.1 * moveIn + Math.cos(seconds * .27) * .12;
  productWindow.style.transform = `perspective(1800px) translate3d(${moveIn * 112 + driftX}px,calc(-50% + ${driftY}px),0) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`;
  setCopy(seconds);

  const focusIn = between(seconds, 11.35, 12.12);
  const focusOut = 1 - between(seconds, 15.55, 16.35);
  const focusOpacity = focusIn * focusOut;
  paymentFocus.style.opacity = String(focusOpacity);
  paymentFocus.style.transform = `translate3d(${(1 - focusIn) * 12}px,${(1 - focusIn) * 8}px,0) scale(${.985 + focusIn * .015})`;

  const closingIn = between(seconds, 15.9, 17.15);
  closing.style.opacity = String(closingIn);
  closing.style.transform = `translate3d(-50%,calc(-44% + ${(1 - closingIn) * 15}px),0) scale(${.965 + closingIn * .035})`;

  const sweepPasses = [
    { start: 4.34, end: 5.58 },
    { start: 15.55, end: 16.56 },
  ];
  let sweepProgress = -1;
  let sweepAlpha = 0;
  for (const pass of sweepPasses) {
    if (seconds >= pass.start && seconds <= pass.end) {
      sweepProgress = (seconds - pass.start) / (pass.end - pass.start);
      sweepAlpha = Math.sin(sweepProgress * Math.PI) * .52;
    }
  }
  lightSweep.style.opacity = String(sweepAlpha);
  if (sweepProgress >= 0) lightSweep.style.transform = `translate3d(${-2300 + sweepProgress * 4550}px,0,0) skewX(-8deg)`;

  const chapter = seconds < 2.25 ? 0 : seconds < 5.8 ? 1 : seconds < 8.15 ? 2 : seconds < 11.75 ? 3 : seconds < 15.9 ? 4 : 5;
  chapterLabel.textContent = chapters[chapter];
  const progress = (seconds / duration) * 100;
  progressFill.style.width = progress + "%";
  progressHead.style.left = progress + "%";
  rig.style.transform = `translate3d(${Math.sin(seconds * .11) * 2.4}px,${Math.cos(seconds * .13) * 1.6}px,0) scale(${1 + between(seconds, 0, duration) * .008})`;

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
    // Reloading the demo restores its clean synthetic starting point when accessible.
  }
  taskWasRecorded = false;
  spotlightAdded = false;
  windowState.innerHTML = "ONBOARDING RECORDED <b>·</b> TASK NOT ASSIGNED";
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
render(0);
frameRequest = requestAnimationFrame(animate);
