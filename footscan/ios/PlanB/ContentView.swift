//  ContentView.swift
//  Xcode 가 만들어 준 ContentView.swift 의 내용을 통째로 이것으로 바꾸세요.
//  (SwiftUI 로 새 프로젝트를 만든 경우입니다)

import SwiftUI
import WebKit

struct ContentView: View {
    var body: some View {
        FootScanWebView()
            .ignoresSafeArea()
    }
}

/// 화면 전체를 채우는 웹뷰. 안에서 도는 것은 web/index.html 입니다.
struct FootScanWebView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebHost { WebHost() }
    func updateUIViewController(_ vc: WebHost, context: Context) {}
}

final class WebHost: UIViewController, WKUIDelegate, WKNavigationDelegate {

    private var webView: WKWebView!
    private var server: LocalServer?
    private let errorLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true               // 카메라 미리보기를 화면 안에서
        cfg.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        errorLabel.numberOfLines = 0
        errorLabel.textColor = .white
        errorLabel.textAlignment = .center
        errorLabel.font = .systemFont(ofSize: 15)
        errorLabel.isHidden = true
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorLabel)
        NSLayoutConstraint.activate([
            errorLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            errorLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            errorLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
        ])

        load()
    }

    private func load() {
        // 카메라는 '안전한 주소'에서만 열립니다. 127.0.0.1 은 어디서나 안전한 주소입니다.
        let root = Bundle.main.url(forResource: "web", withExtension: nil) ?? Bundle.main.bundleURL
        let srv = LocalServer(root: root)
        if let port = srv.start(), let url = URL(string: "http://127.0.0.1:\(port)/index.html") {
            server = srv
            webView.load(URLRequest(url: url))
            return
        }
        // 예비: 파일을 직접 엽니다 (측정은 되고 카메라만 잠깁니다)
        guard let file = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")
                ?? Bundle.main.url(forResource: "index", withExtension: "html") else {
            errorLabel.text = "앱 안에서 index.html 을 찾지 못했습니다.\nweb 폴더를 «Create folder references» 로 넣었는지 확인해 주세요."
            errorLabel.isHidden = false
            webView.isHidden = true
            return
        }
        webView.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
    }

    // 이 메서드가 없으면 웹 안에서 카메라를 요청해도 iOS 가 조용히 거부합니다
    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let trusted = origin.host == "127.0.0.1" || origin.`protocol` == "file"
        decisionHandler(trusted ? .grant : .deny)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler() })
        present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "취소", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "확인", style: .default) { _ in completionHandler(true) })
        present(a, animated: true)
    }
}
