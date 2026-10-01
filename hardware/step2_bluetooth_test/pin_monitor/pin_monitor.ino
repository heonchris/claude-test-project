/*
 * 핀 감시 — 2번·3번에 붙은 것이 TXD 인지 STATE 인지 가려낸다
 *
 * 왜 필요한가:
 *   배선 점검에서 2번·3번 모두 "바깥에서 HIGH 로 잡아 준다" 로 나왔는데
 *   데이터는 한 바이트도 흐르지 않았다. 선은 붙어 있으나 엉뚱한 핀에
 *   붙었을 수 있다.
 *
 *   HM-10 보드에는 TXD·RXD 말고 STATE 라는 핀이 있다. 연결 상태를
 *   알려 주는 출력이라, 측정하면 TXD 와 똑같이 '살아 있음' 으로 보인다.
 *   그러나 데이터는 흐르지 않는다.
 *
 * 구분법:
 *   STATE 는 휴대폰이 연결되고 끊길 때 값이 바뀐다.
 *   TXD 는 데이터를 보내지 않는 한 계속 HIGH 로 가만히 있다.
 *   그래서 휴대폰을 붙였다 뗐다 하면서 값이 변하는지 보면 가려진다.
 *
 * 쓰는 법:
 *   1. 올리고 시리얼 모니터 열기 (9600)
 *   2. 휴대폰 블루투스를 켜고 앱으로 연결 → 값이 바뀌는지 본다
 *   3. 연결을 끊는다 → 다시 바뀌는지 본다
 */

const int P2 = 2;
const int P3 = 3;

int last2 = -1, last3 = -1;
unsigned long chg2 = 0, chg3 = 0;
unsigned long t0 = 0;

void setup() {
  Serial.begin(9600);
  while (!Serial) { }
  pinMode(P2, INPUT);
  pinMode(P3, INPUT);
  delay(400);

  Serial.println();
  Serial.println(F("=== 핀 감시 ==="));
  Serial.println(F("휴대폰을 연결했다 끊었다 하면서 값이 바뀌는지 보세요."));
  Serial.println();
  Serial.println(F("  바뀐다  -> STATE 핀에 잘못 꽂힌 것입니다"));
  Serial.println(F("  안 바뀐다 -> TXD 이거나, 전원선에 닿아 있는 것입니다"));
  Serial.println();
  t0 = millis();
}

void loop() {
  int v2 = digitalRead(P2);
  int v3 = digitalRead(P3);

  if (v2 != last2) { chg2++; last2 = v2; }
  if (v3 != last3) { chg3++; last3 = v3; }

  static unsigned long last = 0;
  if (millis() - last >= 500) {
    last = millis();
    Serial.print(F("["));
    Serial.print((millis() - t0) / 1000);
    Serial.print(F("초] 2번="));
    Serial.print(v2 ? F("HIGH") : F("LOW "));
    Serial.print(F(" (변화 "));
    Serial.print(chg2 > 0 ? chg2 - 1 : 0);
    Serial.print(F("회)   3번="));
    Serial.print(v3 ? F("HIGH") : F("LOW "));
    Serial.print(F(" (변화 "));
    Serial.print(chg3 > 0 ? chg3 - 1 : 0);
    Serial.println(F("회)"));
  }
}
