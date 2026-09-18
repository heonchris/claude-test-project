/* 경고 문구와 '할 일 안내' 짝이 맞는지 검사합니다. (브라우저 없이 돕니다)
 *
 *   node tests/warnings.js
 *
 * engine2.js 가 새 경고를 추가했는데 app_logic.js 의 WARN_RULES 에 짝이 없으면
 * 사용자는 "무엇을 바꿔야 하는지" 안내를 못 받게 됩니다. 그걸 막는 검사입니다.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..');
const engine = fs.readFileSync(path.join(dir, 'engine2.js'), 'utf8');
const logic = fs.readFileSync(path.join(dir, 'app_logic.js'), 'utf8');

// engine2.js 에서 warnings.push(...) 로 내보내는 문구를 모읍니다
const templates = [];
for (const m of engine.matchAll(/warnings\.push\(\s*([`'"])([\s\S]*?)\1\s*\)/g)) {
  const text = m[2];
  const prefix = text.split('${')[0].trim();       // ${...} 앞의 고정된 부분
  if (prefix && !prefix.startsWith('(옆면)')) templates.push({ text, prefix });
}
// 촬영 품질 검사에서 올라오는 문구도 그대로 경고로 나갑니다
for (const m of engine.matchAll(/text:\s*'([^']+)'/g)) {
  templates.push({ text: m[1], prefix: m[1] });
}

// app_logic.js 의 WARN_RULES 에서 짝 맞추기용 조각을 읽습니다
const rules = [...logic.matchAll(/\['([^']+)',\s*'(top|side|photo)',\s*\[([^\]]*)\]\]/g)]
  .map(m => ({ needle: m[1], where: m[2], fixes: m[3] }));

// FIX 에 실제로 있는 열쇠인지도 확인합니다
const fixKeys = new Set([...logic.matchAll(/^\s{2}(\w+):\s*'/gm)].map(m => m[1]));

let bad = 0;
console.log(`경고 문구 ${templates.length}개 · 안내 규칙 ${rules.length}개\n`);
for (const t of templates) {
  if (t.text.startsWith('[LOW_CONFIDENCE]')) continue;      // 따로 처리합니다
  const hit = rules.find(r => t.prefix.includes(r.needle));
  if (!hit) {
    console.log(`✕ 짝이 없는 경고: "${t.prefix.slice(0, 40)}…"`);
    bad++;
  }
}
for (const r of rules) {
  for (const f of r.fixes.split(',').map(x => x.trim().replace(/'/g, '')).filter(Boolean)) {
    if (!fixKeys.has(f)) { console.log(`✕ FIX 에 없는 열쇠: ${f} (규칙 "${r.needle}")`); bad++; }
  }
  if (!templates.some(t => t.prefix.includes(r.needle))) {
    console.log(`! 안 쓰이는 규칙: "${r.needle}" — 엔진이 더 이상 이 경고를 내지 않습니다`);
  }
}
console.log(bad ? `\n✕ ${bad}건 문제` : '\n✓ 모든 경고에 «이렇게 바꿔 보세요» 안내가 붙습니다');
process.exit(bad ? 1 : 0);
