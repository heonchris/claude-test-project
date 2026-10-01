/*
 * 2단계-B · 센서값을 무선으로 보내기
 *
 * 목적: 센서 → 아두이노 → 블루투스 → 휴대폰 경로가 끝까지
 *       이어지는지 눈으로 확인한다.
 *
 * 보내는 것: A0 의 원본값(0~1023)을 글자로. 1초에 10번.
 *            여기서는 아직 34바이트 규격 패킷을 쓰지 않는다.
 *            글자로 보내야 휴대폰의 아무 시리얼 앱으로나 볼 수 있어
 *            어디서 끊겼는지 바로 보인다.
 *
 * 배선: at_check 와 동일 + 센서 회로(1단계와 동일)
 *   5V ── ⓐ줄 ── FSR ── ⓑ줄 ──┬── A0
 *                               └── 10kΩ ── ⓒ줄 ── GND
 *
 * 확인: 휴대폰에 시리얼 터미널 앱을 깔고 연결한다.
 *   - BLE 모듈(HM-10/AT-09/BT05) → "nRF Connect" 또는 "Serial Bluetooth Terminal"
 *   - 클래식 모듈(HC-05/06)       → "Serial Bluetooth Terminal" (안드로이드만)
 *
 * 숫자가 흐르면 성공이다. 센서를 누를 때 숫자가 따라 움직여야 한다.
 */

#include <SoftwareSerial.h>

SoftwareSerial bt(2, 3);

const int FSR_PIN = A0;

void setup() {
  Serial.begin(9600);    // USB 쪽. 같은 값을 PC 에서도 볼 수 있다
  bt.begin(9600);
}

void loop() {
  int raw = analogRead(FSR_PIN);

  bt.println(raw);       // 무선으로
  Serial.println(raw);   // USB 로 (양쪽 값이 같아야 정상)

  delay(100);            // 1초에 10번. 글자로 보내므로 넉넉하게
}
