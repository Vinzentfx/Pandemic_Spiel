// ── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://agxyxxibaqvlrwwlfwto.supabase.co";
const SUPABASE_KEY = "sb_publishable_FkrYM9tcAalKcghoYe0ZmQ_NAWMthuU";

// ── SUPABASE HELPERS ─────────────────────────────────────────────────────────
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

async function ensureTable() {
  // Try to read — if 404-style error the table doesn't exist yet.
  // Supabase auto-creates tables only via Dashboard; we handle gracefully.
  try {
    await sbFetch("/pandemic_scores?limit=1");
  } catch (e) {
    console.warn("Leaderboard table may not exist yet:", e.message);
  }
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

// ── GAME STATE ───────────────────────────────────────────────────────────────
const TICK_MS = 2000; // base tick (1 game-day)
let state = {};
let tickTimer = null;
let speedMultiplier = 1;

const POLICIES = [
  {
    id: "border_control",
    name: "🛂 Border Control",
    desc: "Restrict international travel into Germany.",
    effects: { infectionRate: -0.15, economy: -0.08 },
    pillLabels: [
      { text: "−15% spread", cls: "good" },
      { text: "−8% economy/day", cls: "bad" },
    ],
  },
  {
    id: "mask_mandate",
    name: "😷 Mask Mandate",
    desc: "Require masks in public spaces.",
    effects: { infectionRate: -0.1, happiness: -0.03 },
    pillLabels: [
      { text: "−10% spread", cls: "good" },
      { text: "−3% happiness/day", cls: "bad" },
    ],
  },
  {
    id: "lockdown",
    name: "🔒 Lockdown",
    desc: "Strict stay-at-home orders. Effective but costly.",
    effects: { infectionRate: -0.35, economy: -0.2, happiness: -0.12 },
    pillLabels: [
      { text: "−35% spread", cls: "good" },
      { text: "−20% economy/day", cls: "bad" },
      { text: "−12% happiness/day", cls: "bad" },
    ],
  },
  {
    id: "vaccine",
    name: "💉 Vaccine Program",
    desc: "Fund and distribute vaccines. Slow but permanent.",
    effects: { infectionRate: -0.05, economy: -0.05, vaccineProgress: true },
    pillLabels: [
      { text: "−5% spread", cls: "good" },
      { text: "+vaccine progress", cls: "neutral" },
      { text: "−5% economy/day", cls: "bad" },
    ],
  },
  {
    id: "testing",
    name: "🧪 Mass Testing",
    desc: "Identify and isolate infected individuals.",
    effects: { infectionRate: -0.12, economy: -0.04 },
    pillLabels: [
      { text: "−12% spread", cls: "good" },
      { text: "−4% economy/day", cls: "bad" },
    ],
  },
  {
    id: "stimulus",
    name: "💶 Economic Stimulus",
    desc: "Government support for businesses and citizens.",
    effects: { economy: 0.1, happiness: 0.05 },
    pillLabels: [
      { text: "+10% economy/day", cls: "good" },
      { text: "+5% happiness/day", cls: "good" },
    ],
  },
  {
    id: "public_info",
    name: "📢 Public Info Campaign",
    desc: "Educate the public. Boosts compliance and mood.",
    effects: { infectionRate: -0.06, happiness: 0.04 },
    pillLabels: [
      { text: "−6% spread", cls: "good" },
      { text: "+4% happiness/day", cls: "good" },
    ],
  },
  {
    id: "curfew",
    name: "🌙 Night Curfew",
    desc: "Restrict movement after 9pm.",
    effects: { infectionRate: -0.08, happiness: -0.05 },
    pillLabels: [
      { text: "−8% spread", cls: "good" },
      { text: "−5% happiness/day", cls: "bad" },
    ],
  },
];

const EVENTS = [
  {
    day: 10,
    title: "🦠 New Variant Detected",
    desc: "A more contagious variant has been identified in neighboring countries.",
    effect(s) { s.baseSpread += 0.04; },
  },
  {
    day: 20,
    title: "📰 Media Panic",
    desc: "Sensational news coverage is tanking public morale.",
    effect(s) { s.happiness = Math.max(0, s.happiness - 8); },
  },
  {
    day: 30,
    title: "🏥 Hospital Strain",
    desc: "Hospitals are overwhelmed. Infection deaths increase.",
    condition: s => s.infected > 40,
    effect(s) { s.baseSpread += 0.03; },
  },
  {
    day: 35,
    title: "🤝 EU Aid Package",
    desc: "European partners provide economic relief.",
    effect(s) { s.economy = Math.min(100, s.economy + 10); },
  },
  {
    day: 45,
    title: "😤 Protest Wave",
    desc: "Citizens protest restrictions. Compliance drops.",
    condition: s => s.activePolicies.has("lockdown"),
    effect(s) { s.happiness = Math.max(0, s.happiness - 12); s.baseSpread += 0.02; },
  },
  {
    day: 50,
    title: "🔬 Treatment Breakthrough",
    desc: "A new treatment reduces mortality significantly.",
    effect(s) { s.baseSpread -= 0.05; },
  },
  {
    day: 60,
    title: "✈️ Variant from Asia",
    desc: "A new wave arrives via international travel.",
    condition: s => !s.activePolicies.has("border_control"),
    effect(s) { s.infected = Math.min(100, s.infected + 15); },
  },
  {
    day: 75,
    title: "📉 Recession Warning",
    desc: "Economists warn of long-term economic damage.",
    condition: s => s.economy < 40,
    effect(s) { s.economy = Math.max(0, s.economy - 8); },
  },
];

const NEWS_LINES = [
  "Germany reports record case numbers…",
  "Scientists urge faster vaccine rollout…",
  "WHO warns of pandemic fatigue among citizens…",
  "Economy shows signs of recovery in Q3…",
  "New study links mask mandates to 40% reduction in spread…",
  "Neighboring France tightens border controls…",
  "Hospitals in Berlin operating at 95% capacity…",
  "Chancellor addresses nation on pandemic response…",
  "Poll: 60% of Germans support stricter measures…",
  "Vaccine hesitancy remains a challenge…",
  "Air travel down 70% compared to pre-pandemic levels…",
  "Remote work becomes permanent for many companies…",
];

// ── WORLD MAP (SVG simplified) ────────────────────────────────────────────────
// Countries as circles for simplicity + infection overlays
const COUNTRIES = [
  { id: "DE", name: "Germany", cx: 49, cy: 36, r: 3.5, base: 0 },
  { id: "FR", name: "France", cx: 44, cy: 40, r: 3, base: 0 },
  { id: "IT", name: "Italy", cx: 50, cy: 43, r: 2.5, base: 0 },
  { id: "PL", name: "Poland", cx: 56, cy: 34, r: 2.5, base: 0 },
  { id: "CN", name: "China", cx: 75, cy: 38, r: 4, base: 30 },
  { id: "US", name: "USA", cx: 18, cy: 38, r: 4.5, base: 20 },
  { id: "IN", name: "India", cx: 68, cy: 46, r: 3.5, base: 15 },
  { id: "BR", name: "Brazil", cx: 28, cy: 60, r: 3.5, base: 10 },
  { id: "GB", name: "UK", cx: 42, cy: 31, r: 2, base: 0 },
  { id: "ES", name: "Spain", cx: 41, cy: 43, r: 2.5, base: 0 },
];

// ── INIT ─────────────────────────────────────────────────────────────────────
function initState(playerName) {
  return {
    playerName,
    day: 1,
    infected: 2,       // % of population infected
    happiness: 80,     // %
    economy: 85,       // %
    baseSpread: 0.12,  // base infection increase per day (before policies)
    vaccineProgress: 0,
    activePolicies: new Set(),
    triggeredEvents: new Set(),
    gameOver: false,
    countryInfections: Object.fromEntries(COUNTRIES.map(c => [c.id, c.base])),
  };
}

// ── TICK ─────────────────────────────────────────────────────────────────────
function tick() {
  if (state.gameOver) return;

  // Compute net infection rate modifier from policies
  let spreadMod = 0;
  let economyMod = 0;
  let happinessMod = 0;

  for (const pid of state.activePolicies) {
    const p = POLICIES.find(p => p.id === pid);
    if (!p) continue;
    spreadMod += p.effects.infectionRate || 0;
    economyMod += p.effects.economy || 0;
    happinessMod += p.effects.happiness || 0;
    if (p.effects.vaccineProgress) state.vaccineProgress = Math.min(100, state.vaccineProgress + 1.2);
  }

  // Vaccine effect: once 100%, acts as permanent -20% spread
  const vaccineBonus = state.vaccineProgress >= 100 ? -0.2 : -(state.vaccineProgress / 100) * 0.2;
  spreadMod += vaccineBonus;

  // Economy drift: recovers slowly if no lockdown
  if (!state.activePolicies.has("lockdown") && !state.activePolicies.has("border_control")) {
    economyMod += 0.02;
  }

  // Happiness recovers slightly if infections are low
  if (state.infected < 20) happinessMod += 0.02;

  // Apply spread
  const netSpread = Math.max(0.002, state.baseSpread + spreadMod);
  state.infected = Math.min(100, state.infected + netSpread * 100 * 0.15);

  // Apply economy/happiness
  state.economy = clamp(state.economy + economyMod * 100 * 0.3, 0, 100);
  state.happiness = clamp(state.happiness + happinessMod * 100 * 0.3, 0, 100);

  // Natural happiness drain if infections are high
  if (state.infected > 50) state.happiness = Math.max(0, state.happiness - 0.4);

  // Update neighboring countries (visual only)
  for (const c of COUNTRIES) {
    if (c.id === "DE") {
      state.countryInfections["DE"] = state.infected;
    } else {
      const drift = (Math.random() - 0.3) * 1.5;
      state.countryInfections[c.id] = clamp((state.countryInfections[c.id] || 0) + drift, c.base, 95);
    }
  }

  // Events
  for (const ev of EVENTS) {
    if (state.triggeredEvents.has(ev.day)) continue;
    if (ev.day === state.day) {
      if (!ev.condition || ev.condition(state)) {
        ev.effect(state);
        state.triggeredEvents.add(ev.day);
        showEvent(ev);
      }
    }
  }

  state.day++;

  // Game over conditions
  if (state.infected >= 80) {
    endGame("defeat");
    return;
  }
  if (state.economy <= 0) {
    endGame("economic_collapse");
    return;
  }
  if (state.day > 90) {
    endGame("success");
    return;
  }

  renderGame();
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

// ── RENDER ───────────────────────────────────────────────────────────────────
function renderGame() {
  // Stats
  document.getElementById("stat-infected").textContent = state.infected.toFixed(1) + "%";
  document.getElementById("stat-happiness").textContent = state.happiness.toFixed(1) + "%";
  document.getElementById("stat-economy").textContent = state.economy.toFixed(1) + "%";
  document.getElementById("bar-infected").style.width = state.infected + "%";
  document.getElementById("bar-happiness").style.width = state.happiness + "%";
  document.getElementById("bar-economy").style.width = state.economy + "%";
  document.getElementById("day-counter").textContent = `Day ${state.day} / 90`;

  // Vaccine badge
  const vEl = document.getElementById("vaccine-progress");
  if (state.activePolicies.has("vaccine")) {
    vEl.style.display = "inline";
    vEl.textContent = state.vaccineProgress >= 100 ? "💉 Vaccinated!" : `💉 Vaccine: ${state.vaccineProgress.toFixed(0)}%`;
  } else {
    vEl.style.display = "none";
  }

  // Map
  renderMap();

  // Policy cards (update active state)
  document.querySelectorAll(".policy-card").forEach(el => {
    const pid = el.dataset.id;
    el.classList.toggle("active", state.activePolicies.has(pid));
  });

  // Active policy tags
  const tagsEl = document.getElementById("active-policies");
  tagsEl.innerHTML = "";
  for (const pid of state.activePolicies) {
    const p = POLICIES.find(p => p.id === pid);
    if (!p) continue;
    const tag = document.createElement("div");
    tag.className = "policy-tag";
    tag.innerHTML = `${p.name} <span class="remove-btn" data-id="${pid}">✕</span>`;
    tag.querySelector(".remove-btn").onclick = () => togglePolicy(pid);
    tagsEl.appendChild(tag);
  }
  if (state.activePolicies.size === 0) {
    tagsEl.innerHTML = `<span style="color:#7986a0;font-size:0.8rem">No active policies</span>`;
  }
}

function renderMap() {
  const svg = document.getElementById("world-map");
  svg.innerHTML = "";

  // Background ocean
  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", "#0a1628");
  svg.appendChild(bg);

  for (const c of COUNTRIES) {
    const inf = state.countryInfections[c.id] || 0;
    const infFrac = inf / 100;

    // Glow circle (infection)
    const glow = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    glow.setAttribute("cx", c.cx + "%");
    glow.setAttribute("cy", c.cy + "%");
    glow.setAttribute("r", (c.r * 2.5) + "%");
    glow.setAttribute("fill", `rgba(239,83,80,${infFrac * 0.35})`);
    svg.appendChild(glow);

    // Main circle
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", c.cx + "%");
    circle.setAttribute("cy", c.cy + "%");
    circle.setAttribute("r", c.r + "%");
    const r = Math.round(30 + infFrac * 200);
    const g = Math.round(100 - infFrac * 80);
    const b = Math.round(150 - infFrac * 120);
    circle.setAttribute("fill", `rgb(${r},${g},${b})`);
    circle.setAttribute("stroke", c.id === "DE" ? "#4fc3f7" : "#1e3a5f");
    circle.setAttribute("stroke-width", c.id === "DE" ? "0.5%" : "0.2%");
    svg.appendChild(circle);

    // Label
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", c.cx + "%");
    text.setAttribute("y", (c.cy - c.r - 0.8) + "%");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", c.id === "DE" ? "#4fc3f7" : "#7986a0");
    text.setAttribute("font-size", "1.8%");
    text.setAttribute("font-family", "Segoe UI, sans-serif");
    text.textContent = c.id === "DE" ? `🇩🇪 ${c.name}` : c.name;
    svg.appendChild(text);

    // Infection % label
    const inf_text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    inf_text.setAttribute("x", c.cx + "%");
    inf_text.setAttribute("y", (c.cy + 0.5) + "%");
    inf_text.setAttribute("text-anchor", "middle");
    inf_text.setAttribute("fill", "#fff");
    inf_text.setAttribute("font-size", "1.5%");
    inf_text.setAttribute("font-weight", "bold");
    inf_text.setAttribute("font-family", "Segoe UI, sans-serif");
    inf_text.textContent = inf.toFixed(0) + "%";
    svg.appendChild(inf_text);
  }
}

// ── EVENTS ───────────────────────────────────────────────────────────────────
function showEvent(ev) {
  const container = document.getElementById("events-container");
  const card = document.createElement("div");
  card.className = "event-card";
  card.innerHTML = `<div class="e-title">${ev.title}</div><div class="e-desc">${ev.desc}</div>`;
  container.prepend(card);
  // Keep max 3 events visible
  while (container.children.length > 3) container.lastChild.remove();
}

// ── NEWS TICKER ───────────────────────────────────────────────────────────────
let newsIndex = 0;
function rotateTicker() {
  const el = document.getElementById("news-ticker-text");
  el.textContent = "📡 " + NEWS_LINES[newsIndex % NEWS_LINES.length];
  newsIndex++;
}

// ── POLICIES ─────────────────────────────────────────────────────────────────
function togglePolicy(pid) {
  if (state.activePolicies.has(pid)) {
    state.activePolicies.delete(pid);
  } else {
    state.activePolicies.add(pid);
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
      </div>
    `;
    card.onclick = () => togglePolicy(p.id);
    container.appendChild(card);
  }
}

// ── END GAME ─────────────────────────────────────────────────────────────────
async function endGame(reason) {
  state.gameOver = true;
  clearInterval(tickTimer);

  const infectionScore = Math.round((1 - state.infected / 100) * 40);
  const happinessScore = Math.round((state.happiness / 100) * 30);
  const economyScore = Math.round((state.economy / 100) * 30);
  const totalScore = infectionScore + happinessScore + economyScore;

  let title = "";
  if (reason === "success") title = "90 Days Survived! 🎉";
  else if (reason === "defeat") title = "Pandemic Out of Control 😔";
  else title = "Economic Collapse 📉";

  document.getElementById("end-title").textContent = title;
  document.getElementById("final-score").textContent = totalScore;
  document.getElementById("final-infected").textContent = state.infected.toFixed(1) + "%";
  document.getElementById("final-happiness").textContent = state.happiness.toFixed(1) + "%";
  document.getElementById("final-economy").textContent = state.economy.toFixed(1) + "%";
  document.getElementById("final-days").textContent = state.day;
  document.getElementById("score-infection-pts").textContent = infectionScore + " pts";
  document.getElementById("score-happiness-pts").textContent = happinessScore + " pts";
  document.getElementById("score-economy-pts").textContent = economyScore + " pts";

  showScreen("end-screen");

  try {
    await submitScore(
      state.playerName,
      totalScore,
      +state.infected.toFixed(1),
      +state.happiness.toFixed(1),
      +state.economy.toFixed(1),
      state.day
    );
  } catch (e) {
    console.warn("Score submit failed:", e.message);
  }
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
async function showLeaderboard() {
  showScreen("leaderboard-screen");
  const tbody = document.getElementById("lb-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="loading-text" style="text-align:center;padding:20px">Loading…</td></tr>`;

  try {
    const rows = await fetchLeaderboard();
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#7986a0">No scores yet. Be the first!</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r, i) => `
      <tr>
        <td class="rank">#${i + 1}</td>
        <td>${escHtml(r.name)}</td>
        <td class="score-col">${r.score}</td>
        <td>${r.infected}%</td>
        <td>${r.days} days</td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:#ef5350">Could not load leaderboard.<br><small>${e.message}</small></td></tr>`;
  }
}

function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── SCREENS ───────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ── SPEED CONTROLS ────────────────────────────────────────────────────────────
function setSpeed(mult, btn) {
  speedMultiplier = mult;
  document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, TICK_MS / speedMultiplier);
}

// ── BOOTSTRAP ────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  ensureTable();
  showScreen("start-screen");

  document.getElementById("start-btn").onclick = () => {
    const name = document.getElementById("player-name").value.trim() || "Anonymous";
    state = initState(name);
    buildPolicyCards();
    renderGame();
    showScreen("game-screen");
    tickTimer = setInterval(tick, TICK_MS);
    setInterval(rotateTicker, 4000);
    rotateTicker();
  };

  document.getElementById("view-lb-start").onclick = showLeaderboard;
  document.getElementById("play-again-btn").onclick = () => showScreen("start-screen");
  document.getElementById("view-lb-end").onclick = showLeaderboard;
  document.getElementById("back-to-end").onclick = () => showScreen("end-screen");

  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.onclick = () => setSpeed(+btn.dataset.speed, btn);
  });
});
