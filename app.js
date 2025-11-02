/************************************************************
 * Listening Garden – SHARED, bird-only ambient, iPad-ready
 *
 * ✅ CHANGE THESE 3 THINGS:
 * 1) GAS_WEBAPP_URL  → your deployed Apps Script web app URL
 * 2) GARDEN_SECRET   → must match SHARED_SECRET in Apps Script
 * 3) DEFAULT_GARDEN_ID → what your QR will point to
 *
 * Example QR:
 *   https://checolato.github.io/garden/?garden=risd-main
 ************************************************************/

// 1) 🔁 PUT YOUR SCRIPT URL HERE
const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzttFUbanlNM4Z_2PRWlNWoW3W-x3qvS5MfN4Ss1mWnbmKhCmYHBcpXxdamX7nwIlWN/exec";

// 2) 🔁 SECRET – MUST MATCH Apps Script: const SHARED_SECRET = "..."
const GARDEN_SECRET  = "risd-2025-garden";

// 3) 🔁 DEFAULT GARDEN NAME
const DEFAULT_GARDEN_ID = "risd-main";

// read ?garden= from URL so QR can pick garden
const urlParams = new URLSearchParams(window.location.search);
const GARDEN_ID = urlParams.get("garden") || DEFAULT_GARDEN_ID;

// ====== CANVAS ======
const canvas = document.getElementById("garden");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAX_PLANTS = 700;
const MAX_CANVAS_WIDTH = 5000;
const MAX_CANVAS_HEIGHT = 5000;

// plants + fast lookup
const plants = [];
const plantIndex = new Set();

// ====== AUDIO ELEMENTS ======
const audioBird       = document.getElementById("birdAmbience");
const audioRainSoft   = document.getElementById("rainSoft");
const audioRainHeavy  = document.getElementById("rainHeavy");
const audioWindGentle = document.getElementById("windGentle");
const audioWindStrong = document.getElementById("windStrong");

// ====== WEATHER STATE ======
let effectMode = "none";
let effectConfig = {
  fallSpeed: 0.4,
  fadeSpeed: 0.003,
  driftX: 0,
  duration: 12000,
  startedAt: 0
};

// ====== IPAD-ish LOCKING ======
document.documentElement.style.height = "100%";
document.body.style.height = "100%";
document.body.style.overflow = "hidden";
let lastTouchEnd = 0;
document.addEventListener("touchend", e => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("gesturestart", e => e.preventDefault(), { passive: false });

// draw once, start loop
drawBackground();
requestAnimationFrame(loop);

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

// ====== POPUP (EMAIL) ======
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

// curator shortcut
window.addEventListener("keydown", e => {
  if (e.key === "e" || e.key === "E") showEmailPopup();
});

function showEmailPopup() {
  if (!popupBackdrop) return;
  popupBackdrop.style.display = "flex";
  if (popupStatus) popupStatus.textContent = "";
}
function hideEmailPopup() {
  if (!popupBackdrop) return;
  popupBackdrop.style.display = "none";
}

if (popupClose) popupClose.addEventListener("click", hideEmailPopup);

if (popupSubmit) {
  popupSubmit.addEventListener("click", () => {
    const email = (popupInput?.value || "").trim();
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
        email,
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
        console.warn("email save failed", err);
        popupStatus.textContent = "Could not save right now.";
        popupStatus.style.color = "#c14949";
      });
  });
}

// ====== SPEECH RECOGNITION ======
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
    startBirdLoop();
  };

  recognition.onend = () => {
    setTimeout(() => {
      try { recognition.start(); } catch (e) {}
    }, 300);
  };

  try { recognition.start(); } catch (e) {}
} else {
  console.warn("SpeechRecognition not supported in this browser.");
}

// idle plant every 20s
setInterval(() => {
  makePlantFromSpeech("idle sprout", 0.5);
}, 20000);

// ====== SPEECH → PLANT ======
function makePlantFromSpeech(text, confidence) {
  const plant = textToPlantConfig(text, confidence);
  buildPlantVisual(plant);
  addPlantLocal(plant);
  sendPlantToServer(plant);
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
    id: genPlantId(),
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
    driftY: 0,
    visual: null
  };
}

function addPlantLocal(plant) {
  plants.push(plant);
  plantIndex.add(plant.id);

  if (plants.length > MAX_PLANTS) {
    const removed = plants.shift();
    if (removed?.id) plantIndex.delete(removed.id);
  }

  expandCanvasIfNeeded(plant);
}

