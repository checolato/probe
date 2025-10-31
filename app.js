const canvas = document.getElementById("garden");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  drawBackground();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function drawBackground() {
  ctx.fillStyle = "#f3f1e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#c9c4b5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height - 20);
  ctx.lineTo(canvas.width, canvas.height - 20);
  ctx.stroke();
}

// --- speech setup ---
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
        makePlantFromSpeech(res[0].transcript, res[0].confidence || 0.8);
      }
    }
  };

  recognition.onend = () => setTimeout(() => recognition.start(), 300);
  recognition.start();
}

// --- speech → plant ---
function makePlantFromSpeech(text, confidence) {
  const cfg = textToPlantConfig(text, confidence);
  drawPlant(cfg);
}

function textToPlantConfig(text, confidence) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const len = words.length;
  const height = 40 + Math.min(len, 15) * 10;
  const leafCount = Math.min(2 + Math.floor(len / 2), 14);

  const lower = text.toLowerCase();
  let color = "#5a934e";
  if (lower.match(/happy|love|great|fun|beautiful/)) color = "#7ac943";
  else if (lower.match(/calm|quiet|soft/)) color = "#7cc1aa";
  else if (lower.match(/angry|sad|tired/)) color = "#d94a38";
  else if (lower.match(/water|blue|rain/)) color = "#5f8fd2";

  const x = 40 + Math.random() * (canvas.width - 80);
  const y = canvas.height - 20;
  const strokeWidth = 1 + confidence * 3;
  return { x, y, height, leafCount, color, strokeWidth };
}

// --- drawing ---
function drawPlant({ x, y, height, leafCount, color, strokeWidth }) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;

  const topY = y - height;
  ctx.beginPath();
  ctx.moveTo(x, y);
  const mid1x = x + (Math.random() * 16 - 8);
  const mid1y = y - height * 0.33;
  const mid2x = x + (Math.random() * 16 - 8);
  const mid2y = y - height * 0.66;
  ctx.bezierCurveTo(mid1x, mid1y, mid2x, mid2y, x, topY);
  ctx.stroke();

  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount + 1);
    const ly = y - t * height;
    const dir = i % 2 === 0 ? 1 : -1;
    const lx = x + dir * (12 + Math.random() * 10);
    drawLeaf(lx, ly, dir, color, strokeWidth * 0.7);
  }

  ctx.fillStyle = color + "aa";
  ctx.beginPath();
  ctx.arc(x, topY - 6, 6 + Math.random() * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLeaf(x, y, dir, color, width) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + dir * 16, y - 6, x + dir * 26, y);
  ctx.quadraticCurveTo(x + dir * 16, y + 6, x, y);
  ctx.stroke();
  ctx.restore();
}

// optional idle sprouts
setInterval(() => makePlantFromSpeech("idle sprout", 0.5), 20000);
