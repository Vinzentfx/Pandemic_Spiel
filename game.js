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
async function submitScore(name, score, infected, happiness, economy, days, difficulty) {
  await sbFetch("/pandemic_scores", {
    method: "POST",
    body: JSON.stringify({ name, score, infected, happiness, economy, days, difficulty }),
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

// ── SCHWIERIGKEITSGRADE ───────────────────────────────────────────────────────
const DIFFICULTY = {
  leicht: { label: "Leicht", spread: 0.08, bonus: 0 },
  mittel: { label: "Mittel", spread: 0.12, bonus: 10 },
  schwer: { label: "Schwer", spread: 0.18, bonus: 20 },
};
let selectedDifficulty = "mittel";

// ── MASSNAHMEN (POLICIES) ─────────────────────────────────────────────────────
const POLICIES = [
  {
    id: "border_control",
    name: "🛂 Grenzkontrollen",
    desc: "Internationalen Reiseverkehr nach Deutschland einschränken. Reduziert eingeschleppte Fälle.",
    effects: { infectionRate: -0.15, economy: -0.08 },
    pillLabels: [{ text: "−15% Ausbreitung", cls: "good" }, { text: "−8% Wirtschaft", cls: "bad" }],
  },
  {
    id: "mask_mandate",
    name: "😷 Maskenpflicht",
    desc: "Masken in öffentlichen Verkehrsmitteln und Gebäuden vorschreiben.",
    effects: { infectionRate: -0.10, happiness: -0.03 },
    pillLabels: [{ text: "−10% Ausbreitung", cls: "good" }, { text: "−3% Zufriedenheit", cls: "bad" }],
  },
  {
    id: "lockdown",
    name: "🔒 Lockdown",
    desc: "Ausgangsbeschränkungen für alle. Sehr wirksam, aber kostspielig.",
    effects: { infectionRate: -0.35, economy: -0.20, happiness: -0.12 },
    pillLabels: [{ text: "−35% Ausbreitung", cls: "good" }, { text: "−20% Wirtschaft", cls: "bad" }, { text: "−12% Zufriedenheit", cls: "bad" }],
  },
  {
    id: "vaccine",
    name: "💉 Impfprogramm",
    desc: "Impfstoffentwicklung und Verteilung finanzieren. Langsam, aber dauerhaft wirksam.",
    effects: { infectionRate: -0.05, economy: -0.05, vaccineProgress: true },
    pillLabels: [{ text: "−5% Ausbreitung", cls: "good" }, { text: "+Impffortschritt", cls: "neutral" }, { text: "−5% Wirtschaft", cls: "bad" }],
  },
  {
    id: "testing",
    name: "🧪 Massentests",
    desc: "Infizierte aufspüren und isolieren, bevor sie andere anstecken.",
    effects: { infectionRate: -0.12, economy: -0.04 },
    pillLabels: [{ text: "−12% Ausbreitung", cls: "good" }, { text: "−4% Wirtschaft", cls: "bad" }],
  },
  {
    id: "stimulus",
    name: "💶 Konjunkturpaket",
    desc: "Staatliche Hilfen für Unternehmen und Bürger. Stärkt Wirtschaft und Moral.",
    effects: { economy: 0.10, happiness: 0.05 },
    pillLabels: [{ text: "+10% Wirtschaft", cls: "good" }, { text: "+5% Zufriedenheit", cls: "good" }],
  },
  {
    id: "public_info",
    name: "📢 Informationskampagne",
    desc: "Bevölkerung über Hygiene und Symptome aufklären. Günstig und effektiv.",
    effects: { infectionRate: -0.06, happiness: 0.04 },
    pillLabels: [{ text: "−6% Ausbreitung", cls: "good" }, { text: "+4% Zufriedenheit", cls: "good" }],
  },
  {
    id: "curfew",
    name: "🌙 Ausgangssperre",
    desc: "Bewegungsfreiheit ab 21 Uhr einschränken. Moderater Effekt.",
    effects: { infectionRate: -0.08, happiness: -0.05 },
    pillLabels: [{ text: "−8% Ausbreitung", cls: "good" }, { text: "−5% Zufriedenheit", cls: "bad" }],
  },
  {
    id: "school_close",
    name: "🏫 Schulschließungen",
    desc: "Schulen und Kitas schließen. Reduziert Kontakte bei Kindern stark.",
    effects: { infectionRate: -0.10, happiness: -0.07, economy: -0.05 },
    pillLabels: [{ text: "−10% Ausbreitung", cls: "good" }, { text: "−7% Zufriedenheit", cls: "bad" }, { text: "−5% Wirtschaft", cls: "bad" }],
  },
  {
    id: "contact_tracing",
    name: "📱 Kontaktverfolgung",
    desc: "App zur Nachverfolgung von Infektionsketten einführen.",
    effects: { infectionRate: -0.09, economy: -0.02 },
    pillLabels: [{ text: "−9% Ausbreitung", cls: "good" }, { text: "−2% Wirtschaft", cls: "bad" }],
  },
];

// ── EREIGNISSE (EVENTS) ───────────────────────────────────────────────────────
const EVENTS = [
  { day: 8,  title: "🦠 Neue Variante entdeckt",
    desc: "Eine ansteckendere Variante breitet sich in Nachbarländern aus.",
    type: "red",   effect(s) { s.baseSpread += 0.04; } },
  { day: 18, title: "📰 Medienpanik",
    desc: "Reißerische Schlagzeilen lassen das Vertrauen der Bevölkerung einbrechen.",
    type: "red",   effect(s) { s.happiness = Math.max(0, s.happiness - 8); } },
  { day: 30, title: "🏥 Krankenhäuser überlastet",
    desc: "Notaufnahmen sind voll. Die Sterblichkeit steigt deutlich an.",
    type: "red",   condition: s => s.infected > 35,
    effect(s) { s.baseSpread += 0.03; } },
  { day: 35, title: "🤝 EU-Hilfspaket",
    desc: "Europäische Partner schicken Nothilfe für die Wirtschaft.",
    type: "green",  effect(s) { s.economy = Math.min(100, s.economy + 12); } },
  { day: 42, title: "😤 Protestwelle",
    desc: "Bürger protestieren gegen die Maßnahmen. Befolgungsrate sinkt drastisch.",
    type: "red",   condition: s => s.activePolicies.has("lockdown"),
    effect(s) { s.happiness = Math.max(0, s.happiness - 14); s.baseSpread += 0.02; } },
  { day: 50, title: "🔬 Behandlungsdurchbruch",
    desc: "Ein neues Medikament wird zugelassen. Die Ausbreitung verlangsamt sich.",
    type: "green",  effect(s) { s.baseSpread = Math.max(0.01, s.baseSpread - 0.05); } },
  { day: 60, title: "✈️ Zweite Welle aus Asien",
    desc: "Eine neue Variante kommt über den internationalen Reiseverkehr.",
    type: "red",   condition: s => !s.activePolicies.has("border_control"),
    effect(s) { s.infected = Math.min(100, s.infected + 14); } },
  { day: 68, title: "📉 Rezessionswarnung",
    desc: "Ökonomen warnen vor langfristigem wirtschaftlichem Schaden.",
    type: "red",   condition: s => s.economy < 40,
    effect(s) { s.economy = Math.max(0, s.economy - 8); } },
  { day: 75, title: "🌍 Internationale Solidarität",
    desc: "Weltweite Unterstützung hebt die Stimmung in Deutschland.",
    type: "green",  effect(s) { s.happiness = Math.min(100, s.happiness + 8); } },
  { day: 82, title: "🧫 Mutiertes Virus",
    desc: "Das Virus mutiert erneut — Impfschutz wird teilweise umgangen.",
    type: "red",   condition: s => s.vaccineProgress > 50,
    effect(s) { s.vaccineProgress = Math.max(0, s.vaccineProgress - 20); s.baseSpread += 0.02; } },
];

// ── NACHRICHTEN-TICKER ────────────────────────────────────────────────────────
const NEWS = [
  "Deutschland meldet Rekordzahlen bei Neuinfektionen…",
  "Wissenschaftler fordern schnelleres Impftempo…",
  "WHO warnt vor Pandemiemüdigkeit in der Bevölkerung…",
  "Wirtschaft zeigt erste Erholungszeichen…",
  "Neue Studie: Maskenpflicht senkt Ansteckungen um 40 %…",
  "Nachbarland Frankreich verschärft Einreisekontrollen…",
  "Berliner Krankenhäuser melden 95 % Auslastung…",
  "Kanzler wendet sich in TV-Ansprache an die Nation…",
  "Umfrage: 60 % der Deutschen befürworten strengere Maßnahmen…",
  "Impfskepsis bleibt eine große Herausforderung…",
  "Flugreisen im Vergleich zur Vorpandemie um 70 % eingebrochen…",
  "Homeoffice wird für tausende Unternehmen dauerhaft…",
  "Schulschließungen erneut im Bundestag debattiert…",
  "Lieferketten durch Grenzkontrollen unter Druck…",
  "Experten fordern einheitliche europäische Pandemiestrategie…",
  "Pflegepersonal am Limit — Streiks drohen…",
];

// ── TIPPS ─────────────────────────────────────────────────────────────────────
const TIPPS = [
  "💡 Tipp: Kombination aus Massentests + Maskenpflicht ist kosteneffizient.",
  "💡 Tipp: Das Konjunkturpaket hilft, wenn die Wirtschaft unter 50 % fällt.",
  "💡 Tipp: Grenzkontrollen früh aktivieren verhindert Folgewellen.",
  "💡 Tipp: Das Impfprogramm braucht Zeit — starte es so früh wie möglich.",
  "💡 Tipp: Lockdown nur als letztes Mittel — er kostet Wirtschaft und Zufriedenheit stark.",
  "💡 Tipp: Kontaktverfolgung + Massentests ergänzen sich perfekt.",
  "💡 Tipp: Informationskampagne ist die billigste Maßnahme mit gutem Effekt.",
];

// ── SVG-KARTE (EUROPA) ────────────────────────────────────────────────────────
const EU_COUNTRIES = [
  { id:"GB", name:"UK",          path:"M 152 72 L 168 62 L 178 75 L 172 95 L 158 100 L 148 88 Z",          lx:163, ly:82  },
  { id:"NO", name:"Norwegen",    path:"M 230 20 L 280 10 L 295 30 L 270 50 L 240 55 L 220 40 Z",            lx:255, ly:33  },
  { id:"SE", name:"Schweden",    path:"M 280 15 L 310 10 L 315 50 L 295 60 L 275 50 L 270 30 Z",            lx:293, ly:35  },
  { id:"DK", name:"Dänemark",    path:"M 255 70 L 270 60 L 278 72 L 268 85 L 254 82 Z",                     lx:265, ly:74  },
  { id:"NL", name:"Niederl.",    path:"M 212 110 L 228 106 L 232 120 L 218 126 L 208 118 Z",                lx:220, ly:116 },
  { id:"BE", name:"Belgien",     path:"M 208 122 L 228 118 L 232 134 L 214 138 L 205 130 Z",                lx:218, ly:128 },
  { id:"FR", name:"Frankreich",  path:"M 168 138 L 232 136 L 248 158 L 240 190 L 212 210 L 182 200 L 162 180 L 160 155 Z", lx:203, ly:172 },
  { id:"ES", name:"Spanien",     path:"M 148 210 L 240 204 L 246 232 L 220 256 L 175 260 L 145 244 L 138 224 Z", lx:192, ly:232 },
  { id:"PT", name:"Portugal",    path:"M 138 218 L 153 212 L 152 252 L 136 255 L 130 238 Z",                lx:141, ly:234 },
  { id:"CH", name:"Schweiz",     path:"M 234 164 L 260 160 L 265 176 L 240 180 L 230 172 Z",                lx:248, ly:170 },
  { id:"IT", name:"Italien",     path:"M 240 178 L 278 165 L 290 185 L 285 215 L 270 250 L 258 270 L 245 255 L 252 220 L 248 190 Z", lx:268, ly:210 },
  { id:"AT", name:"Österreich",  path:"M 268 152 L 310 148 L 314 162 L 272 167 L 262 160 Z",               lx:287, ly:157 },
  { id:"CZ", name:"Tschechien",  path:"M 270 130 L 310 124 L 316 142 L 270 148 Z",                         lx:292, ly:136 },
  { id:"PL", name:"Polen",       path:"M 296 96 L 348 88 L 358 112 L 350 130 L 314 136 L 298 118 Z",       lx:326, ly:112 },
  { id:"HU", name:"Ungarn",      path:"M 310 162 L 348 156 L 355 172 L 332 182 L 305 178 Z",               lx:330, ly:169 },
  { id:"RO", name:"Rumänien",    path:"M 348 148 L 390 140 L 398 168 L 380 184 L 348 180 L 338 165 Z",     lx:368, ly:162 },
  { id:"UA", name:"Ukraine",     path:"M 360 90 L 430 80 L 440 120 L 415 138 L 360 130 L 350 108 Z",       lx:395, ly:108 },
  { id:"GR", name:"Griechenl.",  path:"M 308 210 L 335 200 L 345 222 L 330 240 L 308 238 L 298 222 Z",     lx:320, ly:220 },
  { id:"DE", name:"Deutschland", path:"M 234 100 L 270 92 L 294 96 L 296 118 L 270 128 L 268 150 L 234 162 L 230 138 L 232 118 Z", lx:263, ly:122, isGermany:true },
];
const WORLD_BUBBLES = [
  { id:"CN", name:"China",     cx:445, cy:130, r:18, inf:35 },
  { id:"US", name:"USA",       cx:55,  cy:155, r:20, inf:28 },
  { id:"IN", name:"Indien",    cx:405, cy:220, r:16, inf:22 },
  { id:"BR", name:"Brasilien", cx:110, cy:280, r:15, inf:18 },
];

// ── SPIELZUSTAND ──────────────────────────────────────────────────────────────
let state = {};
let tickTimer   = null;
let speedMult   = 1;
let paused      = false;
let newsIndex   = 0;
let tippIndex   = 0;
let lastInf     = 0, lastHap = 0, lastEco = 0;
let infHistory  = []; // Für das Verlaufsdiagramm

function initState(name) {
  const diff = DIFFICULTY[selectedDifficulty];
  return {
    name,
    day: 1,
    infected:  2,
    happiness: 80,
    economy:   85,
    baseSpread: diff.spread,
    difficultyBonus: diff.bonus,
    vaccineProgress: 0,
    activePolicies: new Set(),
    triggeredEvents: new Set(),
    gameOver: false,
  };
}

// ── SPIELTAKT ─────────────────────────────────────────────────────────────────
function tick() {
  if (state.gameOver || paused) return;

  lastInf = state.infected;
  lastHap = state.happiness;
  lastEco = state.economy;

  let spreadMod = 0, ecoMod = 0, hapMod = 0;
  for (const pid of state.activePolicies) {
    const p = POLICIES.find(p => p.id === pid);
    if (!p) continue;
    spreadMod += p.effects.infectionRate || 0;
    ecoMod    += p.effects.economy       || 0;
    hapMod    += p.effects.happiness     || 0;
    if (p.effects.vaccineProgress)
      state.vaccineProgress = Math.min(100, state.vaccineProgress + 1.4);
  }

  spreadMod += -(state.vaccineProgress / 100) * 0.20;
  if (!state.activePolicies.has("lockdown") && !state.activePolicies.has("border_control"))
    ecoMod += 0.018;
  if (state.infected < 20) hapMod += 0.015;
  if (state.infected > 50) hapMod -= 0.03;

  const netSpread = Math.max(0.002, state.baseSpread + spreadMod);
  state.infected  = clamp(state.infected  + netSpread * 100 * 0.14, 0, 100);
  state.economy   = clamp(state.economy   + ecoMod   * 100 * 0.28, 0, 100);
  state.happiness = clamp(state.happiness + hapMod   * 100 * 0.28, 0, 100);

  infHistory.push(+state.infected.toFixed(1));
  if (infHistory.length > 30) infHistory.shift();

  for (const ev of EVENTS) {
    if (state.triggeredEvents.has(ev.day)) continue;
    if (ev.day === state.day && (!ev.condition || ev.condition(state))) {
      ev.effect(state);
      state.triggeredEvents.add(ev.day);
      showToast(ev.title, ev.desc, ev.type || "yellow");
    }
  }

  state.day++;
  if (state.infected >= 80) { endGame("niederlage");   return; }
  if (state.economy   <= 0) { endGame("wirtschaft");   return; }
  if (state.day > 90)       { endGame("erfolg");       return; }

  renderGame();
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// ── TOASTS ────────────────────────────────────────────────────────────────────
function showToast(title, desc, type = "yellow") {
  const box = document.getElementById("toast-container");
  const t = document.createElement("div");
  const cls = type === "red" ? "red-toast" : type === "green" ? "green-toast" : "";
  t.className = `toast ${cls}`;
  t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-desc">${desc}</div>`;
  box.appendChild(t);
  setTimeout(() => {
    t.style.animation = "toast-out .3s ease forwards";
    setTimeout(() => t.remove(), 300);
  }, 5000);
}

// ── STATUS ────────────────────────────────────────────────────────────────────
function getStatus() {
  if (state.infected > 60) return { cls:"critical",  icon:"🚨", text:"Kritisch!" };
  if (state.infected > 35) return { cls:"warning",   icon:"⚠️",  text:"Warnung" };
  if (state.infected > 15) return { cls:"stable",    icon:"📊",  text:"Stabil" };
  return                          { cls:"excellent",  icon:"✅",  text:"Unter Kontrolle" };
}

function getScore() {
  const i = Math.round((1 - state.infected  / 100) * 40);
  const h = Math.round((state.happiness / 100) * 30);
  const e = Math.round((state.economy   / 100) * 30);
  return { i, h, e, total: i + h + e + state.difficultyBonus };
}

function trendArrow(cur, prev) {
  const d = cur - prev;
  if (Math.abs(d) < 0.3) return '<span style="color:#7986a0">→ gleich</span>';
  return d > 0
    ? '<span style="color:#ef5350">↑ steigt</span>'
    : '<span style="color:#66bb6a">↓ sinkt</span>';
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderGame() {
  el("stat-infected").textContent  = state.infected.toFixed(1)  + " %";
  el("stat-happiness").textContent = state.happiness.toFixed(1) + " %";
  el("stat-economy").textContent   = state.economy.toFixed(1)   + " %";
  el("bar-infected").style.width   = state.infected  + "%";
  el("bar-happiness").style.width  = state.happiness + "%";
  el("bar-economy").style.width    = state.economy   + "%";
  el("trend-infected").innerHTML   = trendArrow(state.infected,  lastInf);
  el("trend-happiness").innerHTML  = trendArrow(state.happiness, lastHap);
  el("trend-economy").innerHTML    = trendArrow(state.economy,   lastEco);

  el("day-counter").textContent            = `Tag ${state.day} / 90`;
  el("day-progress-fill").style.width      = ((state.day / 90) * 100) + "%";

  const st = getStatus();
  const badge = el("status-badge");
  badge.className = `status-badge ${st.cls}`;
  badge.innerHTML = `${st.icon} ${st.text}`;

  const sc = getScore();
  el("score-preview-val").textContent = sc.total;

  // Impf-Label
  const vEl = el("vaccine-label");
  if (state.activePolicies.has("vaccine")) {
    vEl.style.display = "block";
    vEl.textContent = state.vaccineProgress >= 100
      ? "💉 Vollständig geimpft!"
      : `💉 Impffortschritt: ${state.vaccineProgress.toFixed(0)} %`;
  } else {
    vEl.style.display = "none";
  }

  renderMap();
  renderChart();

  // Maßnahmenkarten Zustand
  document.querySelectorAll(".policy-card").forEach(card => {
    card.classList.toggle("active", state.activePolicies.has(card.dataset.id));
  });

  // Aktive Maßnahmen-Tags
  const tags = el("active-policies");
  tags.innerHTML = "";
  if (state.activePolicies.size === 0) {
    tags.innerHTML = `<span style="color:#7986a0;font-size:0.78rem">Keine aktiven Maßnahmen — Maßnahme unten antippen</span>`;
  } else {
    for (const pid of state.activePolicies) {
      const p = POLICIES.find(p => p.id === pid);
      if (!p) continue;
      const tag = document.createElement("div");
      tag.className = "policy-tag";
      tag.innerHTML = `${p.name} <span class="x" data-id="${pid}">✕</span>`;
      tag.querySelector(".x").onclick = () => togglePolicy(pid);
      tags.appendChild(tag);
    }
  }
}

// ── SVG-KARTE ─────────────────────────────────────────────────────────────────
function renderMap() {
  const svg = el("world-map");
  svg.innerHTML = "";

  const bg = mkSVG("rect", { width:500, height:360, fill:"#06101e" });
  svg.appendChild(bg);
  for (let x = 0; x <= 500; x += 50) svg.appendChild(mkSVG("line", { x1:x, y1:0, x2:x, y2:360, stroke:"#0e1e32", "stroke-width":1 }));
  for (let y = 0; y <= 360; y += 50) svg.appendChild(mkSVG("line", { x1:0, y1:y, x2:500, y2:y, stroke:"#0e1e32", "stroke-width":1 }));

  for (const r of WORLD_BUBBLES) {
    const f = r.inf / 100;
    svg.appendChild(mkSVG("circle", { cx:r.cx, cy:r.cy, r:r.r*2.2, fill:`rgba(239,83,80,${f*0.3})` }));
    svg.appendChild(mkSVG("circle", { cx:r.cx, cy:r.cy, r:r.r, fill:infCol(f,0.6), stroke:"#1e3a5f", "stroke-width":1 }));
    const lt = mkSVG("text", { x:r.cx, y:r.cy-r.r-4, "text-anchor":"middle", fill:"#7986a0", "font-size":9, "font-family":"Segoe UI,sans-serif" });
    lt.textContent = r.name; svg.appendChild(lt);
    const pt = mkSVG("text", { x:r.cx, y:r.cy+4, "text-anchor":"middle", fill:"#fff", "font-size":8, "font-weight":"bold", "font-family":"Segoe UI,sans-serif" });
    pt.textContent = r.inf + " %"; svg.appendChild(pt);
  }

  for (const c of EU_COUNTRIES) {
    if (c.isGermany) {
      const pulsR = 28 + Math.sin(state.day * 0.3) * 5;
      const frac  = state.infected / 100;
      svg.appendChild(mkSVG("circle", { cx:c.lx, cy:c.ly, r:pulsR, fill:`rgba(239,83,80,${frac*0.18})`, stroke:`rgba(239,83,80,${frac*0.7})`, "stroke-width":1.5 }));
    }
    const frac = c.isGermany ? state.infected / 100 : 0.05 + Math.sin(state.day * 0.1 + c.lx) * 0.07;
    svg.appendChild(mkSVG("path", { d:c.path, fill:c.isGermany ? infCol(frac,1) : "#1e3a5f", stroke:c.isGermany?"#4fc3f7":"#0e1e32", "stroke-width":c.isGermany?2:1 }));

    const skip = ["BE","PT","CH","DK"];
    if (!skip.includes(c.id)) {
      const lt = mkSVG("text", { x:c.lx, y:c.ly, "text-anchor":"middle", "dominant-baseline":"middle", fill:c.isGermany?"#4fc3f7":"#b0bec5", "font-size":c.isGermany?11:8, "font-weight":c.isGermany?"bold":"normal", "font-family":"Segoe UI,sans-serif" });
      lt.textContent = c.isGermany ? `🇩🇪 ${c.name}` : c.name;
      svg.appendChild(lt);
    }
    if (c.isGermany) {
      const pt = mkSVG("text", { x:c.lx, y:c.ly+13, "text-anchor":"middle", fill:"#fff", "font-size":9, "font-weight":"bold", "font-family":"Segoe UI,sans-serif" });
      pt.textContent = state.infected.toFixed(1) + " % infiziert";
      svg.appendChild(pt);
    }
  }
}

function mkSVG(tag, attrs) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v);
  return e;
}
function infCol(frac, alpha) {
  return `rgba(${Math.round(30+frac*210)},${Math.round(100-frac*80)},${Math.round(140-frac*110)},${alpha})`;
}

// ── VERLAUFSDIAGRAMM ──────────────────────────────────────────────────────────
function renderChart() {
  const svg = el("chart-svg");
  if (!svg || infHistory.length < 2) return;
  svg.innerHTML = "";
  const W = 300, H = 60;
  const max = 80;
  const pts = infHistory.slice(-30);
  const step = W / (pts.length - 1);

  // Gefüllter Bereich
  let area = `M 0 ${H} `;
  pts.forEach((v, i) => { area += `L ${i*step} ${H - (v/max)*H} `; });
  area += `L ${(pts.length-1)*step} ${H} Z`;
  svg.appendChild(mkSVG("path", { d:area, fill:"rgba(239,83,80,0.15)" }));

  // Linie
  let line = pts.map((v,i) => `${i===0?"M":"L"} ${i*step} ${H-(v/max)*H}`).join(" ");
  svg.appendChild(mkSVG("path", { d:line, fill:"none", stroke:"#ef5350", "stroke-width":2 }));

  // 80%-Gefahrengrenze
  const dangerY = H - (80/max)*H;
  svg.appendChild(mkSVG("line", { x1:0, y1:dangerY, x2:W, y2:dangerY, stroke:"#b71c1c", "stroke-width":1, "stroke-dasharray":"4 3" }));

  // Letzter Wert
  const last = pts[pts.length-1];
  const lx = (pts.length-1)*step, ly = H-(last/max)*H;
  svg.appendChild(mkSVG("circle", { cx:lx, cy:ly, r:3, fill:"#ef5350" }));
}

// ── MASSNAHMEN ────────────────────────────────────────────────────────────────
function togglePolicy(pid) {
  const p = POLICIES.find(p => p.id === pid);
  if (state.activePolicies.has(pid)) {
    state.activePolicies.delete(pid);
    showToast(`${p.name} aufgehoben`, "Maßnahme deaktiviert — Effekte kehren sich um.", "yellow");
  } else {
    state.activePolicies.add(pid);
    showToast(`${p.name} aktiviert`, p.desc, "green");
  }
  renderGame();
}

function buildPolicyCards() {
  const container = el("policy-cards");
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

// ── PAUSE ────────────────────────────────────────────────────────────────────
function togglePause() {
  paused = !paused;
  const btn = el("pause-btn");
  const overlay = el("pause-overlay");
  btn.textContent   = paused ? "▶ Weiter" : "⏸ Pause";
  btn.classList.toggle("paused", paused);
  overlay.style.display = paused ? "flex" : "none";
}

// ── GESCHWINDIGKEIT ──────────────────────────────────────────────────────────
function setSpeed(mult, btn) {
  speedMult = mult;
  document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 2000 / speedMult);
}

// ── SPIELENDE ────────────────────────────────────────────────────────────────
async function endGame(reason) {
  state.gameOver = true;
  clearInterval(tickTimer);

  const sc = getScore();
  const grades = [
    [90, "S", "Legendärer Krisenmanager! 🏅"],
    [75, "A", "Hervorragende Reaktion! 🌟"],
    [60, "B", "Solide Leistung 👍"],
    [45, "C", "Verbesserungspotenzial 😐"],
    [0,  "D", "Krise eskaliert 😔"],
  ];
  const [, grade, gradeLabel] = grades.find(([min]) => sc.total >= min);

  const titles = {
    erfolg:      "90 Tage überstanden! 🎉",
    niederlage:  "Pandemie außer Kontrolle 🦠",
    wirtschaft:  "Wirtschaftskollaps 📉",
  };
  const msgs = {
    erfolg:      "Du hast die gesamte 90-tägige Krisenphase überstanden. Deine Entscheidungen haben Millionen Leben beeinflusst.",
    niederlage:  "Das Virus hat sich zu weit verbreitet. Handele beim nächsten Mal früher und kombiniere mehrere Maßnahmen.",
    wirtschaft:  "Die Wirtschaft ist unter dem Druck der Maßnahmen kollabiert. Die richtige Balance ist entscheidend.",
  };

  el("end-title").textContent     = titles[reason];
  el("end-msg").textContent       = msgs[reason];
  el("final-score").textContent   = sc.total;
  el("score-grade").textContent   = `Note: ${grade} — ${gradeLabel}`;
  el("score-grade").style.color   = sc.total >= 75 ? "#66bb6a" : sc.total >= 50 ? "#ffa726" : "#ef5350";
  el("s-infected").textContent    = state.infected.toFixed(1)  + " %";
  el("s-happiness").textContent   = state.happiness.toFixed(1) + " %";
  el("s-economy").textContent     = state.economy.toFixed(1)   + " %";
  el("s-days").textContent        = (state.day - 1) + " / 90";
  el("s-difficulty").textContent  = DIFFICULTY[selectedDifficulty].label + (state.difficultyBonus ? ` (+${state.difficultyBonus} Bonus)` : "");
  el("s-i-pts").textContent       = `+${sc.i} Pkt.`;
  el("s-h-pts").textContent       = `+${sc.h} Pkt.`;
  el("s-e-pts").textContent       = `+${sc.e} Pkt.`;
  el("s-total").textContent       = `${sc.total} / 100`;

  showScreen("end-screen");

  try {
    await submitScore(state.name, sc.total, +state.infected.toFixed(1), +state.happiness.toFixed(1), +state.economy.toFixed(1), state.day - 1, DIFFICULTY[selectedDifficulty].label);
  } catch(e) { console.warn("Punktestand konnte nicht gespeichert werden:", e.message); }
}

// ── RANGLISTE ─────────────────────────────────────────────────────────────────
async function showLeaderboard() {
  showScreen("leaderboard-screen");
  const tbody = el("lb-tbody");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#7986a0">Wird geladen…</td></tr>`;
  try {
    const rows = await fetchLeaderboard();
    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#7986a0">Noch keine Einträge. Sei der Erste!</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r, i) => `
      <tr class="${r.name === state.name ? "highlight" : ""}">
        <td class="rank">#${i+1}</td>
        <td>${esc(r.name || "—")}${r.name === state.name ? " 👈" : ""}</td>
        <td class="score-col">${r.score}</td>
        <td>${r.infected ?? "—"} %</td>
        <td>${r.days ?? "—"}</td>
        <td style="color:#7986a0;font-size:0.78rem">${r.difficulty ?? "—"}</td>
      </tr>`).join("");
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#ef5350">
      Rangliste konnte nicht geladen werden.<br>
      <small style="color:#7986a0">Supabase-Tabelle prüfen!</small>
    </td></tr>`;
  }
}

// ── TICKER / TIPPS ────────────────────────────────────────────────────────────
function rotateTicker() {
  el("news-text").textContent = "📡 " + NEWS[newsIndex % NEWS.length];
  newsIndex++;
}
function rotateTipp() {
  const tippEl = el("tipp-text");
  if (tippEl) {
    tippEl.textContent = TIPPS[tippIndex % TIPPS.length];
    tippIndex++;
  }
}

// ── HILFSFUNKTIONEN ───────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function esc(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ── START ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  showScreen("start-screen");

  // Schwierigkeitsgrad-Buttons
  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedDifficulty = btn.dataset.diff;
    };
  });

  el("start-btn").onclick = () => {
    const name = el("player-name").value.trim() || "Anonym";
    state = initState(name);
    infHistory = [2];
    buildPolicyCards();
    renderGame();
    showScreen("game-screen");
    tickTimer = setInterval(tick, 2000);
    rotateTicker();
    rotateTipp();
    setInterval(rotateTicker, 5000);
    setInterval(rotateTipp, 15000);
    showToast("🚨 Krise beginnt!", "Ein neues Virus breitet sich aus. Treffe sofort Entscheidungen!", "red");
  };

  el("pause-btn").onclick    = togglePause;
  el("resume-overlay-btn").onclick = togglePause;

  el("view-lb-start").onclick  = () => goToLeaderboard("start-screen");
  el("view-lb-end").onclick    = () => goToLeaderboard("end-screen");
  el("play-again-btn").onclick = () => { clearInterval(tickTimer); showScreen("start-screen"); };
  el("back-lb-btn").onclick    = () => showScreen(previousScreen);

  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.onclick = () => setSpeed(+btn.dataset.speed, btn);
  });
});