// ====== SEND PLANT TO SERVER ======
function sendPlantToServer(p) {
  const payload = {
    id: p.id,
    text: p.text,
    confidence: p.confidence,
    mood: p.mood,
    energy: p.energy,
    height: p.height,
    complexity: p.complexity,
    x: p.x,
    y: p.y,
    createdAt: Date.now()
  };

  fetch(GAS_WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "addPlant",
      gardenId: GARDEN_ID,
      plant: payload,
      secret: GARDEN_SECRET
    })
  }).catch(err => {
    console.warn("addPlant failed", err);
  });
}

// ====== POLL SHARED GARDEN ======
setInterval(fetchRemotePlants, 5000);

function fetchRemotePlants() {
  const url = `${GAS_WEBAPP_URL}?action=getPlants&gardenId=${encodeURIComponent(GARDEN_ID)}&secret=${encodeURIComponent(GARDEN_SECRET)}`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!data.ok) return;
      mergeRemotePlants(data.plants || []);
    })
    .catch(err => console.warn("getPlants failed", err));
}

function mergeRemotePlants(remotePlants) {
  for (const rp of remotePlants) {
    const id = rp.id || rp.createdAt;
    if (!id) continue;
    if (plantIndex.has(id)) continue;

    const local = {
      id,
      x: rp.x ?? (80 + Math.random() * (canvas.width - 160)),
      y: rp.y ?? (80 + Math.random() * (canvas.height - 160)),
      height: rp.height ?? 160,
      complexity: rp.complexity ?? 2,
      text: rp.text ?? "",
      confidence: rp.confidence ?? 0.8,
      mood: rp.mood ?? "neutral",
      energy: rp.energy ?? 0.4,
      alpha: 1,
      driftX: 0,
      driftY: 0,
      visual: null
    };
    buildPlantVisual(local);
    plants.push(local);
    plantIndex.add(id);
  }

  if (plants.length > MAX_PLANTS) {
    const overshoot = plants.length - MAX_PLANTS;
    const removed = plants.splice(0, overshoot);
    removed.forEach(p => plantIndex.delete(p.id));
  }
}

// ====== CANVAS EXPANSION ======
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
  if (needMoreHeight) newHeight = Math.max(newHeight, futureBottom);

  newWidth = Math.min(newWidth, MAX_CANVAS_WIDTH);
  newHeight = Math.min(newHeight, MAX_CANVAS_HEIGHT);

  if (addTop > 0) {
    for (const p of plants) {
      p.y += addTop;
      if (p.visual) {
        p.visual.stem.startY += addTop;
        p.visual.stem.c1y    += addTop;
        p.visual.stem.c2y    += addTop;
        p.visual.stem.endY   += addTop;
        for (const b of p.visual.blobs) b.y += addTop;
      }
    }
  }

  canvas.width = newWidth;
  canvas.height = newHeight;
}

// ====== EMOTION DETECTION ======
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
  return { mood, energy: Math.min(1, energy), keywords: score };
}

// ====== PALETTES ======
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
  calm:   "rgba(175, 195, 221, 0.5)",
  sad:    "rgba(150, 163, 180, 0.45)",
  angry:  "rgba(212, 112, 102, 0.55)",
  neutral:"rgba(175, 195, 221, 0.5)"
};

// ====== BUILD VISUAL (no flicker) ======
function buildPlantVisual(p) {
  const { x, y, height, complexity = 2, mood = "neutral" } = p;
  const topY = y - height;
  const palette = PALETTES[mood] || PALETTES.neutral;

  const stem = {
    startX: x,
    startY: y,
    c1x: x + rand(-10, 10),
    c1y: y - height * 0.35,
    c2x: x + rand(-8, 8),
    c2y: y - height * 0.7,
    endX: x + rand(-3, 3),
    endY: topY
  };

  const blobs = [];

  // main top
  blobs.push({
    x: stem.endX + rand(-6, 6),
    y: topY - rand(0, 16),
    rx: rand(40, 80) * (mood === "sad" ? 0.8 : 1) * (mood === "joyful" ? 1.1 : 1) / 2,
    ry: rand(26, 50) / 2,
    rot: rand(-0.4, 0.4),
    color: pick(palette),
    highlight: Math.random() < 0.4
  });

  // extra blobs
  let blobCount = complexity;
  if (mood === "joyful") blobCount += 1;
  if (mood === "angry")  blobCount += 1;
  if (mood === "sad")    blobCount = Math.max(1, blobCount - 1);

  for (let i = 0; i < blobCount; i++) {
    blobs.push({
      x: x + rand(-26, 22),
      y: topY + rand(-18, 30),
      rx: rand(20, 55) * (mood === "angry" ? 1.1 : 1) / 2,
      ry: rand(14, 32) / 2,
      rot: rand(-0.4, 0.4),
      color: pick(palette),
      highlight: Math.random() < 0.4
    });
  }

  // trailing
  const trailCount = mood === "angry" ? randInt(3, 6)
                    : mood === "joyful" ? randInt(2, 4)
                    : randInt(1, 3);
  for (let i = 0; i < trailCount; i++) {
    const t = Math.random();
    const by = y - height * t;
    const spread = mood === "angry" ? 40 : mood === "calm" ? 18 : 25;
    blobs.push({
      x: x + rand(-spread, spread),
      y: by + rand(-10, 10),
      rx: rand(10, 26) / 2,
      ry: rand(8, 20) / 2,
      rot: rand(-0.4, 0.4),
      color: pick(palette),
      highlight: Math.random() < 0.35
    });
  }

  p.visual = { stem, blobs };
}

