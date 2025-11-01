// app.js
// Listening Garden (GitHub Pages + Google Apps Script)
// ----------------------------------------------------
// Features:
// - speech → plants (soft, abstract, emotion-based)
// - auto-expanding canvas
// - capped plants for gallery stability
// - random weather (rain/wind)
// - rain is emotion-aware (looks at garden mood)
// - popup collects visitor email → sent to GAS
// - midnight: send canvas PNG → GAS (saved in YOUR Drive only)
// - shared secret, so only your page can call GAS
// ----------------------------------------------------

// ====== 0. CONFIG (EDIT THESE) ======
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzAdh6CbP6tJhllycZv8Qhr5a1l8PTPlW4YJ0BuP_VpwHaYTVvBPPODsIB6pROsDa6D/exec"; // CHANGE THIS
const GARDEN_SECRET  = "pick-a-random-string-here"; // CHANGE THIS (same in Apps Script)
const FINAL_SEND_DATE_ISO = "2025-11-21"; // for display only; actual send is in Apps Script

// ====== 1. CANVAS SETUP ======
const canvas = document.getElementById("garden");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// gallery safety
const MAX_PLANTS = 700;
const MAX_CANVAS_WIDTH = 5000;
const MAX_CANVAS_HEIGHT = 5000;

// audio elements (some may be missing and that's OK)
const audioRainSoft   = document.getElementById("rainSoft");
const audioRainHeavy  = document.getElementById("rainHeavy");
const audioWindGentle = document.getElementById("windGentle");
const audioWindStrong = document.getElementById("windStrong");

// plant store
const plants = [];

// weather state
let effectMode = "none"; // "none" | "rainout" | "windblow"
let effectConfig = {
  fallSpeed: 0.4,
  fadeSpeed: 0.003,
  driftX: 0,
  duration: 12000,
  startedAt: 0
};

drawBackground();
requestAnimationFrame(loop);

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// ====== 2. POPUP (email capture) ======
const popupBackdrop = document.getElementById("email-popup-backdrop");
const popupInput    = document.getElementById("email-input");
const popupSubmit   = document.getElementById("email-submit");
const popupClose    = document.getElementById("email-close");
const popupStatus   = document.getElementById("email-status");

// show once after 25s
setTimeout(() => {
  if (!localStorage.getItem("gardenEmailSaved")) {
    showEmailPopup();
  }
}, 25000);

// key shortcut
window.addEventListener("keydown", (e) => {
  if (e.key === "e" || e.key === "E") {
    showEmailPopup();
  }
});

function showEmailPopup() {
  popupBackdrop.style.display = "flex";
  popupStatus.textContent = "";
}
function hideEmailPopup() {
  popupBackdrop.style.display = "none";
}

popupClose.addEventListener("click", hideEmailPopup);

popupSubmit.addEventListener("click", () => {
  const email = (popupInput.value || "").trim();
  if (!email) {
    popupStatus.textContent = "Please enter an email.";
    popupStatus.style.color = "#c14949";
    return;
  }
  popupStatus.textContent = "Saving...";
  popupStatus.style.color = "#5b574e";

  fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "registerEmail",
      email: email,
      ts: new Date().toISOString(),
      secret: GARDEN_SECRET
    })
  })
  .then(r => r.json())
  .then(data => {
    popupStatus.textContent = data.message || "Saved. Thank you!";
    popupStatus.style.color = "#2d665f";
    localStorage.setItem("gardenEmailSaved", "1");
    setTimeout(hideEmailPopup, 2000);
  })
  .catch(err => {
    console.warn(err);
    popupStatus.textContent = "Could not save right now.";
    popupStatus.style.color = "#c14949";
  });
});

// ====== 3. SPEECH RECOGNITION ======
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
        const conf = res[0].confidence || 0.8;
        makePlantFromSpeech(text, conf);
      }
    }
  };

  recognition.onstart = () => {
    playAmbientLoops();
  };

  recognition.onend = () => {
    setTimeout(() => {
      try { recognition.start(); } catch (e) {}
    }, 300);
  };

  try { recognition.start(); } catch (e) {}
} else {
  console.warn("SpeechRecognition not supported.");
}

// idle plants so it never stops
setInterval(() => {
  makePlantFromSpeech("idle sprout", 0.5);
}, 20000);

