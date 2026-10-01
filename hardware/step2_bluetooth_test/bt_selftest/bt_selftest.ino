/*
 * 블루투스 모듈 자가진단
 *
 * 목적: 아두이노와 모듈 사이의 선이 제대로 연결됐는지, 통신 속도가
 *       얼마인지를 사람이 아무것도 입력하지 않아도 알아낸다.
 *
 * 하는 일: 흔히 쓰는 속도를 하나씩 바꿔 가며 모듈에 AT 를 보내고,
 *          OK 가 돌아오는 속도를 찾는다.
 *
 * ── 먼저 할 일 ─────────────────────────────────────────
 * 휴대폰 앱에서 [연결 끊기] 를 누르거나 블루투스를 꺼 주세요.
 * 모듈이 휴대폰과 연결돼 있으면 AT 명령 대신 그냥 데이터를 흘려보내서
 * 이 검사가 실패합니다. 모듈 LED 가 깜빡이는 상태여야 합니다.
 *
 * ── 배선 ───────────────────────────────────────────────
 *   모듈 VCC → 5V
 *   모듈 GND → GND
 *   모듈 TXD → 아두이노 2번     (모듈이 말하는 선)
 *   모듈 RXD → 아두이노 3번     (모듈이 듣는 선)
 *
 * ── 보는 법 ────────────────────────────────────────────
 * [도구] → [시리얼 모니터], 속도 9600. 결과가 한글로 나온다.
 */

#include <SoftwareSerial.h>

SoftwareSerial bt(2, 3);                       // RX=2(모듈 TXD), TX=3(모듈 RXD)

long speeds[] = { 9600, 38400, 115200, 57600, 19200, 4800 };
const int N = sizeof(speeds) / sizeof(speeds[0]);

long found = 0;
String reply = "";

/* 한 속도로 AT 를 보내고 답이 오는지 본다. */
bool probe(long baud) {
  bt.begin(baud);
  delay(120);
  while (bt.available()) bt.read();            // 남은 찌꺼기 비우기

  /* HM-10 은 줄바꿈 없이 "AT" 만으로 답한다.
   * HC-05 는 줄바꿈이 있어야 한다. 둘 다 시도한다. */
  const char* tries[] = { "AT", "AT\r\n" };
  for (int t = 0; t < 2; t++) {
    bt.print(tries[t]);
    unsigned long until = millis() + 600;
    reply = "";
    while (millis() < until) {
      while (bt.available()) {
        char c = bt.read();
        if (c >= 32 && c < 127) reply += c;
        until = millis() + 150;                // 글자가 오면 조금 더 기다린다
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
  Serial.println(F("=== 블루투스 모듈 자가진단 ==="));
  Serial.println(F("휴대폰 연결을 끊고, 모듈 LED 가 깜빡이는 상태에서 하세요."));
  Serial.println();

  for (int i = 0; i < N; i++) {
    Serial.print(F("  "));
    Serial.print(speeds[i]);
    Serial.print(F(" 로 물어보는 중 ... "));
    if (probe(speeds[i])) {
      Serial.print(F("응답: "));
      Serial.println(reply);
      found = speeds[i];
      break;
    }
    Serial.println(F("무응답"));
  }

  Serial.println();
  Serial.println(F("--- 결과 ---"));

  if (found == 0) {
    Serial.println(F("모듈이 전혀 응답하지 않습니다."));
    Serial.println();
    Serial.println(F("이 순서로 확인하세요."));
    Serial.println(F("  1. 모듈 LED 가 깜빡이는가. 안 깜빡이면 전원 문제입니다"));
    Serial.println(F("     (VCC 가 5V 에, GND 가 GND 에 꽂혔는지)"));
    Serial.println(F("  2. TXD 와 RXD 를 서로 바꿔 꽂아 보세요. 가장 흔한 실수입니다"));
    Serial.println(F("     모듈 TXD -> 2번,  모듈 RXD -> 3번"));
    Serial.println(F("  3. 휴대폰과 연결된 상태면 AT 에 답하지 않습니다."));
    Serial.println(F("     앱에서 연결을 끊고 다시 하세요"));
    Serial.println(F("  4. 선이 브레드보드 구멍에 끝까지 들어갔는지 보세요"));
  } else {
    Serial.print(F("모듈 정상. 통신 속도는 "));
    Serial.print(found);
    Serial.println(F(" 입니다."));
    Serial.println();
    if (found == 9600) {
      Serial.println(F("기본값이므로 스케치를 고칠 필요가 없습니다."));
      Serial.println(F("선과 속도 모두 정상이니, 측정용 스케치를 올리면 됩니다."));
    } else {
      Serial.println(F("기본값(9600)이 아닙니다. 측정용 스케치의"));
      Serial.print(F("  bt.begin(9600)  ->  bt.begin("));
      Serial.print(found);
      Serial.println(F(")  로 고치세요."));
    }
    Serial.println();
    Serial.println(F("참고: 여기서 응답이 왔다는 것은 아두이노 3번 핀에서"));
    Serial.println(F("모듈로 가는 선과, 모듈에서 2번 핀으로 오는 선이"));
    Serial.println(F("양쪽 다 살아 있다는 뜻입니다."));
  }
}

void loop() { }