// ====== BACKGROUND ======
function drawBackground() {
  ctx.fillStyle = "#f3f1e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ====== DRAW PLANT ======
function drawPlant(p) {
  if (!p.visual) return;
  const mood = p.mood || "neutral";
  const stemColor = STEMS[mood] || STEMS.neutral;

  ctx.save();
  ctx.globalAlpha = p.alpha ?? 1;

  const s = p.visual.stem;
  ctx.strokeStyle = stemColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(s.startX + p.driftX, s.startY + p.driftY);
  ctx.bezierCurveTo(
    s.c1x + p.driftX, s.c1y + p.driftY,
    s.c2x + p.driftX, s.c2y + p.driftY,
    s.endX + p.driftX, s.endY + p.driftY
  );
  ctx.stroke();

  for (const b of p.visual.blobs) {
    ctx.save();
    ctx.translate(b.x + p.driftX, b.y + p.driftY);
    ctx.rotate(b.rot);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, b.rx, b.ry, 0, 0, Math.PI * 2);
    ctx.fill();

    if (b.highlight) {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.ellipse(-b.rx * 0.25, -b.ry * 0.25, b.rx * 0.55, b.ry * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  ctx.restore();
}

// ====== MAIN LOOP ======
function loop(timestamp) {
  drawBackground();
  updateEffects(timestamp);

  for (const p of plants) {
    if (p.alpha > 0.01) drawPlant(p);
  }

  requestAnimationFrame(loop);
}

// ====== WEATHER ======
function updateEffects(t) {
  if (effectMode === "none") return;

  const elapsed = t - effectConfig.startedAt;
  if (elapsed > effectConfig.duration) {
    effectMode = "none";
    stopWeatherAudio();
    unduckBird();
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

function getGardenEmotionProfile() {
  const counts = { joyful: 0, calm: 0, sad: 0, angry: 0, neutral: 0 };
  for (const p of plants) {
    const m = p.mood || "neutral";
    if (counts[m] !== undefined) counts[m]++; else counts.neutral++;
  }
  let dom = "neutral", max = 0;
  for (const k in counts) {
    if (counts[k] > max) {
      max = counts[k];
      dom = k;
    }
  }
  return { counts, dominant: dom, total: plants.length };
}

function triggerRainout() {
  const profile = getGardenEmotionProfile();
  const dom = profile.dominant;

  effectMode = "rainout";
  effectConfig.startedAt = performance.now();
  effectConfig.duration = 12000;
  duckBird();

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
  duckBird();
  playEmotionWind("angry");
}

// random weather every 3–10 min
;(function scheduleRandomWeather() {
  const delay = randInt(3, 10) * 60 * 1000;
  setTimeout(() => {
    const r = Math.random();
    if (r < 0.6) triggerRainout();
    else triggerWindblow();
    scheduleRandomWeather();
  }, delay);
})();

// ====== AUDIO HELPERS ======
function startBirdLoop() {
  if (!audioBird) return;
  audioBird.volume = 0.5;
  const p = audioBird.play();
  if (p && p.catch) p.catch(() => {});
}
function duckBird() {
  if (audioBird) audioBird.volume = 0.15;
}
function unduckBird() {
  if (audioBird) audioBird.volume = 0.5;
}
function playEmotionRain(mood) {
  stopWeatherAudio();
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
  stopWeatherAudio();
  if (mood === "angry" && audioWindStrong) {
    safePlay(audioWindStrong, 0.6);
    return;
  }
  if (audioWindGentle) safePlay(audioWindGentle, 0.35);
}
function stopWeatherAudio() {
  [audioRainSoft, audioRainHeavy, audioWindGentle, audioWindStrong].forEach(a => {
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  });
}
function safePlay(audioEl, vol = 0.5) {
  if (!audioEl) return;
  audioEl.volume = vol;
  const p = audioEl.play();
  if (p && p.catch) p.catch(() => {});
}

// ====== MIDNIGHT SCREENSHOT → GAS ======
scheduleMidnightScreenshot();
function scheduleMidnightScreenshot() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
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

// ====== UTILS ======
function genPlantId() {
  return "p_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e6).toString(36);
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min, max) {
  return Math.random() * (max - min) + min;
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}
