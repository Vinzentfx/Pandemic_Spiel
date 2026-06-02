// ── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://agxyxxibaqvlrwwlfwto.supabase.co";
const SUPABASE_KEY = "sb_publishable_FkrYM9tcAalKcghoYe0ZmQ_NAWMthuU";

// ── SUPABASE ─────────────────────────────────────────────────────────────────
async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function submitScore(name, score, infected, happiness, economy, days) {
  await sbFetch("/pandemic_scores", {
    method: "POST",
    body: JSON.stringify({ name, score, infected, happiness, economy, days }),
  });
}

async function fetchLeaderboard() {
  return sbFetch("/pandemic_scores?order=score.desc&limit=20");
}

// ── NAVIGATION ───────────────────────────────────────────────────────────────
let previousScreen = "end-screen";

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function goToLeaderboard(from) {
  previousScreen = from;
  showLeaderboard();
}

// ── POLICIES ─────────────────────────────────────────────────────────────────
const POLICIES = [
  {
    id: "border_control",
    name: "🛂 Border Control",
    desc: "Restrict international travel into Germany. Cuts imported cases.",
    effects: { infectionRate: -0.15, economy: -0.08 },
    pillLabels: [{ text: "−15% spread", cls: "good" }, { text: "−8% economy", cls: "bad" }],
  },
  {
    id: "mask_mandate",
    name: "😷 Mask Mandate",
    desc: "Require masks in public spaces and transport.",
    effects: { infectionRate: -0.10, happiness: -0.03 },
    pillLabels: [{ text: "−10% spread", cls: "good" }, { text: "−3% happiness", cls: "bad" }],
  },
  {
    id: "lockdown",
    name: "🔒 Lockdown",
    desc: "Stay-at-home orders. Very effective but hurts people and economy.",
    effects: { infectionRate: -0.35, economy: -0.20, happiness: -0.12 },
    pillLabels: [{ text: "−35% spread", cls: "good" }, { text: "−20% economy", cls: "bad" }, { text: "−12% happiness", cls: "bad" }],
  },
  {
    id: "vaccine",
    name: "💉 Vaccine Program",
    desc: "Fund research and distribution. Slow start, but permanently reduces spread.",
    effects: { infectionRate: -0.05, economy: -0.05, vaccineProgress: true },
    pillLabels: [{ text: "−5% spread", cls: "good" }, { text: "+vaccine progress", cls: "neutral" }, { text: "−5% economy", cls: "bad" }],
  },
  {
    id: "testing",
    name: "🧪 Mass Testing",
    desc: "Find and isolate infected people before they spread the virus.",
    effects: { infectionRate: -0.12, economy: -0.04 },
    pillLabels: [{ text: "−12% spread", cls: "good" }, { text: "−4% economy", cls: "bad" }],
  },
  {
    id: "stimulus",
    name: "💶 Economic Stimulus",
    desc: "Government aid to businesses and citizens. Boosts economy and morale.",
    effects: { economy: 0.10, happiness: 0.05 },
    pillLabels: [{ text: "+10% economy", cls: "good" }, { text: "+5% happiness", cls: "good" }],
  },
  {
    id: "public_info",
    name: "📢 Info Campaign",
    desc: "Educate the public on hygiene and symptoms. Cheap and effective.",
    effects: { infectionRate: -0.06, happiness: 0.04 },
    pillLabels: [{ text: "−6% spread", cls: "good" }, { text: "+4% happiness", cls: "good" }],
  },
  {
    id: "curfew",
    name: "🌙 Night Curfew",
    desc: "Restrict movement after 9pm. Moderate effect on spread.",
    effects: { infectionRate: -0.08, happiness: -0.05 },
    pillLabels: [{ text: "−8% spread", cls: "good" }, { text: "−5% happiness", cls: "bad" }],
  },
];

