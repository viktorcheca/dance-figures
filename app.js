// --- Estado ---
let currentDance = null;
let positions = [];
let steps = [];
let scratch = []; // secuencia temporal (lista de pasos)
let currentPosition = null;
let expectedHalf = "up"; // alterna estrictamente: up -> down -> up ...

// --- Helpers DOM ---
const $ = (sel) => document.querySelector(sel);

const views = {
  home: $("#view-home"),
  dance: $("#view-dance"),
  steps: $("#view-steps"),
  config: $("#view-config"),
};

function show(viewName) {
  Object.values(views).forEach(v => v.classList.add("hidden"));
  views[viewName].classList.remove("hidden");
}

function setWarning(text) {
  const el = $("#dance-warning");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
}

function setMsg(text, { timeoutMs = 2000 } = {}) {
  const el = $("#config-msg");
  if (!el) return;
  el.textContent = text || "";
  if (!text) return;

  if (timeoutMs) {
    window.clearTimeout(setMsg._t);
    setMsg._t = window.setTimeout(() => {
      // no borres si ya cambió
      if (el.textContent === text) el.textContent = "";
    }, timeoutMs);
  }
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path} (${res.status})`);
  return await res.json();
}

function byName(a, b) {
  return (a.name || "").localeCompare((b.name || ""), "es");
}

function fillSelect(selectEl, items, { includeAll = false, allLabel = "Todas" } = {}) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  if (includeAll) {
    const opt = document.createElement("option");
    opt.value = "__all__";
    opt.textContent = allLabel;
    selectEl.appendChild(opt);
  }

  for (const it of items) {
    const opt = document.createElement("option");
    opt.value = it.id;
    opt.textContent = it.name ?? it.id;
    selectEl.appendChild(opt);
  }
}

function posName(id) {
  const p = positions.find(x => x.id === id);
  return p ? (p.name || p.id) : id;
}

// --- Timing helpers ---
function halfToBeat(half) {
  return (half === "down") ? 5 : 1; // up -> 1, down -> 5
}

function halfToRange(half) {
  return (half === "down") ? "5–8" : "1–4";
}

function updateTimeIndicator() {
  const el = $("#time-indicator");
  if (!el) return;

  const beat = halfToBeat(expectedHalf);
  el.textContent = `Tiempo actual: ${beat}`;
}

// --- Duración / estado visual ---
function calcDurationTimes() {
  // Cada step representa medio 8 (4 tiempos). Total tiempos = scratch.length * 4
  return scratch.length * 4;
}

function formatDanceName(danceKey) {
  // "salsa_la" -> "Salsa LA"
  if (!danceKey) return "";
  const pretty = danceKey
    .split("_")
    .map((w, i) => {
      if (danceKey === "salsa_la" && w === "la") return "LA";
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
  return pretty;
}

function updateDurationUI() {
  const el = $("#seq-duration");
  if (!el) return;
  const t = calcDurationTimes();
  el.textContent = `${t} tiempos`;
}

function updateScratchStatus() {
  const el = $("#scratch-status");
  if (!el) return;
  const n = scratch.length;
  if (!n) {
    el.textContent = "Vacío";
    return;
  }
  el.textContent = `${n} bloques · ${calcDurationTimes()} tiempos`;
}

// --- Render ---
function renderStepsList(listEl, filteredSteps, { showAdd = false } = {}) {
  if (!listEl) return;

  listEl.innerHTML = "";
  if (!filteredSteps.length) {
    const li = document.createElement("li");
    li.textContent = "No hay pasos compatibles.";
    listEl.appendChild(li);
    return;
  }

  for (const s of filteredSteps) {
    const li = document.createElement("li");

    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.textContent = s.name ?? s.id;

    const kv = document.createElement("div");
    kv.className = "kv";

    const b1 = document.createElement("span");
    b1.className = "badge";
    b1.textContent = `entrada: ${posName(s.entrada)}`;

    const b2 = document.createElement("span");
    b2.className = "badge";
    b2.textContent = `salida: ${posName(s.salida)}`;

    kv.appendChild(b1);
    kv.appendChild(b2);

    if (s.half) {
      const bHalf = document.createElement("span");
      bHalf.className = "badge";
      bHalf.textContent = `tiempos: ${halfToRange(s.half)}`;
      kv.appendChild(bHalf);
    }

    if (s.timing) {
      const b3 = document.createElement("span");
      b3.className = "badge";
      b3.textContent = `timing: ${s.timing}`;
      kv.appendChild(b3);
    }

    if (s.notas) {
      const notes = document.createElement("div");
      notes.className = "muted small";
      notes.style.marginTop = "6px";
      notes.textContent = s.notas;
      li.appendChild(title);
      li.appendChild(kv);
      li.appendChild(notes);
    } else {
      li.appendChild(title);
      li.appendChild(kv);
    }

    if (showAdd) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "8px";

      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Añadir al bloc";
      btn.addEventListener("click", () => addStepToScratch(s));

      row.appendChild(btn);
      li.appendChild(row);
    }

    listEl.appendChild(li);
  }
}

function renderScratch() {
  const el = $("#scratch-seq");
  if (!el) return;

  el.innerHTML = "";

  if (!scratch.length) {
    const li = document.createElement("li");
    li.textContent = "Vacío. Añade pasos para montar una secuencia.";
    el.appendChild(li);
    return;
  }

  for (const s of scratch) {
    const halfTxt = s.half ? ` [${halfToRange(s.half)}]` : "";
    const li = document.createElement("li");
    li.textContent = `${s.name ?? s.id}${halfTxt}  (${posName(s.entrada)} → ${posName(s.salida)})`;
    el.appendChild(li);
  }
}

// --- Persistencia del bloc actual (autosave) ---
function scratchKey() {
  return `dancefig:v1:${currentDance || "unknown"}:scratch`;
}

function saveScratch() {
  try {
    const payload = {
      v: 1,
      dance: currentDance,
      startPosition: $("#pos-start")?.value ?? null,
      currentPosition,
      expectedHalf,
      scratchIds: scratch.map(s => s.id),
      savedAt: Date.now(),
    };
    localStorage.setItem(scratchKey(), JSON.stringify(payload));
  } catch (e) {
    console.error("No se pudo guardar scratch:", e);
  }
}

function loadScratch() {
  try {
    const raw = localStorage.getItem(scratchKey());
    if (!raw) return false;

    const payload = JSON.parse(raw);
    if (!payload || payload.v !== 1) return false;

    const byId = new Map(steps.map(s => [s.id, s]));
    scratch = (payload.scratchIds || []).map(id => byId.get(id)).filter(Boolean);

    // restaurar selector de posición inicial
    const sel = $("#pos-start");
    if (sel && payload.startPosition) sel.value = payload.startPosition;

    // restaurar estado
    if (!scratch.length) {
      currentPosition = sel?.value ?? payload.currentPosition ?? null;
      expectedHalf = payload.expectedHalf ?? "up";
    } else {
      const last = scratch[scratch.length - 1];
      currentPosition = last.salida;
      const lastHalf = last.half || "up";
      expectedHalf = (lastHalf === "up") ? "down" : "up";
    }

    return true;
  } catch (e) {
    console.error("No se pudo cargar scratch:", e);
    return false;
  }
}

// --- Biblioteca de figuras ---
function figsKey() {
  return `dancefig:v1:${currentDance || "unknown"}:figs`;
}

function readFigures() {
  try {
    return JSON.parse(localStorage.getItem(figsKey()) || "[]");
  } catch {
    return [];
  }
}

function writeFigures(list) {
  localStorage.setItem(figsKey(), JSON.stringify(list));
}

function makeFigureNameAuto() {
  const dance = formatDanceName(currentDance);
  const t = calcDurationTimes();
  const d = new Date();
  const date = d.toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  // ej: "Salsa LA – 24 tiempos – 01/01 18:32"
  return `${dance} – ${t} tiempos – ${date}`;
}

function refreshFiguresUI() {
  const sel = $("#fig-list");
  if (!sel) return;

  const figs = readFigures().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  sel.innerHTML = "";

  if (!figs.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "— No hay figuras guardadas —";
    sel.appendChild(opt);
    sel.disabled = true;
    return;
  }

  sel.disabled = false;
  for (const f of figs) {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  }
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function saveCurrentAsFigure() {
  if (!scratch.length) {
    setMsg("El bloc está vacío. Añade pasos antes de guardar.", { timeoutMs: 2200 });
    return;
  }

  const figs = readFigures();
  const fig = {
    v: 1,
    id: uid(),
    name: makeFigureNameAuto(),
    createdAt: Date.now(),
    dance: currentDance,
    startPosition: $("#pos-start")?.value ?? null,
    steps: scratch.map(s => s.id),
  };

  figs.unshift(fig);
  writeFigures(figs);
  refreshFiguresUI();
  setMsg("Figura guardada ✅", { timeoutMs: 1800 });
}

function loadSelectedFigure() {
  const sel = $("#fig-list");
  const figId = sel?.value;
  if (!figId) {
    setMsg("No hay figura seleccionada.", { timeoutMs: 1600 });
    return;
  }

  const figs = readFigures();
  const f = figs.find(x => x.id === figId);
  if (!f) return;

  // reconstruir scratch desde steps por id
  const byId = new Map(steps.map(s => [s.id, s]));
  scratch = (f.steps || []).map(id => byId.get(id)).filter(Boolean);

  // restaurar posición inicial
  const posSel = $("#pos-start");
  if (posSel && f.startPosition) posSel.value = f.startPosition;

  // recalcular estado desde scratch
  if (!scratch.length) {
    currentPosition = posSel?.value ?? null;
    expectedHalf = "up";
  } else {
    const last = scratch[scratch.length - 1];
    currentPosition = last.salida;
    const lastHalf = last.half || "up";
    expectedHalf = (lastHalf === "up") ? "down" : "up";
  }

  renderScratch();
  renderPossibleSteps();
  updateTimeIndicator();
  updateDurationUI();
  updateScratchStatus();

  saveScratch(); // el bloc actual pasa a ser esta figura
  setMsg("Figura cargada ✅", { timeoutMs: 1600 });
}

function deleteSelectedFigure() {
  const sel = $("#fig-list");
  const figId = sel?.value;
  if (!figId) return;

  const figs = readFigures();
  const f = figs.find(x => x.id === figId);
  if (!f) return;

  const ok = confirm(`¿Borrar "${f.name}"?`);
  if (!ok) return;

  writeFigures(figs.filter(x => x.id !== figId));
  refreshFiguresUI();
  setMsg("Figura borrada.", { timeoutMs: 1600 });
}

// --- Compartir / Copiar ---
function buildShareText() {
  const dance = formatDanceName(currentDance);
  const t = calcDurationTimes();
  const start = $("#pos-start")?.value ?? "";
  const startTxt = start ? `Inicio: ${posName(start)}` : "";

  const lines = [];
  lines.push(`${dance} – ${t} tiempos`);
  if (startTxt) lines.push(startTxt);
  lines.push(""); // salto

  // Lista de pasos con tiempos por línea
  for (const s of scratch) {
    const range = halfToRange(s.half || "up");
    const name = s.name ?? s.id;
    const arrow = `${posName(s.entrada)} → ${posName(s.salida)}`;
    lines.push(`${range}  ${name}  (${arrow})`);
  }

  if (!scratch.length) {
    lines.push("(Bloc vacío)");
  }

  return lines.join("\n");
}

async function shareScratch() {
  const text = buildShareText();

  // Web Share API (móvil)
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Dance Figures",
        text,
      });
      setMsg("Compartido ✅", { timeoutMs: 1400 });
      return;
    } catch (e) {
      // si cancelan, no hace falta asustar
      console.debug("share cancel/fail:", e);
    }
  }

  // fallback
  await copyScratch();
}

async function copyScratch() {
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
    setMsg("Copiado al portapapeles ✅", { timeoutMs: 1600 });
  } catch (e) {
    console.error(e);
    setMsg("No se pudo copiar (tu navegador lo bloquea).", { timeoutMs: 2200 });
  }
}

// --- Core: añadir/undo/clear con autosave ---
function addStepToScratch(step) {
  scratch.push(step);
  currentPosition = step.salida; // encadenado

  // Alternancia estricta (si no hay half por algún step viejo, asumimos "up")
  const currentHalf = step.half || "up";
  expectedHalf = (currentHalf === "up") ? "down" : "up";

  renderScratch();
  renderPossibleSteps();
  updateTimeIndicator();
  updateDurationUI();
  updateScratchStatus();

  saveScratch();
}

function undoScratch() {
  scratch.pop();

  const startPos = $("#pos-start")?.value ?? null;

  if (scratch.length === 0) {
    currentPosition = startPos;
    expectedHalf = "up";
  } else {
    const last = scratch[scratch.length - 1];
    currentPosition = last.salida;

    const lastHalf = last.half || "up";
    expectedHalf = (lastHalf === "up") ? "down" : "up";
  }

  renderScratch();
  renderPossibleSteps();
  updateTimeIndicator();
  updateDurationUI();
  updateScratchStatus();

  saveScratch();
}

function clearScratch() {
  scratch = [];
  currentPosition = $("#pos-start")?.value ?? null;
  expectedHalf = "up";

  renderScratch();
  renderPossibleSteps();
  updateTimeIndicator();
  updateDurationUI();
  updateScratchStatus();

  saveScratch();
}

// --- Validación de datos ---
function validateData() {
  const posIds = new Set(positions.map(p => p.id));
  const bad = [];

  for (const s of steps) {
    const missingEntrada = !posIds.has(s.entrada);
    const missingSalida = !posIds.has(s.salida);

    if (missingEntrada || missingSalida) {
      bad.push({
        id: s.id,
        name: s.name ?? s.id,
        entrada: s.entrada,
        salida: s.salida,
        missingEntrada,
        missingSalida,
      });
    }
  }
  return bad;
}

// --- Vistas ---
async function enterDance(danceKey) {
  currentDance = danceKey;

  $("#dance-title").textContent = danceKey.replace("_", " ").toUpperCase();
  setWarning("");

  try {
    positions = await loadJSON(`data/${danceKey}/positions.json`);
    steps = await loadJSON(`data/${danceKey}/steps.json`);

    positions.sort(byName);
    steps.sort(byName);

    const bad = validateData();
    if (bad.length) {
      const lines = bad
        .slice(0, 10)
        .map(b => {
          const prob = [
            b.missingEntrada ? `entrada "${b.entrada}"` : null,
            b.missingSalida ? `salida "${b.salida}"` : null,
          ].filter(Boolean).join(" y ");
          return `• ${b.name} (${b.id}) → falta ${prob}`;
        })
        .join("\n");

      const more = bad.length > 10 ? `\n…y ${bad.length - 10} más.` : "";
      setWarning(`Ojo: ${bad.length} pasos tienen posiciones inexistentes:\n${lines}${more}`);
    }
  } catch (e) {
    console.error(e);
    positions = [];
    steps = [];
    setWarning("Aún no hay datos para este baile.");
  }

  show("dance");
}

function enterViewSteps() {
  const filter = $("#steps-filter");
  const items = [{ id: "__all__", name: "Todas" }, ...positions];
  fillSelect(filter, items, { includeAll: false });

  filter.value = "__all__";

  const render = () => {
    const val = filter.value;
    const filtered = (val === "__all__")
      ? steps
      : steps.filter(s => s.entrada === val);

    renderStepsList($("#steps-list"), filtered, { showAdd: false });
  };

  filter.onchange = render;
  render();
  show("steps");
}

function renderPossibleSteps() {
  if (!currentPosition) {
    renderStepsList($("#possible-steps"), [], { showAdd: true });
    return;
  }

  const possible = steps.filter(s =>
    s.entrada === currentPosition &&
    ((s.half || "up") === expectedHalf)
  );

  renderStepsList($("#possible-steps"), possible, { showAdd: true });
}

function enterViewConfig() {
  // select de posición inicial
  const sel = $("#pos-start");
  fillSelect(sel, positions);

  sel.onchange = () => {
    // cambiar posición inicial resetea el bloc
    scratch = [];
    currentPosition = sel.value;
    expectedHalf = "up";

    renderScratch();
    renderPossibleSteps();
    updateTimeIndicator();
    updateDurationUI();
    updateScratchStatus();

    saveScratch();
  };

  // default
  if (positions.length) {
    sel.value = positions[0].id;
    currentPosition = sel.value;
    expectedHalf = "up";
  } else {
    currentPosition = null;
    expectedHalf = "up";
  }

  // Intentar restaurar el bloc guardado
  loadScratch();

  // Render final
  renderScratch();
  renderPossibleSteps();
  updateTimeIndicator();
  updateDurationUI();
  updateScratchStatus();
  refreshFiguresUI();
  setMsg("");

  show("config");
}

// --- Wire up ---
function init() {
  // Home buttons
  document.querySelectorAll("[data-dance]").forEach(btn => {
    btn.addEventListener("click", () => enterDance(btn.dataset.dance));
  });

  // Back buttons
  $("#btn-back-home").addEventListener("click", () => show("home"));
  $("#btn-back-dance-1").addEventListener("click", () => show("dance"));
  $("#btn-back-dance-2").addEventListener("click", () => show("dance"));

  // Menu inside dance
  $("#btn-view-steps").addEventListener("click", () => enterViewSteps());
  $("#btn-config").addEventListener("click", () => enterViewConfig());

  // Scratch buttons
  $("#btn-undo")?.addEventListener("click", () => undoScratch());
  $("#btn-clear")?.addEventListener("click", () => clearScratch());

  // Figuras
  $("#btn-save-fig")?.addEventListener("click", () => saveCurrentAsFigure());
  $("#btn-load-fig")?.addEventListener("click", () => loadSelectedFigure());
  $("#btn-delete-fig")?.addEventListener("click", () => deleteSelectedFigure());

  // Share / Copy
  $("#btn-share")?.addEventListener("click", () => shareScratch());
  $("#btn-copy")?.addEventListener("click", () => copyScratch());

  show("home");
}

init();

