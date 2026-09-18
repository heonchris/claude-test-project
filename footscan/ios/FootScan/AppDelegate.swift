import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?
    private var server: LocalServer?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {

        // 앱 안에 넣어 둔 웹 파일이 있는 폴더
        let root = Bundle.main.url(forResource: "web", withExtension: nil)
            ?? Bundle.main.bundleURL

        let server = LocalServer(root: root)
        _ = server.start()
        self.server = server

        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = WebViewController(server: server)
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}
