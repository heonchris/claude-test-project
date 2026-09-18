# 플랜 B — Xcode 로 새 프로젝트를 만들어 붙이기

제가 손으로 만든 `FootScan.xcodeproj` 에서 계속 막히면, **Xcode 가 직접 만든
프로젝트**에 파일만 옮겨 붙이는 쪽이 확실합니다. 프로젝트 파일을 Xcode 가
만들기 때문에 «Missing bundle ID» 같은 문제가 생길 수 없습니다.

10분이면 됩니다.

## 1. 새 프로젝트 만들기

Xcode → **File > New > Project…**

| 항목 | 값 |
|---|---|
| 템플릿 | **iOS > App** |
| Product Name | `FootScan` |
| Team | 본인 Apple ID |
| Organization Identifier | `com.woo` (본인 것) |
| Interface | **SwiftUI** |
| Language | **Swift** |
| Storage / Testing | 체크 해제 (없어도 됩니다) |

저장 위치는 아무 데나. (이 폴더 말고 다른 곳을 권합니다)

## 2. 파일 두 개 바꿔 넣기

1. 왼쪽에서 **`ContentView.swift`** 를 열고, 내용을 전부 지운 뒤
   이 폴더의 `PlanB/ContentView.swift` 내용을 **통째로 붙여넣기**
2. 이 폴더의 **`LocalServer.swift`** 를 왼쪽 파일 목록의 `FootScan` 그룹으로
   **끌어다 놓기**
   → «Copy items if needed» **체크**, «Add to targets: FootScan» **체크**

## 3. 웹 화면 넣기 ★ 중요

이 프로젝트의 **`FootScan/web` 폴더**(안에 `index.html` 이 있는 폴더)를
왼쪽 파일 목록으로 **끌어다 놓습니다.**

대화상자에서 반드시:

- «Copy items if needed» **체크**
- **«Create folder references»** 선택 ← ★ 이게 핵심입니다
  («Create groups» 를 고르면 폴더 구조가 사라져 앱이 화면을 못 찾습니다)
- «Add to targets: FootScan» **체크**

제대로 되면 왼쪽에 **파란색 폴더** 로 `web` 이 보입니다.
(노란색이면 잘못된 것 — 지우고 다시 «Create folder references» 로)

## 4. 카메라 권한 문구 넣기

**TARGETS > FootScan > Info** 탭에서 `+` 를 눌러 두 줄 추가:

| Key | Value |
|---|---|
| `Privacy - Camera Usage Description` | A4 용지 위의 발을 찍어 크기를 재기 위해 사용합니다. 사진은 이 휴대폰 안에서만 처리됩니다. |
| `Privacy - Photo Library Usage Description` | 이미 찍어 둔 발 사진을 골라 크기를 재기 위해 사용합니다. |

그리고 **App Transport Security** 를 하나 더 추가합니다
(앱 안의 `127.0.0.1` 서버에 붙기 위해 필요합니다):

| Key | 형식 | Value |
|---|---|---|
| `App Transport Security Settings` | Dictionary | — |
| └ `Allow Local Networking` | Boolean | `YES` |

## 5. 세로 고정 (선택)

**TARGETS > FootScan > General > Deployment Info** 에서
**Portrait** 만 남기고 나머지 체크 해제.

## 6. 실행

아이폰을 연결하고 ▶︎.

앱이 뜨면 첫 화면 맨 아래 **「기기 진단」 → 자체 시험 실행** 을 눌러
**249.4mm** 근처가 나오는지 확인해 주세요.

---

## 웹 화면을 새로 받았을 때

`footscan/app/app.html` 이 바뀌면, 그 파일을 프로젝트의
`web/index.html` 로 덮어쓰기만 하면 됩니다. 폴더 참조라서
Xcode 설정은 건드릴 필요가 없습니다.

```sh
cp footscan/app/app.html <새프로젝트>/FootScan/web/index.html
```
