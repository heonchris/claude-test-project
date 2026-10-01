/*
 * 배선 점검 — 2번·3번 핀에 실제로 무언가 연결돼 있는지 전기로 확인한다
 *
 * 왜 필요한가:
 *   자가진단에서 배선 순서 2가지 × 속도 6가지를 모두 시도해도 무응답이면,
 *   남은 것은 "선이 실제로 이어져 있는가" 뿐이다. 눈으로는 꽂혀 보여도
 *   점퍼선 속이 끊겼거나, 브레드보드 줄이 한 칸 어긋났을 수 있다.
 *
 * 원리:
 *   UART 선은 아무것도 보내지 않을 때 HIGH 로 유지된다. 그래서 모듈의
 *   TXD 가 2번에 제대로 연결돼 있으면, 2번을 잠깐 LOW 로 끌어내렸다가
 *   놓는 순간 모듈이 다시 HIGH 로 끌어올린다.
 *   아무것도 연결돼 있지 않으면 끌어내린 LOW 가 한동안 그대로 남는다.
 *   이 차이로 '연결됨'과 '떠 있음'을 구분한다.
 *
 * ── 하기 전에 ──────────────────────────────────────────
 *   휴대폰 블루투스를 끄고, 모듈 전원(VCC·GND)은 연결해 두세요.
 *   모듈 LED 가 깜빡이는 상태여야 합니다.
 */

const int PIN_RX = 2;    /* 모듈 TXD 가 와야 하는 핀 */
const int PIN_TX = 3;    /* 모듈 RXD 로 나가는 핀 */

/* 핀을 LOW 로 끌어내렸다 놓고, 얼마나 빨리 HIGH 로 돌아오는지 센다.
 * 돌아오면 바깥에서 누군가 HIGH 로 잡아 주고 있다는 뜻이다. */
int pullTest(int p) {
  pinMode(p, OUTPUT);
  digitalWrite(p, LOW);
  delayMicroseconds(300);
  pinMode(p, INPUT);                 /* 풀업 없이 놓는다 */

  int high = 0;
  for (int i = 0; i < 200; i++) if (digitalRead(p)) high++;
  return high;                       /* 0 = 계속 LOW(떠 있음), 200 = 바로 HIGH */
}

/* 3번으로 내보낸 신호가 2번으로 돌아오는지 — 점퍼선 되돌림 확인 */
bool loopbackTest() {
  pinMode(PIN_TX, OUTPUT);
  pinMode(PIN_RX, INPUT);
  bool okLow, okHigh;
  digitalWrite(PIN_TX, LOW);  delay(2); okLow  = (digitalRead(PIN_RX) == LOW);
  digitalWrite(PIN_TX, HIGH); delay(2); okHigh = (digitalRead(PIN_RX) == HIGH);
  pinMode(PIN_TX, INPUT);
  return okLow && okHigh;
}

void setup() {
  Serial.begin(9600);
  while (!Serial) { }
  delay(500);

  Serial.println();
  Serial.println(F("=== 배선 점검 ==="));
  Serial.println(F("모듈 전원은 켜 두고, 휴대폰 블루투스는 끈 상태에서."));
  Serial.println();

  bool lb = loopbackTest();
  int r2 = pullTest(PIN_RX);
  int r3 = pullTest(PIN_TX);

  Serial.print(F("  2번 핀 측정값: ")); Serial.print(r2); Serial.println(F(" / 200"));
  Serial.print(F("  3번 핀 측정값: ")); Serial.print(r3); Serial.println(F(" / 200"));
  Serial.println();
  Serial.println(F("--- 결과 ---"));

  if (lb) {
    Serial.println(F("2번과 3번이 서로 직접 이어져 있습니다 (점퍼선 되돌림)."));
    Serial.println(F("아두이노 핀 자체는 정상입니다."));
    Serial.println(F("점퍼선을 빼고 모듈을 연결한 뒤 다시 실행하세요."));
    return;
  }

  if (r2 > 150) {
    Serial.println(F("[2번] 바깥에서 HIGH 로 잡아 주고 있습니다."));
    Serial.println(F("      모듈 TXD 선이 살아 있다는 뜻입니다. 정상."));
  } else {
    Serial.println(F("[2번] 떠 있습니다. 아무것도 연결돼 있지 않습니다. <-- 문제"));
    Serial.println(F("      모듈 TXD 에서 2번으로 오는 선이 끊겼거나,"));
    Serial.println(F("      브레드보드 줄이 어긋났거나, 점퍼선이 불량입니다."));
  }
  Serial.println();

  if (r3 > 150) {
    Serial.println(F("[3번] 바깥에서 HIGH 로 잡고 있습니다."));
    Serial.println(F("      모듈 RXD 는 보통 이렇게 나오지 않습니다."));
    Serial.println(F("      TXD 와 RXD 를 바꿔 꽂았을 수 있습니다."));
  } else {
    Serial.println(F("[3번] 떠 있습니다. 모듈 RXD 는 원래 이렇게 나옵니다."));
    Serial.println(F("      다만 이 검사로는 3번 선의 연결 여부를 알 수 없습니다."));
  }

  Serial.println();
  Serial.println(F("--- 다음에 할 일 ---"));
  if (r2 <= 150) {
    Serial.println(F("1. 모듈 TXD 선을 뽑았다가 끝까지 다시 꽂으세요"));
    Serial.println(F("2. 점퍼선을 다른 것으로 바꿔 보세요 (속이 끊긴 선이 흔합니다)"));
    Serial.println(F("3. 브레드보드를 거친다면, 모듈 선과 아두이노 선이"));
    Serial.println(F("   정말 같은 번호 줄, 같은 쪽(홈의 같은 편)인지 보세요"));
    Serial.println(F("4. 모듈 TXD 선에 저항을 달았다면 빼세요. TXD 는 직접 연결입니다"));
    Serial.println(F("5. 모듈 핀 이름을 다시 보세요. TX / TXO / T 로 적혀 있을 수 있습니다"));
  } else {
    Serial.println(F("2번 선은 살아 있습니다. 그런데도 AT 응답이 없다면"));
    Serial.println(F("1. 3번 -> 모듈 RXD 선을 점검하세요 (이 검사로는 안 보입니다)"));
    Serial.println(F("2. 모듈이 휴대폰과 아직 연결돼 있는지 LED 로 확인하세요"));
    Serial.println(F("3. 모듈 RXD 쪽 저항을 빼고 직접 연결해 보세요"));
  }
}

void loop() { }
