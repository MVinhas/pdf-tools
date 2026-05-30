# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**PDF Tools** — a cross-platform desktop app (macOS, Linux, Windows) built with Tauri 2. Two tabs:
- **Extract Text** — PDF to plain text (with page markers)
- **PDF to Images** — render each page to PNG/JPEG/WebP at a given DPI

No backend server. PDF processing runs via a Python sidecar (`sidecar/pdf_worker.py`) using PyMuPDF. Zero ImageMagick dependency.

---

## Prerequisites

```bash
# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node + npm (use latest LTS)
# macOS: brew install node
# Linux: use fnm or nvm

# Python + PyMuPDF (for dev sidecar)
pip install pymupdf

# Tauri CLI
npm install
```

---

## Dev

```bash
npm run dev        # starts Tauri dev window (hot-reload frontend, recompiles Rust on change)
```

The Rust backend auto-resolves the sidecar via `CARGO_MANIFEST_DIR` — no env var needed in dev.

## Build

```bash
npm run build      # produces platform installers in src-tauri/target/release/bundle/
```

For macOS `.app` + `.dmg`, run on macOS. For Windows `.exe`/`.msi`, run on Windows or use cross-compilation / GitHub Actions.

---

## Architecture

```
index.html                # App shell — two-tab layout, no framework
src/
  style.css               # All styles (CSS custom properties, dark mode via prefers-color-scheme)
  main.js                 # Tab switching, invoke() calls, progress event listener
src-tauri/
  src/
    main.rs               # Entry point (minimal)
    lib.rs                # Tauri commands: extract_text, convert_to_images
  tauri.conf.json         # App config, window size, bundle targets
  capabilities/
    default.json          # Permission grants (shell, dialog, opener)
  Cargo.toml
sidecar/
  pdf_worker.py           # Python worker: JSON-in / JSON+progress-out protocol
```

**Data flow:**
1. JS calls `invoke("extract_text", { path })` or `invoke("convert_to_images", { ... })`
2. Rust `lib.rs` spawns `pdf_worker.py` via `std::process::Command`, writes JSON request to stdin
3. Worker streams `{"progress": true, ...}` lines, then emits final `{"ok": true, ...}`
4. Rust parses progress lines → emits `"progress"` Tauri events → JS updates progress bar
5. Final result returned to JS as typed struct

**Sidecar protocol** (see `sidecar/pdf_worker.py` docstring for full spec):
- One JSON line on stdin → N progress lines + one result line on stdout
- Errors: `{"ok": false, "error": "message"}`

**Dev sidecar resolution** (`lib.rs: worker_command()`):
1. `TAURI_PDF_WORKER` env var (override)
2. `python3 <manifest_dir>/../../sidecar/pdf_worker.py` (default dev path)

For production: bundle `pdf_worker.py` as a resource and point `TAURI_PDF_WORKER` to the bundled path, or use PyInstaller to create a standalone binary listed in `bundle.externalBin`.

---

## Limits (enforced in sidecar)

- Max file size: 256 MB
- Max pages: 250

---

## Icon Regeneration

Source SVG is at `../textify-pdf/data/io.github.micaelvinhas.TextifyPDF.svg`.

```bash
SVG=../textify-pdf/data/io.github.micaelvinhas.TextifyPDF.svg
rsvg-convert -w 32  -h 32  "$SVG" -o src-tauri/icons/32x32.png
rsvg-convert -w 128 -h 128 "$SVG" -o src-tauri/icons/128x128.png
rsvg-convert -w 256 -h 256 "$SVG" -o src-tauri/icons/128x128@2x.png
rsvg-convert -w 512 -h 512 "$SVG" -o src-tauri/icons/icon.png
# .icns: use iconutil on macOS
# .ico: use ImageMagick or the Python stdlib script in CLAUDE.md history
```
