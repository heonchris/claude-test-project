# footscan engine — Phase 0 (파이썬 CV 파이프라인)

A4 용지를 기준자로 삼아, **사진만으로 발을 재는** 엔진입니다.
`SPEC.md` 의 Phase 0 을 그대로 구현했습니다. (앱은 아직 만들지 않았습니다)

```
사진 2장  →  A4 로 원근 펴기  →  발 분할  →  치수 측정  →  신발 사이즈
(위 / 옆)      1px = 0.1mm 고정
```

---

## 1. 설치와 실행

```bash
cd footscan/engine
pip install -r requirements.txt

# 1) 합성 테스트 사진 만들기 (실제 사진이 없어도 검증할 수 있습니다)
python tests/make_synthetic.py

# 2) 측정
python cli.py --top samples/right_top.jpg --side-img samples/right_side.jpg \
              --foot right --debug --out results/

# 3) 회귀 테스트 (SPEC 3-8 완료 조건 검사)
python tests/test_measure.py
```

측면 사진은 **선택**입니다. 빼면 사이즈만 나오고 아치·발등은 "미측정"으로 표시됩니다.

양발을 한 번에:

```bash
python cli.py --right-top samples/right_top.jpg --right-side samples/right_side.jpg \
              --left-top  samples/left_top.jpg  --left-side  samples/left_side.jpg \
              --debug --out results/
```

---

## 2. 값을 조정하고 싶다면 — `footscan/config.py` 한 파일만 보세요

모든 기준 숫자(임계값)가 `config.py` 한 곳에 모여 있고,
각 숫자마다 **"올리면 / 내리면 어떻게 되는지"** 를 한글 주석으로 적어 두었습니다.
코드 안에는 숫자를 직접 쓰지 않았습니다.

특히 아래 값들은 **실측 데이터가 쌓이면 반드시 다시 맞춰야 하는 초기 가정치**입니다.

| 값 | 무엇을 정하는지 |
|---|---|
| `ARCH_CLEARANCE_LOW_MM` / `ARCH_CLEARANCE_HIGH_MM` | 아치 등급 경계 (8mm / 18mm) |
| `ARCH_GAP_RATIO_LOW` / `ARCH_GAP_RATIO_HIGH` | 비접지 구간 비율 경계 |
| `WIDTH_RATIO_*` | 폭 등급(좁음/보통/넓음/매우넓음) 경계 |
| `HVA_CALIB_SCALE` / `HVA_CALIB_OFFSET_DEG` | 무지외반 추정값 보정 |
| `SHOE_ALLOWANCE_MM` | 신발 종류별 여유분 |

숫자를 바꾼 뒤에는 `python tests/test_measure.py` 를 꼭 다시 돌리세요.

---

## 3. 지금 정확도 (합성 이미지 기준)

`python tests/test_measure.py` 가 검사하는 항목이자, 현재 통과 상태입니다.

| SPEC 3-8 완료 조건 | 결과 |
|---|---|
| A4 검출 20세트 중 18세트 이상 | **20/20** |
| 발 길이 정답 대비 ±3mm 이내 | **최대 오차 0.6mm** |
| 재현성: 같은 발 5회 길이 표준편차 2mm 이내 | **0.05mm** |
| 재현성: 같은 발 5회 아치 등급 불변 | **불변** |
| 교차검증 동작 | **동작** (다른 발 사진을 섞으면 신뢰도 0.3 + 재촬영 유도) |
| 에러 코드 4종 | `PAPER_NOT_FOUND` / `FOOT_NOT_FOUND` / `SIDE_REF_NOT_FOUND` / `LOW_CONFIDENCE` |
| 디버그 이미지 8장 | 저장됨 |

> ⚠ **합성 이미지에서 통과 = 알고리즘이 맞다**는 뜻이지, **실사에서도 된다**는 보장은 아닙니다.
> 합성 이미지에는 렌즈 왜곡·짙은 그림자·발 두께·양말 질감이 없습니다.
> 반드시 실제 사진 20세트로 다시 검증하고, 줄자 실측과 비교하세요.

---

## 4. Phase 0 을 만들며 알아낸 것 (실제 촬영·앱 설계에 반영해야 할 것)

1. **측면 촬영 시 발을 종이 긴 변의 '가운데'에 딛어야 합니다.**
   발이 종이의 양 끝을 가리면 297mm 기준 길이를 잴 수 없어 측정 자체가 불가능합니다.
   → 앱의 측면 촬영 가이드 문구/오버레이에 반드시 넣어야 합니다. (SPEC 5-4 8번 문구 보완 필요)