// ── EVENTS ───────────────────────────────────────────────────────────────────
const EVENTS = [
  { day: 8,  title: "🦠 New Variant Detected",   desc: "A more contagious variant spreads from neighboring countries.", type: "red",
    effect(s) { s.baseSpread += 0.04; } },
  { day: 18, title: "📰 Media Panic",             desc: "Sensational headlines tank public confidence.", type: "red",
    effect(s) { s.happiness = Math.max(0, s.happiness - 8); } },
  { day: 30, title: "🏥 Hospitals Overwhelmed",   desc: "Emergency rooms are at capacity. Mortality rises.", type: "red",
    condition: s => s.infected > 35,
    effect(s) { s.baseSpread += 0.03; } },
  { day: 35, title: "🤝 EU Aid Package",          desc: "European partners send emergency economic relief.", type: "green",
    effect(s) { s.economy = Math.min(100, s.economy + 12); } },
  { day: 45, title: "😤 Protest Wave",            desc: "Citizens protest lockdown measures. Compliance collapses.", type: "red",
    condition: s => s.activePolicies.has("lockdown"),
    effect(s) { s.happiness = Math.max(0, s.happiness - 14); s.baseSpread += 0.02; } },
  { day: 50, title: "🔬 Treatment Breakthrough",  desc: "A new antiviral drug is approved. Spread slows.", type: "green",
    effect(s) { s.baseSpread = Math.max(0.01, s.baseSpread - 0.05); } },
  { day: 60, title: "✈️ Second Wave from Asia",   desc: "A new variant arrives via international travel.", type: "red",
    condition: s => !s.activePolicies.has("border_control"),
    effect(s) { s.infected = Math.min(100, s.infected + 14); } },
  { day: 72, title: "📉 Recession Warning",       desc: "Economists warn of long-term economic collapse.", type: "red",
    condition: s => s.economy < 40,
    effect(s) { s.economy = Math.max(0, s.economy - 8); } },
  { day: 80, title: "🌍 Global Solidarity",       desc: "International support boosts German morale.", type: "green",
    effect(s) { s.happiness = Math.min(100, s.happiness + 8); } },
];

// ── NEWS LINES ────────────────────────────────────────────────────────────────
const NEWS = [
  "Germany reports record case numbers…",
  "Scientists urge faster vaccine rollout…",
  "WHO warns of pandemic fatigue among citizens…",
  "Economy shows signs of recovery…",
  "New study: mask mandates cut spread by 40%…",
  "Neighboring France tightens border controls…",
  "Hospitals in Berlin at 95% capacity…",
  "Chancellor addresses the nation on pandemic response…",
  "Poll: 60% of Germans support stricter measures…",
  "Vaccine hesitancy remains a major challenge…",
  "Air travel down 70% vs. pre-pandemic levels…",
  "Remote work becomes permanent for thousands of companies…",
  "School closures debated in parliament…",
  "Supply chains strained by border restrictions…",
];

