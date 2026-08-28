#!/usr/bin/env python3
"""Render a premium photo-embedded QR code.

The photograph is not a logo dropped into the middle of a plain QR code: the
whole symbol *is* the photograph. Every module is painted as a soft dot whose
colour is the photo's own colour pushed to the light or dark luminance the
scanner needs, so the picture keeps reading through the lattice while the code
stays inside error-correction budget.

    python3 docs/qr/generate_premium_qr.py            # render + verify
    python3 docs/qr/generate_premium_qr.py --verify-only

Dependencies: pillow, numpy, segno, opencv-python-headless, zxing-cpp
(see requirements.txt).
"""

from __future__ import annotations

import argparse
import io
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np
import segno
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = Path(__file__).resolve().parent
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)

# Alignment-pattern centre coordinates per QR version (ISO/IEC 18004 annex E).
ALIGNMENT_CENTRES: dict[int, list[int]] = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
    7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
    11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
    15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
    18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90],
}


@dataclass
class Style:
    """Everything that decides how the symbol looks."""

    # Geometry
    module_px: int = 43            # rendered pixels per QR module
    quiet_modules: int = 5         # quiet zone, in modules
    corner_radius_modules: float = 2.6

    # Dot lattice. Radii are in module units measured from the module centre;
    # 0.5 reaches the module edge, 0.707 its corner.
    dark_inner: float = 0.32
    dark_outer: float = 0.57
    light_inner: float = 0.34
    light_outer: float = 0.59
    # The timing rows are what a decoder walks to recover the module grid, so
    # they are drawn at full strength and a size up. Costs two dotted lines of
    # picture; buys a large jump in how forgiving the symbol is.
    timing_inner: float = 0.40
    timing_outer: float = 0.64

    # How hard a dot is pushed toward its target luminance. The renderer always
    # applies `floor`, and adds the rest in proportion to how badly the photo
    # disagrees with the module it has to represent.
    dark_floor: float = 0.62
    light_floor: float = 0.60

    dark_luma: float = 0.085       # target luminance for a dark module
    light_luma: float = 0.935      # target luminance for a light module
    need_span: float = 0.55        # luminance gap that counts as "fully wrong"
    radius_min: float = 0.78       # dot size where the photo already agrees

    # Photo grading before the lattice goes on top.
    saturation: float = 1.14
    contrast: float = 0.82
    gamma: float = 0.97
    # Radii below are in module units, so the grade holds at any render size.
    unsharp: tuple[float, float, int] = (0.046, 105, 3)   # radius, percent, threshold
    clarity: tuple[float, float] = (1.10, 72.0)           # local contrast: radius, percent
    # Grain finer than a module carries no picture at this scale but does read
    # as noise to a scanner's binariser. An edge-preserving filter takes the
    # grain out while leaving the features that make the portrait legible.
    # (diameter in module units, colour sigma, space sigma); 0 disables.
    denoise: tuple[float, float, float] = (0.34, 42.0, 42.0)

    # Soft focus region, in fractions of the square: the subject's face. Inside
    # it the lattice eases off so the portrait keeps its detail; the error
    # correction absorbs the modules this costs.
    focus_centre: tuple[float, float] = (0.505, 0.30)
    focus_radii: tuple[float, float] = (0.250, 0.225)
    focus_feather: float = 0.14
    focus_ease: float = 0.48        # 1.0 = no easing, 0 = lattice removed

    # Palette
    ink: tuple[int, int, int] = (12, 31, 51)        # deep sea navy
    paper: tuple[int, int, int] = (250, 251, 253)
    plate_photo_tint: float = 0.10                  # photo ghost under finders

    # Rounding is capped here on purpose: past ~1.0 modules the finder stops
    # scanning as the 1:1:3:1:1 run-length ratio detectors look for.
    finder_radius: tuple[float, float, float] = (1.00, 0.70, 0.45)
    align_radius: tuple[float, float, float] = (0.80, 0.50, 0.20)


@dataclass
class Job:
    data: str
    photo: Path
    # Square crop of the source photo, as fractions of its own size:
    # (centre-x, centre-y, side) where side is a fraction of the shorter edge.
    crop: tuple[float, float, float] = (0.5205, 0.345, 0.840)
    style: Style = field(default_factory=Style)


# --------------------------------------------------------------------------- #
# photo
# --------------------------------------------------------------------------- #

