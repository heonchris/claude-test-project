package com.woo.footscan;

import android.content.res.AssetManager;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * 앱 안에서만 도는 아주 작은 웹 서버입니다.
 *
 * 왜 필요한가:
 *   브라우저는 카메라를 "안전한 주소"에서만 열어 줍니다. 앱 안의 파일을 그냥 여는
 *   file:// 방식은 안전한 주소로 쳐 주지 않습니다.
 *   127.0.0.1(내 폰 자신)은 어디서나 안전한 주소로 인정되므로,
 *   앱 안에 작은 서버를 띄우고 그 주소로 화면을 엽니다.
 *
 * 127.0.0.1 에만 붙으므로 같은 와이파이의 다른 기기는 접속할 수 없습니다.
 */
final class LocalServer {

    private final AssetManager assets;
    private ServerSocket socket;
    private Thread thread;
    private volatile boolean running;

    /** 실제로 열린 포트. 서버가 뜨기 전에는 0 입니다. */
    int port = 0;

    LocalServer(AssetManager assets) {
        this.assets = assets;
    }

    /** 서버를 켭니다. 성공하면 포트 번호, 실패하면 0. */
    int start() {
        try {
            // 0 을 주면 비어 있는 포트를 운영체제가 골라 줍니다
            socket = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
            port = socket.getLocalPort();
        } catch (IOException e) {
            return 0;
        }
        running = true;
        thread = new Thread(this::loop, "footscan-server");
        thread.setDaemon(true);
        thread.start();
        return port;
    }

    void stop() {
        running = false;
        try { if (socket != null) socket.close(); } catch (IOException ignored) { }
    }

    private void loop() {
        while (running) {
            try (Socket client = socket.accept()) {
                handle(client);
            } catch (IOException e) {
                if (running) continue;
                return;
            }
        }
    }

    private void handle(Socket client) throws IOException {
        InputStream in = client.getInputStream();
        OutputStream out = client.getOutputStream();

        // 요청 첫 줄만 읽으면 됩니다: "GET /index.html HTTP/1.1"
        StringBuilder line = new StringBuilder();
        int c;
        while ((c = in.read()) != -1 && c != '\n' && line.length() < 4096) {
            if (c != '\r') line.append((char) c);
        }
        String[] parts = line.toString().split(" ");
        if (parts.length < 2) { send(out, "400 Bad Request", "text/plain", new byte[0]); return; }

        String path = parts[1];
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        if (path.equals("/")) path = "/index.html";
        // 상위 폴더로 빠져나가는 경로는 막습니다
        if (path.contains("..")) { send(out, "403 Forbidden", "text/plain", new byte[0]); return; }

        byte[] body;
        try {
            body = readAsset("web" + path);
        } catch (IOException e) {
            send(out, "404 Not Found", "text/plain", "not found".getBytes(StandardCharsets.UTF_8));
            return;
        }
        send(out, "200 OK", mime(path), body);
    }

    private byte[] readAsset(String name) throws IOException {
        try (InputStream is = assets.open(name)) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream(Math.max(is.available(), 8192));
            byte[] buf = new byte[16384];
            int n;
            while ((n = is.read(buf)) != -1) bos.write(buf, 0, n);
            return bos.toByteArray();
        }
    }

    private void send(OutputStream out, String status, String type, byte[] body) throws IOException {
        String head = "HTTP/1.1 " + status + "\r\n"
                + "Content-Type: " + type + "\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + "Cache-Control: no-store\r\n"
                + "Connection: close\r\n\r\n";
        out.write(head.getBytes(StandardCharsets.UTF_8));
        out.write(body);
        out.flush();
    }

    private static String mime(String path) {
        // Locale.ROOT 를 지정합니다. 터키어 등 일부 언어에서는
        // toLowerCase() 가 I 를 다르게 바꿔 확장자 비교가 틀어집니다.
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html; charset=utf-8";
        if (p.endsWith(".js"))   return "application/javascript; charset=utf-8";
        if (p.endsWith(".css"))  return "text/css; charset=utf-8";
        if (p.endsWith(".json")) return "application/json; charset=utf-8";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".png"))  return "image/png";
        return "application/octet-stream";
    }
}