// ── EUROPE SVG MAP ────────────────────────────────────────────────────────────
// Simplified country paths in a 500×360 viewBox
const EU_COUNTRIES = [
  {
    id: "GB", name: "UK", color: "#1e3a5f",
    path: "M 152 72 L 168 62 L 178 75 L 172 95 L 158 100 L 148 88 Z",
    labelX: 163, labelY: 82,
  },
  {
    id: "IE", name: "Ireland", color: "#1e3a5f",
    path: "M 130 85 L 143 80 L 148 92 L 138 100 L 126 95 Z",
    labelX: 136, labelY: 91,
  },
  {
    id: "NO", name: "Norway", color: "#1a3050",
    path: "M 230 20 L 280 10 L 295 30 L 270 50 L 240 55 L 220 40 Z",
    labelX: 255, labelY: 33,
  },
  {
    id: "SE", name: "Sweden", color: "#1a3050",
    path: "M 280 15 L 310 10 L 315 50 L 295 60 L 275 50 L 270 30 Z",
    labelX: 293, labelY: 35,
  },
  {
    id: "DK", name: "Denmark", color: "#1e3a5f",
    path: "M 255 70 L 270 60 L 278 72 L 268 85 L 254 82 Z",
    labelX: 265, labelY: 74,
  },
  {
    id: "NL", name: "Netherlands", color: "#1e3a5f",
    path: "M 212 110 L 228 106 L 232 120 L 218 126 L 208 118 Z",
    labelX: 220, labelY: 116,
  },
  {
    id: "BE", name: "Belgium", color: "#1e3a5f",
    path: "M 208 122 L 228 118 L 232 134 L 214 138 L 205 130 Z",
    labelX: 218, labelY: 128,
  },
  {
    id: "FR", name: "France", color: "#1e3a5f",
    path: "M 168 138 L 232 136 L 248 158 L 240 190 L 212 210 L 182 200 L 162 180 L 160 155 Z",
    labelX: 203, labelY: 172,
  },
  {
    id: "ES", name: "Spain", color: "#1e3a5f",
    path: "M 148 210 L 240 204 L 246 232 L 220 256 L 175 260 L 145 244 L 138 224 Z",
    labelX: 192, labelY: 232,
  },
  {
    id: "PT", name: "Portugal", color: "#1e3a5f",
    path: "M 138 218 L 153 212 L 152 252 L 136 255 L 130 238 Z",
    labelX: 141, labelY: 234,
  },
  {
    id: "CH", name: "Switzerland", color: "#1e3a5f",
    path: "M 234 164 L 260 160 L 265 176 L 240 180 L 230 172 Z",
    labelX: 248, labelY: 170,
  },
  {
    id: "IT", name: "Italy", color: "#1e3a5f",
    path: "M 240 178 L 278 165 L 290 185 L 285 215 L 270 250 L 258 270 L 245 255 L 252 220 L 248 190 Z",
    labelX: 268, labelY: 210,
  },
  {
    id: "AT", name: "Austria", color: "#1e3a5f",
    path: "M 268 152 L 310 148 L 314 162 L 272 167 L 262 160 Z",
    labelX: 287, labelY: 157,
  },
  {
    id: "CZ", name: "Czechia", color: "#1e3a5f",
    path: "M 270 130 L 310 124 L 316 142 L 270 148 Z",
    labelX: 292, labelY: 136,
  },
  {
    id: "PL", name: "Poland", color: "#1e3a5f",
    path: "M 296 96 L 348 88 L 358 112 L 350 130 L 314 136 L 298 118 Z",
    labelX: 326, labelY: 112,
  },
  {
    id: "HU", name: "Hungary", color: "#1a3050",
    path: "M 310 162 L 348 156 L 355 172 L 332 182 L 305 178 Z",
    labelX: 330, labelY: 169,
  },
  {
    id: "RO", name: "Romania", color: "#1a3050",
    path: "M 348 148 L 390 140 L 398 168 L 380 184 L 348 180 L 338 165 Z",
    labelX: 368, labelY: 162,
  },
  {
    id: "UA", name: "Ukraine", color: "#131f30",
    path: "M 360 90 L 430 80 L 440 120 L 415 138 L 360 130 L 350 108 Z",
    labelX: 395, labelY: 108,
  },
  {
    id: "GR", name: "Greece", color: "#1a3050",
    path: "M 308 210 L 335 200 L 345 222 L 330 240 L 308 238 L 298 222 Z",
    labelX: 320, labelY: 220,
  },
  {
    id: "DE", name: "Germany", color: "#1e3a5f", isGermany: true,
    path: "M 234 100 L 270 92 L 294 96 L 296 118 L 270 128 L 268 150 L 234 162 L 230 138 L 232 118 Z",
    labelX: 263, labelY: 122,
  },
];

// Regions outside Europe (shown as bubbles)
const WORLD_REGIONS = [
  { id: "CN", name: "China",  cx: 440, cy: 140, r: 18, infection: 35 },
  { id: "US", name: "USA",    cx: 55,  cy: 160, r: 20, infection: 28 },
  { id: "IN", name: "India",  cx: 400, cy: 220, r: 16, infection: 22 },
  { id: "BR", name: "Brazil", cx: 110, cy: 280, r: 15, infection: 18 },
];

// ── GAME STATE ───────────────────────────────────────────────────────────────
let state = {};
let tickTimer = null;
let speedMultiplier = 1;
let newsIndex = 0;
let lastInfected = 0, lastHappiness = 0, lastEconomy = 0;

function initState(playerName) {
  return {
    playerName,
    day: 1,
    infected: 2,
    happiness: 80,
    economy: 85,
    baseSpread: 0.12,
    vaccineProgress: 0,
    activePolicies: new Set(),
    triggeredEvents: new Set(),
    gameOver: false,
  };
}

