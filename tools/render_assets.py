#!/usr/bin/env python3
"""
앱 아이콘 / 스플래시 / 고양이 미리보기 PNG를 만든다.

고양이 도형은 components/Cat.tsx와 같은 좌표를 쓴다.
**원본은 언제나 Cat.tsx다.** Cat.tsx에서 모양을 고쳤으면 여기도 같이 고친 뒤
python3 tools/render_assets.py 로 다시 뽑으면 된다.

필요한 것: headless chromium (이 저장소 밖의 도구)
"""

import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

BODY = "#141312"
EYE = "#FFFFFF"
BG = "#FBF7F0"

CHROME_CANDIDATES = [
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium/chrome-linux/chrome",
    shutil.which("chromium") or "",
    shutil.which("google-chrome") or "",
]


def paw(x, y, r=6.5, up=True, fill=BODY):
    dy = -r * 0.55 if up else r * 0.55
    toe = r * 0.45
    return (
        f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'
        f'<circle cx="{x - r * 0.62}" cy="{y + dy}" r="{toe}" fill="{fill}"/>'
        f'<circle cx="{x}" cy="{y + dy * 1.25}" r="{toe}" fill="{fill}"/>'
        f'<circle cx="{x + r * 0.62}" cy="{y + dy}" r="{toe}" fill="{fill}"/>'
    )


def claws(x, y, length=22, fill=BODY):
    out = []
    for dx in (-5.5, -1.8, 1.8, 5.5):
        out.append(
            f'<line x1="{x + dx}" y1="{y - 7}" x2="{x + dx * 1.55}" y2="{y - 7 - length}" '
            f'stroke="{fill}" stroke-width="1.4" stroke-linecap="round"/>'
        )
    return "".join(out)


def eyes(pairs, r, pupil, fill=BODY, white=EYE):
    out = []
    for cx, cy in pairs:
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{white}"/>')
        out.append(f'<circle cx="{cx}" cy="{cy}" r="{pupil}" fill="{fill}"/>')
    return "".join(out)


def sitting(fill=BODY, white=EYE, top=False, startled=False):
    tail = (
        "M78 124 C 104 126, 117 108, 107 84 L 100 88 C 108 108, 99 118, 76 118 Z"
        if top
        else "M78 130 C 103 134, 117 122, 111 98 L 104 101 C 108 118, 98 126, 76 124 Z"
    )
    r = 11.5 if startled else 9.8
    pupil = 7 if startled else 4.8
    return (
        f'<path d="{tail}" fill="{fill}"/>'
        f'<ellipse cx="60" cy="100" rx="23" ry="38" fill="{fill}"/>'
        f'<path d="M50 114 L 50 138" stroke="{fill}" stroke-width="12" stroke-linecap="round" fill="none"/>'
        f'<path d="M70 114 L 70 138" stroke="{fill}" stroke-width="12" stroke-linecap="round" fill="none"/>'
        + paw(50, 140, 7, False, fill)
        + paw(70, 140, 7, False, fill)
        + f'<polygon points="40,36 31,8 58,28" fill="{fill}"/>'
        + f'<polygon points="64,28 90,8 82,40" fill="{fill}"/>'
        + f'<ellipse cx="60" cy="48" rx="25" ry="22" fill="{fill}"/>'
        + eyes([(49, 47), (71, 47)], r, pupil, fill, white)
    )


def climbing(fill=BODY, white=EYE):
    return (
        claws(24, 32, 17, fill)
        + claws(94, 28, 20, fill)
        + f'<path d="M42 120 C 26 126, 12 138, 12 152 L 19 152 C 19 140, 30 130, 45 127 Z" fill="{fill}"/>'
        + f'<g transform="rotate(-6 58 110)"><ellipse cx="58" cy="110" rx="21" ry="38" fill="{fill}"/></g>'
        + f'<path d="M46 86 C 36 68, 28 48, 24 34" stroke="{fill}" stroke-width="9" stroke-linecap="round" fill="none"/>'
        + f'<path d="M70 82 C 82 64, 90 44, 94 30" stroke="{fill}" stroke-width="9" stroke-linecap="round" fill="none"/>'
        + paw(24, 32, 6.5, True, fill)
        + paw(94, 28, 6.5, True, fill)
        + paw(47, 143, 7.5, False, fill)
        + paw(68, 140, 7.5, False, fill)
        + f'<polygon points="36,46 30,20 54,38" fill="{fill}"/>'
        + f'<polygon points="64,38 84,18 78,50" fill="{fill}"/>'
        + f'<ellipse cx="58" cy="58" rx="24" ry="21" fill="{fill}"/>'
        + eyes([(48, 57.5), (68, 55.5)], 9.2, 4.4, fill, white)
    )


