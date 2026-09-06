# -*- coding: utf-8 -*-
"""
출력 B: HTML 리포트
===================
브라우저로 열어 그룹별로 썸네일을 나란히 놓고 비교하는 페이지입니다.
- 그룹대표는 굵은 테두리로 강조
- 각 사진에 점수 / 태그 / 파일명 표시
- 사진을 클릭하면 크게 보면서 모든 측정 수치를 확인할 수 있습니다
- 상단 버튼으로 '대표만', '탈락만', '눈감음' 등 걸러 보기 가능
"""

import datetime as _dt
import html
import json

from . import config

PAGE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>인물 사진 1차 셀렉 리포트</title>
<style>
  :root {
    --bg: #f6f6f4; --card: #ffffff; --ink: #1d1d1f; --muted: #6e6e73;
    --line: #e3e3e0; --rep: #1a7f5a; --reject: #c0392b; --warn: #b7791f;
    --accent: #2f6fd0;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo",
                      "Noto Sans KR", "Malgun Gothic", sans-serif; }
  header { position:sticky; top:0; z-index:20; background:rgba(246,246,244,.96);
           backdrop-filter: blur(8px); border-bottom:1px solid var(--line); padding:14px 20px; }
  h1 { margin:0 0 6px; font-size:17px; letter-spacing:-.01em; }
  .meta { font-size:12.5px; color:var(--muted); line-height:1.7; }
  .meta b { color:var(--ink); font-weight:600; }
  .bar { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; align-items:center; }
  button.f { font:inherit; font-size:12.5px; padding:5px 11px; border-radius:999px;
             border:1px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; }
  button.f:hover { border-color:#c8c8c4; }
  button.f.on { background:var(--ink); color:#fff; border-color:var(--ink); }
  .sep { width:1px; height:20px; background:var(--line); margin:0 6px; }
  main { padding:16px 20px 60px; }
  .group { background:var(--card); border:1px solid var(--line); border-radius:12px;
           padding:12px 14px 14px; margin-bottom:14px; }
  .ghead { font-size:13px; color:var(--muted); margin-bottom:10px; display:flex;
           gap:10px; align-items:baseline; flex-wrap:wrap; }
  .ghead b { color:var(--ink); font-size:14px; }
  .row { display:flex; flex-wrap:wrap; gap:12px; }
  .card { width:210px; border-radius:10px; overflow:hidden; background:#fff;
          border:2px solid transparent; outline:1px solid var(--line); cursor:pointer; }
  .card:hover { outline-color:#bdbdb8; }
  .card.rep { border-color:var(--rep); outline-color:var(--rep); }
  .card.reject { opacity:.62; }
  .thumb { width:100%; height:210px; object-fit:contain; display:block; background:#efefec; }
  .nothumb { width:100%; height:210px; background:#efefec; color:#9a9a95; font-size:12px;
             display:flex; align-items:center; justify-content:center; }
  .cbody { padding:7px 9px 9px; }
  .fname { font-size:11.5px; color:var(--muted); word-break:break-all; line-height:1.35; }
  .srow { display:flex; align-items:center; gap:6px; margin:3px 0 5px; }
  .score { font-size:15px; font-weight:700; }
  .stars { font-size:12px; color:var(--warn); letter-spacing:1px; }
  .chips { display:flex; flex-wrap:wrap; gap:3px; }
  .chip { font-size:10.5px; padding:2px 6px; border-radius:5px; background:#f0f0ee; color:var(--muted); }
  .chip.rep { background:#e3f4ec; color:var(--rep); font-weight:600; }
  .chip.bad { background:#fbe9e7; color:var(--reject); font-weight:600; }
  .chip.warn { background:#fdf3e0; color:var(--warn); }
  .empty { color:var(--muted); font-size:13px; padding:30px 0; text-align:center; }
  /* 크게 보기 */
  .lb { position:fixed; inset:0; background:rgba(20,20,20,.92); display:none;
        z-index:50; padding:24px; }
  .lb.show { display:flex; gap:20px; align-items:flex-start; }
  .lb img { max-width:70vw; max-height:90vh; object-fit:contain; border-radius:6px; }
  .lb .info { color:#eee; font-size:12.5px; max-width:340px; overflow:auto; max-height:90vh; }
  .lb .info h3 { margin:0 0 10px; font-size:14px; word-break:break-all; }
  .lb table { border-collapse:collapse; width:100%; }
  .lb td { padding:3px 8px 3px 0; vertical-align:top; border-bottom:1px solid #333; }
  .lb td:first-child { color:#9a9a9a; white-space:nowrap; }
  .lb .close { position:absolute; top:14px; right:20px; color:#ddd; font-size:26px; cursor:pointer; }
</style>
</head>
<body>
<header>
  <h1>인물 사진 1차 셀렉 리포트</h1>
  <div class="meta">
    <b>__FOLDER__</b><br>
    사진 <b>__TOTAL__</b>장 · 그룹 <b>__GROUPS__</b>개 · 그룹대표 <b>__REPS__</b>장 ·
    탈락 <b>__REJECTS__</b>장 · 얼굴없음 <b>__NOFACE__</b>장 · 분석실패 <b>__ERRORS__</b>장<br>
    생성 __NOW__ · 임계값: 얼굴선명도 탈락 &lt; __SHARP__ , EAR &lt; __EAR__ , 깜빡임 &gt; __BLINK__ ,
    연사간격 __GAP__초 , 유사도 __PHASH__
  </div>
  <div class="bar">
    <button class="f on" data-f="all">전체</button>
    <button class="f" data-f="rep">그룹대표만</button>
    <button class="f" data-f="keep">살아남은 컷</button>
    <button class="f" data-f="reject">탈락만</button>
    <button class="f" data-f="eyes">눈감음</button>
    <button class="f" data-f="blur">초점흐림</button>
    <button class="f" data-f="expo">노출주의</button>
    <button class="f" data-f="noface">얼굴없음</button>
    <span class="sep"></span>
    <button class="f on" data-s="group">그룹순</button>
    <button class="f" data-s="score">점수순</button>
    <span class="sep"></span>
    <span class="meta" id="count"></span>
  </div>
</header>
<main id="app"></main>
<div class="lb" id="lb"><span class="close" onclick="closeLb()">&times;</span></div>
<script>
const DATA = __DATA__;
let filter = "all", sortMode = "group";

function stars(n){ return n>0 ? "★".repeat(n) + "☆".repeat(Math.max(0,3-n)) : "☆☆☆"; }
function chipClass(t){
  if (t === "그룹대표") return "chip rep";
  if (t === "눈감음" || t === "초점흐림" || t === "분석실패") return "chip bad";
  if (t.indexOf("노출주의") === 0) return "chip warn";
  return "chip";
}
function match(p){
  if (filter === "all") return true;
  if (filter === "rep") return p.is_rep;
  if (filter === "keep") return !p.rejected;
  if (filter === "reject") return p.rejected;
  if (filter === "eyes") return p.tags.includes("눈감음");
  if (filter === "blur") return p.tags.includes("초점흐림");
  if (filter === "expo") return p.tags.some(t => t.indexOf("노출주의") === 0);
  if (filter === "noface") return p.tags.includes("얼굴없음");
  return true;
}
function card(p){
  const d = document.createElement("div");
  d.className = "card" + (p.is_rep ? " rep" : "") + (p.rejected ? " reject" : "");
  const chips = p.tags.map(t => `<span class="${chipClass(t)}">${t}</span>`).join("");
  const thumb = p.thumb
    ? `<img class="thumb" loading="lazy" src="${p.thumb}" alt="">`
    : `<div class="nothumb">미리보기 없음</div>`;
  d.innerHTML = `
    ${thumb}
    <div class="cbody">
      <div class="srow"><span class="score">${p.score}</span>
        <span class="stars">${stars(p.rating)}</span></div>
      <div class="chips">${chips}</div>
      <div class="fname" title="${p.path}">${p.name}</div>
    </div>`;
  d.onclick = () => openLb(p);
  return d;
}
function render(){
  const app = document.getElementById("app");
  app.innerHTML = "";
  let shown = 0;
  if (sortMode === "score"){
    const list = DATA.photos.filter(match).sort((a,b) => b.score - a.score);
    shown = list.length;
    const box = document.createElement("div");
    box.className = "group";
    box.innerHTML = '<div class="ghead"><b>점수 높은 순</b><span>' + shown + '장</span></div>';
    const row = document.createElement("div"); row.className = "row";
    list.forEach(p => row.appendChild(card(p)));
    box.appendChild(row); app.appendChild(box);
  } else {
    DATA.groups.forEach(g => {
      const list = g.items.filter(match);
      if (!list.length) return;
      shown += list.length;
      const box = document.createElement("div");
      box.className = "group";
      box.innerHTML = '<div class="ghead"><b>그룹 ' + g.id + '</b><span>' + g.items.length +
                      '장</span><span>' + (g.time || "") + '</span></div>';
      const row = document.createElement("div"); row.className = "row";
      list.forEach(p => row.appendChild(card(p)));
      box.appendChild(row); app.appendChild(box);
    });
  }
  if (!shown) app.innerHTML = '<div class="empty">해당하는 사진이 없습니다.</div>';
  document.getElementById("count").textContent = shown + "장 표시 중";
}
function openLb(p){
  const lb = document.getElementById("lb");
  const rows = [
    ["점수", p.score + " (" + p.verdict + ", 별 " + p.rating + ")"],
    ["그룹", p.group + (p.is_rep ? " · 대표" : "")],
    ["얼굴", p.faces + "개" + (p.face_ratio ? " · 화면대비 " + (p.face_ratio*100).toFixed(1) + "%" : "")],
    ["얼굴 선명도", p.face_sharp === null ? "-" : p.face_sharp],
    ["전체 선명도", p.frame_sharp === null ? "-" : p.frame_sharp],
    ["얼굴 대비", p.face_contrast === null ? "-" : p.face_contrast],
    ["눈 상태", p.eye_kr + (p.eye_skip_reason ? " (" + p.eye_skip_reason + ")" : "")],
    ["EAR 좌/우", (p.ear_left ?? "-") + " / " + (p.ear_right ?? "-")],
    ["깜빡임 좌/우", (p.blink_left ?? "-") + " / " + (p.blink_right ?? "-")],
    ["하이라이트 클리핑", ((p.clip_high||0)*100).toFixed(1) + "%"],
    ["암부 클리핑", ((p.clip_low||0)*100).toFixed(1) + "%"],
    ["얼굴 밝기", p.face_luma === null ? "-" : p.face_luma],
    ["촬영시각", p.time || "-"],
    ["이미지 출처", p.source_kr],
    ["탈락 사유", p.reject_reason || "-"],
    ["경로", p.path],
  ].map(r => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("");
  lb.innerHTML = '<span class="close" onclick="closeLb()">&times;</span>' +
    (p.thumb ? '<img src="' + p.thumb + '">' : '') +
    '<div class="info"><h3>' + p.name + '</h3><table>' + rows + '</table></div>';
  lb.classList.add("show");
}
function closeLb(){ document.getElementById("lb").classList.remove("show"); }
document.getElementById("lb").onclick = e => { if (e.target.id === "lb") closeLb(); };
document.addEventListener("keydown", e => { if (e.key === "Escape") closeLb(); });
document.querySelectorAll("button.f").forEach(b => {
  b.onclick = () => {
    const grp = b.dataset.f ? "f" : "s";
    document.querySelectorAll("button.f").forEach(o => {
      if ((o.dataset.f && grp === "f") || (o.dataset.s && grp === "s")) o.classList.remove("on");
    });
    b.classList.add("on");
    if (b.dataset.f) filter = b.dataset.f; else sortMode = b.dataset.s;
    render();
  };
});
render();
</script>
</body>
</html>
"""

SOURCE_KR = {
    "raw_preview": "RAW 내장 미리보기",
    "raw_halfsize": "RAW 축소 디코딩(미리보기 없음)",
    "image": "일반 이미지",
}
EYE_KR = {"open": "뜸", "closed": "감음", "unknown": "판정불가"}


def _photo_json(rec, thumb_prefix="thumbs/"):
    ts = rec.get("capture_ts")
    return {
        "name": rec.get("name", ""),
        "path": rec.get("path", ""),
        "thumb": (thumb_prefix + rec["thumb"]) if rec.get("thumb") else "",
        "score": rec.get("score", 0),
        "rating": rec.get("rating", 0),
        "verdict": rec.get("verdict", ""),
        "group": rec.get("group", 0),
        "is_rep": bool(rec.get("is_rep")),
        "rejected": bool(rec.get("rejected")),
        "tags": rec.get("tags", []),
        "faces": rec.get("faces", 0),
        "face_ratio": rec.get("face_ratio"),
        "face_sharp": rec.get("face_sharp"),
        "frame_sharp": rec.get("frame_sharp"),
        "face_contrast": rec.get("face_contrast"),
        "eye_kr": EYE_KR.get(rec.get("eye_state", "unknown"), "?"),
        "eye_skip_reason": rec.get("eye_skip_reason", ""),
        "ear_left": rec.get("ear_left"), "ear_right": rec.get("ear_right"),
        "blink_left": rec.get("blink_left"), "blink_right": rec.get("blink_right"),
        "clip_high": rec.get("clip_high"), "clip_low": rec.get("clip_low"),
        "face_luma": rec.get("face_luma"),
        "reject_reason": rec.get("reject_reason", ""),
        "source_kr": SOURCE_KR.get(rec.get("source", ""), rec.get("source", "-")),
        "time": _ts_str(ts),
    }


def _ts_str(ts):
    if not ts:
        return ""
    return _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")


def write_html(records, out_path, folder, groups=None):
    photos = [_photo_json(r) for r in records]

    gmap = {}
    for rec, pj in zip(records, photos):
        gmap.setdefault(rec.get("group", 0), []).append(pj)
    group_list = []
    for gid in sorted(gmap):
        items = sorted(gmap[gid], key=lambda p: (-p["score"], p["name"]))
        group_list.append({"id": gid, "items": items,
                           "time": next((i["time"] for i in items if i["time"]), "")})

    data = {"photos": photos, "groups": group_list}
    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")

    n_rep = sum(1 for r in records if r.get("is_rep"))
    n_rej = sum(1 for r in records if r.get("rejected") and r.get("ok"))
    n_noface = sum(1 for r in records if r.get("ok") and r.get("faces", 0) == 0)
    n_err = sum(1 for r in records if not r.get("ok"))

    page = (PAGE
            .replace("__DATA__", payload)
            .replace("__FOLDER__", html.escape(folder))
            .replace("__TOTAL__", str(len(records)))
            .replace("__GROUPS__", str(len(group_list)))
            .replace("__REPS__", str(n_rep))
            .replace("__REJECTS__", str(n_rej))
            .replace("__NOFACE__", str(n_noface))
            .replace("__ERRORS__", str(n_err))
            .replace("__NOW__", _dt.datetime.now().strftime("%Y-%m-%d %H:%M"))
            .replace("__SHARP__", str(config.SHARP_REJECT))
            .replace("__EAR__", str(config.EAR_CLOSED))
            .replace("__BLINK__", str(config.BLINK_CLOSED))
            .replace("__GAP__", str(config.BURST_GAP_SEC))
            .replace("__PHASH__", str(config.PHASH_MAX_DISTANCE)))

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(page)
    return out_path
