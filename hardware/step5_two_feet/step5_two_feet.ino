/*
 * 5단계 · 양발 — 발마다 아두이노 하나씩
 *
 * 두 신발 사이에 선을 둘 수 없으므로 발마다 아두이노와 블루투스 모듈을
 * 하나씩 둔다. 휴대폰이 두 기기에 동시에 연결한다.
 *
 * ★ 아두이노 두 대에 같은 코드를 올리되, 아래 FOOT 만 서로 다르게 한다 ★
 *
 * 패킷 — 19바이트
 *   [0]      0xA6   헤더 (발 단위 패킷)
 *   [1]      순번   0~255 순환
 *   [2]      'L' 또는 'R'
 *   [3~18]   ch1~ch8  uint16 little-endian
 *
 * 19바이트로 줄인 이유 두 가지
 *   1) BLE 는 한 번에 20바이트까지만 보낸다. 34바이트는 20+14 로 쪼개져
 *      도착해서 받는 쪽이 다시 이어 붙여야 한다. 19바이트는 한 번에 간다.
 *   2) 9600 baud 는 초당 960바이트다.
 *        34바이트 × 30Hz = 1020 B/s → 안 들어간다
 *        19바이트 × 30Hz =  570 B/s → 들어간다
 *      즉 발을 나누면 규격의 30Hz 를 기본 속도 그대로 쓸 수 있다.
 *
 * ── 배선 ───────────────────────────────────────────────
 *   모듈 VCC → 5V,  GND → GND,  TXD → 4번,  RXD → 5번
 *   3번은 쓰지 않는다 — 그 보드에서 고장나 있던 핀이다
 *   센서마다 10kΩ 저항을 하나씩 따로 둔다. 공유하면 서로 값이 섞인다
 *
 * ── 모듈 이름을 발마다 다르게 ──────────────────────────
 *   둘 다 공장 기본값(HMSoft)이면 휴대폰에서 어느 쪽인지 구분할 수 없다.
 *   신발에 넣기 전에 at_check 로 한 번씩 바꿔 둔다.
 *     AT+NAMEinsoleL      AT+NAMEinsoleR
 */

#include <SoftwareSerial.h>

/* ★★ 두 대에서 서로 다르게 ★★  왼발 'L' · 오른발 'R' */
const char FOOT = 'L';

/* ★ 이 발에 단 센서를 순서대로 ★  ch1, ch2, … */
const int PINS[] = { A0, A1 };

SoftwareSerial bt(4, 5);          // RX=4(모듈 TXD), TX=5(모듈 RXD)

const int  N        = sizeof(PINS) / sizeof(PINS[0]);
const int  CHANNELS = 8;          // 발당 채널 수. 패킷 크기를 고정한다
const byte HEADER   = 0xA6;
const int  PACKET   = 3 + CHANNELS * 2;   // 19

byte seq = 0;
byte packet[PACKET];

void setup() {
  Serial.begin(9600);
  bt.begin(9600);

  packet[0] = HEADER;
  packet[2] = (byte)FOOT;
  for (int i = 3; i < PACKET; i++) packet[i] = 0;   // 안 쓰는 채널은 0

  Serial.print(F("발 "));
  Serial.print(FOOT);
  Serial.print(F(" · 센서 "));
  Serial.print(N);
  Serial.println(F("개로 시작합니다."));
}

void loop() {
  packet[1] = seq++;

  for (int i = 0; i < N && i < CHANNELS; i++) {
    int raw = analogRead(PINS[i]);
    packet[3 + i * 2]     = raw & 0xFF;          // little-endian 하위
    packet[3 + i * 2 + 1] = (raw >> 8) & 0xFF;   // 상위

    Serial.print(F("ch"));
    Serial.print(i + 1);
    Serial.print(F("="));
    Serial.print(raw);
    Serial.print(F("  "));
  }
  Serial.println();

  bt.write(packet, PACKET);

  delay(100);                     // 10Hz. 30Hz 로 올리려면 delay(33)
}
