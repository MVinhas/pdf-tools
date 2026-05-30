# PDF Tools

A fast, private, cross-platform desktop app to extract text from PDFs and render PDF pages to images. Runs entirely offline — no cloud, no backend.

Built with [Tauri 2](https://tauri.app), [PyMuPDF](https://pymupdf.readthedocs.io), and vanilla JS.

---

## Features

- **Extract Text** — extract all text from a PDF, page by page, ready to copy
- **PDF to Images** — render each page to PNG, JPEG, or WebP at a chosen DPI
- Drag-and-drop or file picker
- Real-time progress per page
- Dark mode (follows system preference)
- Up to 256 MB · 250 pages

---

## Prerequisites

All platforms need **Rust**, **Node.js**, and **Python 3 + PyMuPDF**.

| Tool | Version |
|---|---|
| Rust | 1.77+ |
| Node.js | 18 LTS+ |
| Python | 3.10+ |
| PyMuPDF | 1.27+ |

Install PyMuPDF on any platform:
```bash
pip3 install pymupdf
```

---

## macOS

### Install dependencies

```bash
# Homebrew (https://brew.sh)
brew install node

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# WebKit (included in Xcode Command Line Tools)
xcode-select --install

pip3 install pymupdf
```

### Run in development

```bash
git clone https://github.com/micaelvinhas/pdf-tools.git
cd pdf-tools
npm install
npm run dev
```

### Build a distributable `.dmg`

```bash
npm run build
# Output: src-tauri/target/release/bundle/dmg/PDF Tools_1.0.0_aarch64.dmg
```

> **Apple Silicon note:** the build targets the current machine architecture automatically. For a universal binary (Intel + Apple Silicon) use `npm run build -- --target universal-apple-darwin` after installing both targets with `rustup target add x86_64-apple-darwin aarch64-apple-darwin`.

---

## Linux (Fedora Silverblue / any distro)

### Fedora Silverblue — recommended: Toolbox

Silverblue's base OS is immutable. Use `toolbox` to get a mutable dev environment:

```bash
toolbox create dev
toolbox enter dev
```

Inside the toolbox:

```bash
sudo dnf install -y nodejs npm cargo rust \
  webkit2gtk4.1-devel openssl-devel \
  librsvg2-devel patchelf python3-pip

pip3 install pymupdf
```

### Other Fedora / RHEL

```bash
sudo dnf install -y nodejs npm cargo rust \
  webkit2gtk4.1-devel openssl-devel \
  librsvg2-devel patchelf python3-pip

pip3 install pymupdf
```

### Debian / Ubuntu

```bash
sudo apt update
sudo apt install -y nodejs npm curl build-essential \
  libwebkit2gtk-4.1-dev libssl-dev \
  librsvg2-dev patchelf python3-pip

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

pip3 install pymupdf
```

### Run in development

```bash
git clone https://github.com/micaelvinhas/pdf-tools.git
cd pdf-tools
npm install
npm run dev
```

### Build a distributable

```bash
npm run build
# Output: src-tauri/target/release/bundle/
#   appimage/pdf-tools_1.0.0_amd64.AppImage   ← run directly, no install
#   rpm/pdf-tools-1.0.0-1.x86_64.rpm          ← Silverblue: rpm-ostree install
#   deb/pdf-tools_1.0.0_amd64.deb             ← Debian/Ubuntu: dpkg -i
```

**Silverblue — install the RPM as a system layer:**
```bash
rpm-ostree install ./src-tauri/target/release/bundle/rpm/pdf-tools-*.rpm
systemctl reboot
```

Or just run the AppImage directly without installing:
```bash
chmod +x pdf-tools_*.AppImage
./pdf-tools_*.AppImage
```

---

## Windows

### Install dependencies

1. **Rust** — download and run the installer from [rustup.rs](https://rustup.rs)
2. **Node.js** — download LTS from [nodejs.org](https://nodejs.org)
3. **Python** — download from [python.org](https://python.org), check "Add to PATH"
4. **WebView2** — already included on Windows 11; Windows 10 users: [download runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)
5. **Visual Studio C++ Build Tools** — required by Rust on Windows:
   - Download [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - Select "Desktop development with C++"

```powershell
pip install pymupdf
```

### Run in development

```powershell
git clone https://github.com/micaelvinhas/pdf-tools.git
cd pdf-tools
npm install
npm run dev
```

### Build a distributable installer

```powershell
npm run build
# Output: src-tauri\target\release\bundle\
#   nsis\PDF Tools_1.0.0_x64-setup.exe    ← NSIS installer
#   msi\PDF Tools_1.0.0_x64_en-US.msi     ← MSI package
```

---

## Project structure

```
index.html              App shell — two-tab layout
src/
  style.css             All styles (CSS variables, dark mode)
  main.js               Tab logic, Tauri invoke() calls, progress events
src-tauri/
  src/lib.rs            Tauri commands: extract_text, convert_to_images
  tauri.conf.json       App config and bundle targets
  capabilities/         Permission grants
sidecar/
  pdf_worker.py         PyMuPDF worker — JSON protocol over stdin/stdout
```

---

## License

MIT