// ── TICK ─────────────────────────────────────────────────────────────────────
function tick() {
  if (state.gameOver) return;

  lastInfected  = state.infected;
  lastHappiness = state.happiness;
  lastEconomy   = state.economy;

  let spreadMod = 0, economyMod = 0, happinessMod = 0;

  for (const pid of state.activePolicies) {
    const p = POLICIES.find(p => p.id === pid);
    if (!p) continue;
    spreadMod    += p.effects.infectionRate || 0;
    economyMod   += p.effects.economy || 0;
    happinessMod += p.effects.happiness || 0;
    if (p.effects.vaccineProgress)
      state.vaccineProgress = Math.min(100, state.vaccineProgress + 1.4);
  }

  const vaccineBonus = -(state.vaccineProgress / 100) * 0.20;
  spreadMod += vaccineBonus;

  if (!state.activePolicies.has("lockdown") && !state.activePolicies.has("border_control"))
    economyMod += 0.018;

  if (state.infected < 20)  happinessMod += 0.015;
  if (state.infected > 50)  happinessMod -= 0.03;

  const netSpread = Math.max(0.002, state.baseSpread + spreadMod);
  state.infected  = clamp(state.infected  + netSpread * 100 * 0.14, 0, 100);
  state.economy   = clamp(state.economy   + economyMod   * 100 * 0.28, 0, 100);
  state.happiness = clamp(state.happiness + happinessMod * 100 * 0.28, 0, 100);

  // Events
  for (const ev of EVENTS) {
    if (state.triggeredEvents.has(ev.day)) continue;
    if (ev.day === state.day && (!ev.condition || ev.condition(state))) {
      ev.effect(state);
      state.triggeredEvents.add(ev.day);
      showToast(ev.title, ev.desc, ev.type || "yellow");
    }
  }

  state.day++;

  if (state.infected >= 80)  { endGame("defeat");           return; }
  if (state.economy   <= 0)  { endGame("economic_collapse"); return; }
  if (state.day > 90)        { endGame("success");           return; }

  renderGame();
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// ── TOASTS ───────────────────────────────────────────────────────────────────
function showToast(title, desc, type = "yellow") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  const cls = type === "red" ? "red-toast" : type === "green" ? "green-toast" : "";
  toast.className = `toast ${cls}`;
  toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-desc">${desc}</div>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toast-out .3s ease forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function getStatus() {
  if (state.infected > 60) return { cls: "critical",  icon: "🚨", text: "Critical!" };
  if (state.infected > 35) return { cls: "warning",   icon: "⚠️", text: "Warning" };
  if (state.infected > 15) return { cls: "stable",    icon: "📊", text: "Stable" };
  return                          { cls: "excellent",  icon: "✅", text: "Under Control" };
}

function getScorePreview() {
  const i = Math.round((1 - state.infected  / 100) * 40);
  const h = Math.round((state.happiness / 100) * 30);
  const e = Math.round((state.economy   / 100) * 30);
  return i + h + e;
}

function trendArrow(cur, prev) {
  const d = cur - prev;
  if (Math.abs(d) < 0.3) return '<span style="color:#7986a0">→</span>';
  return d > 0
    ? '<span style="color:#ef5350">↑</span>'
    : '<span style="color:#66bb6a">↓</span>';
}

