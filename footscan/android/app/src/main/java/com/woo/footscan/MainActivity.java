package com.woo.footscan;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

/**
 * 화면 전체를 채우는 웹뷰 하나가 전부입니다.
 * 측정은 안에 들어 있는 웹 화면(assets/web/index.html)이 직접 합니다.
 * 이 앱은 카메라가 열리게 해 주는 껍데기 역할만 합니다.
 */
public class MainActivity extends Activity {

    private static final int REQ_CAMERA = 1001;
    private static final int REQ_FILE = 1002;

    private WebView webView;
    private LocalServer server;
    private ValueCallback<Uri[]> filePicker;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        // 카메라 권한을 먼저 물어봅니다. 거부해도 사진첩으로는 측정됩니다.
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
        }

        server = new LocalServer(getAssets());
        int port = server.start();

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.BLACK);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);                      // 측정 이력 저장에 씁니다
        s.setMediaPlaybackRequiresUserGesture(false);      // 카메라 미리보기가 바로 뜨도록
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {

            /** 웹 화면이 카메라를 요청할 때. 이게 없으면 조용히 거부됩니다. */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    // 앱 안에 넣어 둔 우리 화면만 허용합니다
                    String host = request.getOrigin() != null ? request.getOrigin().getHost() : "";
                    if ("127.0.0.1".equals(host)) request.grant(request.getResources());
                    else request.deny();
                });
            }

            /** <input type="file"> 을 눌렀을 때 사진첩을 엽니다. 없으면 아무 일도 안 일어납니다. */
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePicker != null) filePicker.onReceiveValue(null);
                filePicker = cb;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    filePicker = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);

        if (port > 0) {
            // 정상 경로: 내 폰 안의 주소 → 카메라가 열립니다
            webView.loadUrl("http://127.0.0.1:" + port + "/index.html");
        } else {
            // 예비 경로: 서버가 안 뜨면 파일을 직접 엽니다.
            // 측정은 되지만 카메라는 잠깁니다.
            s.setAllowFileAccess(true);
            webView.loadUrl("file:///android_asset/web/index.html");
        }
    }

    @Override
    protected void onActivityResult(int req, int result, Intent data) {
        if (req != REQ_FILE) { super.onActivityResult(req, result, data); return; }
        if (filePicker == null) return;
        filePicker.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(result, data));
        filePicker = null;
    }

    /** 안드로이드 뒤로가기 버튼이 앱 안의 이전 화면으로 가도록 */
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (server != null) server.stop();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
