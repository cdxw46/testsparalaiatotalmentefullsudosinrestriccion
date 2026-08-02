#!/usr/bin/env python3
"""Turn generated symbol art (flat white backdrop) into trimmed RGBA sprites.

The matte is built by flood-filling the white backdrop from the image border,
then the ~2px transition band is solved as an alpha blend against white using a
locally estimated foreground colour. That keeps interior white highlights fully
opaque while giving clean, halo-free anti-aliased edges.
"""
from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image

WHITE = 255.0


def build_alpha(rgb: np.ndarray, white_tol: int, tint_tol: int) -> np.ndarray:
    mn = rgb.min(axis=2)
    mx = rgb.max(axis=2)
    whiteish = (mn >= WHITE - white_tol) & ((mx - mn) <= tint_tol)

    labels, count = ndi.label(whiteish)
    if count == 0:
        return np.ones(rgb.shape[:2], np.float32)

    border = np.concatenate(
        [labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]
    )
    bg_ids = {int(i) for i in np.unique(border) if i}
    if not bg_ids:
        return np.ones(rgb.shape[:2], np.float32)

    bg = np.isin(labels, list(bg_ids))
    fg = ~bg

    # Known-opaque core: pull back from the boundary so the estimate of the
    # foreground colour is not polluted by already-blended edge pixels.
    core = ndi.binary_erosion(fg, iterations=3, border_value=0)
    if not core.any():
        core = fg

    w = core.astype(np.float32)
    denom = ndi.uniform_filter(w, size=9) + 1e-6
    f_est = np.stack(
        [ndi.uniform_filter(rgb[:, :, c] * w, size=9) / denom for c in range(3)],
        axis=2,
    )

    # Solve P = a*F + (1-a)*255 per channel, trusting the channel that is
    # furthest from white (largest denominator, best conditioned).
    num = WHITE - rgb
    den = np.maximum(WHITE - f_est, 1.0)
    ratio = np.clip(num / den, 0.0, 1.0)
    pick = np.argmax(den, axis=2)[:, :, None]
    alpha = np.take_along_axis(ratio, pick, axis=2)[:, :, 0]

    band = ndi.binary_dilation(bg, iterations=2) & fg
    out = np.where(fg, 1.0, 0.0).astype(np.float32)
    out[band] = alpha[band]
    out[bg] = 0.0
    return np.clip(out, 0.0, 1.0)


def decontaminate(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    a = np.clip(alpha, 1e-3, 1.0)[:, :, None]
    return np.clip((rgb - (1.0 - a) * WHITE) / a, 0, 255)


def square_pad(im: Image.Image, size: int, margin: float) -> Image.Image:
    box = im.getbbox()
    if box:
        im = im.crop(box)
    side = int(max(im.size) / (1.0 - 2 * margin))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def process(src: pathlib.Path, dst: pathlib.Path, size: int, margin: float) -> None:
    im = Image.open(src).convert("RGB")
    rgb = np.asarray(im, np.float32)
    alpha = build_alpha(rgb, white_tol=26, tint_tol=16)
    clean = decontaminate(rgb, alpha)
    rgba = np.dstack([clean, alpha * 255.0]).astype(np.uint8)
    out = square_pad(Image.fromarray(rgba, "RGBA"), size, margin)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, optimize=True)
    covered = float((np.asarray(out)[:, :, 3] > 8).mean())
    print(f"  {src.name:>22} -> {dst.name:<22} cobertura alfa {covered:6.1%}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("inputs", nargs="+", type=pathlib.Path)
    ap.add_argument("--out", required=True, type=pathlib.Path)
    ap.add_argument("--size", type=int, default=320)
    ap.add_argument("--margin", type=float, default=0.04)
    args = ap.parse_args()

    for src in args.inputs:
        if not src.exists():
            print(f"  falta {src}", file=sys.stderr)
            continue
        process(src, args.out / src.name, args.size, args.margin)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
