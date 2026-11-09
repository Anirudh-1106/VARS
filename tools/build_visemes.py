"""Build the interviewer's mouth-shape (viseme) sheet from talking footage.

Every frame of the source clip is aligned to the idle face (eyes and nose
held fixed, so head movement cancels out), the mouth is measured (how open,
how wide, how much teeth show), and the best real frame for each mouth shape
is cut out with a feathered edge. The browser then swaps these real mouths
onto the still face in time with each word of the interviewer's voice.

    python tools/build_visemes.py path/to/talking_clip.mp4

Needs opencv-python-headless and numpy (build time only; not used by the app).
Writes static/img/avatars/meera-visemes.png and meera-visemes.json.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT_IMG = ROOT / "static" / "img" / "avatars" / "meera-visemes.png"
OUT_JSON = ROOT / "static" / "img" / "avatars" / "meera-visemes.json"
OUT_PREVIEW = ROOT / ".impeccable" / "review" / "visemes-preview.png"

CROP_X, CROP_W, CROP_H = 267, 760, 720  # same crop as meera-idle.jpg
BASE_INDEX = 1                            # the frame meera-idle.jpg was taken from

# Regions in crop coordinates (measured on the idle frame).
ALIGN_BOX = (262, 175, 236, 135)   # eyes + nose, excludes the mouth
MOUTH_BOX = (322, 316, 116, 60)    # tight window below the nose used to measure the mouth
PATCH_MOUTH = (288, 272, 184, 140) # area swapped onto the still face
PATCH_EYE_L = (270, 208, 108, 76)
PATCH_EYE_R = (388, 208, 108, 76)

# Frames chosen by eye from a contact sheet of the aligned mouths (frame
# numbers in the source clip). Delete an entry to let the automatic picker
# choose that shape from measurements instead.
PICKS = {"A": 48, "E": 105, "I": 63, "O": 6, "U": 186, "K": 96, "FV": 30, "MBP": 57}
BLINK_PICKS = {"blink": 122, "blinkHalf": 186}


def load_frames(path: Path) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(frame[:CROP_H, CROP_X:CROP_X + CROP_W].copy())
    cap.release()
    if not frames:
        raise SystemExit("No frames could be read from the video.")
    return frames


def align(base_gray: np.ndarray, frames: list[np.ndarray]) -> list[tuple[np.ndarray, float]]:
    x, y, w, h = ALIGN_BOX
    mask = np.zeros_like(base_gray, dtype=np.uint8)
    mask[y:y + h, x:x + w] = 255
    template = cv2.GaussianBlur(base_gray, (5, 5), 0).astype(np.float32)
    out = []
    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 120, 1e-6)
    for frame in frames:
        gray = cv2.GaussianBlur(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (5, 5), 0).astype(np.float32)
        try:
            cc, warp = cv2.findTransformECC(template, gray, warp, cv2.MOTION_AFFINE, criteria, mask, 5)
        except cv2.error:
            cc, warp = 0.0, np.eye(2, 3, dtype=np.float32)
        aligned = cv2.warpAffine(frame, warp, (CROP_W, CROP_H), flags=cv2.INTER_CUBIC + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        out.append((aligned, float(cc)))
    return out


def measure_mouth(img: np.ndarray) -> dict:
    x, y, w, h = MOUTH_BOX
    roi = img[y:y + h, x:x + w]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    v = hsv[..., 2].astype(np.int32)
    s = hsv[..., 1].astype(np.int32)
    # Inner mouth is much darker than the closed lip line; teeth are bright and grey.
    dark = (v < 58).astype(np.uint8)
    teeth = ((v > 185) & (s < 70)).astype(np.uint8)
    inner = dark | teeth
    rows = np.where(inner.sum(1) >= 3)[0]
    cols = np.where(inner.sum(0) >= 2)[0]
    if len(rows) == 0 or len(cols) == 0:
        return {"open": 0.0, "width": 0.0, "teeth": float(teeth.sum()), "dark": 0.0}
    return {
        "open": float(len(rows)),
        "width": float(cols.max() - cols.min() + 1),
        "teeth": float(teeth.sum()),
        "dark": float(dark.sum()),
    }


def measure_eyes(img: np.ndarray) -> float:
    # Dark iris/pupil area inside both eye windows; drops sharply when lids close.
    total = 0
    for ex in (300, 418):
        roi = img[228:262, ex:ex + 46]
        v = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)[..., 2]
        total += int((v < 70).sum())
    return float(total)


def feather(w: int, h: int, core: float = 0.62) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xx - (w - 1) / 2) / (w / 2)
    ny = (yy - (h - 1) / 2) / (h / 2)
    r = np.sqrt(nx * nx + ny * ny)
    alpha = np.clip((1.0 - r) / (1.0 - core), 0.0, 1.0)
    return (alpha * alpha * (3 - 2 * alpha)).astype(np.float32)  # smoothstep


def cut(img: np.ndarray, box, core: float) -> np.ndarray:
    x, y, w, h = box
    patch = cv2.cvtColor(img[y:y + h, x:x + w], cv2.COLOR_BGR2BGRA)
    patch[..., 3] = (feather(w, h, core) * 255).astype(np.uint8)
    return patch


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "gemini_generated_video_8fcb9ef8.mp4"
    frames = load_frames(src)
    base = frames[BASE_INDEX]
    base_gray = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY)
    aligned = align(base_gray, frames)

    rows = []
    for i, (img, cc) in enumerate(aligned):
        m = measure_mouth(img)
        rows.append({"i": i, "cc": cc, "eyes": measure_eyes(img), **m})
    good = [r for r in rows if r["cc"] > 0.93]
    if len(good) < 20:
        good = sorted(rows, key=lambda r: -r["cc"])[: max(20, len(rows) // 2)]

    base_m = measure_mouth(base)
    opens = np.array([r["open"] for r in good])
    widths = np.array([r["width"] for r in good])
    teeth = np.array([r["teeth"] for r in good])
    o_hi, o_mid, o_lo = np.percentile(opens, [92, 60, 30])
    w_hi, w_mid, w_lo = np.percentile(widths, [88, 55, 20])
    t_hi = np.percentile(teeth, 80)

    # Target (open, width, teeth) per mouth shape; best real frame wins.
    targets = {
        "A": (o_hi, w_mid, t_hi * 0.6),        # ah: jaw dropped
        "E": (o_mid, w_hi, t_hi),              # eh/ae: wide, teeth showing
        "I": (o_lo, w_hi, t_hi),               # ee: wide smile, small gap
        "O": (o_mid * 1.1, w_lo, t_hi * 0.15), # oh: round
        "U": (o_lo * 0.8, w_lo * 0.85, 0.0),   # oo/w: small round
        "K": (o_lo * 0.7, w_mid, t_hi * 0.7),  # t d n s k: teeth slightly apart
        "FV": (o_lo * 0.5, w_mid, t_hi * 0.9), # f v: teeth on lip
    }
    span = np.array([max(1.0, opens.max()), max(1.0, widths.max()), max(1.0, teeth.max())])
    picks = {}
    used = set()
    for name, target in targets.items():
        best, best_d = None, 1e9
        for r in good:
            if r["i"] in used:
                continue
            vec = np.array([r["open"], r["width"], r["teeth"]]) / span
            d = float(np.linalg.norm(vec - np.array(target) / span)) - 0.15 * r["cc"]
            if d < best_d:
                best, best_d = r, d
        picks[name] = best
        used.add(best["i"])
    by_index = {r["i"]: r for r in rows}
    for name, idx in PICKS.items():
        picks[name] = by_index[idx]

    # Blink: fewest dark eye pixels (closed) and one in between (half).
    eye_vals = np.array([r["eyes"] for r in rows])
    open_level = np.percentile(eye_vals, 70)
    # A blink changes the eye area the alignment uses, so accept a lower score here.
    closed = min((r for r in rows if r["cc"] > 0.82), key=lambda r: r["eyes"])
    half_target = (closed["eyes"] + open_level) / 2
    half = min((r for r in rows if r["cc"] > 0.82 and r["i"] != closed["i"]), key=lambda r: abs(r["eyes"] - half_target))

    patches = []
    meta = {"base": "/static/img/avatars/meera-idle.jpg", "size": [CROP_W, CROP_H], "patches": {}}
    for name, r in picks.items():
        patches.append((name, cut(aligned[r["i"]][0], PATCH_MOUTH, 0.55), PATCH_MOUTH, r))
    if BLINK_PICKS:
        closed = by_index[BLINK_PICKS["blink"]]
        half = by_index[BLINK_PICKS["blinkHalf"]]
    for name, r in (("blink", closed), ("blinkHalf", half)):
        for side, box in (("L", PATCH_EYE_L), ("R", PATCH_EYE_R)):
            patches.append((f"{name}{side}", cut(aligned[r["i"]][0], box, 0.5), box, r))

    sheet_w = max(p[1].shape[1] for p in patches)
    sheet_h = sum(p[1].shape[0] for p in patches)
    sheet = np.zeros((sheet_h, sheet_w, 4), dtype=np.uint8)
    y = 0
    for name, patch, box, r in patches:
        h, w = patch.shape[:2]
        sheet[y:y + h, 0:w] = patch
        meta["patches"][name] = {"sx": 0, "sy": y, "w": w, "h": h, "x": box[0], "y": box[1], "frame": r["i"]}
        y += h
    cv2.imwrite(str(OUT_IMG), sheet, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    OUT_JSON.write_text(json.dumps(meta, indent=1), encoding="utf-8")

    # Preview: the still face with each patch composited, for a visual check.
    tiles = []
    for name, patch, box, r in patches:
        canvas = base.copy().astype(np.float32)
        x0, y0, w, h = box
        a = patch[..., 3:4].astype(np.float32) / 255.0
        canvas[y0:y0 + h, x0:x0 + w] = canvas[y0:y0 + h, x0:x0 + w] * (1 - a) + patch[..., :3].astype(np.float32) * a
        face = canvas[170:420, 240:520].astype(np.uint8)
        cv2.putText(face, name, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 1, cv2.LINE_AA)
        tiles.append(face)
    OUT_PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    rows_img = [np.hstack(tiles[i:i + 5] + [np.zeros_like(tiles[0])] * (5 - len(tiles[i:i + 5]))) for i in range(0, len(tiles), 5)]
    cv2.imwrite(str(OUT_PREVIEW), np.vstack(rows_img))

    print(f"frames {len(frames)}, well aligned {len(good)}, base mouth {base_m}")
    for name, patch, box, r in patches:
        print(f"{name:10s} frame {r['i']:3d} cc {r['cc']:.3f} open {r['open']:.0f} width {r['width']:.0f} teeth {r['teeth']:.0f} eyes {r['eyes']:.0f}")
    print(f"wrote {OUT_IMG.relative_to(ROOT)} ({OUT_IMG.stat().st_size // 1024} KB) and {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
