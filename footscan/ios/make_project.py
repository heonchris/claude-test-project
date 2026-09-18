"""FootScan.xcodeproj 를 만들어 냅니다.

Xcode 프로젝트 파일은 사람이 손으로 쓰기엔 번거로운 형식이라 스크립트로 찍어 냅니다.
파일을 추가하거나 설정을 바꿀 일이 생기면 이 스크립트를 고치고 다시 돌리세요.

    python3 make_project.py          # FootScan.xcodeproj 생성
    python3 make_project.py --check  # 참조가 다 맞는지 검사만
"""

from __future__ import annotations

import argparse
import hashlib
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
PROJ = HERE / "FootScan.xcodeproj"

APP_NAME = "FootScan"
BUNDLE_ID = "com.example.footscan"       # 실기기에 넣으려면 본인 것으로 바꾸세요
DEPLOY_TARGET = "15.0"                   # 웹뷰 카메라 권한 API 가 iOS 15 부터입니다
SWIFT_FILES = ["AppDelegate.swift", "WebViewController.swift", "LocalServer.swift"]


def uid(key: str) -> str:
    """이름에서 24자리 고유 번호를 만듭니다 (매번 같은 값이 나오도록)."""
    return hashlib.sha1(key.encode()).hexdigest()[:24].upper()


