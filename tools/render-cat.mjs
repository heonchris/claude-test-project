/**
 * 고양이 미리보기와 앱 아이콘을 PNG로 뽑는다.
 *
 *   node --experimental-strip-types tools/render-cat.mjs
 *
 * 그림은 lib/catArt.ts 하나에서만 정의된다. 이 파일은 그걸 불러다 그릴 뿐이라
 * 앱에 보이는 모습과 미리보기가 어긋날 수 없다.
 *
 * 필요한 것: headless chromium (저장소 밖의 도구)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ALL_POSES, CAT_ASPECT, catSvg } from '../lib/catArt.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

const BG = '#FBF7F0';
const CARD = '#FFFFFF';
const SUB = '#9A9088';

const CHROME_CANDIDATES = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

function chromeBin() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      'chromium을 찾지 못했습니다. tools/render-cat.mjs의 CHROME_CANDIDATES에 경로를 추가하세요.'
    );
  }
  return found;
}

function page(inner, width, height, background) {
  return (
    "<!doctype html><meta charset='utf-8'><style>" +
    'html,body{margin:0;padding:0}' +
    `body{width:${width}px;height:${height}px;${background ? `background:${background};` : ''}` +
    'display:flex;align-items:center;justify-content:center;overflow:hidden;' +
    "font:13px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#3D3733}" +
    `</style><body>${inner}</body>`
  );
}

function shoot(html, outPath, width, height, transparent) {
  const dir = mkdtempSync(join(tmpdir(), 'cat-'));
  try {
    const pageFile = join(dir, 'page.html');
    writeFileSync(pageFile, html, 'utf8');
    const shot = join(dir, 'shot.png');
    const args = [
      '--headless',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      `--screenshot=${shot}`,
    ];
    if (transparent) args.push('--default-background-color=00000000');
    args.push(pathToFileURL(pageFile).href);
    execFileSync(chromeBin(), args, { stdio: 'pipe' });
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, readFileSync(shot));
    console.log(`  ${outPath.replace(ROOT + '/', '')}  (${width}x${height})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------ 아이콘 ------------------------------ */

function iconPage(size, background, palette, ratio) {
  const catHeight = Math.round(size * ratio);
  const catWidth = Math.round(catHeight / CAT_ASPECT);
  const svg = catSvg({ pose: 'awake', beat: 0, blink: false }, {
    width: catWidth,
    height: catHeight,
    palette,
  });
  return page(svg, size, size, background);
}

const DARK = { body: '#141312', eye: '#FFFFFF', prop: '#EFE7DC', water: '#7FB6E8' };
const MONO = { body: '#FFFFFF', eye: '#000000', prop: '#FFFFFF', water: '#FFFFFF' };

function renderIcons() {
  console.log('아이콘 만드는 중…');
  shoot(iconPage(1024, BG, DARK, 0.78), join(ASSETS, 'icon.png'), 1024, 1024, false);
  shoot(
    iconPage(1024, null, DARK, 0.58),
    join(ASSETS, 'android-icon-foreground.png'),
    1024,
    1024,
    true
  );
  shoot(page('', 1024, 1024, BG), join(ASSETS, 'android-icon-background.png'), 1024, 1024, false);
  shoot(
    iconPage(1024, null, MONO, 0.58),
    join(ASSETS, 'android-icon-monochrome.png'),
    1024,
    1024,
    true
  );
  shoot(iconPage(512, null, DARK, 0.8), join(ASSETS, 'splash-icon.png'), 512, 512, true);
  shoot(iconPage(48, BG, DARK, 0.8), join(ASSETS, 'favicon.png'), 48, 48, false);
}

/* ----------------------------- 미리보기 ----------------------------- */

function cell(label, svg) {
  return (
    '<div style="display:flex;flex-direction:column;align-items:center;gap:6px">' +
    `<div style="background:${CARD};border-radius:18px;padding:6px">${svg}</div>` +
    `<div style="color:${SUB};font-size:12px">${label}</div>` +
    '</div>'
  );
}

/** 자세별로 두 프레임을 나란히. "이 꼬리가 낫다"를 눈으로 고를 수 있게. */
function renderFrames() {
  console.log('프레임 미리보기 만드는 중…');
  const rows = ALL_POSES.map((pose) => {
    const frames = [0, 1].map((beat) =>
      cell(`${pose} ${beat + 1}`, catSvg({ pose, beat, blink: false }, { width: 118 }))
    );
    const blink = cell(
      `${pose} 눈감음`,
      catSvg({ pose, beat: 0, blink: true }, { width: 118 })
    );
    return (
      '<div style="display:flex;gap:14px;align-items:flex-end;margin-bottom:10px">' +
      frames.join('') +
      blink +
      '</div>'
    );
  });

  const columns = [rows.slice(0, 5).join(''), rows.slice(5).join('')];
  const inner =
    '<div style="display:flex;gap:28px;align-items:flex-start;padding:16px">' +
    columns.map((c) => `<div>${c}</div>`).join('') +
    '</div>';

  shoot(page(inner, 1180, 1180, BG), join(ROOT, 'tools', 'cat-frames.png'), 1180, 1180, false);
}

/* -------------------------------------------------------------------- */

renderIcons();
renderFrames();
console.log('끝!');
