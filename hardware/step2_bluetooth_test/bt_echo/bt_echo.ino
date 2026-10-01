/*
 * 메아리 — 모듈이 보내오는 것을 USB 로 그대로 찍는다
 *
 * 목적: 지금까지 확인한 것은 모두 '아두이노 -> 모듈' 방향이었다.
 *       반대 방향(휴대폰 -> 모듈 -> 아두이노)이 되는지 보면
 *       모듈의 어느 쪽이 죽었는지 갈린다.
 *
 * 쓰는 법
 *   1. 이 스케치를 올리고 시리얼 모니터를 연다 (9600)
 *   2. 휴대폰 블루투스를 켜고 앱에서 [인솔 연결]
 *   3. 앱 [진단] 탭의 [모듈로 HELLO 보내기] 를 누른다
 *   4. 시리얼 모니터를 본다
 *
 * 결과 읽는 법
 *   HELLO 가 그대로 찍힌다
 *     -> 모듈 TXD -> 2번 경로와 통신 속도가 모두 정상.
 *        문제는 아두이노 -> 모듈(3번 -> RXD) 쪽 하나로 좁혀진다.
 *   글자가 깨져서 찍힌다
 *     -> 경로는 살아 있고 통신 속도만 다르다. 16진수를 보면 알 수 있다.
 *   아무것도 안 찍힌다
 *     -> 모듈 TXD 쪽도 죽어 있다. 양방향 모두 안 되는 것이므로
 *        모듈 자체이거나 전원 문제다.
 */

#include <SoftwareSerial.h>

SoftwareSerial bt(2, 3);   /* RX=2(모듈 TXD), TX=3(모듈 RXD) */

unsigned long total = 0;

void setup() {
  Serial.begin(9600);
  while (!Serial) { }
  bt.begin(9600);
  bt.listen();
  delay(300);

  Serial.println();
  Serial.println(F("=== 메아리 (모듈 -> 아두이노) ==="));
  Serial.println(F("앱에서 [모듈로 HELLO 보내기] 를 누르세요."));
  Serial.println(F("여기에 HELLO 가 찍히면 그 방향은 정상입니다."));
  Serial.println();
}

void loop() {
  while (bt.available()) {
    byte b = bt.read();
    total++;

    Serial.print(F("["));
    if (b >= 32 && b < 127) Serial.write(b);    /* 읽을 수 있는 글자면 그대로 */
    else                    Serial.print(F("?"));
    Serial.print(F("] 0x"));
    if (b < 16) Serial.print(F("0"));
    Serial.print(b, HEX);
    Serial.print(F("   누적 "));
    Serial.println(total);
  }

  /* 5초마다 살아 있음을 알린다. 아무것도 안 올 때 멈춘 것과 구분하기 위함. */
  static unsigned long last = 0;
  if (millis() - last >= 5000) {
    last = millis();
    if (total == 0) Serial.println(F("... 아직 받은 것이 없습니다"));
  }
}