def load_square_photo(path: Path, size: int, crop: tuple[float, float, float]) -> Image.Image:
    """Crop the source to a square around the subject and resize to `size`."""
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    w, h = img.size
    cx, cy, frac = crop
    side = int(min(w, h) * frac)
    left = int(cx * w - side / 2)
    top = int(cy * h - side / 2)
    left = max(0, min(left, w - side))
    top = max(0, min(top, h - side))
    square = img.crop((left, top, left + side, top + side))
    return square.resize((size, size), Image.LANCZOS)


def grade(img: Image.Image, st: Style, module_px: int = 0) -> np.ndarray:
    """Tone-map the photo so both dark and light dots have somewhere to sit."""
    unit = module_px or 1
    c_radius, c_percent = st.clarity
    if c_percent:
        img = img.filter(
            ImageFilter.UnsharpMask(radius=c_radius * unit, percent=int(c_percent), threshold=2)
        )
    radius, percent, threshold = st.unsharp
    img = img.filter(
        ImageFilter.UnsharpMask(radius=radius * unit, percent=percent, threshold=threshold)
    )
    a = np.asarray(img, dtype=np.float32) / 255.0

    lum = (a * LUMA).sum(axis=2, keepdims=True)
    a = np.clip(lum + (a - lum) * st.saturation, 0.0, 1.0)      # saturation
    a = np.clip(0.5 + (a - 0.5) * st.contrast, 0.0, 1.0)        # contrast headroom
    a = np.power(a, st.gamma)                                   # gentle lift

    if module_px and st.denoise[0]:
        diameter, sigma_colour, sigma_space = st.denoise
        d = max(3, int(round(diameter * module_px)) | 1)
        filtered = cv2.bilateralFilter(
            (a * 255).astype(np.uint8), d, sigma_colour, sigma_space
        )
        a = filtered.astype(np.float32) / 255.0
    return a


# --------------------------------------------------------------------------- #
# code geometry
# --------------------------------------------------------------------------- #

def qr_matrix(data: str) -> tuple[np.ndarray, int]:
    qr = segno.make(data, error="h", boost_error=True, micro=False)
    matrix = np.array([[int(bit) for bit in row] for row in qr.matrix], dtype=np.uint8)
    return matrix, qr.version


def finder_origins(n: int) -> list[tuple[int, int]]:
    return [(0, 0), (n - 7, 0), (0, n - 7)]


def alignment_origins(version: int, n: int) -> list[tuple[int, int]]:
    centres = ALIGNMENT_CENTRES.get(version, [])
    out: list[tuple[int, int]] = []
    for cy in centres:
        for cx in centres:
            near_finder = (
                (cx <= 8 and cy <= 8)
                or (cx <= 8 and cy >= n - 9)
                or (cx >= n - 9 and cy <= 8)
            )
            if not near_finder:
                out.append((cx - 2, cy - 2))
    return out


def timing_mask(matrix: np.ndarray) -> np.ndarray:
    """The two timing runs, excluding the stretches owned by the finders."""
    n = matrix.shape[0]
    mask = np.zeros((n, n), dtype=bool)
    mask[6, 8:n - 8] = True
    mask[8:n - 8, 6] = True
    return mask


def function_mask(matrix: np.ndarray, version: int) -> np.ndarray:
    """True for modules drawn as bespoke shapes rather than lattice dots."""
    n = matrix.shape[0]
    mask = np.zeros((n, n), dtype=bool)
    for ox, oy in finder_origins(n):
        x0, y0 = max(0, ox - 1), max(0, oy - 1)
        mask[y0:oy + 8, x0:ox + 8] = True          # finder + separator
    for ox, oy in alignment_origins(version, n):
        mask[oy:oy + 5, ox:ox + 5] = True
    return mask


# --------------------------------------------------------------------------- #
# rendering
# --------------------------------------------------------------------------- #

