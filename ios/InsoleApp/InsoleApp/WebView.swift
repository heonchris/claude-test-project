//
//  WebView.swift
//
//  앱 번들 안의 web/index.html 을 WKWebView 로 띄웁니다.
//

import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        // <html> 에 native 클래스를 붙입니다.
        // CSS 가 이걸 보고 기기 프레임을 벗고 전체화면으로 그립니다.
        // (아이패드처럼 폭이 넓어도 폰 프레임이 뜨지 않게 하는 장치)
        let flag = WKUserScript(
            source: "document.documentElement.classList.add('native');",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(flag)

        let webView = WKWebView(frame: .zero, configuration: config)

        // 웹페이지가 아니라 앱처럼 보이게 하는 설정들
        webView.scrollView.bounces = false                        // 끝에서 튕기지 않게
        webView.scrollView.contentInsetAdjustmentBehavior = .never // 자동 여백 삽입 끄기
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.minimumZoomScale = 1                   // 확대/축소 막기
        webView.scrollView.maximumZoomScale = 1

        // 다크 모드에서 흰 배경이 번쩍이지 않도록 투명 처리
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear

        load(into: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) { }

    private func load(into webView: WKWebView) {
        // web 을 "폴더 참조(파란 폴더)" 로 추가해야 subdirectory 로 찾힙니다.
        // 노란 그룹으로 추가하면 여기서 nil 이 나옵니다. README 참고.
        guard let url = Bundle.main.url(forResource: "index",
                                        withExtension: "html",
                                        subdirectory: "web") else {
            webView.loadHTMLString(Self.missingResourceHTML, baseURL: nil)
            return
        }

        // 같은 폴더의 css/, js/ 까지 읽을 수 있게 상위 폴더 접근을 허용합니다.
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
    }

    /// 번들에 web 폴더가 안 들어갔을 때 빈 흰 화면 대신 원인을 보여줍니다.
    private static let missingResourceHTML = """
    <!doctype html><html lang="ko"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body{font:16px -apple-system,sans-serif;padding:2rem;line-height:1.7;color:#111}
      code{background:#eee;padding:.1em .35em;border-radius:3px}
      h1{font-size:1.2rem}
      @media (prefers-color-scheme:dark){body{background:#111;color:#eee}code{background:#333}}
    </style></head><body>
    <h1>web 폴더를 찾지 못했습니다</h1>
    <p>앱 번들에 <code>web/index.html</code> 이 들어 있지 않습니다.
    거의 항상 폴더를 <b>노란 그룹</b>으로 추가해서 생기는 문제입니다.</p>
    <p><b>고치는 법</b><br>
    프로젝트에서 <code>web</code> 폴더를 지운 뒤(Remove Reference),
    Finder 에서 다시 끌어다 놓고 <b>Create folder references</b>(파란 폴더)를
    선택하세요. Target Membership 도 체크되어 있어야 합니다.</p>
    </body></html>
    """
}
