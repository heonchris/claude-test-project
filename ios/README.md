# Xcode 실행 안내

족저압 인솔 앱을 iPhone 시뮬레이터·실기기에서 띄우기 위한 iOS 프로젝트입니다.

---

## 1. 요구사항

- macOS + **Xcode 15 이상**
- iOS 16 이상 (시뮬레이터 또는 실기기)

## 2. 실행 (3단계)

1. `InsoleApp/InsoleApp.xcodeproj` 를 더블클릭
2. 상단 기기 목록에서 **iPhone 15** 등 시뮬레이터 선택
3. **▶ (Run)** 또는 `⌘R`

시뮬레이터가 뜨고 앱이 전체화면으로 실행됩니다.

## 3. 실기기(내 아이폰)에서 돌리려면

무료 애플 계정으로도 됩니다. 서명 설정만 한 번 해주면 됩니다.

1. Xcode → **Settings → Accounts** 에서 애플 ID 추가
2. 왼쪽 파일 목록에서 **InsoleApp**(파란 아이콘) 클릭
3. **TARGETS → InsoleApp → Signing & Capabilities** 탭
4. **Team** 을 본인 계정으로 선택
5. **Bundle Identifier** 를 겹치지 않는 값으로 변경
   (예: `com.본인이름.insoleapp`) — 기본값 `com.example.insoleapp` 은
   이미 쓰이고 있을 수 있어 거부될 수 있습니다
6. 아이폰을 USB 로 연결하고 기기 목록에서 선택 후 ▶

> 처음 실행하면 아이폰에서 **설정 → 일반 → VPN 및 기기 관리** 로 들어가
> 개발자 앱을 신뢰해야 합니다. 무료 계정은 7일마다 다시 설치해야 합니다.

---

## 4. 구조

```
InsoleApp/
  InsoleApp.xcodeproj        프로젝트 파일
  InsoleApp/
    InsoleApp.swift          앱 진입점 (10줄)
    ContentView.swift        화면 (5줄)
    WebView.swift            WKWebView 설정 (70줄)
    web/                     ← 실제 앱 화면. 여기가 내용물입니다
      index.html
      css/app.css
      js/01-config.js … 07-app.js
```

**Swift 코드는 웹 화면을 전체화면으로 띄우는 껍데기일 뿐입니다.**
기능을 고치려면 `web/` 안을 고치세요. 구조 설명은 `handoff/` 폴더의
README·HANDOFF·DATA_CONTRACT 문서와 동일합니다.

## 5. 화면 내용을 고치려면

`web/` 안의 파일을 편집하고 다시 ▶ 를 누르면 반영됩니다.
브라우저에서 `web/index.html` 을 직접 열어 확인하면서 작업하는 편이 빠릅니다.

주로 손댈 곳:
- `web/js/01-config.js` — 센서 배치, 판정 기준, 색상
- `web/js/02-sensor.js` — 실제 BLE 센서를 붙이는 지점

---

## 6. 흰 화면만 나온다면

앱이 켜졌는데 **"web 폴더를 찾지 못했습니다"** 안내가 뜨는 경우입니다.
번들에 `web` 폴더가 안 들어간 것이고, 원인은 거의 항상 폴더가
**노란 그룹**으로 등록된 것입니다.

**고치는 법**
1. Xcode 파일 목록에서 `web` 을 우클릭 → **Delete → Remove Reference**
2. Finder 에서 `InsoleApp/InsoleApp/web` 폴더를 Xcode 파일 목록으로 끌어다 놓기
3. 뜨는 창에서 **Create folder references** 선택 (파란 폴더 아이콘)
4. **Add to targets: InsoleApp** 체크 확인

파일 목록에서 `web` 이 **파란색 폴더**로 보이면 정상입니다.
노란색이면 위 절차를 다시 하세요.

## 7. 그 밖의 문제

| 증상 | 원인과 해결 |
|---|---|
| `Signing for "InsoleApp" requires a development team` | 3번 항목의 Team 설정 |
| `Bundle identifier is not available` | Bundle Identifier 를 다른 값으로 변경 |
| 글꼴이 기본 서체로 나옴 | 인터넷 미연결. 레이아웃은 정상이며 서체만 대체됩니다 |
| 시뮬레이터에서 그래프가 느림 | 실기기에서는 훨씬 빠릅니다. 시뮬레이터는 GPU 가속이 제한적입니다 |

---

## 8. 이 방식에 대해 (중요)

이 프로젝트는 **WKWebView 로 웹 화면을 감싼 것**입니다. 네이티브 앱이 아닙니다.

**이렇게 만든 이유**
- 검증된 웹 코드를 그대로 쓰므로 동작이 보장됩니다
- Swift 코드가 100줄 이하라 잘못될 여지가 거의 없습니다
- 최종 제품은 사업 정의서대로 iOS/Android 크로스플랫폼이라
  어차피 Flutter·React Native 등으로 다시 만들게 됩니다

**한계**
- 네이티브 성능·감촉이 아닙니다 (스크롤 관성, 화면 전환 등)
- BLE 를 붙이려면 웹 Bluetooth 가 iOS WKWebView 에서 동작하지 않으므로,
  **Swift 쪽에서 CoreBluetooth 로 받아 JS 로 넘겨주는 다리**가 필요합니다.
  `WKScriptMessageHandler` + `evaluateJavaScript` 로 `INSOLE.sensor.values`
  를 갱신하는 방식입니다. 현재는 미구현입니다.
- App Store 심사에서 단순 웹뷰 래퍼는 반려될 수 있습니다.
  내부 시연·검토용으로만 쓰세요.

**네이티브로 갈 때** 이식해야 할 알고리즘은 `handoff/HANDOFF.md` 의
"반드시 유지해야 하는 설계 판단 3가지" 를 참고하세요.