// ── RENDER ───────────────────────────────────────────────────────────────────
function renderGame() {
  // Stats
  document.getElementById("stat-infected").textContent  = state.infected.toFixed(1)  + "%";
  document.getElementById("stat-happiness").textContent = state.happiness.toFixed(1) + "%";
  document.getElementById("stat-economy").textContent   = state.economy.toFixed(1)   + "%";
  document.getElementById("bar-infected").style.width   = state.infected  + "%";
  document.getElementById("bar-happiness").style.width  = state.happiness + "%";
  document.getElementById("bar-economy").style.width    = state.economy   + "%";

  document.getElementById("trend-infected").innerHTML  = trendArrow(state.infected,  lastInfected);
  document.getElementById("trend-happiness").innerHTML = trendArrow(state.happiness, lastHappiness);
  document.getElementById("trend-economy").innerHTML   = trendArrow(state.economy,   lastEconomy);

  // Day
  document.getElementById("day-counter").textContent = `Day ${state.day} / 90`;
  document.getElementById("day-progress-fill").style.width = ((state.day / 90) * 100) + "%";

  // Status badge
  const st = getStatus();
  const badge = document.getElementById("status-badge");
  badge.className = `status-badge ${st.cls}`;
  badge.innerHTML = `${st.icon} ${st.text}`;

  // Score preview
  document.getElementById("score-preview-val").textContent = getScorePreview();

  // Vaccine
  const vEl = document.getElementById("vaccine-label");
  if (state.activePolicies.has("vaccine")) {
    vEl.style.display = "block";
    vEl.textContent = state.vaccineProgress >= 100
      ? "💉 Fully Vaccinated!"
      : `💉 Vaccine: ${state.vaccineProgress.toFixed(0)}%`;
  } else {
    vEl.style.display = "none";
  }

  // Map
  renderMap();

  // Policy cards
  document.querySelectorAll(".policy-card").forEach(el => {
    el.classList.toggle("active", state.activePolicies.has(el.dataset.id));
  });

  // Active policy tags
  const tagsEl = document.getElementById("active-policies");
  tagsEl.innerHTML = "";
  if (state.activePolicies.size === 0) {
    tagsEl.innerHTML = `<span style="color:#7986a0;font-size:0.78rem">None active — tap a policy below</span>`;
  } else {
    for (const pid of state.activePolicies) {
      const p = POLICIES.find(p => p.id === pid);
      if (!p) continue;
      const tag = document.createElement("div");
      tag.className = "policy-tag";
      tag.innerHTML = `${p.name} <span class="x" data-id="${pid}">✕</span>`;
      tag.querySelector(".x").onclick = () => togglePolicy(pid);
      tagsEl.appendChild(tag);
    }
  }
}

// ── SVG MAP ───────────────────────────────────────────────────────────────────
function renderMap() {
  const svg = document.getElementById("world-map");
  svg.innerHTML = "";

  const VW = 500, VH = 360;

  // Ocean background
  const bg = makeSVG("rect", { width: VW, height: VH, fill: "#06101e" });
  svg.appendChild(bg);

  // Subtle grid lines
  for (let x = 0; x <= VW; x += 50) {
    const l = makeSVG("line", { x1: x, y1: 0, x2: x, y2: VH, stroke: "#0e1e32", "stroke-width": 1 });
    svg.appendChild(l);
  }
  for (let y = 0; y <= VH; y += 50) {
    const l = makeSVG("line", { x1: 0, y1: y, x2: VW, y2: y, stroke: "#0e1e32", "stroke-width": 1 });
    svg.appendChild(l);
  }

  // World regions (bubbles at corners)
  for (const r of WORLD_REGIONS) {
    const infFrac = r.infection / 100;
    const glow = makeSVG("circle", {
      cx: r.cx, cy: r.cy, r: r.r * 2.2,
      fill: `rgba(239,83,80,${infFrac * 0.3})`,
    });
    svg.appendChild(glow);
    const circle = makeSVG("circle", {
      cx: r.cx, cy: r.cy, r: r.r,
      fill: infColor(infFrac, 0.6),
      stroke: "#1e3a5f", "stroke-width": 1,
    });
    svg.appendChild(circle);
    const label = makeSVG("text", {
      x: r.cx, y: r.cy - r.r - 4,
      "text-anchor": "middle", fill: "#7986a0",
      "font-size": 9, "font-family": "Segoe UI,sans-serif",
    });
    label.textContent = r.name;
    svg.appendChild(label);
    const pct = makeSVG("text", {
      x: r.cx, y: r.cy + 4,
      "text-anchor": "middle", fill: "#fff",
      "font-size": 8, "font-weight": "bold", "font-family": "Segoe UI,sans-serif",
    });
    pct.textContent = r.infection + "%";
    svg.appendChild(pct);
  }

  // European countries
  for (const c of EU_COUNTRIES) {
    const infFrac = c.isGermany ? state.infected / 100 : 0.05 + Math.sin(state.day * 0.1 + c.labelX) * 0.08;

    if (c.isGermany) {
      // Pulse ring
      const ring = makeSVG("circle", {
        cx: c.labelX, cy: c.labelY,
        r: 28 + Math.sin(state.day * 0.3) * 4,
        fill: `rgba(239,83,80,${infFrac * 0.15})`,
        stroke: `rgba(239,83,80,${infFrac * 0.6})`,
        "stroke-width": 1.5,
      });
      svg.appendChild(ring);
    }

    const fillColor = c.isGermany
      ? infColor(infFrac, 1)
      : "#1e3a5f";

    const path = makeSVG("path", {
      d: c.path,
      fill: fillColor,
      stroke: c.isGermany ? "#4fc3f7" : "#0e1e32",
      "stroke-width": c.isGermany ? 2 : 1,
    });
    svg.appendChild(path);

    // Country label
    if (!["IE", "PT", "BE", "AT", "CH", "DK"].includes(c.id)) {
      const label = makeSVG("text", {
        x: c.labelX, y: c.labelY,
        "text-anchor": "middle", "dominant-baseline": "middle",
        fill: c.isGermany ? "#4fc3f7" : "#b0bec5",
        "font-size": c.isGermany ? 11 : 8,
        "font-weight": c.isGermany ? "bold" : "normal",
        "font-family": "Segoe UI,sans-serif",
      });
      label.textContent = c.isGermany ? `🇩🇪 ${c.name}` : c.name;
      svg.appendChild(label);
    }

    // Germany infection %
    if (c.isGermany) {
      const pct = makeSVG("text", {
        x: c.labelX, y: c.labelY + 12,
        "text-anchor": "middle",
        fill: "#fff", "font-size": 9, "font-weight": "bold",
        "font-family": "Segoe UI,sans-serif",
      });
      pct.textContent = state.infected.toFixed(1) + "% infected";
      svg.appendChild(pct);
    }
  }

  // Legend
  const legendY = VH - 10;
  for (const [i, [pct, label, col]] of [[0, "Low", "#2e7d32"], [1, "Medium", "#e65100"], [2, "High", "#b71c1c"]].entries()) {
    const dot = makeSVG("circle", { cx: 12 + i * 70, cy: legendY, r: 5, fill: col });
    svg.appendChild(dot);
    const t = makeSVG("text", { x: 20 + i * 70, y: legendY + 4, fill: "#7986a0", "font-size": 8, "font-family": "Segoe UI,sans-serif" });
    t.textContent = label;
    svg.appendChild(t);
  }
}

