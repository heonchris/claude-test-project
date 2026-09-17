import UIKit
import WebKit

/// 앱 화면 전체를 차지하는 웹뷰입니다.
/// 안에서 도는 것은 ../app/app.html 과 똑같은 파일입니다.
final class WebViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {

    private var webView: WKWebView!
    private let server: LocalServer
    private let errorLabel = UILabel()

    init(server: LocalServer) {
        self.server = server
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("스토리보드를 쓰지 않습니다") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let cfg = WKWebViewConfiguration()
        // 카메라 미리보기가 전체화면으로 튀어나가지 않고 화면 안에서 재생되도록
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = .black
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
        if server.port > 0, let url = URL(string: "http://127.0.0.1:\(server.port)/index.html") {
            // 정상 경로: 내 폰 안의 주소 → 카메라가 열립니다
            webView.load(URLRequest(url: url))
            return
        }
        // 예비 경로: 서버가 안 뜨면 파일을 직접 엽니다.
        // 측정은 되지만 기기에 따라 카메라가 잠길 수 있습니다.
        guard let file = Bundle.main.url(forResource: "index", withExtension: "html",
                                         subdirectory: "Resources")
                ?? Bundle.main.url(forResource: "index", withExtension: "html") else {
            show(error: "앱 안에서 index.html 을 찾지 못했습니다.\n빌드 설정의 Copy Bundle Resources 를 확인해 주세요.")
            return
        }
        webView.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent())
    }

    private func show(error: String) {
        errorLabel.text = error
        errorLabel.isHidden = false
        webView.isHidden = true
    }

    // MARK: - 카메라 권한
    // 이 메서드가 없으면 웹 안에서 카메라를 요청해도 iOS 가 조용히 거부합니다.

    @available(iOS 15.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        // 앱 안에 넣어 둔 우리 화면만 허용합니다
        // `protocol` 은 스위프트 예약어라 역따옴표로 감싸야 합니다
        let trusted = origin.host == "127.0.0.1" || origin.`protocol` == "file"
        decisionHandler(trusted ? .grant : .deny)
    }

    // 웹에서 alert/confirm 을 쓰면 기본적으로 아무 일도 일어나지 않으므로 연결해 둡니다
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

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        show(error: "화면을 불러오지 못했습니다.\n\(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        show(error: "화면을 불러오지 못했습니다.\n\(error.localizedDescription)")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
