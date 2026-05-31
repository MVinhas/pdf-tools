const { invoke } = window.__TAURI__.core;
const { open, save } = window.__TAURI__.dialog;
const { openPath } = window.__TAURI__.opener;

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".panel").forEach(p => {
      p.classList.remove("active");
      p.classList.add("hidden");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    const panel = document.getElementById(`panel-${tab.dataset.tab}`);
    panel.classList.remove("hidden");
    panel.classList.add("active");
  });
});

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setProgress(fillId, labelId, fraction, label) {
  document.getElementById(fillId).style.width = `${Math.round(fraction * 100)}%`;
  document.getElementById(labelId).textContent = label;
}

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

async function pickPdf() {
  return await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
}

// ── TEXT TAB ──────────────────────────────────────────────────────────────────

const dropText = document.getElementById("drop-text");

function setupDrop(el, onFile) {
  el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("drag-over"); });
  el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
  el.addEventListener("drop", e => {
    e.preventDefault();
    el.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file && file.name.toLowerCase().endsWith(".pdf")) {
      onFile(file.path ?? file.name);
    } else {
      showToast("Please drop a PDF file.");
    }
  });
  el.addEventListener("click", async () => {
    const path = await pickPdf();
    if (path) onFile(path);
  });
  el.addEventListener("keydown", async e => {
    if (e.key === "Enter" || e.key === " ") {
      const path = await pickPdf();
      if (path) onFile(path);
    }
  });
}

setupDrop(dropText, extractText);

async function extractText(pdfPath) {
  hide("drop-text");
  hide("output-text");
  show("progress-text");
  setProgress("progress-fill-text", "progress-label-text", 0, "Opening PDF…");

  try {
    const result = await invoke("extract_text", { path: pdfPath });
    hide("progress-text");
    show("drop-text");

    document.getElementById("text-result").value = result.text;
    document.getElementById("text-meta").textContent =
      `${result.page_count} page${result.page_count !== 1 ? "s" : ""} · ${result.char_count.toLocaleString()} characters`;

    hide("drop-text");
    show("output-text");
  } catch (err) {
    hide("progress-text");
    show("drop-text");
    showToast(err);
  }
}

document.getElementById("btn-copy").addEventListener("click", () => {
  const text = document.getElementById("text-result").value;
  navigator.clipboard.writeText(text).then(() => showToast("Text copied to clipboard."));
});

document.getElementById("btn-new-text").addEventListener("click", () => {
  hide("output-text");
  document.getElementById("text-result").value = "";
  show("drop-text");
});

// ── IMAGE TAB ─────────────────────────────────────────────────────────────────

const dropImage = document.getElementById("drop-image");
let imagePdfPath = null;
let lastOutputFolder = null;

setupDrop(dropImage, path => {
  imagePdfPath = path;
  document.getElementById("image-filename").textContent = path.split(/[/\\]/).pop();
  hide("drop-image");
  show("settings-image");
});

document.getElementById("btn-change-pdf").addEventListener("click", async () => {
  const path = await pickPdf();
  if (path) {
    imagePdfPath = path;
    document.getElementById("image-filename").textContent = path.split(/[/\\]/).pop();
  }
});

document.getElementById("input-quality").addEventListener("input", e => {
  document.getElementById("quality-value").textContent = e.target.value;
});

document.getElementById("btn-convert").addEventListener("click", async () => {
  if (!imagePdfPath) { showToast("Select a PDF first."); return; }

  const outputDir = await open({ directory: true, title: "Choose output folder" });
  if (!outputDir) return;

  lastOutputFolder = outputDir;

  const dpi = parseInt(document.getElementById("input-dpi").value, 10) || 150;
  const fmt = document.getElementById("input-format").value;
  const quality = parseInt(document.getElementById("input-quality").value, 10);
  const prefix = document.getElementById("input-prefix").value || "page";

  hide("settings-image");
  show("progress-image");
  setProgress("progress-fill-image", "progress-label-image", 0, "Starting…");

  try {
    const result = await invoke("convert_to_images", {
      path: imagePdfPath,
      outputDir,
      dpi,
      format: fmt,
      quality,
      prefix,
    });

    hide("progress-image");
    document.getElementById("image-done-label").textContent =
      `${result.files_written} image${result.files_written !== 1 ? "s" : ""} saved.`;
    show("output-image");
  } catch (err) {
    hide("progress-image");
    show("settings-image");
    showToast(err);
  }
});

document.getElementById("btn-open-folder").addEventListener("click", () => {
  if (lastOutputFolder) openPath(lastOutputFolder);
});

document.getElementById("btn-new-image").addEventListener("click", () => {
  imagePdfPath = null;
  lastOutputFolder = null;
  hide("output-image");
  hide("settings-image");
  document.getElementById("image-filename").textContent = "No file selected";
  show("drop-image");
});

// ── Progress polling ──────────────────────────────────────────────────────────
// Listen for progress events emitted by the Rust backend

const { listen } = window.__TAURI__.event;

listen("progress", event => {
  const { tab, current, total, label } = event.payload;
  const fillId = tab === "text" ? "progress-fill-text" : "progress-fill-image";
  const labelId = tab === "text" ? "progress-label-text" : "progress-label-image";
  setProgress(fillId, labelId, current / total, label);
});
