/*
 * 보내는 쪽 점검 — 아두이노 3번 핀이 실제로 글자를 내보내는가
 *
 * 왜 필요한가:
 *   메아리 시험으로 '모듈 -> 아두이노(2번)' 방향과 통신 속도가 정상임이
 *   확인됐다. 남은 고장은 '아두이노 3번 -> 모듈 RXD' 하나뿐인데,
 *   이 구간이 안 되는 이유는 셋 중 하나다.
 *     (가) 아두이노 3번 핀이나 소프트웨어 시리얼이 글자를 못 내보낸다
 *     (나) 3번에서 모듈 RXD 로 가는 선이 끊겼다
 *     (다) 모듈의 RXD 입력이 상했다
 *   이 스케치는 (가)를 가려낸다.
 *
 * 하는 법
 *   1. 모듈로 가는 선을 2번·3번에서 모두 뽑는다 (VCC·GND 는 둬도 된다)
 *   2. 점퍼선 하나로 아두이노 2번과 3번을 직접 잇는다
 *   3. 이 스케치를 올리고 시리얼 모니터를 연다 (9600)
 *
 * 읽는 법
 *   TEST 가 돌아온다 -> 3번 핀은 정상. 원인은 (나) 또는 (다)
 *   안 돌아온다      -> 3번 핀이나 스케치 문제. (가)
 */

#include <SoftwareSerial.h>

SoftwareSerial bt(2, 3);   /* RX=2, TX=3 */

void setup() {
  Serial.begin(9600);
  while (!Serial) { }
  bt.begin(9600);
  bt.listen();
  delay(400);

  Serial.println();
  Serial.println(F("=== 보내는 쪽 점검 ==="));
  Serial.println(F("2번과 3번을 점퍼선으로 직접 이어 두고 하세요."));
  Serial.println();

  while (bt.available()) bt.read();          /* 찌꺼기 비우기 */

  Serial.println(F("3번으로 TEST 를 내보냅니다..."));
  bt.print(F("TEST"));

  String got = "";
  unsigned long until = millis() + 800;
  while (millis() < until) {
    while (bt.available()) {
      char c = bt.read();
      if (c >= 32 && c < 127) got += c;
      until = millis() + 200;
    }
  }

  Serial.print(F("2번으로 돌아온 것: ["));
  Serial.print(got);
  Serial.println(F("]"));
  Serial.println();
  Serial.println(F("--- 결과 ---"));

  if (got == "TEST") {
    Serial.println(F("아두이노 3번 핀은 정상입니다. 글자를 제대로 내보냅니다."));
    Serial.println();
    Serial.println(F("그렇다면 원인은 둘 중 하나입니다."));
    Serial.println(F("  1. 3번 -> 모듈 RXD 선이 끊겼다"));
    Serial.println(F("     -> 그 선만 새 점퍼선으로 바꿔 보세요"));
    Serial.println(F("     -> 저항(분압)을 달았다면 빼고 직접 이어 보세요"));
    Serial.println(F("  2. 모듈의 RXD 입력이 상했다"));
    Serial.println(F("     -> 1번을 해도 안 되면 모듈을 바꿔야 합니다"));
  } else if (got.length() == 0) {
    Serial.println(F("아무것도 돌아오지 않았습니다."));
    Serial.println(F("  - 점퍼선이 2번과 3번에 제대로 꽂혔는지 보세요"));
    Serial.println(F("  - 그 점퍼선을 다른 것으로 바꿔 보세요"));
    Serial.println(F("  - 둘 다 맞는데도 안 되면 아두이노 3번 핀 문제입니다"));
  } else {
    Serial.println(F("일부만 돌아왔습니다. 접촉이 불안정합니다."));
    Serial.println(F("점퍼선을 바꿔 보세요."));
  }
}

void loop() { }