// ====== 4. SPEECH → PLANT ======
function makePlantFromSpeech(text, confidence) {
  const cfg = textToPlantConfig(text, confidence);
  plants.push(cfg);

  // safety cap
  if (plants.length > MAX_PLANTS) {
    plants.shift();
  }

  expandCanvasIfNeeded(cfg);
}

function textToPlantConfig(text, confidence) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const len = words.length;

  const emo = analyzeEmotion(text);

  let height = 120 + Math.min(len, 20) * 7;
  if (emo.mood === "sad") height *= 0.8;
  if (emo.mood === "calm") height *= 0.9;
  if (emo.mood === "joyful") height *= 1.05;
  if (emo.mood === "angry") height *= 1.05;

  const margin = 80;
  const x = margin + Math.random() * Math.max(200, canvas.width - margin * 2);
  const y = margin + Math.random() * Math.max(200, canvas.height - margin * 2);

  const complexity = Math.min(1 + Math.floor(len / 4), 4);

  return {
    x,
    y,
    height,
    complexity,
    text,
    confidence,
    mood: emo.mood,
    energy: emo.energy,
    alpha: 1,
    driftX: 0,
    driftY: 0
  };
}

// ====== 5. CANVAS EXPANSION ======
function expandCanvasIfNeeded(plant) {
  const margin = 120;
  const plantTop = plant.y - plant.height - margin;
  const plantRight = plant.x + margin;
  const plantBottom = plant.y + margin;

  let addTop = 0;
  if (plantTop < 0) addTop = -plantTop;

  const needMoreWidth = plantRight > canvas.width;
  const futureBottom = plantBottom + addTop;
  const needMoreHeight = futureBottom > canvas.height;

  if (!needMoreWidth && !needMoreHeight && addTop === 0) return;

  let newWidth = needMoreWidth ? plantRight : canvas.width;
  let newHeight = canvas.height + addTop;
  if (needMoreHeight) {
    newHeight = Math.max(newHeight, futureBottom);
  }

  newWidth = Math.min(newWidth, MAX_CANVAS_WIDTH);
  newHeight = Math.min(newHeight, MAX_CANVAS_HEIGHT);

  if (addTop > 0) {
    // shift existing plants down
    for (const p of plants) {
      p.y += addTop;
    }
  }

  canvas.width = newWidth;
  canvas.height = newHeight;
}

// ====== 6. EMOTION DETECTION ======
function analyzeEmotion(text) {
  const lower = text.toLowerCase();

  const joyWords  = ["happy", "fun", "love", "lovely", "excited", "yay", "beautiful", "nice", "great", "good", "sunny"];
  const calmWords = ["calm", "quiet", "soft", "peace", "slow", "breathe", "gentle", "relax"];
  const sadWords  = ["sad", "tired", "lonely", "alone", "upset", "cry", "crying", "blue", "exhausted"];
  const angryWords= ["angry", "mad", "annoyed", "frustrated", "hate", "stupid", "ugh"];

  const score = { joyful: 0, calm: 0, sad: 0, angry: 0 };

  joyWords.forEach(w  => lower.includes(w) && score.joyful++);
  calmWords.forEach(w => lower.includes(w) && score.calm++);
  sadWords.forEach(w  => lower.includes(w) && score.sad++);
  angryWords.forEach(w=> lower.includes(w) && score.angry++);

  let mood = "neutral";
  let max = 0;
  for (const k in score) {
    if (score[k] > max) {
      max = score[k];
      mood = k;
    }
  }

  let energy = 0.4;
  if (lower.includes("!")) energy += 0.2;
  if (score.angry > 0)   energy += 0.3;
  if (score.joyful > 0)  energy += 0.2;
  if (energy > 1) energy = 1;

  return { mood, energy, keywords: score };
}

// ====== 7. VISUALS ======
const PALETTES = {
  joyful: [
    "rgba(255, 196, 160, 0.75)",
    "rgba(255, 221, 166, 0.75)",
    "rgba(244, 178, 197, 0.75)",
    "rgba(252, 238, 205, 0.7)"
  ],
  calm: [
    "rgba(194, 212, 243, 0.7)",
    "rgba(212, 233, 220, 0.7)",
    "rgba(186, 205, 221, 0.7)",
    "rgba(207, 226, 241, 0.55)"
  ],
  sad: [
    "rgba(168, 187, 207, 0.55)",
    "rgba(181, 196, 204, 0.5)",
    "rgba(205, 214, 222, 0.45)"
  ],
  angry: [
    "rgba(223, 127, 121, 0.75)",
    "rgba(214, 96, 113, 0.7)",
    "rgba(245, 177, 166, 0.6)"
  ],
  neutral: [
    "rgba(194, 212, 243, 0.7)",
    "rgba(245, 208, 223, 0.7)",
    "rgba(248, 227, 190, 0.7)",
    "rgba(212, 233, 220, 0.7)"
  ]
};

