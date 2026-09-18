# 아이폰에서 실제로 돌려 보기

`../app/app.html` 을 그대로 감싼 iOS 앱입니다. 계산은 전부 웹 쪽 코드가 하고,
이 앱은 **카메라가 열리게 해 주는 껍데기** 역할만 합니다.

> **아직 실기기에서 돌려 본 적이 없습니다.** 이 폴더는 초안이며, 처음 빌드할 때
> 서명 설정 등에서 걸릴 수 있습니다. 막히는 지점을 알려 주시면 고치겠습니다.

## 잠깐 — 그냥 아이폰에서 써 보는 게 목적이라면

**Xcode 는 필요 없습니다.** 체험판 링크를 아이폰 사파리에서 열면 카메라까지
그대로 됩니다. 홈 화면에 추가하면 아이콘도 생기고 주소창 없이 앱처럼 열립니다.

이 폴더(Xcode 프로젝트)는 **"앱스토어에 올릴 형태로 만들었을 때도 되는지"** 를
확인하기 위한 것입니다. 당장 발을 재 보시는 게 목적이라면 건너뛰셔도 됩니다.

## 가장 빠른 길 — Xcode 로 열기

```sh
cd footscan/ios
sh sync_web.sh          # 웹 앱을 앱 안으로 복사
open FootScan.xcodeproj
```

Xcode 가 열리면:

1. 왼쪽에서 **FootScan** 프로젝트 → **TARGETS > FootScan** → **Signing & Capabilities**
2. **Team** 을 본인 Apple ID 로 고릅니다 (무료 계정도 됩니다)
3. **Bundle Identifier** 를 본인 것으로 바꿉니다 (예: `com.본인이름.footscan`)
   — 기본값 `com.example.footscan` 은 남이 쓰고 있을 수 있어 서명이 실패합니다
4. 위쪽에서 연결한 아이폰을 고르고 **▶︎ Run**

처음 실행하면 아이폰에 "신뢰하지 않은 개발자" 라고 뜹니다.
**설정 > 일반 > VPN 및 기기 관리** 에서 개발자 앱을 신뢰해 주세요.

## 터미널에서 실행

```sh
sh run.sh list                  # 쓸 수 있는 기기 목록
sh run.sh build                 # 빌드만 (서명 없이 문법 확인)
sh run.sh sim                   # 시뮬레이터에서 실행
sh run.sh sim "iPhone 15 Pro"
TEAM=ABCDE12345 sh run.sh device   # 연결된 아이폰에서 실행
```

팀 ID 찾기: `security find-identity -v -p codesigning`

시뮬레이터에는 카메라가 없습니다. **계산이 도는지**는 시뮬레이터로도 확인할 수
있지만(앱 안 「기기 진단 > 자체 시험 실행」), **카메라는 실기기에서만** 확인됩니다.

## Xcode 없이 — 사파리로 열어 보기

```sh
sh serve.sh          # http — 측정은 되지만 카메라는 잠깁니다
sh serve.sh https    # https — 카메라까지 되지만 인증서를 신뢰해야 합니다
```

폰과 컴퓨터가 같은 와이파이에 있어야 합니다. 출력된 주소를 사파리에서 여세요.

## 확인해야 할 것 — 앱 안 「기기 진단」

홈 화면 맨 아래 **「기기 진단」** 버튼을 눌러 주세요. 세 가지를 확인합니다.

| 항목 | 무엇을 보나 |
|---|---|
| 1. 되는 것 / 안 되는 것 | 화면 크기, 엔진 로딩, 카메라 가능 여부, 저장 |
| 2. 실제로 재 보기 | 내장 예시 사진으로 측정 — **249.4mm 근처**면 정상 |
| 3. 카메라 | 카메라가 열리는지, 해상도가 얼마인지 |

맨 아래 **「진단 결과 복사하기」** 를 누르면 내용이 통째로 복사됩니다.
문제가 있으면 그 내용을 그대로 보내 주세요.

## 막혔을 때 — `sh doctor.sh`

빌드나 설치가 안 되면 이것부터 돌려 주세요. 환경·설정·빌드·만들어진 앱까지
차례로 확인하고, 어디서 틀어졌는지 알려 줍니다. 결과를 그대로 보내 주시면 됩니다.

```sh
cd footscan/ios
sh doctor.sh
```

### 자주 나오는 오류

**`Simulator device failed to install the application. Missing bundle ID.`**

빌드는 됐는데, 만들어진 앱 안에 Info.plist 나 Bundle ID 가 없다는 뜻입니다.

