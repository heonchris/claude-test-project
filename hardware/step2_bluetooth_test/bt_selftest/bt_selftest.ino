/*
 * 블루투스 모듈 자가진단 v2
 *
 * v1 과 달라진 점: TX/RX 가 바뀌어 꽂혔을 경우까지 자동으로 검사한다.
 *   사람이 "바꿔 꽂아 보세요" 를 따라 하지 않아도 되므로,
 *   '배선을 바꿔봤다고 생각했는데 안 바뀐' 경우를 배제할 수 있다.
 *
 * 검사 범위
 *   배선 2가지 × 통신 속도 6가지 = 12가지 조합
 *
 * ── 반드시 먼저 ────────────────────────────────────────
 * 휴대폰 블루투스를 끄세요. 모듈이 휴대폰과 연결돼 있으면 AT 명령에
 * 답하지 않습니다. 모듈 LED 가 깜빡이는 상태여야 합니다.
 *
 * ── 배선 ───────────────────────────────────────────────
 *   모듈 VCC → 5V,  모듈 GND → GND
 *   모듈 TXD, RXD → 디지털 2번, 3번  (순서는 이 스케치가 알아냅니다)
 */

#include <SoftwareSerial.h>

SoftwareSerial sA(2, 3);   /* 정상: 모듈 TXD→2, 모듈 RXD→3 */
SoftwareSerial sB(3, 2);   /* 반대: 모듈 TXD→3, 모듈 RXD→2 */

long speeds[] = { 9600, 38400, 57600, 19200, 115200, 4800 };
const int NS = sizeof(speeds) / sizeof(speeds[0]);

String reply = "";
String sent  = "";

/* 둘 중 하나만 살려 둔다. begin() 이 핀 방향을 다시 잡아 준다. */
SoftwareSerial& pick(bool swapped, long baud) {
  if (swapped) { sA.end(); sB.begin(baud); sB.listen(); return sB; }
  sB.end(); sA.begin(baud); sA.listen(); return sA;
}

bool probe(bool swapped, long baud) {
  SoftwareSerial& bt = pick(swapped, baud);
  delay(120);
  while (bt.available()) bt.read();                  /* 찌꺼기 비우기 */

  /* HM-10 은 줄바꿈 없이, HC-05 는 줄바꿈이 있어야 답한다. */
  const char* tries[] = { "AT", "AT\r\n" };
  for (int t = 0; t < 2; t++) {
    sent = tries[t];
    bt.print(sent);
    unsigned long until = millis() + 500;
    reply = "";
    while (millis() < until) {
      while (bt.available()) {
        char c = bt.read();
        if (c >= 32 && c < 127) reply += c;
        until = millis() + 150;
      }
    }
    if (reply.length() > 0) return true;
  }
  return false;
}

void setup() {
  Serial.begin(9600);
  while (!Serial) { }
  delay(400);

  Serial.println();
  Serial.println(F("=== 블루투스 모듈 자가진단 v2 ==="));
  Serial.println(F("휴대폰 블루투스를 끈 상태에서 하세요."));
  Serial.println(F("배선 2가지 x 속도 6가지를 모두 시도합니다."));
  Serial.println();

  bool ok = false;
  bool foundSwap = false;
  long foundBaud = 0;

  for (int w = 0; w < 2 && !ok; w++) {
    Serial.print(F("[ 배선 "));
    Serial.print(w == 0 ? F("TXD->2, RXD->3") : F("TXD->3, RXD->2"));
    Serial.println(F(" ]"));

    for (int i = 0; i < NS; i++) {
      Serial.print(F("   "));
      Serial.print(speeds[i]);
      Serial.print(F(" ... "));
      if (probe(w == 1, speeds[i])) {
        Serial.print(F("응답 ["));
        Serial.print(reply);
        Serial.println(F("]"));
        ok = true; foundSwap = (w == 1); foundBaud = speeds[i];
        break;
      }
      Serial.println(F("무응답"));
    }
    Serial.println();
  }

  Serial.println(F("--- 결과 ---"));

  if (!ok) {
    Serial.println(F("12가지 조합 모두 무응답입니다."));
    Serial.println();
    Serial.println(F("배선 순서는 이미 양쪽 다 시도했으므로, 순서 문제는 아닙니다."));
    Serial.println(F("다음 중 하나입니다."));
    Serial.println(F("  A. 휴대폰과 아직 연결돼 있다 (LED 가 안 깜빡이면 연결 중)"));
    Serial.println(F("  B. 모듈 TXD 선에 저항을 달았다 -> 신호가 죽는다. 저항은"));
    Serial.println(F("     RXD 쪽에만 단다. TXD 는 직접 연결"));
    Serial.println(F("  C. 선이 구멍에 끝까지 안 들어갔거나 브레드보드 줄이 다르다"));
    Serial.println(F("  D. 모듈 TXD 핀이 실제로는 다른 이름이다 (TX, TXO, T 등)"));
    Serial.println();
    Serial.println(F(">> 다음 검사: 모듈 선을 2번·3번에서 모두 뽑고,"));
    Serial.println(F("   점퍼선 하나로 2번과 3번을 직접 연결한 뒤 USB 를 다시 꽂으세요."));
    Serial.println(F("   그때 응답이 오면 아두이노는 정상이고 모듈 쪽 문제입니다."));
  } else {
    /* 보낸 것이 그대로 돌아왔으면 모듈이 아니라 2-3번이 이어진 것이다. */
    bool loop_back = (reply == sent || reply == F("AT"));
    if (loop_back && reply.indexOf("OK") < 0) {
      Serial.println(F("보낸 글자가 그대로 돌아왔습니다 = 되돌림(루프백) 상태입니다."));
      Serial.println(F("2번과 3번이 점퍼선으로 직접 이어져 있다는 뜻입니다."));
      Serial.println();
      Serial.println(F("아두이노의 2번·3번 핀과 스케치는 정상입니다."));
      Serial.println(F("점퍼선을 빼고 모듈을 연결한 뒤 다시 검사하세요."));
      Serial.println(F("그래도 무응답이면 원인은 모듈이나 모듈 쪽 선입니다."));
    } else {
      Serial.println(F("모듈이 응답했습니다."));
      Serial.print(F("  올바른 배선: 모듈 TXD -> "));
      Serial.print(foundSwap ? F("3번") : F("2번"));
      Serial.print(F(",  모듈 RXD -> "));
      Serial.println(foundSwap ? F("2번") : F("3번"));
      Serial.print(F("  통신 속도: "));
      Serial.println(foundBaud);
      Serial.println();
      if (foundSwap) {
        Serial.println(F("지금은 반대로 꽂혀 있습니다. 측정용 스케치를 쓰려면"));
        Serial.println(F("선 두 개를 서로 바꿔 꽂거나, 스케치의"));
        Serial.println(F("  SoftwareSerial bt(2, 3)  ->  SoftwareSerial bt(3, 2)"));
        Serial.println(F("로 고치세요."));
      }
      if (foundBaud != 9600) {
        Serial.print(F("속도가 기본값이 아닙니다. 측정용 스케치의 bt.begin(9600) 을 "));
        Serial.print(foundBaud);
        Serial.println(F(" 으로 고치세요."));
      }
      if (!foundSwap && foundBaud == 9600) {
        Serial.println(F("배선과 속도 모두 기본값 그대로입니다. 고칠 것이 없습니다."));
      }
    }
  }
}

void loop() { }
