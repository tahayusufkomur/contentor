#!/usr/bin/env python3
"""Removes the Gemini sparkle watermark by algebraically reversing the alpha
blend, using a calibrated alpha template (extracted from a flat-background
sample) rather than inpainting -- so underlying texture is exactly
reconstructed instead of hallucinated/smeared.

Calibration (Gorkem/Pro account, ~1536px-tall renders): watermark center is
at a near-fixed pixel offset from the bottom-right corner, (w-241, h-241).
We refine that with a local template-match on the "local brightening" diff
map (±40px window) to absorb per-image jitter, then de-blend:
    original = (observed - 255*alpha) / (1 - alpha)
using the calibrated alpha_template's shape at the refined location.
"""
import sys
from pathlib import Path

import numpy as np
import cv2
from PIL import Image, ImageFilter

SCRIPT_DIR = Path(__file__).resolve().parent
ALPHA_TEMPLATE = np.load(SCRIPT_DIR / "alpha_template.npy").astype(np.float32)
TH, TW = ALPHA_TEMPLATE.shape
CORNER_OFFSET = 241  # px, calibrated for Gorkem/Pro ~1536px-tall renders
SEARCH_WINDOW = 40


def diffmap(img):
    arr = np.asarray(img).astype(np.float32)
    blurred = np.asarray(img.filter(ImageFilter.GaussianBlur(radius=25))).astype(np.float32)
    return arr.mean(axis=2) - blurred.mean(axis=2)


def remove_watermark(in_path, out_path, debug=False):
    img = Image.open(in_path).convert("RGB")
    w, h = img.size
    arr = np.asarray(img).astype(np.float32)

    pred_cx, pred_cy = w - CORNER_OFFSET, h - CORNER_OFFSET
    x0 = max(0, pred_cx - TW // 2 - SEARCH_WINDOW)
    y0 = max(0, pred_cy - TH // 2 - SEARCH_WINDOW)
    x1 = min(w, pred_cx + TW // 2 + SEARCH_WINDOW)
    y1 = min(h, pred_cy + TH // 2 + SEARCH_WINDOW)

    diff = diffmap(img)
    search = diff[y0:y1, x0:x1]
    if search.shape[0] < TH or search.shape[1] < TW:
        img.save(out_path)
        return False, None

    # normalize template to a diff-like signal for matching purposes
    norm_template = (ALPHA_TEMPLATE - ALPHA_TEMPLATE.mean()).astype(np.float32)
    result = cv2.matchTemplate(search.astype(np.float32), norm_template, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)
    if debug:
        print(f"  match score={max_val:.3f} predicted_center=({pred_cx},{pred_cy})")

    mx, my = max_loc
    cx0 = x0 + mx  # top-left of matched window, absolute
    cy0 = y0 + my

    if max_val < 0.15:
        # fall back to the pure pixel-offset prediction if match is weak
        cx0 = pred_cx - TW // 2
        cy0 = pred_cy - TH // 2
        if debug:
            print("  low match confidence, using predicted offset directly")

    out = arr.copy()
    y_lo, y_hi = cy0, cy0 + TH
    x_lo, x_hi = cx0, cx0 + TW
    # clip to image bounds (template could hang off the edge for small images)
    ty_lo, ty_hi = max(0, -y_lo), TH - max(0, y_hi - h)
    tx_lo, tx_hi = max(0, -x_lo), TW - max(0, x_hi - w)
    y_lo, y_hi = max(0, y_lo), min(h, y_hi)
    x_lo, x_hi = max(0, x_lo), min(w, x_hi)

    a = ALPHA_TEMPLATE[ty_lo:ty_hi, tx_lo:tx_hi][:, :, None]
    region = out[y_lo:y_hi, x_lo:x_hi, :]
    denom = np.clip(1.0 - a, 0.08, 1.0)  # avoid blow-up at a->1 (shouldn't happen, peak~0.33)
    recovered = (region - 255.0 * a) / denom
    out[y_lo:y_hi, x_lo:x_hi, :] = recovered

    out = np.clip(out, 0, 255).astype(np.uint8)
    Image.fromarray(out).save(out_path)
    return True, max_val


if __name__ == "__main__":
    in_path, out_path = sys.argv[1], sys.argv[2]
    found, score = remove_watermark(in_path, out_path, debug=True)
    print("processed" if found else "skipped", score, "->", out_path)
