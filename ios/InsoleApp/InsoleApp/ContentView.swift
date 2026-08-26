//
//  ContentView.swift
//
//  ignoresSafeArea() 로 화면 끝까지 웹뷰를 채우고,
//  노치·홈 인디케이터 회피는 CSS 의 env(safe-area-inset-*) 에 맡깁니다.
//  (그래서 index.html 의 viewport 에 viewport-fit=cover 가 필요합니다)
//

import SwiftUI

struct ContentView: View {
    var body: some View {
        WebView()
            .ignoresSafeArea()
    }
}

#Preview {
    ContentView()
}