def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / np.maximum(edge1 - edge0, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def module_radius(size: int, module_px: int) -> np.ndarray:
    """Per-pixel distance from its own module's centre, in module units."""
    coord = (np.arange(size, dtype=np.float32) % module_px + 0.5) / module_px - 0.5
    dx = coord[None, :]
    dy = coord[:, None]
    return np.sqrt(dx * dx + dy * dy)


def dot_weight(r: np.ndarray, inner: np.ndarray, outer: np.ndarray) -> np.ndarray:
    """Falloff from the module centre: 1 inside `inner`, 0 past `outer`."""
    return 1.0 - smoothstep(inner, outer, r)


def focus_mask(size: int, st: Style) -> np.ndarray:
    """1.0 everywhere, easing toward `focus_ease` inside the subject ellipse."""
    if st.focus_ease >= 1.0:
        return np.ones((size, size, 1), dtype=np.float32)
    u = (np.arange(size, dtype=np.float32) + 0.5) / size
    fx, fy = st.focus_centre
    rx, ry = st.focus_radii
    d = np.sqrt(((u[None, :] - fx) / rx) ** 2 + ((u[:, None] - fy) / ry) ** 2)
    inside = 1.0 - smoothstep(1.0, 1.0 + st.focus_feather / min(rx, ry), d)
    return (1.0 - inside * (1.0 - st.focus_ease))[..., None].astype(np.float32)


def to_luma(a: np.ndarray) -> np.ndarray:
    return (a * LUMA).sum(axis=2, keepdims=True)


def render_code(photo: np.ndarray, matrix: np.ndarray, version: int, st: Style) -> np.ndarray:
    """Paint the dot lattice over the graded photo."""
    n = matrix.shape[0]
    m = st.module_px
    size = n * m

    dark_mod = matrix.astype(bool)
    is_dark = np.repeat(np.repeat(dark_mod, m, axis=0), m, axis=1)[..., None]
    is_func = np.repeat(np.repeat(function_mask(matrix, version), m, axis=0), m, axis=1)[..., None]

    lum = to_luma(photo)

    # How badly each module disagrees with the value it has to carry, judged
    # once per module so a dot never breaks up inside itself.
    mod_lum = lum[..., 0].reshape(n, m, n, m).mean(axis=(1, 3))
    need_mod = np.where(
        dark_mod,
        np.clip((mod_lum - st.dark_luma) / st.need_span, 0.0, 1.0),
        np.clip((st.light_luma - mod_lum) / st.need_span, 0.0, 1.0),
    )
    need = np.repeat(np.repeat(need_mod, m, axis=0), m, axis=1)[..., None]

    # A module the photo already agrees with gets a smaller dot, so the picture
    # keeps its own detail wherever the code does not need to overrule it.
    scale = st.radius_min + (1.0 - st.radius_min) * need
    inner = np.where(is_dark, st.dark_inner, st.light_inner) * scale
    outer = np.where(is_dark, st.dark_outer, st.light_outer) * scale

    timing = np.repeat(np.repeat(timing_mask(matrix), m, axis=0), m, axis=1)[..., None]
    inner = np.where(timing, st.timing_inner, inner)
    outer = np.where(timing, st.timing_outer, outer)

    weight = dot_weight(module_radius(size, m)[..., None], inner, outer)

    # Dark target: scale the photo colour down to the target luminance, which
    # keeps the hue instead of flattening everything to black.
    dark_target = np.clip(photo * (st.dark_luma / np.maximum(lum, 1e-3)), 0.0, 1.0)
    # Light target: lift toward white along the same hue.
    t = np.clip((st.light_luma - lum) / np.maximum(1.0 - lum, 1e-3), 0.0, 1.0)
    light_target = photo + t * (1.0 - photo)
    target = np.where(is_dark, dark_target, light_target)

    floor = np.where(is_dark, st.dark_floor, st.light_floor)
    alpha = weight * (floor + (1.0 - floor) * need) * focus_mask(size, st)
    alpha = np.where(timing, weight, alpha)      # timing runs are never eased

    out = photo * (1.0 - alpha) + target * alpha
    return np.where(is_func, photo, out)      # function zones are painted later


def rounded(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float],
            radius: float, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def paint_function_patterns(base: np.ndarray, photo: np.ndarray, matrix: np.ndarray,
                            version: int, st: Style) -> np.ndarray:
    """Draw finders and alignment patterns as crisp rounded shapes, 2x supersampled."""
    n = matrix.shape[0]
    m = st.module_px
    size = n * m
    ss = 2
    s = m * ss

    layer = Image.new("RGBA", (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    ink = st.ink + (255,)
    paper = st.paper + (255,)
    r_out, r_mid, r_in = st.finder_radius

    for ox, oy in finder_origins(n):
        # A soft paper plate across the finder + separator keeps detection easy.
        px, py = (ox - 1) * s, (oy - 1) * s
        rounded(d, (px, py, px + 9 * s, py + 9 * s), 2.9 * s, paper)
        fx, fy = ox * s, oy * s
        rounded(d, (fx, fy, fx + 7 * s, fy + 7 * s), r_out * s, ink)
        rounded(d, (fx + s, fy + s, fx + 6 * s, fy + 6 * s), r_mid * s, paper)
        rounded(d, (fx + 2 * s, fy + 2 * s, fx + 5 * s, fy + 5 * s), r_in * s, ink)

    ra_out, ra_mid, ra_in = st.align_radius
    for ox, oy in alignment_origins(version, n):
        ax, ay = ox * s, oy * s
        rounded(d, (ax, ay, ax + 5 * s, ay + 5 * s), ra_out * s, ink)
        rounded(d, (ax + s, ay + s, ax + 4 * s, ay + 4 * s), ra_mid * s, paper)
        rounded(d, (ax + 2 * s, ay + 2 * s, ax + 3 * s, ay + 3 * s), ra_in * s, ink)

    layer = layer.resize((size, size), Image.LANCZOS)
    over = np.asarray(layer, dtype=np.float32) / 255.0
    rgb, a = over[..., :3], over[..., 3:4]

    # Let a whisper of the photo through the paper plates so the shapes still
    # feel part of the picture rather than stickers on top of it.
    is_paper = (np.abs(rgb - np.array(st.paper, dtype=np.float32) / 255.0).sum(axis=2, keepdims=True) < 0.02)
    rgb = np.where(is_paper, rgb * (1 - st.plate_photo_tint) + photo * st.plate_photo_tint, rgb)

    return base * (1.0 - a) + rgb * a


def compose_tile(code: np.ndarray, st: Style) -> Image.Image:
    """Add the quiet zone and round the outer corners."""
    m = st.module_px
    pad = st.quiet_modules * m
    size = code.shape[0] + 2 * pad

    tile = Image.new("RGB", (size, size), st.paper)
    tile.paste(Image.fromarray((np.clip(code, 0, 1) * 255).astype(np.uint8)), (pad, pad))

    ss = 2
    mask = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * ss, size * ss), radius=st.corner_radius_modules * m * ss, fill=255
    )
    mask = mask.resize((size, size), Image.LANCZOS)

    out = Image.new("RGB", (size, size), st.paper)
    out.paste(tile, (0, 0), mask)
    return out


def save_png(img: Image.Image, path: Path, colors: int = 256) -> None:
    """Palette-optimise on the way out. The lattice already limits the palette,
    so 256 colours is visually lossless here and roughly a quarter the bytes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if colors:
        img = img.quantize(colors=colors, method=Image.MEDIANCUT,
                           dither=Image.Dither.FLOYDSTEINBERG)
    img.save(path, optimize=True)


def build(job: Job) -> tuple[Image.Image, np.ndarray, int]:
    matrix, version = qr_matrix(job.data)
    n = matrix.shape[0]
    st = job.style
    photo = grade(load_square_photo(job.photo, n * st.module_px, job.crop), st, st.module_px)
    code = render_code(photo, matrix, version, st)
    code = paint_function_patterns(code, photo, matrix, version, st)
    return compose_tile(code, st), matrix, version


# --------------------------------------------------------------------------- #
# presentation card
# --------------------------------------------------------------------------- #

FONT_DIRS = [
    Path("/mnt/skills/examples/canvas-design/canvas-fonts"),
    Path("/usr/share/fonts/truetype/liberation"),
    Path("/usr/share/fonts/truetype/dejavu"),
]


def font(names: list[str], size: int) -> ImageFont.FreeTypeFont:
    for name in names:
        for directory in FONT_DIRS:
            candidate = directory / name
            if candidate.exists():
                return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default(size)


def sans(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return font(
        ["Outfit-Bold.ttf", "InstrumentSans-Bold.ttf", "LiberationSans-Bold.ttf"] if bold
        else ["Outfit-Regular.ttf", "InstrumentSans-Regular.ttf", "LiberationSans-Regular.ttf"],
        size,
    )


def mono(size: int) -> ImageFont.FreeTypeFont:
    return font(["GeistMono-Regular.ttf", "JetBrainsMono-Regular.ttf", "LiberationMono-Regular.ttf"], size)


def tracked(draw: ImageDraw.ImageDraw, xy, text: str, f, fill, tracking: float,
            anchor_centre: bool = True) -> None:
    """Draw letter-spaced text (Pillow has no tracking of its own)."""
    widths = [draw.textlength(ch, font=f) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x, y = xy
    if anchor_centre:
        x -= total / 2
    for ch, w in zip(text, widths):
        draw.text((x, y), ch, font=f, fill=fill)
        x += w + tracking


def make_card(tile: Image.Image, url: str, eyebrow: str, headline: str,
              caption: str, st: Style) -> Image.Image:
    """Lay the symbol out as a sheet you could print and pin to a wall."""
    W, H = 2200, 2860
    ink = st.ink
    muted = (104, 121, 141)
    accent = (79, 70, 229)          # brand indigo, matches the app's theme-color

    # Vertical wash, so the sheet reads as paper rather than a flat fill.
    wash = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    top = np.array([252, 253, 255], dtype=np.float32)
    bottom = np.array([231, 237, 246], dtype=np.float32)
    card = Image.fromarray((top + (bottom - top) * wash).astype(np.uint8).repeat(W, axis=1))

    qr_side = 1660
    pad = 44
    fw = qr_side + 2 * pad
    fx = (W - fw) // 2
    fy = 676
    # Concentric with the tile's own corner, so the frame reads as one object.
    tile_radius = st.corner_radius_modules * st.module_px * qr_side / tile.width
    frame_radius = tile_radius + pad

    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).rounded_rectangle(
        (fx + 8, fy + 30, fx + fw + 8, fy + fw + 42), radius=frame_radius, fill=88
    )
    card = Image.composite(
        Image.new("RGB", (W, H), (148, 164, 186)), card,
        shadow.filter(ImageFilter.GaussianBlur(36)),
    )

    d = ImageDraw.Draw(card)
    # The frame is the tile's own paper colour, so the quiet zone has no seam.
    d.rounded_rectangle((fx, fy, fx + fw, fy + fw), radius=frame_radius, fill=st.paper)
    card.paste(tile.resize((qr_side, qr_side), Image.LANCZOS), (fx + pad, fy + pad))

    tracked(d, (W / 2, 296), eyebrow, sans(44, bold=True), accent, tracking=13)
    d.text((W / 2, 392), headline, font=sans(112, bold=True), fill=ink, anchor="ma")
    d.text((W / 2, 540), caption, font=sans(52), fill=muted, anchor="ma")

    rule_y = fy + fw + 148
    d.line((W / 2 - 110, rule_y, W / 2 + 110, rule_y), fill=(203, 214, 228), width=4)
    d.text((W / 2, rule_y + 80), url, font=mono(50), fill=ink, anchor="ma")
    d.text((W / 2, rule_y + 170), "Point any camera at the picture",
           font=sans(42), fill=muted, anchor="ma")
    return card


# --------------------------------------------------------------------------- #
# verification
# --------------------------------------------------------------------------- #

def _decoders():
    """zxing-cpp is the primary judge; OpenCV's classic detector is a strict
    second opinion (it is markedly weaker on textured symbols)."""

    def zxing(img: Image.Image) -> bool:
        import zxingcpp

        try:
            hit = zxingcpp.read_barcode(img.convert("L"))
        except Exception:
            return False
        return bool(hit) and hit.text == VERIFY_TEXT[0]

    def opencv(img: Image.Image) -> bool:
        frame = cv2.cvtColor(np.asarray(img.convert("RGB")), cv2.COLOR_RGB2BGR)
        for det in (cv2.QRCodeDetector(), cv2.QRCodeDetectorAruco()):
            try:
                if det.detectAndDecode(frame)[0] == VERIFY_TEXT[0]:
                    return True
            except cv2.error:
                pass
        return False

    return [("zxing-cpp", zxing), ("opencv", opencv)]


VERIFY_TEXT = [""]


def simulate_capture(img: Image.Image, seed: int) -> Image.Image:
    """Approximate a phone photographing the code: tilt, uneven light, noise."""
    rng = np.random.default_rng(seed)
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w = a.shape[:2]

    jitter = 0.10 * min(h, w)
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = src + rng.uniform(-jitter, jitter, src.shape).astype(np.float32)
    dst -= dst.min(axis=0)
    out_w, out_h = int(dst[:, 0].max()), int(dst[:, 1].max())
    warped = cv2.warpPerspective(
        a, cv2.getPerspectiveTransform(src, dst), (out_w, out_h),
        borderMode=cv2.BORDER_CONSTANT, borderValue=(250, 251, 253),
    )

    # Uneven lighting: a soft diagonal gradient plus a bright corner.
    gy, gx = np.mgrid[0:out_h, 0:out_w].astype(np.float32)
    shade = 0.78 + 0.34 * (gx / out_w) * 0.6 + 0.26 * (1.0 - gy / out_h)
    warped *= shade[..., None]
    warped += rng.normal(0, 4.0, warped.shape)                       # sensor noise
    return Image.fromarray(np.clip(warped, 0, 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(0.7)
    )


def capture_cases(src: Image.Image) -> list[tuple[str, Image.Image]]:
    """The symbol as a scanner is likely to meet it, from poster to thumbnail."""
    cases: list[tuple[str, Image.Image]] = []
    for px in (1400, 1100, 900, 700, 560, 440, 340, 280, 220):
        small = src.resize((px, px), Image.LANCZOS)
        buf = io.BytesIO()
        small.convert("RGB").save(buf, "JPEG", quality=55)
        buf.seek(0)
        cases += [
            (f"{px}px", small),
            (f"{px}px blur", small.filter(ImageFilter.GaussianBlur(1.1))),
            (f"{px}px rot11", small.rotate(11, resample=Image.BICUBIC, expand=True,
                                           fillcolor=(250, 251, 253))),
            (f"{px}px jpeg55", Image.open(buf)),
            (f"{px}px camera", simulate_capture(small, seed=px)),
        ]
    return cases


def verify(path: Path, expected: str, strict: bool = True) -> bool:
    """Decode the rendered file across the conditions a scanner has to survive."""
    VERIFY_TEXT[0] = expected
    src = Image.open(path).convert("RGB")
    cases = capture_cases(src)
    decoders = _decoders()

    tally = {name: 0 for name, _ in decoders}
    missed: dict[str, list[str]] = {name: [] for name, _ in decoders}
    for case_name, image in cases:
        for name, fn in decoders:
            if fn(image):
                tally[name] += 1
            else:
                missed[name].append(case_name)

    total = len(cases)
    for name, _ in decoders:
        print(f"  {name:10s} {tally[name]:2d}/{total}")
        if missed[name]:
            print(f"             missed: {', '.join(missed[name])}")
    return tally["zxing-cpp"] == total if strict else True


# --------------------------------------------------------------------------- #

DEFAULT_URL = "https://react-node-url-mdata-fetch-dotanv.netlify.app/"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default=DEFAULT_URL)
    ap.add_argument("--photo", type=Path, default=HERE / "source" / "portrait.jpg")
    ap.add_argument("--out", type=Path, default=HERE / "premium-qr.png")
    ap.add_argument("--card", type=Path, default=HERE / "premium-qr-card.png")
    ap.add_argument("--crop", default="0.5205,0.345,0.840", help="cx,cy,side as fractions")
    ap.add_argument("--eyebrow", default="URL METADATA FETCHER")
    ap.add_argument("--headline", default="Scan to open the live app")
    ap.add_argument("--caption", default="Inspect, preview and audit the metadata behind any URL")
    ap.add_argument("--colors", type=int, default=256,
                    help="palette size for the saved PNGs; 0 keeps full colour")
    ap.add_argument("--no-card", action="store_true")
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()

    if not args.verify_only:
        cx, cy, side = (float(v) for v in args.crop.split(","))
        job = Job(data=args.data, photo=args.photo, crop=(cx, cy, side))
        tile, matrix, version = build(job)
        save_png(tile, args.out, args.colors)
        print(f"wrote {args.out}  ({tile.width}x{tile.height}, version {version}, "
              f"{matrix.shape[0]} modules, ECC H)")
        if not args.no_card:
            card = make_card(tile, args.data, args.eyebrow, args.headline, args.caption, job.style)
            save_png(card, args.card, args.colors)
            print(f"wrote {args.card}  ({card.width}x{card.height})")

    print(f"verifying {args.out}")
    ok = verify(args.out, args.data)
    if not args.no_card and args.card.exists():
        print(f"verifying {args.card}")
        ok = verify(args.card, args.data) and ok
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
