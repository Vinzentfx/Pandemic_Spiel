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

// Bester Score pro Spieler wird behalten (Deduplizierung im JS)
async function submitScore(name, score, infected, happiness, economy, days, difficulty) {
  // Vorhandenen Score des Spielers prüfen
  try {
    const existing = await sbFetch(`/pandemic_scores?name=eq.${encodeURIComponent(name)}&order=score.desc&limit=1`);
    if (existing && existing.length > 0) {
      if (score > existing[0].score) {
        // Besseren Score updaten
        await sbFetch(`/pandemic_scores?name=eq.${encodeURIComponent(name)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ score, infected, happiness, economy, days, difficulty }),
        });
      }
      return; // Schlechterer Score wird ignoriert
    }
  } catch (_) {}
  // Erster Eintrag
  await sbFetch("/pandemic_scores", {
    method: "POST",
    body: JSON.stringify({ name, score, infected, happiness, economy, days, difficulty }),
  });
}

async function fetchLeaderboard() {
  const rows = await sbFetch("/pandemic_scores?order=score.desc&limit=200");
  // Deduplizierung: bester Score pro Name
  const seen = new Map();
  for (const r of rows) {
    if (!seen.has(r.name) || r.score > seen.get(r.name).score) seen.set(r.name, r);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 20);
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

// ── NACHBARLÄNDER (beeinflussen Deutschland aktiv!) ───────────────────────────
// cx/cy = Position auf der Karte (SVG 500×380)
// angle = Winkel zur Karte-Mitte (für Pfeile)
const NEIGHBORS = [
  { id:"DK", name:"Dänemark",      flag:"🇩🇰", cx:248, cy:52,  baseInf:8,  spreadFactor:0.008 },
  { id:"NL", name:"Niederl./Belg.",flag:"🇳🇱", cx:90,  cy:118, baseInf:12, spreadFactor:0.010 },
  { id:"FR", name:"Frankreich",    flag:"🇫🇷", cx:82,  cy:245, baseInf:15, spreadFactor:0.012 },
  { id:"CH", name:"Schweiz/Öst.",  flag:"🇨🇭", cx:195, cy:338, baseInf:6,  spreadFactor:0.007 },
  { id:"CZ", name:"Tschechien",    flag:"🇨🇿", cx:358, cy:288, baseInf:10, spreadFactor:0.009 },
  { id:"PL", name:"Polen",         flag:"🇵🇱", cx:400, cy:115, baseInf:13, spreadFactor:0.011 },
];
// Deutschland-Karte-Zentrum
const DE_CX = 240, DE_CY = 195;

// Vereinfachtes Deutschland-Polygon (Mitte der SVG)
const DE_PATH = "M 215 88 L 255 75 L 298 90 L 315 125 L 310 168 L 292 198 L 278 232 L 248 242 L 215 228 L 192 198 L 182 158 L 192 120 Z";

// ── MASSNAHMEN ────────────────────────────────────────────────────────────────
const POLICIES = [
  { id:"border_control", name:"🛂 Grenzkontrollen",      desc:"Internationalen Reiseverkehr einschränken. Nachbarländer können Deutschland weniger infizieren.",
    effects:{ infectionRate:-0.08, economy:-0.08 },
    pillLabels:[{text:"−Nachbardruck",cls:"good"},{text:"−8% Wirtschaft",cls:"bad"}] },
  { id:"mask_mandate",   name:"😷 Maskenpflicht",         desc:"Masken in öffentlichen Räumen und Verkehrsmitteln vorschreiben.",
    effects:{ infectionRate:-0.10, happiness:-0.03 },
    pillLabels:[{text:"−10% Ausbreitung",cls:"good"},{text:"−3% Zufriedenheit",cls:"bad"}] },
  { id:"lockdown",       name:"🔒 Lockdown",              desc:"Ausgangsbeschränkungen für alle. Sehr wirksam, aber kostspielig.",
    effects:{ infectionRate:-0.35, economy:-0.20, happiness:-0.12 },
    pillLabels:[{text:"−35% Ausbreitung",cls:"good"},{text:"−20% Wirtschaft",cls:"bad"},{text:"−12% Zufriedenheit",cls:"bad"}] },
  { id:"vaccine",        name:"💉 Impfprogramm",          desc:"Impfstoffentwicklung finanzieren. Langsam, aber dauerhaft wirksam.",
    effects:{ infectionRate:-0.05, economy:-0.05, vaccineProgress:true },
    pillLabels:[{text:"−5% Ausbreitung",cls:"good"},{text:"+Impffortschritt",cls:"neutral"},{text:"−5% Wirtschaft",cls:"bad"}] },
  { id:"testing",        name:"🧪 Massentests",           desc:"Infizierte aufspüren und isolieren, bevor sie andere anstecken.",
    effects:{ infectionRate:-0.12, economy:-0.04 },
    pillLabels:[{text:"−12% Ausbreitung",cls:"good"},{text:"−4% Wirtschaft",cls:"bad"}] },
  { id:"stimulus",       name:"💶 Konjunkturpaket",       desc:"Staatliche Hilfen für Unternehmen und Bürger.",
    effects:{ economy:0.10, happiness:0.05 },
    pillLabels:[{text:"+10% Wirtschaft",cls:"good"},{text:"+5% Zufriedenheit",cls:"good"}] },
  { id:"public_info",    name:"📢 Informationskampagne",  desc:"Bevölkerung aufklären. Günstig und effektiv.",
    effects:{ infectionRate:-0.06, happiness:0.04 },
    pillLabels:[{text:"−6% Ausbreitung",cls:"good"},{text:"+4% Zufriedenheit",cls:"good"}] },
  { id:"curfew",         name:"🌙 Ausgangssperre",        desc:"Bewegungsfreiheit ab 21 Uhr einschränken.",
    effects:{ infectionRate:-0.08, happiness:-0.05 },
    pillLabels:[{text:"−8% Ausbreitung",cls:"good"},{text:"−5% Zufriedenheit",cls:"bad"}] },
  { id:"school_close",   name:"🏫 Schulschließungen",     desc:"Schulen und Kitas schließen. Reduziert Kontakte bei Kindern stark.",
    effects:{ infectionRate:-0.10, happiness:-0.07, economy:-0.05 },
    pillLabels:[{text:"−10% Ausbreitung",cls:"good"},{text:"−7% Zufriedenheit",cls:"bad"},{text:"−5% Wirtschaft",cls:"bad"}] },
  { id:"contact_tracing",name:"📱 Kontaktverfolgung",     desc:"App zur Nachverfolgung von Infektionsketten.",
    effects:{ infectionRate:-0.09, economy:-0.02 },
    pillLabels:[{text:"−9% Ausbreitung",cls:"good"},{text:"−2% Wirtschaft",cls:"bad"}] },
];

// ── EREIGNISSE ────────────────────────────────────────────────────────────────
const EVENTS = [
  { day:8,  title:"🦠 Neue Variante entdeckt",    desc:"Eine ansteckendere Variante breitet sich in Nachbarländern aus — Infektionsdruck steigt.",
    type:"red",   effect(s){ s.neighbors.forEach(n=>{ n.inf=Math.min(80,n.inf+15); }); } },
  { day:18, title:"📰 Medienpanik",               desc:"Reißerische Schlagzeilen lassen das Vertrauen einbrechen.",
    type:"red",   effect(s){ s.happiness=Math.max(0,s.happiness-8); } },
  { day:30, title:"🏥 Krankenhäuser überlastet",  desc:"Notaufnahmen sind voll. Sterblichkeit steigt.",
    type:"red",   condition:s=>s.infected>35, effect(s){ s.baseSpread+=0.03; } },
  { day:35, title:"🤝 EU-Hilfspaket",             desc:"Europäische Partner schicken Nothilfe für die Wirtschaft.",
    type:"green", effect(s){ s.economy=Math.min(100,s.economy+12); } },
  { day:42, title:"😤 Protestwelle",              desc:"Bürger protestieren gegen Maßnahmen. Befolgungsrate sinkt.",
    type:"red",   condition:s=>s.activePolicies.has("lockdown"),
    effect(s){ s.happiness=Math.max(0,s.happiness-14); s.baseSpread+=0.02; } },
  { day:50, title:"🔬 Behandlungsdurchbruch",     desc:"Ein neues Medikament wird zugelassen. Ausbreitung verlangsamt sich.",
    type:"green", effect(s){ s.baseSpread=Math.max(0.01,s.baseSpread-0.05); } },
  { day:60, title:"✈️ Zweite Welle aus dem Ausland", desc:"Neue Variante kommt über Nachbarländer — Frankreich und Polen besonders betroffen.",
    type:"red",   condition:s=>!s.activePolicies.has("border_control"),
    effect(s){ s.neighbors.find(n=>n.id==="FR").inf=Math.min(90,s.neighbors.find(n=>n.id==="FR").inf+25);
               s.neighbors.find(n=>n.id==="PL").inf=Math.min(90,s.neighbors.find(n=>n.id==="PL").inf+20); } },
  { day:68, title:"📉 Rezessionswarnung",         desc:"Ökonomen warnen vor langfristigem Schaden.",
    type:"red",   condition:s=>s.economy<40, effect(s){ s.economy=Math.max(0,s.economy-8); } },
  { day:75, title:"🌍 Internationale Solidarität",desc:"Weltweite Unterstützung hebt die Stimmung.",
    type:"green", effect(s){ s.happiness=Math.min(100,s.happiness+8); } },
  { day:82, title:"🧫 Mutiertes Virus",           desc:"Das Virus mutiert — Impfschutz wird teilweise umgangen.",
    type:"red",   condition:s=>s.vaccineProgress>50,
    effect(s){ s.vaccineProgress=Math.max(0,s.vaccineProgress-20); s.baseSpread+=0.02; } },
];

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
  "Pflegepersonal am Limit — Streiks drohen…",
  "Homeoffice wird für tausende Unternehmen dauerhaft…",
  "Lieferketten durch Grenzkontrollen unter Druck…",
  "Polen meldet starken Anstieg der Neuinfektionen…",
  "Frankreich erwägt erneuten Lockdown…",
  "Experten fordern einheitliche europäische Pandemiestrategie…",
];
const TIPPS = [
  "💡 Tipp: Grenzkontrollen früh aktivieren — Nachbarländer infizieren Deutschland direkt!",
  "💡 Tipp: Kombination aus Massentests + Maskenpflicht ist sehr kosteneffizient.",
  "💡 Tipp: Das Konjunkturpaket hilft, wenn die Wirtschaft unter 50 % fällt.",
  "💡 Tipp: Das Impfprogramm braucht Zeit — starte es so früh wie möglich.",
  "💡 Tipp: Lockdown nur als letztes Mittel — er kostet Wirtschaft und Zufriedenheit stark.",
  "💡 Tipp: Schau auf die Nachbarländer — steigen deren Infektionen, droht Gefahr.",
  "💡 Tipp: Informationskampagne ist die billigste Maßnahme mit gutem Effekt.",
];

// ── SPIELZUSTAND ──────────────────────────────────────────────────────────────
let state = {};
let tickTimer   = null;
let speedMult   = 1;
let paused      = false;
let newsIndex   = 0;
let tippIndex   = 0;
let lastInf     = 0, lastHap = 0, lastEco = 0;
let infHistory  = [];

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
    // Nachbarländer mit eigenem Infektionsstand
    neighbors: NEIGHBORS.map(n => ({ ...n, inf: n.baseInf })),
  };
}

// ── SPIELTAKT ─────────────────────────────────────────────────────────────────
function tick() {
  if (state.gameOver || paused) return;

  lastInf = state.infected;
  lastHap = state.happiness;
  lastEco = state.economy;

  // Nachbarländer entwickeln sich
  for (const n of state.neighbors) {
    const drift = (Math.random() - 0.35) * 2.5;
    n.inf = clamp(n.inf + drift, n.baseInf * 0.5, 85);
  }

  // Infektionsdruck durch Nachbarländer auf Deutschland
  let neighborPressure = 0;
  for (const n of state.neighbors) {
    neighborPressure += (n.inf / 100) * n.spreadFactor;
  }
  const borderActive = state.activePolicies.has("border_control");
  if (borderActive) neighborPressure *= 0.15; // Grenzkontrollen reduzieren Druck um 85%

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
  if (!state.activePolicies.has("lockdown") && !borderActive) ecoMod += 0.018;
  if (state.infected < 20) hapMod += 0.015;
  if (state.infected > 50) hapMod -= 0.03;

  const netSpread = Math.max(0.002, state.baseSpread + spreadMod);
  state.infected  = clamp(state.infected  + (netSpread * 100 * 0.14) + (neighborPressure * 100), 0, 100);
  state.economy   = clamp(state.economy   + ecoMod * 100 * 0.28, 0, 100);
  state.happiness = clamp(state.happiness + hapMod * 100 * 0.28, 0, 100);

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
  if (state.infected >= 80) { endGame("niederlage");  return; }
  if (state.economy   <= 0) { endGame("wirtschaft");  return; }
  if (state.day > 90)       { endGame("erfolg");      return; }

  renderGame();
}

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

// ── TOASTS ────────────────────────────────────────────────────────────────────
function showToast(title, desc, type = "yellow") {
  const box = el("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type === "red" ? "red-toast" : type === "green" ? "green-toast" : ""}`;
  t.innerHTML = `<div class="toast-title">${title}</div><div class="toast-desc">${desc}</div>`;
  box.appendChild(t);
  setTimeout(() => { t.style.animation = "toast-out .3s ease forwards"; setTimeout(() => t.remove(), 300); }, 5000);
}

// ── STATUS & SCORE ────────────────────────────────────────────────────────────
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
  return d > 0 ? '<span style="color:#ef5350">↑ steigt</span>' : '<span style="color:#66bb6a">↓ sinkt</span>';
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
  el("day-counter").textContent    = `Tag ${state.day} / 90`;
  el("day-progress-fill").style.width = ((state.day / 90) * 100) + "%";

  const st = getStatus();
  const badge = el("status-badge");
  badge.className = `status-badge ${st.cls}`;
  badge.innerHTML = `${st.icon} ${st.text}`;
  el("score-preview-val").textContent = getScore().total;

  const vEl = el("vaccine-label");
  if (state.activePolicies.has("vaccine")) {
    vEl.style.display = "block";
    vEl.textContent = state.vaccineProgress >= 100 ? "💉 Vollständig geimpft!" : `💉 Impffortschritt: ${state.vaccineProgress.toFixed(0)} %`;
  } else { vEl.style.display = "none"; }

  renderMap();
  renderChart();

  document.querySelectorAll(".policy-card").forEach(c => c.classList.toggle("active", state.activePolicies.has(c.dataset.id)));

  const tags = el("active-policies");
  tags.innerHTML = "";
  if (state.activePolicies.size === 0) {
    tags.innerHTML = `<span style="color:#7986a0;font-size:0.78rem">Keine aktiven Maßnahmen — unten antippen</span>`;
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

// ── KARTE: Deutschland + Nachbarn ─────────────────────────────────────────────
function renderMap() {
  const svg = el("world-map");
  svg.innerHTML = "";

  // Hintergrund
  svg.appendChild(mkSVG("rect", { width:500, height:380, fill:"#06101e" }));
  // Subtiles Gitter
  for (let x=0;x<=500;x+=60) svg.appendChild(mkSVG("line",{x1:x,y1:0,x2:x,y2:380,stroke:"#0b1a2e","stroke-width":1}));
  for (let y=0;y<=380;y+=60) svg.appendChild(mkSVG("line",{x1:0,y1:y,x2:500,y2:y,stroke:"#0b1a2e","stroke-width":1}));

  const borderActive = state.activePolicies.has("border_control");

  // Verbindungslinien: Nachbar → Deutschland
  for (const n of state.neighbors) {
    const frac = n.inf / 100;
    // Pfeilfarbe: rot = hohes Risiko, blau = niedrig, grau = Grenzkontrollen aktiv
    const arrowColor = borderActive
      ? "#1e3a5f"
      : frac > 0.4 ? `rgba(239,83,80,${0.3+frac*0.5})` : `rgba(79,195,247,${0.2+frac*0.3})`;

    // Linie
    const dx = DE_CX - n.cx, dy = DE_CY - n.cy;
    const dist = Math.sqrt(dx*dx+dy*dy);
    const endX = n.cx + dx * 0.65, endY = n.cy + dy * 0.65;

    svg.appendChild(mkSVG("line", {
      x1: n.cx, y1: n.cy, x2: endX, y2: endY,
      stroke: arrowColor, "stroke-width": borderActive ? 1 : 1.5 + frac*2,
      "stroke-dasharray": borderActive ? "6 4" : "none",
    }));

    // Pfeilspitze
    if (!borderActive) {
      const angle = Math.atan2(dy, dx);
      const ax = endX - 8*Math.cos(angle-0.35), ay = endY - 8*Math.sin(angle-0.35);
      const bx = endX - 8*Math.cos(angle+0.35), by = endY - 8*Math.sin(angle+0.35);
      svg.appendChild(mkSVG("polygon", {
        points: `${endX},${endY} ${ax},${ay} ${bx},${by}`,
        fill: arrowColor,
      }));
    }
  }

  // Deutschland Hinterglühen
  const deInf = state.infected / 100;
  const pulseR = 68 + Math.sin(state.day * 0.4) * 5;
  svg.appendChild(mkSVG("circle", { cx:DE_CX, cy:DE_CY, r:pulseR, fill:`rgba(239,83,80,${deInf*0.12})`, stroke:`rgba(239,83,80,${deInf*0.5})`, "stroke-width":1.5 }));

  // Deutschland Polygon
  svg.appendChild(mkSVG("path", {
    d: DE_PATH,
    fill: infCol(deInf, 1),
    stroke: "#4fc3f7", "stroke-width": 2.5,
  }));

  // Deutschland Label
  const deLabel = mkSVG("text", { x:DE_CX, y:DE_CY-8, "text-anchor":"middle", fill:"#4fc3f7", "font-size":13, "font-weight":"bold", "font-family":"Segoe UI,sans-serif" });
  deLabel.textContent = "🇩🇪 Deutschland";
  svg.appendChild(deLabel);
  const dePct = mkSVG("text", { x:DE_CX, y:DE_CY+10, "text-anchor":"middle", fill:"#fff", "font-size":11, "font-weight":"bold", "font-family":"Segoe UI,sans-serif" });
  dePct.textContent = state.infected.toFixed(1) + " % infiziert";
  svg.appendChild(dePct);

  // Nachbarländer-Kreise
  for (const n of state.neighbors) {
    const frac = n.inf / 100;
    const r = 30;

    // Glow
    svg.appendChild(mkSVG("circle", { cx:n.cx, cy:n.cy, r:r+10, fill:`rgba(239,83,80,${frac*0.25})` }));
    // Kreis
    svg.appendChild(mkSVG("circle", { cx:n.cx, cy:n.cy, r, fill:infCol(frac, 0.85), stroke: borderActive?"#1565c0":"#2a3a5a", "stroke-width":borderActive?2:1 }));

    // Name
    const nLabel = mkSVG("text", { x:n.cx, y:n.cy-13, "text-anchor":"middle", fill:"#e0e6f0", "font-size":9, "font-weight":"bold", "font-family":"Segoe UI,sans-serif" });
    nLabel.textContent = n.flag + " " + n.name;
    svg.appendChild(nLabel);

    // Infektions-Prozent
    const nPct = mkSVG("text", { x:n.cx, y:n.cy+5, "text-anchor":"middle", fill:"#fff", "font-size":11, "font-weight":"bold", "font-family":"Segoe UI,sans-serif" });
    nPct.textContent = n.inf.toFixed(0) + " %";
    svg.appendChild(nPct);

    // Grenzkontrollen-Badge
    if (borderActive) {
      svg.appendChild(mkSVG("circle", { cx:n.cx+22, cy:n.cy-22, r:10, fill:"#1565c0", stroke:"#4fc3f7", "stroke-width":1 }));
      const shield = mkSVG("text", { x:n.cx+22, y:n.cy-18, "text-anchor":"middle", fill:"#fff", "font-size":11 });
      shield.textContent = "🛂";
      svg.appendChild(shield);
    }
  }

  // Legende
  const legendItems = borderActive
    ? [["#1565c0","Grenzen gesperrt — Infektionsdruck ↓85 %"]]
    : [["#ef5350","Hohes Risiko — Grenzkontrollen empfohlen!"],["#4fc3f7","Niedriges Risiko"]];
  legendItems.forEach(([col, txt], i) => {
    svg.appendChild(mkSVG("circle", { cx:12, cy:360+i*16, r:5, fill:col }));
    const lt = mkSVG("text", { x:22, y:365+i*16, fill:"#7986a0", "font-size":8.5, "font-family":"Segoe UI,sans-serif" });
    lt.textContent = txt;
    svg.appendChild(lt);
  });
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
  const W=300, H=60, max=80;
  const pts = infHistory.slice(-30);
  const step = W / (pts.length - 1);

  let area = `M 0 ${H} `;
  pts.forEach((v,i) => { area += `L ${i*step} ${H-(v/max)*H} `; });
  area += `L ${(pts.length-1)*step} ${H} Z`;
  svg.appendChild(mkSVG("path", { d:area, fill:"rgba(239,83,80,0.15)" }));

  let line = pts.map((v,i) => `${i===0?"M":"L"} ${i*step} ${H-(v/max)*H}`).join(" ");
  svg.appendChild(mkSVG("path", { d:line, fill:"none", stroke:"#ef5350", "stroke-width":2 }));

  const dangerY = H-(80/max)*H;
  svg.appendChild(mkSVG("line", { x1:0, y1:dangerY, x2:W, y2:dangerY, stroke:"#b71c1c", "stroke-width":1, "stroke-dasharray":"4 3" }));

  const last=pts[pts.length-1];
  svg.appendChild(mkSVG("circle", { cx:(pts.length-1)*step, cy:H-(last/max)*H, r:3, fill:"#ef5350" }));
}

// ── MASSNAHMEN CARDS ──────────────────────────────────────────────────────────
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
    card.className = "policy-card"; card.dataset.id = p.id;
    card.innerHTML = `<div class="p-name">${p.name}</div><div class="p-desc">${p.desc}</div>
      <div class="policy-effects">${p.pillLabels.map(pl=>`<span class="effect-pill ${pl.cls}">${pl.text}</span>`).join("")}</div>`;
    card.onclick = () => togglePolicy(p.id);
    container.appendChild(card);
  }
}

// ── PAUSE ─────────────────────────────────────────────────────────────────────
function togglePause() {
  paused = !paused;
  el("pause-btn").textContent = paused ? "▶ Weiter" : "⏸ Pause";
  el("pause-btn").classList.toggle("paused", paused);
  el("pause-overlay").style.display = paused ? "flex" : "none";
}

// ── GESCHWINDIGKEIT ───────────────────────────────────────────────────────────
function setSpeed(mult, btn) {
  speedMult = mult;
  document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  clearInterval(tickTimer);
  tickTimer = setInterval(tick, 2000 / speedMult);
}

// ── SPIELENDE ─────────────────────────────────────────────────────────────────
async function endGame(reason) {
  state.gameOver = true;
  clearInterval(tickTimer);
  const sc = getScore();
  const grades = [[90,"S","Legendärer Krisenmanager! 🏅"],[75,"A","Hervorragende Reaktion! 🌟"],[60,"B","Solide Leistung 👍"],[45,"C","Verbesserungspotenzial 😐"],[0,"D","Krise eskaliert 😔"]];
  const [,grade,gradeLabel] = grades.find(([min])=>sc.total>=min);
  const titles = { erfolg:"90 Tage überstanden! 🎉", niederlage:"Pandemie außer Kontrolle 🦠", wirtschaft:"Wirtschaftskollaps 📉" };
  const msgs   = { erfolg:"Du hast die gesamte 90-tägige Krisenphase überstanden. Deine Entscheidungen haben Millionen Leben beeinflusst.",
    niederlage:"Das Virus hat sich zu weit verbreitet. Handle beim nächsten Mal früher und achte auf den Druck aus Nachbarländern.",
    wirtschaft:"Die Wirtschaft ist kollabiert. Kombiniere wirtschaftsschonende Maßnahmen mit dem Konjunkturpaket." };
  el("end-title").textContent   = titles[reason];
  el("end-msg").textContent     = msgs[reason];
  el("final-score").textContent = sc.total;
  el("score-grade").textContent = `Note: ${grade} — ${gradeLabel}`;
  el("score-grade").style.color = sc.total>=75?"#66bb6a":sc.total>=50?"#ffa726":"#ef5350";
  el("s-infected").textContent  = state.infected.toFixed(1)+" %";
  el("s-happiness").textContent = state.happiness.toFixed(1)+" %";
  el("s-economy").textContent   = state.economy.toFixed(1)+" %";
  el("s-days").textContent      = (state.day-1)+" / 90";
  el("s-difficulty").textContent= DIFFICULTY[selectedDifficulty].label+(state.difficultyBonus?` (+${state.difficultyBonus} Bonus)`:"");
  el("s-i-pts").textContent     = `+${sc.i} Pkt.`;
  el("s-h-pts").textContent     = `+${sc.h} Pkt.`;
  el("s-e-pts").textContent     = `+${sc.e} Pkt.`;
  el("s-total").textContent     = `${sc.total} / 100`;
  showScreen("end-screen");
  try { await submitScore(state.name,sc.total,+state.infected.toFixed(1),+state.happiness.toFixed(1),+state.economy.toFixed(1),state.day-1,DIFFICULTY[selectedDifficulty].label); }
  catch(e){ console.warn("Punktestand konnte nicht gespeichert werden:",e.message); }
}

// ── RANGLISTE ─────────────────────────────────────────────────────────────────
async function showLeaderboard() {
  showScreen("leaderboard-screen");
  const tbody = el("lb-tbody");
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#7986a0">Wird geladen…</td></tr>`;
  try {
    const rows = await fetchLeaderboard();
    if (!rows||rows.length===0) {
      tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:24px;color:#7986a0">Noch keine Einträge. Sei der Erste!</td></tr>`; return;
    }
    tbody.innerHTML = rows.map((r,i)=>`<tr class="${r.name===state.name?"highlight":""}">
      <td class="rank">#${i+1}</td><td>${esc(r.name||"—")}${r.name===state.name?" 👈":""}</td>
      <td class="score-col">${r.score}</td><td>${r.infected??"—"} %</td>
      <td>${r.days??"—"}</td><td style="color:#7986a0;font-size:0.78rem">${r.difficulty??"—"}</td></tr>`).join("");
  } catch(e) {
    tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;padding:24px;color:#ef5350">Rangliste konnte nicht geladen werden.<br><small style="color:#7986a0">Supabase-Tabelle prüfen!</small></td></tr>`;
  }
}

// ── TICKER / TIPPS ────────────────────────────────────────────────────────────
function rotateTicker() { el("news-text").textContent="📡 "+NEWS[newsIndex++%NEWS.length]; }
function rotateTipp()   { const t=el("tipp-text"); if(t) t.textContent=TIPPS[tippIndex++%TIPPS.length]; }

// ── HILFSFUNKTIONEN ───────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function esc(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

// ── START ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  showScreen("start-screen");

  document.querySelectorAll(".diff-btn").forEach(btn => {
    btn.onclick = () => { document.querySelectorAll(".diff-btn").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); selectedDifficulty=btn.dataset.diff; };
  });

  el("start-btn").onclick = () => {
    const name = el("player-name").value.trim() || "Anonym";
    state = initState(name);
    infHistory = [2];
    buildPolicyCards();
    renderGame();
    showScreen("game-screen");
    paused = false;
    el("pause-btn").textContent="⏸ Pause";
    el("pause-btn").classList.remove("paused");
    el("pause-overlay").style.display="none";
    tickTimer = setInterval(tick, 2000);
    rotateTicker(); rotateTipp();
    setInterval(rotateTicker, 5000);
    setInterval(rotateTipp, 15000);
    showToast("🚨 Krise beginnt!", "Nachbarländer sind bereits infiziert — handle sofort!", "red");
  };

  el("pause-btn").onclick        = togglePause;
  el("resume-overlay-btn").onclick = togglePause;
  el("view-lb-start").onclick    = () => goToLeaderboard("start-screen");
  el("view-lb-end").onclick      = () => goToLeaderboard("end-screen");
  el("play-again-btn").onclick   = () => { clearInterval(tickTimer); showScreen("start-screen"); };
  el("lb-play-again-btn").onclick= () => { clearInterval(tickTimer); showScreen("start-screen"); };
  el("back-lb-btn").onclick      = () => showScreen(previousScreen);

  document.querySelectorAll(".speed-btn").forEach(btn=>{
    btn.onclick=()=>setSpeed(+btn.dataset.speed,btn);
  });
});
