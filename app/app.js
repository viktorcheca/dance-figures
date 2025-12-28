// --- Estado ---
let currentDance = null;
let positions = [];
let steps = [];
let scratch = []; // secuencia temporal (lista de pasos)
let currentPosition = null;

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
  if (!text) {
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.remove("hidden");
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

function renderStepsList(listEl, filteredSteps, { showAdd = false } = {}) {
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
  el.innerHTML = "";

  if (!scratch.length) {
    const li = document.createElement("li");
    li.textContent = "Vacío. Añade pasos para montar una secuencia.";
    el.appendChild(li);
    return;
  }

  for (const s of scratch) {
    const li = document.createElement("li");
    li.textContent = `${s.name ?? s.id}  (${posName(s.entrada)} → ${posName(s.salida)})`;
    el.appendChild(li);
  }
}

function addStepToScratch(step) {
  scratch.push(step);
  currentPosition = step.salida; // encadenado
  renderScratch();
  renderPossibleSteps(); // recalcula siguientes
}

function undoScratch() {
  scratch.pop();
  // recalcular posición actual
  if (scratch.length === 0) {
    currentPosition = $("#pos-start").value;
  } else {
    currentPosition = scratch[scratch.length - 1].salida;
  }
  renderScratch();
  renderPossibleSteps();
}

function clearScratch() {
  scratch = [];
  currentPosition = $("#pos-start").value;
  renderScratch();
  renderPossibleSteps();
}

function validateData() {
  // avisa si hay steps con entradas/salidas que no existen
  const posIds = new Set(positions.map(p => p.id));
  const bad = steps.filter(s => !posIds.has(s.entrada) || !posIds.has(s.salida));
  return bad;
}

// --- Vistas ---
async function enterDance(danceKey) {
  currentDance = danceKey;

  $("#dance-title").textContent = danceKey.replace("_", " ").toUpperCase();
  setWarning("");

  // Cargamos datos solo si existen (de momento bachata)
  try {
    positions = await loadJSON(`/data/${danceKey}/positions.json`);
    steps = await loadJSON(`/data/${danceKey}/steps.json`);

    positions.sort(byName);
    steps.sort(byName);

    const bad = validateData();
    if (bad.length) {
      setWarning(`Ojo: hay ${bad.length} pasos con entrada/salida que no existen en positions.json.`);
    }
  } catch (e) {
    positions = [];
    steps = [];
    setWarning("Aún no hay datos para este baile.");
  }

  show("dance");
}

function enterViewSteps() {
  // Select de filtro
  const filter = $("#steps-filter");
  const items = [{ id: "__all__", name: "Todas" }, ...positions];
  fillSelect(filter, items, { includeAll: false });

  // por defecto “todas”
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
  const possible = steps.filter(s => s.entrada === currentPosition);
  renderStepsList($("#possible-steps"), possible, { showAdd: true });
}

function enterViewConfig() {
  // Reset bloc
  scratch = [];
  renderScratch();

  // select de posición inicial
  const sel = $("#pos-start");
  fillSelect(sel, positions);
  sel.onchange = () => {
    scratch = [];
    currentPosition = sel.value;
    renderScratch();
    renderPossibleSteps();
  };

  // default
  if (positions.length) {
    sel.value = positions[0].id;
    currentPosition = sel.value;
  } else {
    currentPosition = null;
  }

  renderPossibleSteps();
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
  $("#btn-undo").addEventListener("click", () => undoScratch());
  $("#btn-clear").addEventListener("click", () => clearScratch());

  show("home");
}

init();
