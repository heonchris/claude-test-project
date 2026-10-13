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
 *
 * ── 핀을 4·5번으로 쓰는 이유 ───────────────────────────
 * 처음에는 2·3번을 썼다. 그런데 실기기에서 아두이노 -> 모듈 방향만
 * 끝까지 동작하지 않았다. 배선 순서·통신 속도·모듈·앱을 모두 확인해
 * 정상임을 증명한 뒤에야, 핀을 4·5번으로 옮기자 바로 동작했다.
 * 즉 그 보드의 디지털 3번 핀이 죽어 있었다. 코드로는 찾을 수 없는
 * 고장이므로, 막히면 핀을 옮겨 보는 것을 점검 목록에 넣어 둔다.
 */

/* 보드마다 블루투스 연결 핀이 다릅니다.
 *   우노·나노 : 소프트웨어 시리얼 — 모듈 TXD→4번, RXD→5번
 *   메가      : 하드웨어 Serial1  — 모듈 TXD→19번, RXD→18번
 * 메가의 소프트웨어 시리얼은 받는 핀으로 10~15, 50~53, A8~A15 만 쓸 수
 * 있습니다. 4번은 목록에 없어 컴파일은 되지만 한 바이트도 못 받습니다. */
#if defined(ARDUINO_AVR_MEGA2560) || defined(ARDUINO_AVR_MEGA) || defined(ARDUINO_AVR_MEGA_ADK)
  #define BT Serial1
  #define BT_LISTEN()          /* 하드웨어 시리얼은 항상 듣고 있다 */
#else
  #include <SoftwareSerial.h>
  SoftwareSerial btSoft(4, 5);
  #define BT btSoft
  #define BT_LISTEN() btSoft.listen()
#endif

unsigned long total = 0;

void setup() {
  Serial.begin(9600);
  while (!Serial) { }
  BT.begin(9600);
  BT_LISTEN();
  delay(300);

  Serial.println();
  Serial.println(F("=== 메아리 (모듈 -> 아두이노) ==="));
  Serial.println(F("앱에서 [모듈로 HELLO 보내기] 를 누르세요."));
  Serial.println(F("여기에 HELLO 가 찍히면 그 방향은 정상입니다."));
  Serial.println();
}

void loop() {
  while (BT.available()) {
    byte b = BT.read();
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
