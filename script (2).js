// ====== CONFIGURATION : à adapter si besoin ======
const SHEET_ID = "1lSoW6jskjQGtsUzOmYM2_8ZtghnH31IKdogmWF_nJ-g";
const SHEET_GID = "0";
// ===================================================

const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&headers=1`;

let rows = [];       // données chargées depuis le Sheet
let colIndex = {};   // correspondance nom de champ -> index de colonne
let dataLoaded = false;
let dataLoadFailed = false;

const els = {
  input: document.getElementById("order-input"),
  button: document.getElementById("search-btn"),
  message: document.getElementById("message"),
  notFoundCard: document.getElementById("not-found-card"),
  resultCard: document.getElementById("result-card"),
  title: document.getElementById("r-title"),
  client: document.getElementById("r-client"),
  phone: document.getElementById("r-phone"),
  colis: document.getElementById("r-colis"),
  date: document.getElementById("r-date"),
  statusBadge: document.getElementById("status-badge"),
  statusMessage: document.getElementById("status-message"),
  montant: document.getElementById("r-montant"),
  reste: document.getElementById("r-reste"),
  progress: document.getElementById("progress"),
};

// ---- Données (logique inchangée) ----

function normalize(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildColumnIndex(cols) {
  const map = {};
  cols.forEach((col, i) => {
    const label = normalize(col.label);
    if (label.includes("telephone")) map.phone = i;
    else if (label.includes("commande")) map.order = i;
    else if (label.includes("montant")) map.montant = i;
    else if (label.includes("reste")) map.reste = i;
    else if (label.includes("statut")) map.status = i;
    else if (label.includes("date")) map.date = i;
    else if (label.includes("nom")) map.client = i;
    else if (label === "colis") map.colis = i;
  });
  return map;
}

function cellValue(row, idx) {
  if (idx === undefined) return "";
  const cell = row.c[idx];
  if (!cell) return "";
  return cell.f !== null && cell.f !== undefined ? cell.f : (cell.v !== null && cell.v !== undefined ? cell.v : "");
}

function cellRaw(row, idx) {
  if (idx === undefined) return null;
  const cell = row.c[idx];
  return cell ? cell.v : null;
}

function formatMontant(row, idx) {
  const raw = cellRaw(row, idx);
  if (typeof raw === "number") {
    return raw.toLocaleString("fr-FR") + " FCFA";
  }
  const fallback = cellValue(row, idx);
  return fallback ? fallback + " FCFA" : "—";
}

async function loadData() {
  try {
    const res = await fetch(SHEET_URL);
    const text = await res.text();
    const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText);
    if (parsed.status === "error") {
      throw new Error("access_denied");
    }
    colIndex = buildColumnIndex(parsed.table.cols);
    rows = parsed.table.rows || [];
    dataLoaded = true;
  } catch (err) {
    dataLoadFailed = true;
    showMessage(
      "Impossible de charger les données pour le moment. Merci de réessayer un peu plus tard.",
      "warn"
    );
  }
}

// ---- Progression automatique à partir du statut ----

const STEPS = [
  { label: "Commande", message: "Votre commande a bien été enregistrée." },
  { label: "En transit", message: "Votre colis est actuellement en cours d'acheminement." },
  { label: "Arrivée à Cotonou", message: "Votre colis est arrivé à Cotonou." },
  { label: "Livrée", message: "Votre colis a été livré avec succès." },
];

function getStatusInfo(rawStatus) {
  const n = normalize(rawStatus);
  let stepIndex = 0;
  if (n.includes("livr")) stepIndex = 3;
  else if (n.includes("arriv")) stepIndex = 2;
  else if (n.includes("transit")) stepIndex = 1;

  let badgeClass = "";
  if (n.includes("retard")) badgeClass = "danger";
  else if (stepIndex === 3) badgeClass = "success";
  else if (stepIndex === 1) badgeClass = "transit";

  const icons = ["📦", "🚚", "📍", "✅"];
  return {
    stepIndex,
    badgeClass,
    badgeText: `${icons[stepIndex]} ${STEPS[stepIndex].label.toUpperCase()}`,
    message: STEPS[stepIndex].message,
  };
}

function renderProgress(stepIndex) {
  const steps = els.progress.querySelectorAll(".progress-step");
  const lines = els.progress.querySelectorAll(".progress-line");
  steps.forEach((el) => {
    const i = Number(el.dataset.step);
    el.classList.remove("done", "current");
    if (i < stepIndex) el.classList.add("done");
    else if (i === stepIndex) el.classList.add("current");
  });
  lines.forEach((el) => {
    const i = Number(el.dataset.line);
    el.classList.toggle("done", i < stepIndex);
  });
}

// ---- Affichage ----

function showMessage(text, kind) {
  els.message.textContent = text;
  els.message.className = "message" + (kind ? " " + kind : "");
}

function clearStates() {
  els.notFoundCard.classList.add("hidden");
  els.resultCard.classList.add("hidden");
}

function showNotFound() {
  clearStates();
  els.notFoundCard.classList.remove("hidden");
}

function showResult(row) {
  clearStates();

  const rawStatus = cellValue(row, colIndex.status);
  const info = getStatusInfo(rawStatus);

  els.title.textContent = `📦 COMMANDE ${cellValue(row, colIndex.order) || "—"}`;
  els.client.textContent = cellValue(row, colIndex.client) || "—";
  els.phone.textContent = cellValue(row, colIndex.phone) || "—";
  els.colis.textContent = cellValue(row, colIndex.colis) || "—";
  els.date.textContent = cellValue(row, colIndex.date) || "—";

  els.statusBadge.textContent = info.badgeText;
  els.statusBadge.className = "status-badge" + (info.badgeClass ? " " + info.badgeClass : "");
  els.statusMessage.textContent = info.message;
  renderProgress(info.stepIndex);

  els.montant.textContent = formatMontant(row, colIndex.montant);
  els.reste.textContent = formatMontant(row, colIndex.reste);

  els.resultCard.classList.remove("hidden");
}

// ---- Recherche ----

async function handleSearch() {
  const query = els.input.value.trim();
  clearStates();

  if (!query) {
    showMessage("Veuillez entrer votre numéro de commande.");
    return;
  }

  if (!dataLoaded && !dataLoadFailed) {
    showMessage("Chargement des données...", "info");
    await loadData();
  }

  if (dataLoadFailed) {
    showMessage(
      "Impossible de charger les données pour le moment. Merci de réessayer un peu plus tard.",
      "warn"
    );
    return;
  }

  showMessage("");
  const target = normalize(query);
  const match = rows.find((row) => normalize(cellValue(row, colIndex.order)) === target);

  if (!match) {
    showNotFound();
    return;
  }

  showResult(match);
}

els.button.addEventListener("click", handleSearch);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSearch();
});

// Pré-chargement des données dès l'ouverture de la page
loadData();