2. **그림자는 밝기만 바꾸고 색은 안 바꿉니다.**
   그래서 종이를 판정할 때 밝기(L)를 빼고 색감(a,b)만 봅니다.
   이 한 가지로 "발 밑 그림자를 발로 오인"하는 문제가 사라졌습니다.

3. **밝은 벽을 종이로 착각하는 사고가 잦습니다.**
   "검색 영역 맨 윗줄에 닿는 밝은 덩어리는 버린다"는 규칙 하나로 막았습니다.
   (바닥의 종이는 아래쪽 '띠'로 보이고, 벽은 위로 계속 이어지기 때문)

4. **무지외반 추정값에는 계통 오차가 있습니다.**
   설계각 0/8/16/24도 → 측정 8.5/15.2/20.9/25.9도 (기울기 0.73, 절편 +8.5도).
   X-ray 계측값 몇 개만 확보하면 `config.HVA_CALIB_*` 로 맞출 수 있습니다.
   그때까지는 반드시 "외형 기반 추정"으로만 표기하세요.

5. **아치 지수(AHI)는 정의를 통일해야 합니다.**
   SPEC 은 `발등높이 / 전체 발길이` 로 정의하고 정상 범위를 0.32~0.37 이라고 했습니다.
   (임상에서 흔히 쓰는 "절단 발길이" 기준과 다른 값이니, 실측 보정 시 주의하세요)

---

## 5. 폴더 구조

```
engine/
├── footscan/
│   ├── config.py       ★ 모든 임계값 (여기만 고치면 됩니다)
│   ├── errors.py         에러 코드와 한글 안내 문구
│   ├── schemas.py        결과 데이터 모양 (pydantic)
│   ├── imageio.py        사진 읽기 + EXIF 회전 보정
│   ├── debug.py          디버그 이미지 저장
│   ├── pipeline.py       전체 흐름 엮기
│   ├── crosscheck.py     [B6] 상면 vs 측면 교차검증
│   ├── sizing.py         [4]  신발 사이즈 환산
│   ├── top/              위에서 찍은 사진 처리
│   │   ├── paper.py      [A2] A4 검출
│   │   ├── warp.py       [A3] 원근 펴기 (1px = 0.1mm)
│   │   ├── segment.py    [A4] 발 분할
│   │   └── measure.py    [A5] 길이·너비·발가락형태·무지외반
│   └── side/             옆에서 찍은 사진 처리
│       ├── reference.py  [B2] A4 긴 변 = 기준자 + 바닥선
│       ├── segment.py    [B3] 발 분할 (rembg 또는 색 기반)
│       └── measure.py    [B4,B5] 아치·발등·등급
├── data/size_tables.json ★ 사이즈 대응표 (검증 후 교체 필요)
├── samples/              합성 테스트 사진 + 정답 JSON
├── tests/
│   ├── make_synthetic.py 합성 사진 생성기
│   └── test_measure.py   회귀 테스트
├── cli.py
└── requirements.txt
```

Phase 1 의 `server.py` (FastAPI 래핑) 는 아직 만들지 않았습니다.

---

## 6. 디버그 이미지 보는 법

`--debug` 를 붙이면 `results/` 에 8장이 저장됩니다. 측정값이 이상하면 순서대로 보세요.

| 파일 | 무엇을 확인하나 |
|---|---|
| `01_paper_detected.jpg` | 주황 사각형이 A4 를 정확히 감쌌는지 |
| `02_warped.jpg` | 종이가 반듯한 직사각형으로 펴졌는지 (격자 = 50mm) |
| `03_mask.jpg` | 초록색이 발만 덮었는지 (그림자까지 덮었으면 조명 문제) |
| `04_measured.jpg` | 길이·발볼·뒤꿈치 측정선 위치, 발가락 봉우리 5개 |
| `11_ref_edge.jpg` | 빨간 선이 A4 의 '가까운 긴 변'인지 (수평선이면 실패) |
| `12_rotated.jpg` | 바닥선이 수평이 되었는지 |
| `13_mask.jpg` | 초록색이 발만 덮었는지 (종이·그림자 제외됐는지) |
| `14_arch_measured.jpg` | 바닥선(빨강)·접지구간(자홍)·아치 최고점(노랑)·발등(파랑) |

---

## 7. 하지 않는 것 (법적 표현 제한 — SPEC 1-5)

- "평발입니다", "무지외반증", "족저근막염 위험" 같은 **진단 표현을 쓰지 않습니다.**
- "아치가 낮은 편으로 측정되었습니다", "참고용 측정값입니다" 처럼만 씁니다.
- 모든 결과 끝에 `본 측정값은 참고용이며 의료적 진단이 아닙니다.` 가 붙습니다.
