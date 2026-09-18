import Foundation
import Network

/// 앱 안에서만 도는 아주 작은 웹 서버입니다.
///
/// 왜 필요한가:
///   브라우저는 카메라를 "안전한 주소"에서만 열어 줍니다. 파일을 직접 여는
///   file:// 방식은 기기·OS 버전에 따라 안전한 주소로 쳐 주기도, 안 쳐 주기도
///   합니다. 127.0.0.1(내 폰 자신)은 어디서나 안전한 주소로 인정되므로,
///   앱 안에 작은 서버를 띄우고 그 주소로 화면을 엽니다.
///
/// 바깥에서는 접속할 수 없습니다(127.0.0.1 에만 붙습니다).
final class LocalServer {

    private let root: URL
    private var listener: NWListener?
    private let queue = DispatchQueue(label: "footscan.localserver")

    /// 실제로 열린 포트 번호. 서버가 뜨기 전에는 0 입니다.
    private(set) var port: UInt16 = 0

    init(root: URL) {
        self.root = root
    }

    /// 서버를 켭니다. 성공하면 포트 번호를, 실패하면 nil 을 돌려줍니다.
    func start() -> UInt16? {
        let params = NWParameters.tcp
        // 127.0.0.1 에만 붙입니다 — 같은 와이파이의 다른 기기는 접속할 수 없습니다
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
        params.allowLocalEndpointReuse = true

        guard let listener = try? NWListener(using: params) else { return nil }
        self.listener = listener

        let ready = DispatchSemaphore(value: 0)
        listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.port = listener.port?.rawValue ?? 0
                ready.signal()
            case .failed, .cancelled:
                ready.signal()
            default:
                break
            }
        }
        listener.newConnectionHandler = { [weak self] conn in
            self?.handle(conn)
        }
        listener.start(queue: queue)

        // 서버가 뜰 때까지 잠깐(최대 3초) 기다립니다
        _ = ready.wait(timeout: .now() + 3)
        return port > 0 ? port : nil
    }

    func stop() {
        listener?.cancel()
        listener = nil
    }

    // MARK: - 요청 처리

    private func handle(_ conn: NWConnection) {
        conn.start(queue: queue)
        receive(conn, buffer: Data())
    }

    private func receive(_ conn: NWConnection, buffer: Data) {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isDone, error in
            guard let self = self else { return }
            var buf = buffer
            if let data { buf.append(data) }

            // 요청 머리말이 끝났는지(빈 줄) 확인합니다
            if let headEnd = buf.range(of: Data("\r\n\r\n".utf8)) {
                let head = String(decoding: buf[..<headEnd.lowerBound], as: UTF8.self)
                self.respond(to: head, on: conn)
                return
            }
            if error != nil || isDone || buf.count > 256 * 1024 {
                conn.cancel()
                return
            }
            self.receive(conn, buffer: buf)
        }
    }

    private func respond(to head: String, on conn: NWConnection) {
        let firstLine = head.split(separator: "\r\n", maxSplits: 1).first.map(String.init) ?? ""
        let parts = firstLine.split(separator: " ")
        guard parts.count >= 2 else { return send(status: "400 Bad Request", body: Data(), type: "text/plain", on: conn) }

        var path = String(parts[1])
        if let q = path.firstIndex(of: "?") { path = String(path[..<q]) }
        if path == "/" { path = "/index.html" }
        path = path.removingPercentEncoding ?? path

        // 상위 폴더로 빠져나가는 경로는 막습니다
        guard !path.contains("..") else {
            return send(status: "403 Forbidden", body: Data(), type: "text/plain", on: conn)
        }

        let file = root.appendingPathComponent(String(path.dropFirst()))
        guard let data = try? Data(contentsOf: file) else {
            return send(status: "404 Not Found", body: Data("not found".utf8), type: "text/plain", on: conn)
        }
        send(status: "200 OK", body: data, type: Self.mime(for: file.pathExtension), on: conn)
    }

    private func send(status: String, body: Data, type: String, on conn: NWConnection) {
        var header = "HTTP/1.1 \(status)\r\n"
        header += "Content-Type: \(type)\r\n"
        header += "Content-Length: \(body.count)\r\n"
        header += "Cache-Control: no-store\r\n"
        header += "Connection: close\r\n\r\n"
        var out = Data(header.utf8)
        out.append(body)
        conn.send(content: out, completion: .contentProcessed { _ in conn.cancel() })
    }

    private static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js":          return "application/javascript; charset=utf-8"
        case "css":         return "text/css; charset=utf-8"
        case "json":        return "application/json; charset=utf-8"
        case "jpg", "jpeg": return "image/jpeg"
        case "png":         return "image/png"
        case "svg":         return "image/svg+xml"
        default:            return "application/octet-stream"
        }
    }
}