const STEMS = {
  joyful: "rgba(241, 182, 154, 0.5)",
  calm: "rgba(175, 195, 221, 0.5)",
  sad: "rgba(150, 163, 180, 0.45)",
  angry: "rgba(212, 112, 102, 0.55)",
  neutral: "rgba(175, 195, 221, 0.5)"
};

function drawPlantSoftAbstractEmotion(p) {
  const { x, y, height, complexity = 2, mood = "neutral" } = p;
  const palette = PALETTES[mood] || PALETTES.neutral;
  const stemColor = STEMS[mood] || STEMS.neutral;
  const alpha = p.alpha !== undefined ? p.alpha : 1;
  const topY = y - height;

  ctx.save();
  ctx.globalAlpha = alpha;

  // stem
  ctx.strokeStyle = stemColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + p.driftX, y + p.driftY);
  ctx.bezierCurveTo(
    x + rand(-10, 10) + p.driftX,
    y - height * 0.35 + p.driftY,
    x + rand(-8, 8) + p.driftX,
    y - height * 0.7 + p.driftY,
    x + rand(-3, 3) + p.driftX,
    topY + p.driftY
  );
  ctx.stroke();

  // mood → number of blobs
  let blobCount = complexity;
  if (mood === "joyful") blobCount += 1;
  if (mood === "angry")  blobCount += 1;
  if (mood === "sad")    blobCount = Math.max(1, blobCount - 1);

  // main top
  drawSoftBlob(
    x + rand(-6, 6) + p.driftX,
    topY - rand(0, 16) + p.driftY,
    rand(40, 80) * (mood === "sad" ? 0.8 : 1) * (mood === "joyful" ? 1.1 : 1),
    rand(26, 50),
    pick(palette)
  );

  // satellites
  for (let i = 0; i < blobCount; i++) {
    drawSoftBlob(
      x + rand(-26, 22) + p.driftX,
      topY + rand(-18, 30) + p.driftY,
      rand(20, 55) * (mood === "angry" ? 1.1 : 1),
      rand(14, 32),
      pick(palette)
    );
  }

  // trailing
  const trailCount = mood === "angry" ? randInt(3, 6)
                    : mood === "joyful" ? randInt(2, 4)
                    : randInt(1, 3);

  for (let i = 0; i < trailCount; i++) {
    const t = Math.random();
    const by = y - height * t;
    const spread = mood === "angry" ? 40 : mood === "calm" ? 18 : 25;
    drawSoftBlob(
      x + rand(-spread, spread) + p.driftX,
      by + rand(-10, 10) + p.driftY,
      rand(10, 26),
      rand(8, 20),
      pick(palette)
    );
  }

  ctx.restore();
}

