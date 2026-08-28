# 냥집사 — 개발·운영 명세서

> **이 문서 하나면 됩니다.** 앱이 무엇인지, 어떻게 만들어졌는지, 폰에 어떻게 넣고 계속 쓰는지가 다 들어 있습니다.
> 클로드 코드에게 작업을 시킬 때는 `SPEC.md 기준으로 ~해줘` 라고 하면 됩니다.

| | |
|---|---|
| 저장소 | `heonchris/claude-test-project` |
| 브랜치 | `claude/cat-health-app-dev-100btx` |
| 상태 | Phase 1~6 구현 완료 · 아이폰 실기기 설치 확인 |

---

## 목차

1. [앱 개요](#1-앱-개요)
2. [화면 명세](#2-화면-명세)
3. [고양이 캐릭터 규칙](#3-고양이-캐릭터-규칙)
4. [달성률 계산](#4-달성률-계산)
5. [플랜 붙여넣기 규격](#5-플랜-붙여넣기-규격)
6. [데이터 모델](#6-데이터-모델)
7. [디자인 토큰](#7-디자인-토큰)
8. [기술 스택과 폴더 구조](#8-기술-스택과-폴더-구조)
9. [폰에 설치하기](#9-폰에-설치하기)
10. [계속 쓰기](#10-계속-쓰기)
11. [구현 메모](#11-구현-메모)
12. [아직 안 만든 것](#12-아직-안-만든-것)
13. [점검 리스트](#13-점검-리스트)

---

## 1. 앱 개요

### 1-1. 한 줄 정의

> 사진 한 장과 탭 몇 번으로 오늘의 식단·물·운동을 남기면, 고양이가 반응해주는 **나 혼자 쓰는** 기록 앱.

### 1-2. 핵심 원칙 (반드시 지킬 것)

1. **로그인 없음, 서버 없음.** 모든 데이터는 폰 안에만 저장. 회원가입/계정 화면 만들지 말 것.
2. **기록은 3초 안에.** 사진 찍기 → 저장. 칼로리·영양소 입력은 전부 **선택 항목**.
3. **평가하지 않는다.** "목표 초과", "실패", 빨간 경고, 감점 표시 없음. 기록은 기록일 뿐.
   달성했을 때만 긍정 피드백을 주고, 못 채운 날은 조용히 넘어간다.
4. **인터넷 없이 100% 동작.** AI 호출 코드 넣지 말 것 (플랜은 사용자가 붙여넣는다).
5. 모든 UI 텍스트는 **한국어**.

### 1-3. 기록하는 것

| | 무엇을 | 비고 |
|---|---|---|
| 🍚 식단 | 사진 + **찍은 시각** + 끼니 + 짧은 메모 | 칼로리는 선택, 사진 없이도 저장됨 |
| 💧 물 | 컵 단위 탭 | 기본 목표 8컵, 설정에서 4~15컵 |
| 🏃 운동 | 종류 + 시간(분) + 메모 | 시간 비워도 저장됨 |
| ⏱ 공복 | 마지막 식사 시각부터 지금까지 | **자동 계산.** 시작/종료 버튼 없음 |
| 📋 플랜 체크 | 붙여넣은 계획의 오늘 항목 | 플랜이 없으면 화면에서 숨김 |

---

## 2. 화면 명세

하단 탭 4개: **오늘 · 기록 · 플랜 · 설정**

### 2-1. 오늘 (홈) — `app/(tabs)/index.tsx`

위에서부터:

1. **고양이 카드** — 화면 높이의 35%. 세로로 긴 흰 벽을 고양이가 달성률만큼 올라간다. 아래에 한 줄 말풍선.
2. **오늘의 링 3개** — 식단 / 물 / 운동 원형 진행바
3. **공복 카드** — 마지막 식사부터 흐른 시간, 목표까지 남은 시간 (1분마다 갱신)
4. **물 컵 줄** — 탭하면 한 컵, **길게 누르면 취소**
5. **오늘 먹은 것** — 사진 썸네일 가로 스크롤 (끼니 + 찍은 시각 표시). 비어 있으면 `아직 비어 있어요. 첫 끼를 남겨볼까요?`
6. **오늘 운동** — 한 줄 요약. 탭하면 수정
7. **오늘의 플랜** — 활성 플랜의 오늘 항목 체크리스트. **플랜이 없으면 이 섹션 자체를 숨김**
8. 우하단 **플로팅 + 버튼**

사진을 탭하면 크게 보기 → 수정 / 삭제.

### 2-2. 기록 추가

`+` → **식단 / 운동 / 물** 세 갈래. `물`은 시트에서 바로 한 컵 추가된다.

**식단 추가** — `app/add/meal.tsx`

- 큰 버튼 2개: `사진 찍기` / `앨범에서 고르기`
- **사진 없이 메모만으로도 저장 가능**
- 사진을 고르면 **EXIF에서 찍은 시각을 읽어** 기록하고, 그 시각 기준으로 끼니를 추천한다
  (아침에 찍은 사진을 밤에 저장해도 `아침`으로 잡힌다)
- 사진이 오늘 것이 아니면 **"8월 23일 기록으로 남기기"** 스위치가 뜬다 (기본 켜짐)
- **먹은 시각을 직접 고칠 수 있다** (`12:30` 형식). 공복 시간이 이 값에서부터 다시 시작된다
- 끼니 칩: 아침 / 점심 / 저녁 / 간식
- 메모(선택), 칼로리(선택, 접혀 있음)

**운동 추가** — `app/add/workout.tsx`

- 칩: 걷기 · 달리기 · 헬스 · 요가 · 홈트 · 자전거 · 기타(직접 입력)
- 시간(분) 숫자 입력 + `+10분` `+30분` 퀵버튼
- 메모(선택)

두 화면 모두 저장하면 **고양이가 1.5초간 놀란 표정**을 짓는다.

### 2-3. 기록 — `app/(tabs)/history.tsx`

- 월 달력. 날짜 아래 점 3개(식단 🟠 / 물 🔵 / 운동 🟢)로 그날 기록 유무 표시
- 날짜를 탭하면 아래에 그날 상세 — **먹은 시간대(첫 끼 ~ 마지막 끼)와 첫 끼까지의 공복**, 사진 그리드(끼니 + 시각), 물 컵 수, 운동 목록
- 사진을 탭하면 수정, **길게 누르면 삭제**
- 상단 토글로 **주간 요약** 전환 — 최근 7일 물/운동 막대그래프, **식사 시간 타임라인**, 식단 사진 모아보기
- 타임라인은 하루를 24시간 가로선으로 놓고 먹은 시간대를 막대로, 각 식사를 점으로 찍는다.
  막대가 짧을수록 공복이 길었다는 뜻이다

### 2-4. 플랜 — `app/(tabs)/plan.tsx`

- 활성 플랜이 없으면: 큰 붙여넣기 칸 + `붙여넣은 내용 불러오기`(클립보드에서 가져오기) + `AI에게 보낼 프롬프트 복사`
- 활성 플랜이 있으면: 제목 / `3일차 / 28일` / 오늘 항목 체크리스트 / `전체 보기` / `플랜 교체`
- 아래에 지난 플랜 목록 (다시 쓰기 / 삭제)

### 2-5. 설정 — `app/(tabs)/settings.tsx`

- 고양이 이름
- 하루 물 목표 컵 수 (4~15)
- **공복 목표 시간 (12~24)**
- 알림 on/off + 식사·물 시간 (폰 안에서만 울리는 **로컬 알림**)
- **데이터 내보내기 / 불러오기** (JSON)
- 저장 공간 — 사진 개수·용량, 안 쓰는 사진 정리

---

## 3. 고양이 캐릭터 규칙

### 3-0. 스타일

- **완전한 검정 실루엣.** 외곽선·그림자·그라데이션 없이 **검정 면 하나**로만
- **눈만 흰색.** 큰 흰 동그라미 안에 검은 동공. 이게 이 캐릭터의 전부
- 귀는 **뾰족한 삼각형**, 몸통은 **길쭉하고 홀쭉**, 꼬리는 **가늘고 길게**
- 발끝에 **세 갈래 발가락**, 매달릴 때 발 위로 **가느다란 발톱 자국**
- **입·코·수염·볼터치 넣지 말 것** (눈만 있어야 이 느낌이 산다)

### 3-1. 상태

`components/Cat.tsx` 한 파일. 그림 파일이 아니라 **SVG 코드**라서 말로 고칠 수 있다.

| state | 조건 | 모습 |
|---|---|---|
| `napping` | 오늘 기록 0개 | 바닥에 늘어져 누움, 눈 감음(가로선), 꼬리 축 처짐 |
| `awake` | 기록 1개 이상 | 앉아서 정면 응시 |
| `climbing` | 기록 2종 이상 | 두 팔 들고 매달린 자세, 발톱 자국 |
| `top` | 3종 다 + 물 목표 달성 | 꼭대기에 앉아 꼬리 살랑 |
| `startled` | 저장 직후 1.5초 | 눈동자 확 커짐 |

모양을 확인하려면 `python3 tools/render_assets.py` → `tools/cat-preview.png`에 5가지가 한 장으로 나온다.
같은 스크립트가 앱 아이콘과 스플래시도 다시 만든다.

### 3-2. 시그니처 — 오늘의 벽 오르기

`components/CatWall.tsx`

- 고양이 카드는 **세로로 긴 흰 벽**. 달성률만큼 위로 올라간다
- 지나온 자리에 **발톱 자국이 흔적으로 남는다**
- 벽 옆에 카테고리 색 점 3개
- 이동은 스프링 애니메이션, 자정에 리셋

> **바닥은 실패가 아니라 낮잠이다.** X표시·빨간색·흐린 처리 같은 벌칙 연출 금지.
> **이게 이 앱의 유일한 화려한 부분**이니 나머지 화면은 조용하고 단정하게 유지할 것.

### 3-3. 말풍선

- 기록 없음: `자는 중…` / `깨우려면 뭐 하나 남겨봐요`
- 기록 중: `올라가는 중` / `잘하고 있어요`
- 물 달성: `물 다 마셨다냥`
- 전부 달성: `꼭대기 도착. 오늘 푹 쉬어요`

> 잔소리·재촉·죄책감 주는 대사는 절대 넣지 말 것.

---

## 4. 달성률 계산

`lib/progress.ts`

| 항목 | 계산 |
|---|---|
| 식단 | 오늘 끼니 수 ÷ 3 |
| 물 | 컵 ÷ `water_goal` |
| 운동 | 합계 분 ÷ `workout_goal_minutes` (기본 30). 시간을 안 적었으면 100%로 본다 |
| 플랜 | 체크한 항목 ÷ 오늘 항목 수. **플랜이 없으면 평균에서 제외** |
| **벽 높이** | 위 값들의 **평균** |

고양이 상태는 "몇 가지 종류를 건드렸는지"로 정한다 (식단/물/운동 중 몇 종).

**공복은 달성률에 넣지 않는다.**
넣으면 "못 지킨 날"이라는 압박이 생겨 원칙 3(평가하지 않는다)과 충돌한다.
공복은 정보로만 보여주고, 목표를 채웠을 때만 말풍선으로 `공복 시간 다 채웠다냥` 한 줄을 준다.

### 공복 시간 (`lib/fasting.ts`)

- **시작/종료 버튼이 없다.** 마지막 식사 기록의 `taken_at`이 곧 타이머의 시작점이다
- 식단을 하나 남기면 그 시각부터 자동으로 다시 센다
- 날짜를 넘어가도 상관없다. 어제 저녁 7시가 마지막이면 오늘 아침에도 그 시각부터 센다
- 시각이 틀렸으면 식단 수정 화면에서 `먹은 시각`을 고치면 된다
- 기본 목표 16시간 (설정에서 12~24시간)
- 화면은 1분마다 갱신한다 (`useNow`). 초 단위는 의미가 없어 쓰지 않는다

---

## 5. 플랜 붙여넣기 규격

AI가 만들어준 계획을 앱이 알아듣게 하려면 **형식을 정해두는 게 전부**다.
사용자는 `프롬프트 복사` → 챗봇에 붙여넣기 → 나온 답을 앱에 붙여넣기, 이 세 단계만 한다.

### 5-1. 앱이 읽는 JSON

```json
{
  "title": "4주 체력 만들기",
  "startDate": "2026-08-25",
  "endDate": "2026-09-21",
  "dailyTargets": { "waterCups": 8, "workoutMinutes": 30 },
  "days": [
    {
      "day": 1,
      "meals": [
        { "type": "아침", "name": "오트밀과 바나나", "items": ["오트밀 40g", "바나나 1개"] },
        { "type": "점심", "name": "닭가슴살 샐러드", "items": [] }
      ],
      "workouts": [{ "name": "빠르게 걷기", "minutes": 30, "detail": "저녁 식후" }],
      "note": "물 자주 마시기"
    }
  ]
}
```

- `days`가 7개만 와도 **7일 주기로 반복** 적용된다 (28일 플랜이면 4주 반복)
- **없는 필드는 무시**하고 있는 것만 쓴다. 필드 하나 빠졌다고 통째로 실패시키지 않는다
- `dailyTargets`의 값은 **설정에도 반영**된다 (물 목표, 운동 목표)

### 5-2. 파싱 실패는 실패가 아니다

JSON이 아니면 **원문을 줄 단위로 잘라 체크리스트**로 저장한다.
어떤 입력이든 거절하지 않으며, **붙여넣은 원문은 항상 그대로 보관**된다 (`plans.raw_text`).

### 5-3. 프롬프트 원문

`lib/promptText.ts`에 있다. 설정·플랜 화면의 버튼이 이걸 클립보드에 복사한다.

```
아래 조건으로 식단·운동 계획을 짜줘.
결과는 반드시 아래 JSON 형식으로만 출력하고, 설명이나 코드블록 표시 없이 JSON만 줘.

[내 조건: 여기에 나이/키/몸무게/목표/알레르기/운동 가능 시간 등을 적으세요]

{ ...위 5-1의 형식... }
```

---

## 6. 데이터 모델

SQLite 하나. 사진은 DB에 넣지 않고 파일로 저장한다.

> ⚠️ **`photo_uri`에는 파일 이름만 넣는다** (`1756-ab12.jpg`). 절대경로를 넣으면 안 된다.
> iOS는 앱을 다시 설치할 때마다 앱 폴더 주소가 바뀌기 때문에, 이 앱처럼 7일마다
> 재설치하는 구조에서는 저장해 둔 절대경로가 전부 깨진다.
> 볼 때는 `lib/photos.ts`의 `resolvePhotoUri()`로 현재 주소와 합친다.

```sql
CREATE TABLE meals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,           -- 'YYYY-MM-DD'
  meal_type TEXT NOT NULL,      -- '아침' | '점심' | '저녁' | '간식'
  photo_uri TEXT,               -- 없을 수도 있음
  memo TEXT,
  calories INTEGER,             -- 선택. NULL 허용
  taken_at TEXT,                -- 사진을 찍은 시각(EXIF). 없으면 저장한 시각
  created_at TEXT NOT NULL
);

CREATE TABLE water (
  date TEXT PRIMARY KEY,
  cups INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  minutes INTEGER,
  memo TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  raw_text TEXT NOT NULL,       -- 붙여넣은 원문 (항상 보관)
  parsed_json TEXT,             -- 구조화 성공 시 JSON
  is_active INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE plan_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  item_key TEXT NOT NULL,       -- 'meal-아침', 'workout-0', 'line-3'
  label TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  UNIQUE(plan_id, date, item_key)
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
```

**설정 기본값**
`water_goal=8`, `cat_name='나비'`, `reminder_on=0`, `reminder_meal_time='12:30'`, `reminder_water_time='15:00'`, `workout_goal_minutes=30`, `fasting_goal_hours=16`

**스키마를 바꿀 때**
이미 폰에서 쓰고 있는 DB가 있으므로 `db/index.ts`의 `migrate()`에 추가한다.
열이 없을 때만 `ALTER TABLE`하고, **기존 기록은 절대 지우지 않는다.**

---

## 7. 디자인 토큰

```ts
export const colors = {
  bg:      '#FBF7F0',  // 우유빛 배경
  card:    '#FFFFFF',
  text:    '#3D3733',
  textSub: '#9A9088',
  meal:    '#F5B461',  // 식단 - 살구
  water:   '#7FB6E8',  // 물 - 하늘
  workout: '#7BC6A4',  // 운동 - 민트
  catBody: '#141312',  // 고양이
  catEye:  '#FFFFFF',
  wall:    '#FFFFFF',
  line:    '#EFE7DC',
};
```

- **화면에서 가장 진한 것은 고양이 하나뿐.** 다른 곳에 검정에 가까운 색을 쓰지 말 것. 아이콘·글씨는 `text`까지만
- 카테고리 색 3개는 **장식이 아니라 정보**다. 링·달력 점·카드 테두리에서 항상 같은 색을 유지할 것
- 폰트: 본문 **Pretendard**, 제목/숫자 **Cafe24 Ssurround** (`assets/fonts/`에 포함)
- radius: 카드 20, 버튼 16, 칩 999 · 그림자 `shadowOpacity 0.05` · 여백 4의 배수 · 화면 좌우 패딩 20
- **다크모드 지원 안 함.** 라이트 고정

---

## 8. 기술 스택과 폴더 구조

```
Expo SDK 57 + expo-router + TypeScript
expo-sqlite            로컬 DB
expo-image-picker      카메라 / 앨범 (EXIF 포함)
expo-image-manipulator 가로 1080px 리사이즈
expo-file-system       사진 파일 보관
react-native-svg       고양이 · 아이콘 (전부 코드로 그림)
expo-notifications     로컬 알림만
date-fns               날짜
```

상태관리 라이브러리는 쓰지 않는다. React 기본 훅 + SQLite 조회로 충분하다.

```
app/
  _layout.tsx          앱 시작 (DB 초기화, 폰트 로딩)
  (tabs)/index.tsx     오늘
  (tabs)/history.tsx   기록
  (tabs)/plan.tsx      플랜
  (tabs)/settings.tsx  설정
  add/meal.tsx         식단 추가·수정 (모달)
  add/workout.tsx      운동 추가·수정 (모달)
components/            Cat, CatWall, FastingCard, ProgressRing, WaterCups, Txt, Input, ui …
db/                    schema.ts · index.ts(연결·마이그레이션) · queries.ts
lib/                   dates · progress · fasting · planParser · photos · exif · backup · notify
theme/                 colors.ts · typography.ts
tools/                 render_assets.py (아이콘·미리보기 생성)
assets/fonts/          Pretendard, Cafe24 Ssurround
```

---

## 9. 폰에 설치하기

Expo Go로 여는 방법도 있지만, **Expo Go 버전이 맞지 않아 Xcode로 직접 빌드하는 경로를 쓴다.**

### 9-1. 준비물 (처음 한 번)

| | |
|---|---|
| Node.js | https://nodejs.org 에서 **LTS** |
| Xcode | 맥 App Store. 설치 후 한 번 열어 약관 동의 + 추가 구성요소 설치 |
| CocoaPods | `sudo gem install cocoapods` (안 되면 Homebrew로 `brew install cocoapods`) |
| 아이폰 | 케이블 연결 + `이 컴퓨터를 신뢰` |

### 9-2. 설치 순서

```bash
npm install
open ios/*.xcworkspace     # 서명 설정 (처음 한 번만)
```

Xcode에서: 왼쪽 맨 위 파란 아이콘 → `TARGETS`의 앱 → **`Signing & Capabilities`** 탭
→ `Automatically manage signing` 체크 → `Team`에 본인 Apple ID `(Personal Team)`

그다음 터미널에서:

```bash
npm run iphone     # = expo run:ios --device --configuration Release
```

아이폰에서 앱을 처음 누를 때 "신뢰할 수 없는 개발자"가 뜨면
**설정 → 일반 → VPN 및 기기 관리 → 본인 Apple ID → 신뢰**

> ⚠️ **`--configuration Release`가 중요하다.** 이게 빠지면 자바스크립트가 앱에 들어가지 않아서
> **맥이 켜져 있고 터미널이 돌아가는 동안만** 앱이 열린다. Release로 넣어야 앱이 혼자 동작한다.
> (`npm run xcode`는 맥 안의 시뮬레이터용 개발 빌드다. 시뮬레이터에는 카메라가 없다.)

### 9-3. 겪은 문제와 해결

| 증상 | 원인과 해결 |
|---|---|
| `Username for 'https://github.com'` | 비공개 저장소라 로그인이 필요하다. GitHub 비밀번호는 안 받는다. **웹에서 ZIP을 받거나 GitHub Desktop을 쓴다** |
| `Project is incompatible with this version of Expo Go` | 폰의 Expo Go가 SDK 57을 못 읽는다. Expo Go를 지우고 다시 설치하거나, **Xcode 경로로 간다** |
| `Failed to install CocoaPods CLI` | `sudo gem install cocoapods` (sudo 없이는 권한이 없어 실패한다) |
| `No such file or directory: /Users/.../...100btx` | **폴더 이름에 띄어쓰기가 있으면 안 된다.** `cat-health` 같은 짧은 영문으로 바꾸고 `ios` 폴더를 지운 뒤 다시 실행 |
| `Personal development teams ... do not support the Push Notifications capability` | 무료 계정은 푸시 알림을 못 쓴다. 이 앱은 로컬 알림만 쓰므로 필요 없다. `app.json`에서 `expo-notifications` 플러그인을 뺐다 |
| `Failed to register bundle identifier` | 다른 사람이 쓰는 ID다. Xcode에서 `Bundle Identifier` 뒤에 본인 글자를 붙인다 |
| `Developer Mode disabled` | 아이폰 **설정 → 개인정보 보호 및 보안 → 개발자 모드** 켜기 → 재부팅 |
| `codesign이 키체인 접근을 허용하고자 합니다` | 맥 로그인 암호 입력 후 **`항상 허용`** (그냥 `허용`을 누르면 파일마다 계속 물어본다) |
| `invalid code signature ... not been explicitly trusted` | 설치는 끝났다. **설정 → 일반 → VPN 및 기기 관리 → 본인 Apple ID → 신뢰** |
| 빌드가 꼬였을 때 | `ios` 폴더를 지우고 다시 실행하면 새로 만든다 |

---

## 10. 계속 쓰기

### 10-1. 7일마다 (무료 Apple 계정의 제한)

무료 계정으로 설치한 앱은 **7일 뒤 열리지 않는다.** 아이폰을 연결하고 다시 실행하면 된다.

```bash
npm run iphone
```

**기록은 그대로 유지된다.** 앱을 덮어쓰는 것이라 안의 데이터는 남는다.
단 **앱을 삭제하면 기록도 사라진다.**

유료 개발자 계정(연 $99)이면 이 주기가 1년으로 늘어난다.

### 10-2. 새 버전 받기

**기존 폴더에 소스만 덮어쓰는 것이 가장 빠르다.**
`ios/` 폴더(서명 설정이 들어 있다)와 `node_modules`를 그대로 재사용할 수 있기 때문이다.

1. ZIP을 받아 압축을 풀고, 새 폴더 이름을 `new-code`처럼 **공백 없이** 바꾼다
2. 터미널에서:

```bash
rsync -a --exclude node_modules --exclude ios --exclude .expo \
  ~/Downloads/new-code/ ~/Downloads/cat-health/
cd ~/Downloads/cat-health
npm install
npm run iphone
```

`--exclude ios`가 핵심이다. 이걸 빼면 서명 설정이 날아가 Xcode에서 Team을 다시 골라야 한다.

계속 고쳐 나갈 거라면 **GitHub Desktop**이 편하다.
`Fetch origin` → `Pull origin` 버튼 한 번이면 위 과정이 필요 없다.

### 10-2-1. Xcode 화면에서 업데이트하기

터미널 대신 Xcode 버튼으로 설치할 수도 있다. **단, 기본값이 Debug라 그대로 누르면 안 된다.**

1. `open ios/*.xcworkspace`
2. 상단 가운데 기기 선택 칸에서 **본인 아이폰** 선택
3. 메뉴 **Product → Scheme → Edit Scheme…** → 왼쪽 `Run` → **`Build Configuration`을 `Release`로 변경** → `Close`
4. **▶️** 버튼 (또는 `⌘R`)

3번을 건너뛰면 Debug로 설치되어 **맥이 켜져 있어야만 앱이 열린다.**
이 설정은 한 번 바꿔두면 유지되므로, 다음부터는 2번 → 4번만 하면 된다.

### 10-3. 백업 — 이게 제일 중요하다

서버가 없어서 **기록을 복구해줄 곳이 없다.**

설정 탭 → **`데이터 내보내기`** → JSON 파일을 카톡·메일·파일 앱 어디든 남겨둔다.
복원은 같은 화면의 `데이터 불러오기`.

> 사진 파일은 용량 때문에 백업에 담기지 않는다. 경로만 들어간다.

---

## 11. 구현 메모

명세와 다르게 간 곳, 명세에 없어서 정한 곳.

**고양이 컴포넌트가 둘로 나뉘어 있다**
`Cat.tsx`는 고양이 자체(props: `state`, `width`), `CatWall.tsx`가 벽·`progress`·발톱 자국·말풍선·카테고리 점을 맡는다.

**식단의 시각 (`taken_at`)**
- 사진의 EXIF에서 촬영 시각을 읽는다. 없으면 저장한 시각을 쓴다
- **끼니 자동 추천도 '지금'이 아니라 사진을 찍은 시각 기준**이다
- 사진이 오늘 것이 아니면 그날 기록으로 넣을지 스위치로 물어본다 (기본 켜짐)
- 사진 목록은 저장 순서가 아니라 **찍은 순서**로 늘어선다
- EXIF 키 이름이 기기마다 달라 `lib/exif.ts`가 후보를 차례로 확인하고, 못 찾으면 조용히 저장 시각으로 넘어간다

**사진은 이름만 저장한다**
`photo_uri`는 파일 이름이다. 화면에 띄울 때 `resolvePhotoUri()`가 현재 앱 폴더와 합친다.
파일이 없으면 `components/Photo.tsx`가 메모나 안내 문구로 대신한다.

**앱을 켤 때 알림을 다시 건다**
예약된 알림은 재설치와 함께 사라지므로, 설정이 켜져 있으면 `app/_layout.tsx`에서 조용히 재예약한다.

**공복 타이머에 새 테이블을 만들지 않았다**
식단의 `taken_at` 하나로 다 계산된다. 설정값 `fasting_goal_hours`만 추가했다.
기록할 것이 늘지 않으므로 "기록은 3초 안에" 원칙이 유지된다.

**플랜의 `dailyTargets`는 설정에 반영된다**
플랜을 시작할 때 `waterCups`(4~15)와 `workoutMinutes`가 있으면 설정값으로 저장한다.
그래야 설정 화면과 오늘 화면이 같은 목표를 본다.

**폰트가 없어도 앱은 죽지 않는다**
모든 글씨는 `components/Txt.tsx`를 거친다. 폰트 로딩이 실패하면 시스템 폰트로 조용히 넘어간다.
크기·굵기는 `theme/typography.ts` 한 곳에서 관리한다.

**푸시 알림 권한을 쓰지 않는다**
무료 Apple 계정으로 서명할 수 없기 때문. 리마인더는 폰 안에서만 울리는 로컬 알림이라 권한이 필요 없다.

**아이콘·스플래시는 고양이 SVG에서 뽑는다**
`python3 tools/render_assets.py`. 이 스크립트의 도형은 **미리보기·아이콘 전용 복사본**이고,
모양의 원본은 언제나 `components/Cat.tsx`다. Cat.tsx를 고쳤으면 스크립트도 같이 고친 뒤 다시 뽑는다.

---

## 12. 아직 안 만든 것

지금은 만들지 않는다.

- 사진에서 음식 자동 인식 (Claude API 연동)
- 체중 기록 + 그래프
- 고양이 성장 / 코스튬
- iOS 위젯
- 안드로이드 확인 (코드는 대응돼 있으나 실기기 확인은 안 했다)

---

## 13. 점검 리스트

- [ ] 비행기 모드에서 모든 기능이 동작한다
- [ ] 사진 30장쯤 넣어도 앱이 느려지지 않는다
- [ ] 앱을 껐다 켜도 데이터가 남아 있다
- [ ] 자정이 지나면 오늘 화면이 새 날짜로 초기화된다
- [ ] 기록을 안 한 날에 앱이 나를 탓하지 않는다
- [ ] 설정에서 내보낸 JSON으로 복원이 된다
- [ ] 사진의 찍은 시각이 제대로 표시된다
- [ ] 식사를 기록하면 공복 시간이 0부터 다시 시작된다
- [ ] 자정을 넘겨도 공복 시간이 이어서 계산된다

---

*이 앱은 개인 기록용입니다. 의학적 조언이나 진단을 제공하지 않으며, 체중·영양 목표는 필요하면 전문가와 상의해서 정하는 게 좋습니다.*