def napping(fill=BODY, white=EYE):
    return (
        f'<path d="M96 124 C 112 120, 119 131, 112 146 L 105 141 C 110 132, 106 128, 94 130 Z" fill="{fill}"/>'
        f'<ellipse cx="66" cy="122" rx="40" ry="19" fill="{fill}"/>'
        + paw(44, 137, 6.5, False, fill)
        + paw(62, 139, 6.5, False, fill)
        + f'<polygon points="20,104 12,82 34,98" fill="{fill}"/>'
        + f'<polygon points="36,98 54,82 50,108" fill="{fill}"/>'
        + f'<ellipse cx="33" cy="112" rx="21" ry="19" fill="{fill}"/>'
        + f'<line x1="22" y1="113" x2="31" y2="113" stroke="{white}" stroke-width="2.6" stroke-linecap="round"/>'
        + f'<line x1="38" y1="111" x2="47" y2="111" stroke="{white}" stroke-width="2.6" stroke-linecap="round"/>'
    )


POSES = {
    "napping": napping,
    "awake": lambda **k: sitting(**k),
    "climbing": climbing,
    "top": lambda **k: sitting(top=True, **k),
    "startled": lambda **k: sitting(startled=True, **k),
}


def svg(body, width, height, scale=1.0, dx=0, dy=0):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 120 150">'
        f'<g transform="translate({dx} {dy}) scale({scale})">{body}</g></svg>'
    )


def chrome_bin():
    for c in CHROME_CANDIDATES:
        if c and pathlib.Path(c).exists():
            return c
    raise SystemExit("chromium을 찾지 못했습니다. CHROME_CANDIDATES를 확인하세요.")


def shoot(html, out_path, width, height, transparent):
    with tempfile.TemporaryDirectory() as tmp:
        page = pathlib.Path(tmp) / "page.html"
        page.write_text(html, encoding="utf-8")
        shot = pathlib.Path(tmp) / "shot.png"
        cmd = [
            chrome_bin(),
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--hide-scrollbars",
            f"--window-size={width},{height}",
            f"--screenshot={shot}",
        ]
        if transparent:
            cmd.append("--default-background-color=00000000")
        cmd.append(page.as_uri())
        subprocess.run(cmd, check=True, capture_output=True)
        shutil.copy(shot, out_path)
    print(f"  {out_path.relative_to(ROOT)}  ({width}x{height})")


def page(inner, width, height, background):
    bg = f"background:{background};" if background else ""
    return (
        "<!doctype html><meta charset='utf-8'>"
        "<style>html,body{margin:0;padding:0;}"
        f"body{{width:{width}px;height:{height}px;{bg}"
        "display:flex;align-items:center;justify-content:center;overflow:hidden;}}"
        "</style>"
        f"<body>{inner}</body>"
    )


def icon(size, background, fill=BODY, white=EYE, cat_ratio=0.62):
    cat_h = int(size * cat_ratio)
    cat_w = int(cat_h * 120 / 150)
    inner = svg(POSES["awake"](fill=fill, white=white), cat_w, cat_h)
    return page(inner, size, size, background)


def main():
    ASSETS.mkdir(exist_ok=True)
    print("아이콘 만드는 중…")
    shoot(icon(1024, BG, cat_ratio=0.78), ASSETS / "icon.png", 1024, 1024, False)
    shoot(icon(1024, None, cat_ratio=0.58), ASSETS / "android-icon-foreground.png", 1024, 1024, True)
    shoot(page("", 1024, 1024, BG), ASSETS / "android-icon-background.png", 1024, 1024, False)
    shoot(
        icon(1024, None, fill="#FFFFFF", white="#000000", cat_ratio=0.58),
        ASSETS / "android-icon-monochrome.png",
        1024,
        1024,
        True,
    )
    shoot(icon(512, None, cat_ratio=0.8), ASSETS / "splash-icon.png", 512, 512, True)
    shoot(icon(48, BG, cat_ratio=0.8), ASSETS / "favicon.png", 48, 48, False)

    print("고양이 미리보기 만드는 중…")
    cells = []
    for name, fn in POSES.items():
        cells.append(
            "<div style=\"display:flex;flex-direction:column;align-items:center;gap:8px;\">"
            f"<div style=\"background:#fff;border-radius:20px;padding:8px;\">{svg(fn(), 160, 200)}</div>"
            f"<div style=\"font:13px -apple-system,sans-serif;color:#9A9088;\">{name}</div>"
            "</div>"
        )
    inner = (
        "<div style=\"display:flex;gap:20px;align-items:flex-end;\">" + "".join(cells) + "</div>"
    )
    shoot(page(inner, 1080, 300, BG), ROOT / "tools" / "cat-preview.png", 1080, 300, False)
    print("끝!")


if __name__ == "__main__":
    main()
