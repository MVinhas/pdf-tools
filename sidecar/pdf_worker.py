"""
PDF worker sidecar for Tauri.

Protocol: one JSON request on stdin → one JSON response on stdout, then exit.

Request shapes:
  {"op": "extract_text", "path": "/abs/path.pdf"}
  {"op": "convert_images", "path": "...", "output_dir": "...",
   "dpi": 150, "format": "jpg", "quality": 85, "prefix": "page"}

Response shapes (success):
  {"ok": true, "text": "...", "page_count": N, "char_count": N}
  {"ok": true, "files_written": N}

Response shape (error):
  {"ok": false, "error": "Human-readable message"}

Progress is streamed as separate JSON lines to stdout before the final response:
  {"progress": true, "current": N, "total": N, "label": "Processing page N of M…"}
"""

import json
import os
import sys

MAX_FILE_SIZE = 256 * 1024 * 1024
MAX_PAGES = 250


def emit(obj):
    print(json.dumps(obj), flush=True)


def validate(path):
    if not os.path.isfile(path):
        raise ValueError("File not found.")
    if os.path.getsize(path) > MAX_FILE_SIZE:
        mb = os.path.getsize(path) / 1024 / 1024
        raise ValueError(f"File too large ({mb:.0f} MB). Maximum is 256 MB.")


def op_extract_text(path):
    import pymupdf

    validate(path)
    doc = pymupdf.open(path)

    if doc.page_count == 0:
        doc.close()
        raise ValueError("PDF has no pages.")
    if doc.page_count > MAX_PAGES:
        doc.close()
        raise ValueError(f"PDF has {doc.page_count} pages. Maximum is {MAX_PAGES}.")

    total = doc.page_count
    parts = []

    for i, page in enumerate(doc):
        emit({"progress": True, "current": i + 1, "total": total,
              "label": f"Processing page {i + 1} of {total}…"})
        text = page.get_text("text").strip()
        parts.append(f"--- Page {i + 1} ---\n{text}")

    doc.close()
    full_text = "\n\n".join(parts)
    emit({"ok": True, "text": full_text,
          "page_count": total, "char_count": len(full_text)})


def op_convert_images(path, output_dir, dpi, fmt, quality, prefix):
    import pymupdf

    validate(path)
    os.makedirs(output_dir, exist_ok=True)

    doc = pymupdf.open(path)

    if doc.page_count == 0:
        doc.close()
        raise ValueError("PDF has no pages.")
    if doc.page_count > MAX_PAGES:
        doc.close()
        raise ValueError(f"PDF has {doc.page_count} pages. Maximum is {MAX_PAGES}.")

    total = doc.page_count
    mat = pymupdf.Matrix(dpi / 72, dpi / 72)
    files_written = 0

    for i, page in enumerate(doc):
        emit({"progress": True, "current": i + 1, "total": total,
              "label": f"Rendering page {i + 1} of {total}…"})

        pix = page.get_pixmap(matrix=mat, alpha=False)
        filename = f"{prefix}-{i + 1}.{fmt}"
        out_path = os.path.join(output_dir, filename)

        if fmt == "jpg":
            pix.save(out_path, jpg_quality=quality)
        elif fmt == "webp":
            from PIL import Image
            img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            img.save(out_path, "WEBP", quality=quality)
        else:
            pix.save(out_path)

        files_written += 1

    doc.close()
    emit({"ok": True, "files_written": files_written})


def main():
    raw = sys.stdin.readline()
    try:
        req = json.loads(raw)
    except json.JSONDecodeError as e:
        emit({"ok": False, "error": f"Invalid request: {e}"})
        return

    op = req.get("op")
    try:
        if op == "extract_text":
            op_extract_text(req["path"])
        elif op == "convert_images":
            op_convert_images(
                path=req["path"],
                output_dir=req["output_dir"],
                dpi=int(req.get("dpi", 150)),
                fmt=req.get("format", "jpg"),
                quality=int(req.get("quality", 85)),
                prefix=req.get("prefix", "page"),
            )
        else:
            emit({"ok": False, "error": f"Unknown operation: {op}"})
    except ValueError as e:
        emit({"ok": False, "error": str(e)})
    except Exception as e:
        emit({"ok": False, "error": f"Unexpected error: {e}"})


if __name__ == "__main__":
    main()
