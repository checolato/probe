// app.js
// AUTONOMOUS SPEECH → CELAS-STYLE GARDEN
// --------------------------------------------------

// 1. canvas setup
const canvas = document.getElementById("garden");
const ctx = canvas.getContext("2d");

// we'll start with viewport size
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// store all plants so we can redraw / resize / expand
const plants = [];

// draw initial background
drawBackground();

// --------------------------------------------------
// 2. speech recognition (auto, no buttons)
// --------------------------------------------------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        const text = res[0].transcript;
        const confidence = res[0].confidence || 0.8;
        makePlantFromSpeech(text, confidence);
      }
    }
  };

  recognition.onend = () => {
    // Chrome sometimes stops even in continuous mode
    setTimeout(() => {
      try { recognition.start(); } catch (e) {}
    }, 300);
  };

  // start right away (browser will ask for mic once)
  try { recognition.start(); } catch (e) {}
} else {
  console.warn("SpeechRecognition not supported");
}

// OPTIONAL: idle plants so garden grows even in silence
setInterval(() => {
  makePlantFromSpeech("idle sprout", 0.5);
}, 20000);

// --------------------------------------------------
// 3. speech → plant data
// --------------------------------------------------
function makePlantFromSpeech(text, confidence) {
  const cfg = textToPlantConfig(text, confidence);

  // save it
  plants.push(cfg);

  // expand canvas if needed
  expandCanvasIfNeeded(cfg);

  // draw just this plant
  drawPlantCelasStyle(cfg);
}

function textToPlantConfig(text, confidence) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const len = words.length;

  // tall plants like the reference
  const height = 140 + Math.min(len, 18) * 8;

  // random x along current canvas width
  // but leave some margin
  const x = 60 + Math.random() * (canvas.width - 120);
  // plant sits on ground line
  const y = canvas.height - 20;

  // number of side branches
  const leafCount = Math.min(2 + Math.floor(len / 2), 8);

  return {
    x,
    y,
    height,
    leafCount,
    text,
    confidence
  };
}

// --------------------------------------------------
// 4. auto-expanding canvas
// --------------------------------------------------
function expandCanvasIfNeeded(plant) {
  const margin = 120; // extra space around plant
  const neededWidth = Math.max(canvas.width, plant.x + margin);
  const neededHeight = Math.max(canvas.height, plant.y + margin, canvas.height);

  const mustExpand = neededWidth > canvas.width || neededHeight > canvas.height;

  if (mustExpand) {
    // keep old image
    const oldImage = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // resize
    canvas.width = neededWidth;
    canvas.height = neededHeight;

    // redraw background + old image + re-draw all plants
    drawBackground();
    // put old image back at 0,0
    ctx.putImageData(oldImage, 0, 0);

    // NOTE: since we have plants[], we could also fully redraw:
    // drawBackground();
    // for (const p of plants) drawPlantCelasStyle(p);
  }
}

// --------------------------------------------------
// 5. drawing helpers (Celas-style)
// --------------------------------------------------
function drawBackground() {
  ctx.fillStyle = "#f3f1e8"; // off-white like poster
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ground line
  ctx.strokeStyle = "#c9c4b5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height - 20);
  ctx.lineTo(canvas.width, canvas.height - 20);
  ctx.stroke();
}

// palettes
const STEM_COLORS = ["#c2d4f3", "#b7cbed", "#b7d6d8", "#d1dff7"];
const ACCENT_COLORS = ["#f1c74f", "#f08ca6", "#b980ff", "#f3dcb5", "#e26b6f", "#f5b7d4"];
const OUTLINE_COLOR = "#d59498";

// main draw
function drawPlantCelasStyle({ x, y, height, leafCount }) {
  const stemColor = pick(STEM_COLORS);
  const lineW = 2;

  const topY = y - height;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stemColor;
  ctx.lineWidth = lineW;

  // wobble stem
  ctx.beginPath();
  ctx.moveTo(x, y);
  const mid1x = x + rand(-14, 14);
  const mid1y = y - height * 0.33;
  const mid2x = x + rand(-10, 10);
  const mid2y = y - height * 0.67;
  ctx.bezierCurveTo(mid1x, mid1y, mid2x, mid2y, x + rand(-3, 3), topY);
  ctx.stroke();

  // side branches / small leaves
  const sideCount = Math.min(leafCount, 5);
  for (let i = 0; i < sideCount; i++) {
    const t = Math.random() * 0.7 + 0.1;
    const by = y - height * t;
    const dir = Math.random() > 0.5 ? 1 : -1;
    drawSideBranch(x, by, dir, stemColor);
  }

  // top shape
  drawTopShape(x + rand(-3, 3), topY - rand(4, 20));

  ctx.restore();
}

function drawSideBranch(x, y, dir, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const len = rand(20, 55);
  ctx.quadraticCurveTo(
    x + dir * (len * 0.4),
    y - rand(4, 14),
    x + dir * len,
    y + rand(-6, 6)
  );
  ctx.stroke();

  // maybe add blob at end
  if (Math.random() < 0.85) {
    drawSmallBlob(x + dir * len, y + rand(-6, 6));
  }
  ctx.restore();
}

function drawTopShape(x, y) {
  const type = Math.random();
  if (type < 0.33) {
    drawRoundedMushroom(x, y);
  } else if (type < 0.66) {
    drawCoralOutline(x, y);
  } else {
    drawTallSeedhead(x, y);
  }
}

function drawRoundedMushroom(x, y) {
  const w = rand(35, 80);
  const h = rand(14, 32);
  const color = pick(ACCENT_COLORS);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCoralOutline(x, y) {
  const w = rand(40, 90);
  const h = rand(36, 80);
  ctx.save();
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const points = 8;
  for (let i = 0; i < points; i++) {
    const px = x + rand(-w / 2, w / 2);
    const py = y + rand(-h / 2, h / 2);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawTallSeedhead(x, y) {
  const color = pick(ACCENT_COLORS);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  const r = rand(16, 30);
  const lines = randInt(4, 8);
  for (let i = 0; i < lines; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rand(-r, r), y - rand(6, 20));
    ctx.stroke();
  }
  ctx.restore();
}

function drawSmallBlob(x, y) {
  const color = pick(ACCENT_COLORS);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rand(4, 10), rand(3, 8), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --------------------------------------------------
// 6. utils
// --------------------------------------------------
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