def build() -> str:
    ids = {k: uid(k) for k in [
        "project", "target", "product", "group.main", "group.app", "group.products",
        "cfg.list.project", "cfg.list.target",
        "cfg.project.debug", "cfg.project.release", "cfg.target.debug", "cfg.target.release",
        "phase.sources", "phase.frameworks", "phase.resources",
        "file.info", "file.resources", "build.resources",
    ]}
    for f in SWIFT_FILES:
        ids[f"file.{f}"] = uid(f"file.{f}")
        ids[f"build.{f}"] = uid(f"build.{f}")

    L: list[str] = []
    add = L.append

    add("// !$*UTF8*$!")
    add("{")
    add("\tarchiveVersion = 1;")
    add("\tclasses = {")
    add("\t};")
    add("\tobjectVersion = 56;")
    add("\tobjects = {")

    # ---- PBXBuildFile : 어떤 파일을 어느 단계에서 쓰는지 ----
    add("\n/* Begin PBXBuildFile section */")
    for f in SWIFT_FILES:
        add(f"\t\t{ids[f'build.{f}']} /* {f} in Sources */ = {{isa = PBXBuildFile; "
            f"fileRef = {ids[f'file.{f}']} /* {f} */; }};")
    add(f"\t\t{ids['build.resources']} /* Resources in Resources */ = {{isa = PBXBuildFile; "
        f"fileRef = {ids['file.resources']} /* Resources */; }};")
    add("/* End PBXBuildFile section */")

    # ---- PBXFileReference : 실제 파일들 ----
    add("\n/* Begin PBXFileReference section */")
    add(f"\t\t{ids['product']} /* {APP_NAME}.app */ = {{isa = PBXFileReference; "
        f"explicitFileType = wrapper.application; includeInIndex = 0; "
        f"path = {APP_NAME}.app; sourceTree = BUILT_PRODUCTS_DIR; }};")
    for f in SWIFT_FILES:
        add(f"\t\t{ids[f'file.{f}']} /* {f} */ = {{isa = PBXFileReference; "
            f"lastKnownFileType = sourcecode.swift; path = {f}; sourceTree = \"<group>\"; }};")
    add(f"\t\t{ids['file.info']} /* Info.plist */ = {{isa = PBXFileReference; "
        f"lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = \"<group>\"; }};")
    # 폴더 통째로 넣기 — 번들 안에서도 web/index.html 구조가 유지됩니다
    # ('Resources' 라는 이름은 앱 번들 패키징이 쓰는 이름이라 피했습니다)
    add(f"\t\t{ids['file.resources']} /* web */ = {{isa = PBXFileReference; "
        f"lastKnownFileType = folder; path = web; sourceTree = \"<group>\"; }};")
    add("/* End PBXFileReference section */")

    # ---- PBXFrameworksBuildPhase ----
    add("\n/* Begin PBXFrameworksBuildPhase section */")
    add(f"\t\t{ids['phase.frameworks']} /* Frameworks */ = {{")
    add("\t\t\tisa = PBXFrameworksBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (\n\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXFrameworksBuildPhase section */")

    # ---- PBXGroup : 왼쪽 파일 목록 트리 ----
    add("\n/* Begin PBXGroup section */")
    add(f"\t\t{ids['group.main']} = {{")
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add(f"\t\t\t\t{ids['group.app']} /* {APP_NAME} */,")
    add(f"\t\t\t\t{ids['group.products']} /* Products */,")
    add("\t\t\t);")
    add("\t\t\tsourceTree = \"<group>\";")
    add("\t\t};")
    add(f"\t\t{ids['group.app']} /* {APP_NAME} */ = {{")
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    for f in SWIFT_FILES:
        add(f"\t\t\t\t{ids[f'file.{f}']} /* {f} */,")
    add(f"\t\t\t\t{ids['file.info']} /* Info.plist */,")
    add(f"\t\t\t\t{ids['file.resources']} /* web */,")
    add("\t\t\t);")
    add(f"\t\t\tpath = {APP_NAME};")
    add("\t\t\tsourceTree = \"<group>\";")
    add("\t\t};")
    add(f"\t\t{ids['group.products']} /* Products */ = {{")
    add("\t\t\tisa = PBXGroup;")
    add("\t\t\tchildren = (")
    add(f"\t\t\t\t{ids['product']} /* {APP_NAME}.app */,")
    add("\t\t\t);")
    add("\t\t\tname = Products;")
    add("\t\t\tsourceTree = \"<group>\";")
    add("\t\t};")
    add("/* End PBXGroup section */")

    # ---- PBXNativeTarget ----
    add("\n/* Begin PBXNativeTarget section */")
    add(f"\t\t{ids['target']} /* {APP_NAME} */ = {{")
    add("\t\t\tisa = PBXNativeTarget;")
    add(f"\t\t\tbuildConfigurationList = {ids['cfg.list.target']} /* Build configuration list for PBXNativeTarget \"{APP_NAME}\" */;")
    add("\t\t\tbuildPhases = (")
    add(f"\t\t\t\t{ids['phase.sources']} /* Sources */,")
    add(f"\t\t\t\t{ids['phase.frameworks']} /* Frameworks */,")
    add(f"\t\t\t\t{ids['phase.resources']} /* Resources */,")
    add("\t\t\t);")
    add("\t\t\tbuildRules = (\n\t\t\t);")
    add("\t\t\tdependencies = (\n\t\t\t);")
    add(f"\t\t\tname = {APP_NAME};")
    add(f"\t\t\tproductName = {APP_NAME};")
    add(f"\t\t\tproductReference = {ids['product']} /* {APP_NAME}.app */;")
    add("\t\t\tproductType = \"com.apple.product-type.application\";")
    add("\t\t};")
    add("/* End PBXNativeTarget section */")

    # ---- PBXProject ----
    add("\n/* Begin PBXProject section */")
    add(f"\t\t{ids['project']} /* Project object */ = {{")
    add("\t\t\tisa = PBXProject;")
    add("\t\t\tattributes = {")
    add("\t\t\t\tBuildIndependentTargetsInParallel = 1;")
    add("\t\t\t\tLastUpgradeCheck = 1500;")
    add("\t\t\t\tTargetAttributes = {")
    add(f"\t\t\t\t\t{ids['target']} = {{")
    add("\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;")
    add("\t\t\t\t\t};")
    add("\t\t\t\t};")
    add("\t\t\t};")
    add(f"\t\t\tbuildConfigurationList = {ids['cfg.list.project']} /* Build configuration list for PBXProject \"{APP_NAME}\" */;")
    add("\t\t\tcompatibilityVersion = \"Xcode 14.0\";")
    add("\t\t\tdevelopmentRegion = ko;")
    add("\t\t\thasScannedForEncodings = 0;")
    add("\t\t\tknownRegions = (\n\t\t\t\tko,\n\t\t\t\tBase,\n\t\t\t);")
    add(f"\t\t\tmainGroup = {ids['group.main']};")
    add(f"\t\t\tproductRefGroup = {ids['group.products']} /* Products */;")
    add("\t\t\tprojectDirPath = \"\";")
    add("\t\t\tprojectRoot = \"\";")
    add("\t\t\ttargets = (")
    add(f"\t\t\t\t{ids['target']} /* {APP_NAME} */,")
    add("\t\t\t);")
    add("\t\t};")
    add("/* End PBXProject section */")

    # ---- PBXResourcesBuildPhase ----
    add("\n/* Begin PBXResourcesBuildPhase section */")
    add(f"\t\t{ids['phase.resources']} /* Resources */ = {{")
    add("\t\t\tisa = PBXResourcesBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    add(f"\t\t\t\t{ids['build.resources']} /* web in Resources */,")
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXResourcesBuildPhase section */")

    # ---- PBXSourcesBuildPhase ----
    add("\n/* Begin PBXSourcesBuildPhase section */")
    add(f"\t\t{ids['phase.sources']} /* Sources */ = {{")
    add("\t\t\tisa = PBXSourcesBuildPhase;")
    add("\t\t\tbuildActionMask = 2147483647;")
    add("\t\t\tfiles = (")
    for f in SWIFT_FILES:
        add(f"\t\t\t\t{ids[f'build.{f}']} /* {f} in Sources */,")
    add("\t\t\t);")
    add("\t\t\trunOnlyForDeploymentPostprocessing = 0;")
    add("\t\t};")
    add("/* End PBXSourcesBuildPhase section */")

    # ---- XCBuildConfiguration ----
    common = [
        "ALWAYS_SEARCH_USER_PATHS = NO;",
        "CLANG_ENABLE_MODULES = YES;",
        "CLANG_ENABLE_OBJC_ARC = YES;",
        "COPY_PHASE_STRIP = NO;",
        "ENABLE_STRICT_OBJC_MSGSEND = YES;",
        f"IPHONEOS_DEPLOYMENT_TARGET = {DEPLOY_TARGET};",
        "SDKROOT = iphoneos;",
        "SWIFT_VERSION = 5.0;",
    ]
    target_common = [
        "CODE_SIGN_STYLE = Automatic;",
        "CURRENT_PROJECT_VERSION = 1;",
        # Xcode 가 Info.plist 를 만들고, 아래 INFOPLIST_FILE 을 거기에 합칩니다.
        # CFBundleIdentifier 를 Xcode 가 직접 넣어 주므로
        # "Missing bundle ID" 로 설치가 실패하는 일이 없습니다.
        "GENERATE_INFOPLIST_FILE = YES;",
        f"INFOPLIST_FILE = {APP_NAME}/Info.plist;",
        "INFOPLIST_KEY_UILaunchScreen_Generation = YES;",
        "INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait;",
        "LD_RUNPATH_SEARCH_PATHS = (\n\t\t\t\t\t\"$(inherited)\",\n\t\t\t\t\t\"@executable_path/Frameworks\",\n\t\t\t\t);",
        "MARKETING_VERSION = 0.1;",
        f"PRODUCT_BUNDLE_IDENTIFIER = {BUNDLE_ID};",
        "PRODUCT_NAME = \"$(TARGET_NAME)\";",
        "SWIFT_EMIT_LOC_STRINGS = YES;",
        "TARGETED_DEVICE_FAMILY = 1;",   # 아이폰 전용 (세로 고정이라 아이패드는 제외)
    ]

    def cfg(key: str, name: str, settings: list[str]) -> None:
        add(f"\t\t{ids[key]} /* {name} */ = {{")
        add("\t\t\tisa = XCBuildConfiguration;")
        add("\t\t\tbuildSettings = {")
        for line in settings:
            add(f"\t\t\t\t{line}")
        add("\t\t\t};")
        add(f"\t\t\tname = {name};")
        add("\t\t};")

    add("\n/* Begin XCBuildConfiguration section */")
    cfg("cfg.project.debug", "Debug", common + [
        "DEBUG_INFORMATION_FORMAT = dwarf;",
        "ENABLE_TESTABILITY = YES;",
        "GCC_OPTIMIZATION_LEVEL = 0;",
        "ONLY_ACTIVE_ARCH = YES;",
        "SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;",
        "SWIFT_OPTIMIZATION_LEVEL = \"-Onone\";",
    ])
    cfg("cfg.project.release", "Release", common + [
        "DEBUG_INFORMATION_FORMAT = \"dwarf-with-dsym\";",
        "ENABLE_NS_ASSERTIONS = NO;",
        "SWIFT_COMPILATION_MODE = wholemodule;",
        "VALIDATE_PRODUCT = YES;",
    ])
    cfg("cfg.target.debug", "Debug", target_common)
    cfg("cfg.target.release", "Release", target_common)
    add("/* End XCBuildConfiguration section */")

    # ---- XCConfigurationList ----
    add("\n/* Begin XCConfigurationList section */")
    for key, name, debug, release in [
        ("cfg.list.project", f"Build configuration list for PBXProject \"{APP_NAME}\"",
         "cfg.project.debug", "cfg.project.release"),
        ("cfg.list.target", f"Build configuration list for PBXNativeTarget \"{APP_NAME}\"",
         "cfg.target.debug", "cfg.target.release"),
    ]:
        add(f"\t\t{ids[key]} /* {name} */ = {{")
        add("\t\t\tisa = XCConfigurationList;")
        add("\t\t\tbuildConfigurations = (")
        add(f"\t\t\t\t{ids[debug]} /* Debug */,")
        add(f"\t\t\t\t{ids[release]} /* Release */,")
        add("\t\t\t);")
        add("\t\t\tdefaultConfigurationIsVisible = 0;")
        add("\t\t\tdefaultConfigurationName = Release;")
        add("\t\t};")
    add("/* End XCConfigurationList section */")

    add("\t};")
    add(f"\trootObject = {ids['project']} /* Project object */;")
    add("}")
    return "\n".join(L) + "\n"


SCHEME = """<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="1500" version="1.7">
   <BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES"
                           buildForArchiving="YES" buildForAnalyzing="YES">
            <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="__TARGET__"
               BuildableName="__APP__.app" BlueprintName="__APP__"
               ReferencedContainer="container:__APP__.xcodeproj"/>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier="Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle="0"
      useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES"
      debugServiceExtension="internal" allowLocationSimulation="YES">
      <BuildableProductRunnable runnableDebuggingMode="0">
         <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="__TARGET__"
            BuildableName="__APP__.app" BlueprintName="__APP__"
            ReferencedContainer="container:__APP__.xcodeproj"/>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier=""
      useCustomWorkingDirectory="NO" debugDocumentVersioning="YES">
      <BuildableProductRunnable runnableDebuggingMode="0">
         <BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="__TARGET__"
            BuildableName="__APP__.app" BlueprintName="__APP__"
            ReferencedContainer="container:__APP__.xcodeproj"/>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction buildConfiguration="Debug"/>
   <ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>
"""


def check(text: str) -> int:
    """쓰인 24자리 번호가 모두 '정의'되어 있는지 확인합니다."""
    defined = set(re.findall(r"^\t\t([0-9A-F]{24}) /\*.*?\*/ = \{", text, re.M))
    defined |= set(re.findall(r"^\t\t([0-9A-F]{24}) = \{", text, re.M))
    used = set(re.findall(r"\b([0-9A-F]{24})\b", text))
    missing = used - defined
    unused = defined - (used - defined)
    print(f"정의 {len(defined)}개 · 참조 {len(used)}개")
    if missing:
        print("✗ 정의 없이 참조된 번호:", sorted(missing))
        return 1
    print("✓ 모든 참조가 정의와 맞습니다")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    text = build()
    if args.check:
        sys.exit(check(text))

    (PROJ / "xcshareddata" / "xcschemes").mkdir(parents=True, exist_ok=True)
    (PROJ / "project.pbxproj").write_text(text, encoding="utf-8")
    (PROJ / "xcshareddata" / "xcschemes" / f"{APP_NAME}.xcscheme").write_text(
        SCHEME.replace("__TARGET__", uid("target")).replace("__APP__", APP_NAME),
        encoding="utf-8")
    print(f"{PROJ} 생성 완료")
    sys.exit(check(text))


if __name__ == "__main__":
    main()
