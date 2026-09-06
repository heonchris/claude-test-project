# -*- coding: utf-8 -*-
"""
출력 A: 라이트룸용 XMP 사이드카
===============================
원본 파일은 절대 건드리지 않습니다. 사진 옆에 .xmp 파일만 새로 만듭니다.

기록하는 값
  xmp:Rating  별점 (3 = 그룹대표, 1 = 보류, 0 = 탈락)
  xmp:Label   탈락 컷에만 "Reject"
  dc:subject  태그를 키워드로 (AI_눈감음, AI_초점흐림 ...)  ← 라이트룸에서 필터하기 편함
  pc:*        점수/그룹번호 (전용 네임스페이스. 라이트룸은 무시하지만 값은 보존됩니다)

주의: 기존 캐션(dc:description)이나 다른 메타데이터는 건드리지 않습니다.
이미 .xmp가 있으면 기본적으로 '건너뜁니다'. 덮어쓰려면 --overwrite-xmp 옵션을 쓰세요.
"""

import os
from xml.sax.saxutils import escape

from . import config

XMP_TEMPLATE = """<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="portrait-culler">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:xmp="http://ns.adobe.com/xap/1.0/"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:pc="http://ns.portrait-culler/1.0/"
    xmp:Rating="{rating}"{label_attr}
    pc:Score="{score}"
    pc:Group="{group}"
    pc:Verdict="{verdict}">{subject}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
"""

SUBJECT_TEMPLATE = """
   <dc:subject>
    <rdf:Bag>
{items}
    </rdf:Bag>
   </dc:subject>"""


def sidecar_path(photo_path, taken=None):
    """
    사이드카 경로를 정합니다.
    기본은 '확장자만 .xmp로 바꾼 이름'(라이트룸 표준)입니다.
    같은 이름의 RAW+JPEG가 한 폴더에 있으면 충돌하므로, 그때는
    '원본이름.전체확장자.xmp' 형태로 피합니다.
    """
    base, ext = os.path.splitext(photo_path)
    primary = base + ".xmp"
    if taken is not None and primary in taken:
        return photo_path + ".xmp"
    return primary


def build_xmp(rec):
    tags = rec.get("tags", [])
    subject = ""
    if config.XMP_WRITE_KEYWORDS and tags:
        items = "\n".join(
            "     <rdf:li>%s</rdf:li>" % escape(config.XMP_KEYWORD_PREFIX + t)
            for t in tags
        )
        subject = SUBJECT_TEMPLATE.format(items=items)

    label_attr = ""
    if rec.get("rejected") and config.REJECT_LABEL:
        label_attr = '\n    xmp:Label="%s"' % escape(config.REJECT_LABEL)

    return XMP_TEMPLATE.format(
        rating=rec.get("rating", 0),
        label_attr=label_attr,
        score=rec.get("score", 0),
        group=rec.get("group", 0),
        verdict=escape(str(rec.get("verdict", ""))),
        subject=subject,
    )


def write_sidecars(records, overwrite=False, dry_run=False):
    """
    모든 사진에 대해 사이드카를 만듭니다.
    반환: {"written": n, "skipped": n, "failed": n, "errors": [...]}
    """
    stats = {"written": 0, "skipped": 0, "failed": 0, "errors": []}
    taken = set()
    for rec in records:
        if not rec.get("ok"):
            stats["skipped"] += 1
            continue
        path = rec["path"]
        out = sidecar_path(path, taken)
        taken.add(out)
        rec["xmp"] = out
        if os.path.exists(out) and not overwrite:
            stats["skipped"] += 1
            rec["xmp_status"] = "이미 있어 건너뜀"
            continue
        if dry_run:
            stats["written"] += 1
            rec["xmp_status"] = "생성 예정(dry-run)"
            continue
        try:
            with open(out, "w", encoding="utf-8") as f:
                f.write(build_xmp(rec))
            stats["written"] += 1
            rec["xmp_status"] = "생성"
        except Exception as e:
            stats["failed"] += 1
            stats["errors"].append("%s: %s" % (os.path.basename(path), e))
            rec["xmp_status"] = "실패"
    return stats


def make_rating_links(records, out_dir):
    """
    (선택 기능) 별점별로 심볼릭 링크 폴더를 만듭니다. --links 옵션.
    원본을 복사하거나 옮기지 않고 '바로가기'만 만들기 때문에 안전합니다.
    JPEG로 촬영해 라이트룸 사이드카를 못 쓰는 경우 파인더에서 훑어보기 좋습니다.
    """
    made = 0
    for rec in records:
        if not rec.get("ok"):
            continue
        rating = rec.get("rating", 0)
        sub = {3: "3star_대표", 1: "1star_보류", 0: "0star_탈락", -1: "0star_탈락"}.get(rating, "기타")
        d = os.path.join(out_dir, "links", sub)
        os.makedirs(d, exist_ok=True)
        link = os.path.join(d, rec["name"])
        try:
            if os.path.islink(link) or os.path.exists(link):
                os.unlink(link)
            os.symlink(rec["path"], link)
            made += 1
        except Exception:
            pass
    return made