function drawSoftBlob(cx, cy, w, h, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rand(-0.4, 0.4));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  if (Math.random() < 0.4) {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.ellipse(-w * 0.12, -h * 0.12, w / 3.5, h / 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ====== 8. BACKGROUND ======
function drawBackground() {
  ctx.fillStyle = "#f3f1e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ====== 9. ANIMATION LOOP ======
function loop(timestamp) {
  drawBackground();
  updateEffects(timestamp);

  for (const p of plants) {
    if (p.alpha > 0.01) {
      drawPlantSoftAbstractEmotion(p);
    }
  }

  requestAnimationFrame(loop);
}

// ====== 10. EFFECTS (rain / wind) ======
function updateEffects(t) {
  if (effectMode === "none") return;

  const elapsed = t - effectConfig.startedAt;
  if (elapsed > effectConfig.duration) {
    effectMode = "none";
    return;
  }

  if (effectMode === "rainout") {
    for (const p of plants) {
      p.driftY += effectConfig.fallSpeed;
      p.driftX += effectConfig.driftX;
      p.alpha  -= effectConfig.fadeSpeed;
      if (p.alpha < 0) p.alpha = 0;
    }
  } else if (effectMode === "windblow") {
    for (const p of plants) {
      p.driftX += effectConfig.driftX;
      p.alpha  -= effectConfig.fadeSpeed;
      if (p.alpha < 0) p.alpha = 0;
    }
  }
}

// ====== 11. EMOTION-AWARE RAIN ======
function getGardenEmotionProfile() {
  const counts = { joyful: 0, calm: 0, sad: 0, angry: 0, neutral: 0 };
  for (const p of plants) {
    const m = p.mood || "neutral";
    if (counts[m] !== undefined) counts[m]++; else counts.neutral++;
  }
  let dominant = "neutral";
  let max = 0;
  for (const k in counts) {
    if (counts[k] > max) {
      max = counts[k];
      dominant = k;
    }
  }
  return { counts, dominant, total: plants.length };
}

function triggerRainout() {
  const profile = getGardenEmotionProfile();
  const dom = profile.dominant;

  effectMode = "rainout";
  effectConfig.startedAt = performance.now();
  effectConfig.duration = 12000;

  if (dom === "joyful") {
    effectConfig.fallSpeed = 0.25;
    effectConfig.fadeSpeed = 0.0015;
    effectConfig.driftX = 0;
    playEmotionRain("joyful");
  } else if (dom === "calm") {
    effectConfig.fallSpeed = 0.15;
    effectConfig.fadeSpeed = 0.0009;
    effectConfig.driftX = 0;
    playEmotionRain("calm");
  } else if (dom === "sad") {
    effectConfig.fallSpeed = 0.6;
    effectConfig.fadeSpeed = 0.0035;
    effectConfig.driftX = 0;
    playEmotionRain("sad");
  } else if (dom === "angry") {
    effectConfig.fallSpeed = 0.55;
    effectConfig.fadeSpeed = 0.004;
    effectConfig.driftX = 0.3;
    playEmotionRain("angry");
  } else {
    effectConfig.fallSpeed = 0.35;
    effectConfig.fadeSpeed = 0.0025;
    effectConfig.driftX = 0;
    playEmotionRain("neutral");
  }
}

function triggerWindblow() {
  effectMode = "windblow";
  effectConfig.startedAt = performance.now();
  effectConfig.duration = 12000;
  effectConfig.driftX = 0.6;
  effectConfig.fadeSpeed = 0.0035;
  playEmotionWind("angry");
}

// ====== 12. RANDOM WEATHER ======
function scheduleRandomWeather() {
  const delay = randInt(3, 10) * 60 * 1000; // 3–10 minutes
  setTimeout(() => {
    const r = Math.random();
    if (r < 0.6) triggerRainout();
    else triggerWindblow();
    scheduleRandomWeather();
  }, delay);
}
scheduleRandomWeather();

// ====== 13. AUDIO HELPERS ======
function playAmbientLoops() {
  if (audioRainSoft)   safePlay(audioRainSoft, 0.35);
  if (audioWindGentle) safePlay(audioWindGentle, 0.2);
}

function playEmotionRain(mood) {
  if ((mood === "sad" || mood === "angry") && audioRainHeavy) {
    safePlay(audioRainHeavy, 0.55);
    return;
  }
  if (audioRainSoft) {
    safePlay(audioRainSoft, mood === "calm" ? 0.3 : 0.45);
  } else if (audioRainHeavy) {
    safePlay(audioRainHeavy, 0.4);
  }
}

function playEmotionWind(mood) {
  if (mood === "angry" && audioWindStrong) {
    safePlay(audioWindStrong, 0.6);
    return;
  }
  if (audioWindGentle) {
    safePlay(audioWindGentle, 0.3);
  }
}

function safePlay(audioEl, vol = 0.5) {
  if (!audioEl) return;
  audioEl.volume = vol;
  const p = audioEl.play();
  if (p && p.catch) {
    p.catch(() => {
      // autoplay might be blocked; it's fine for gallery
    });
  }
}

// ====== 14. MIDNIGHT SCREENSHOT → GAS ======
scheduleMidnightScreenshot();

function scheduleMidnightScreenshot() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  // midnight + small buffer
  tomorrow.setHours(0, 0, 5, 0);
  const ms = tomorrow.getTime() - now.getTime();

  setTimeout(() => {
    sendCanvasScreenshot();
    scheduleMidnightScreenshot();
  }, ms);
}

function sendCanvasScreenshot() {
  if (!canvas) return;
  const dataURL = canvas.toDataURL("image/png");
  fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "saveScreenshot",
      image: dataURL,
      ts: new Date().toISOString(),
      secret: GARDEN_SECRET
    })
  }).catch(e => console.warn("screenshot upload failed", e));
}

// ====== 15. UTILS ======
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
