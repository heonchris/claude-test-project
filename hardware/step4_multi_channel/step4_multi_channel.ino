/*
 * 4단계 · 센서 여러 개
 *
 * 센서를 늘릴 때 고칠 곳은 아래 PINS 한 줄뿐이다.
 *   센서 2개 → { A0, A1 }
 *   센서 3개 → { A0, A1, A2 }
 *   ...
 *   우노는 A0~A5 여섯 개가 한계. 발당 8채널은 나노(A0~A7)가 필요하다.
 *
 * PINS 의 순서가 곧 채널 번호다.
 *   PINS[0] → ch1,  PINS[1] → ch2, ...
 * 어느 채널이 발의 어디인지는 앱의 [설정] → [센서 위치 설정] 에서
 * 바꾼다. 배선을 다시 뽑을 필요가 없다.
 *
 * ── 배선에서 반드시 지킬 것 ────────────────────────────
 * 센서마다 10kΩ 저항을 하나씩 따로 둔다. 저항 하나를 여러 센서가
 * 나눠 쓰면 한쪽을 누를 때 다른 쪽 값까지 같이 움직여, 어느 센서가
 * 눌린 것인지 구분할 수 없게 된다.
 *
 * 5V 와 GND 는 반대로 전부 같이 쓴다. 브레드보드 가장자리의
 * 빨강·파랑 전원 레일에 한 번만 끌어오면 된다.
 *
 * ── 핀 ─────────────────────────────────────────────────
 * 블루투스는 디지털 4번(모듈 TXD) · 5번(모듈 RXD).
 * 3번은 쓰지 않는다 — 그 보드에서 고장나 있던 핀이다.
 */

#include <SoftwareSerial.h>

SoftwareSerial bt(4, 5);          // RX=4(모듈 TXD), TX=5(모듈 RXD)

/* ★ 센서를 늘릴 때 여기만 고친다 ★ */
const int PINS[] = { A0, A1 };

const int  N        = sizeof(PINS) / sizeof(PINS[0]);
const byte HEADER   = 0xA5;
const int  CHANNELS = 16;
const int  PACKET   = 2 + CHANNELS * 2;   // 34

byte seq = 0;
byte packet[PACKET];

void setup() {
  Serial.begin(9600);
  bt.begin(9600);

  packet[0] = HEADER;
  for (int i = 2; i < PACKET; i++) packet[i] = 0;   // 안 쓰는 채널은 0

  Serial.print(F("센서 "));
  Serial.print(N);
  Serial.println(F("개로 시작합니다."));
}

void loop() {
  packet[1] = seq++;

  for (int i = 0; i < N; i++) {
    int raw = analogRead(PINS[i]);
    packet[2 + i * 2]     = raw & 0xFF;          // little-endian 하위
    packet[2 + i * 2 + 1] = (raw >> 8) & 0xFF;   // 상위

    Serial.print(F("ch"));
    Serial.print(i + 1);
    Serial.print(F("="));
    Serial.print(raw);
    Serial.print(F("  "));
  }
  Serial.println();

  bt.write(packet, PACKET);

  delay(100);                       // 10Hz
}