function makeSVG(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function infColor(frac, alpha) {
  const r = Math.round(30  + frac * 210);
  const g = Math.round(100 - frac * 80);
  const b = Math.round(140 - frac * 110);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── POLICIES ─────────────────────────────────────────────────────────────────
function togglePolicy(pid) {
  if (state.activePolicies.has(pid)) {
    state.activePolicies.delete(pid);
    const p = POLICIES.find(p => p.id === pid);
    showToast(`${p.name} lifted`, "Policy removed — effects will reverse.", "yellow");
  } else {
    state.activePolicies.add(pid);
    const p = POLICIES.find(p => p.id === pid);
    showToast(`${p.name} activated`, p.desc, "green");
  }
  renderGame();
}

function buildPolicyCards() {
  const container = document.getElementById("policy-cards");
  container.innerHTML = "";
  for (const p of POLICIES) {
    const card = document.createElement("div");
    card.className = "policy-card";
    card.dataset.id = p.id;
    card.innerHTML = `
      <div class="p-name">${p.name}</div>
      <div class="p-desc">${p.desc}</div>
      <div class="policy-effects">
        ${p.pillLabels.map(pl => `<span class="effect-pill ${pl.cls}">${pl.text}</span>`).join("")}
      </div>`;
    card.onclick = () => togglePolicy(p.id);
    container.appendChild(card);
  }
}

// ── NEWS TICKER ───────────────────────────────────────────────────────────────
function rotateTicker() {
  document.getElementById("news-text").textContent = "📡 " + NEWS[newsIndex % NEWS.length];
  newsIndex++;
}

// ── END GAME ─────────────────────────────────────────────────────────────────
async function endGame(reason) {
  state.gameOver = true;
  clearInterval(tickTimer);

  const iScore = Math.round((1 - state.infected  / 100) * 40);
  const hScore = Math.round((state.happiness / 100) * 30);
  const eScore = Math.round((state.economy   / 100) * 30);
  const total  = iScore + hScore + eScore;

  const grades = [
    [90, "S", "Legendary Crisis Manager! 🏅"],
    [75, "A", "Outstanding Response! 🌟"],
    [60, "B", "Solid Performance 👍"],
    [45, "C", "Could Be Better 😐"],
    [0,  "D", "Crisis Mismanaged 😔"],
  ];
  const [, grade, gradeLabel] = grades.find(([min]) => total >= min);

  const titles = {
    success: "90 Days Complete! 🎉",
    defeat: "Pandemic Out of Control 🦠",
    economic_collapse: "Economic Collapse 📉",
  };
  const msgs = {
    success: "You survived the full 90-day crisis period. Your decisions shaped millions of lives.",
    defeat: "The virus spread too far. Next time, act faster and combine multiple policies.",
    economic_collapse: "The economy collapsed under the weight of restrictions. Balance is key.",
  };

  document.getElementById("end-title").textContent   = titles[reason];
  document.getElementById("end-msg").textContent     = msgs[reason];
  document.getElementById("final-score").textContent = total;
  document.getElementById("score-grade").textContent = `Grade: ${grade} — ${gradeLabel}`;
  document.getElementById("score-grade").style.color = total >= 75 ? "#66bb6a" : total >= 50 ? "#ffa726" : "#ef5350";

  document.getElementById("s-infected").textContent  = state.infected.toFixed(1)  + "%";
  document.getElementById("s-happiness").textContent = state.happiness.toFixed(1) + "%";
  document.getElementById("s-economy").textContent   = state.economy.toFixed(1)   + "%";
  document.getElementById("s-days").textContent      = (state.day - 1) + " / 90";
  document.getElementById("s-i-pts").textContent     = `+${iScore} pts`;
  document.getElementById("s-h-pts").textContent     = `+${hScore} pts`;
  document.getElementById("s-e-pts").textContent     = `+${eScore} pts`;
  document.getElementById("s-total").textContent     = `${total} / 100`;

  showScreen("end-screen");

  try {
    await submitScore(state.playerName, total, +state.infected.toFixed(1), +state.happiness.toFixed(1), +state.economy.toFixed(1), state.day - 1);
  } catch (e) {
    console.warn("Score submit failed:", e.message);
  }
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
async function showLeaderboard() {
  showScreen("leaderboard-screen");
  const tbody = document.getElementById("lb-tbody");
  tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#7986a0">Loading scores…</td></tr>`;

  try {
    const rows = await fetchLeaderboard();
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#7986a0">No scores yet. Be the first!</td></tr>`;
      return;
    }
    const myScore = state.gameOver ? getScorePreview() : -1;
    tbody.innerHTML = rows.map((r, i) => {
      const isMine = r.name === state.playerName && r.score === myScore;
      return `<tr class="${isMine ? "highlight" : ""}">
        <td class="rank">#${i + 1}</td>
        <td>${esc(r.name)}${isMine ? " 👈" : ""}</td>
        <td class="score-col">${r.score}</td>
        <td>${r.infected}%</td>
        <td>${r.days} days</td>
      </tr>`;
    }).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#ef5350">
      Could not load leaderboard.<br><small style="color:#7986a0">Make sure the Supabase table exists.</small>
    </td></tr>`;
  }
}

function esc(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ── SPEED ─────────────────────────────────────────────────────────────────────
function setSpeed(mult, btn) {
  speedMultiplier = mult;
  document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 2000 / speedMultiplier);
}

// ── BOOTSTRAP ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  showScreen("start-screen");

  document.getElementById("start-btn").onclick = () => {
    const name = document.getElementById("player-name").value.trim() || "Anonymous";
    state = initState(name);
    buildPolicyCards();
    renderGame();
    showScreen("game-screen");
    tickTimer = setInterval(tick, 2000);
    rotateTicker();
    setInterval(rotateTicker, 5000);
    showToast("🚨 Crisis Begins", "A new pathogen is spreading. Make your first decisions!", "red");
  };

  document.getElementById("view-lb-start").onclick = () => goToLeaderboard("start-screen");
  document.getElementById("view-lb-end").onclick   = () => goToLeaderboard("end-screen");
  document.getElementById("play-again-btn").onclick = () => {
    clearInterval(tickTimer);
    showScreen("start-screen");
  };
  document.getElementById("back-lb-btn").onclick   = () => showScreen(previousScreen);

  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.onclick = () => setSpeed(+btn.dataset.speed, btn);
  });
});