```sh
# 만들어진 앱 안을 직접 들여다봅니다
plutil -p ~/Library/Developer/Xcode/DerivedData/FootScan-*/Build/Products/Debug-iphonesimulator/FootScan.app/Info.plist
```

- **`No such file`** → 앱 안에 Info.plist 가 아예 없습니다 (프로젝트 설정 문제)
- **떴는데 `CFBundleIdentifier` 가 없거나 빈 문자열** → 치환이 실패한 것

차례로 시도해 보세요.

1. `sh doctor.sh` — 어디서 틀어졌는지 알려 줍니다
2. 프로젝트 파일이 예전 것일 수 있습니다:
   `python3 make_project.py` 로 다시 만든 뒤,
   Xcode 를 완전히 닫았다가 다시 여세요
3. DerivedData 를 지우고 다시:
   ```sh
   rm -rf ~/Library/Developer/Xcode/DerivedData/FootScan-*
   ```
   Xcode 에서 **Product > Clean Build Folder** (⇧⌘K) 후 실행
4. 그래도 안 되면 **[플랜 B](PlanB/README.md)** — Xcode 가 직접 만든
   프로젝트에 파일만 옮겨 붙입니다. 10분이면 되고, 프로젝트 파일을
   Xcode 가 만들기 때문에 이 오류가 생길 수 없습니다.

> 이 프로젝트는 Xcode 가 Info.plist 를 직접 만들도록(`GENERATE_INFOPLIST_FILE = YES`)
> 되어 있어 Bundle ID 가 비는 일이 없어야 합니다. 예전 방식(Info.plist 안에
> `$(PRODUCT_BUNDLE_IDENTIFIER)` 라고 적어 두는 방식)에서 이 오류가 났습니다.

**`Signing for "FootScan" requires a development team.`**

Signing & Capabilities 에서 **Team** 을 본인 Apple ID 로 고르세요.

**`Unable to install ... The provisioning profile ... bundle identifier is not available.`**

Bundle Identifier 가 남이 쓰고 있는 이름입니다. `com.본인이름.footscan` 처럼 바꾸세요.

## 구조

| 파일 | 하는 일 |
|---|---|
| `FootScan/AppDelegate.swift` | 앱 시작 — 안쪽 서버를 켜고 화면을 띄웁니다 |
| `FootScan/LocalServer.swift` | 127.0.0.1 에만 붙는 아주 작은 웹 서버 |
| `FootScan/WebViewController.swift` | 화면 전체를 채우는 웹뷰 + 카메라 권한 처리 |
| `FootScan/Info.plist` | 카메라·사진 사용 이유(애플 심사 필수), 세로 고정 |
|  `FootScan/web/index.html` | `../app/app.html` 복사본 (`sync_web.sh` 가 만듭니다) |
| `make_project.py` | `FootScan.xcodeproj` 를 만들어 내는 스크립트 |
| `doctor.sh` | 빌드가 안 될 때 원인을 찾아 주는 점검 스크립트 |
| `PlanB/` | 이 프로젝트가 안 되면 쓰는 대안 — Xcode 로 새로 만들어 붙이기 |

### 왜 앱 안에 서버를 띄우나

브라우저는 **"안전한 주소"에서만 카메라를 열어 줍니다.** 파일을 직접 여는
`file://` 방식은 기기·OS 버전에 따라 안전한 주소로 쳐 주기도, 안 쳐 주기도 합니다.
`127.0.0.1`(내 폰 자신)은 어디서나 안전한 주소로 인정되므로, 앱 안에 작은 서버를
띄우고 그 주소로 화면을 엽니다. 바깥에서는 접속할 수 없습니다.

서버가 뜨지 않으면 `file://` 로 넘어가 **측정은 그대로 되고 카메라만 잠깁니다.**

### 왜 iOS 15 이상인가

웹뷰 안에서 카메라를 허용하는 API(`requestMediaCapturePermissionFor`)가
iOS 15 부터입니다. 그 아래에서는 카메라가 열리지 않고 사진첩만 됩니다.

## 웹 쪽을 고쳤을 때

```sh
sh ../app/build.sh   # 조각 파일 → app.html
sh sync_web.sh       # app.html → FootScan/web/index.html
```

그다음 Xcode 에서 다시 Run 하면 됩니다. `web` 은 폴더째로 번들에 들어가므로
파일을 추가해도 프로젝트 설정을 건드릴 필요가 없습니다.

## 프로젝트 파일을 다시 만들려면

```sh
python3 make_project.py          # FootScan.xcodeproj 새로 생성
python3 make_project.py --check  # 참조가 맞는지 검사만
```

---
본 측정값은 참고용이며 의료적 진단이 아닙니다.
