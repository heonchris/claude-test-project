/* ============================================================
 * 왼발 — 아두이노 우노
 *
 * 보드 한 대에 이 파일 하나. **코드는 고칠 것이 없습니다.**
 * 올리기 전에 Tools > Board 만 아래로 맞추세요.
 *
 *   Board : Arduino Uno
 *   발    : L
 *
 * 보드를 잘못 고르면 업로드 전에 빨간 글씨로 막힙니다. 조용히 안 되는
 * 것보다 낫습니다. 어느 파일을 어느 보드로 올려야 하는지 알려 줍니다.
 *
 * 배선
 *   모듈 VCC->5V · GND->GND · TXD->4번 · RXD->5번
 *   센서는 A0 · A1. 센서마다 10kΩ 저항을 하나씩 따로 (공유 금지)
 *
 * 블루투스 모듈 이름을 기기마다 다르게 해 두세요. 휴대폰이 구분할
 * 방법이 이름뿐입니다.  예) AT+NAMEinsoleL1
 * ============================================================ */

#define FILE_NAME "insole_L_uno"

const char FOOT = 'L';

/* ★ 이 발에 단 센서를 순서대로 ★  ch1, ch2, …
 * 센서를 늘리면 여기에 A2, A3 … 를 더하면 됩니다. */
const int PINS[] = { A0, A1 };

#if defined(ARDUINO_AVR_MEGA2560) || defined(ARDUINO_AVR_MEGA) || defined(ARDUINO_AVR_MEGA_ADK)
  #error "이 파일은 우노용입니다. 메가에는 insole_R_mega 를 올리세요. (Tools > Board 를 Arduino Uno 로 바꾸세요)"
#endif

#include <SoftwareSerial.h>
SoftwareSerial btSoft(4, 5);      // RX=4(모듈 TXD), TX=5(모듈 RXD)
#define BT btSoft
#define BOARD_NAME "우노 (소프트웨어 시리얼 · 모듈 TXD->4, RXD->5)"

const int  N        = sizeof(PINS) / sizeof(PINS[0]);
const int  CHANNELS = 8;                  // 발당 채널 수. 패킷 크기를 고정한다
const byte HEADER   = 0xA6;
const int  PACKET   = 3 + CHANNELS * 2;   // 19바이트

byte seq = 0;
byte packet[PACKET];

void setup() {
  Serial.begin(9600);
  BT.begin(9600);

  packet[0] = HEADER;
  packet[2] = (byte)FOOT;
  for (int i = 3; i < PACKET; i++) packet[i] = 0;   // 안 쓰는 채널은 0

  Serial.println();
  Serial.print(F("파일: "));  Serial.println(F(FILE_NAME));
  Serial.print(F("보드: "));  Serial.println(F(BOARD_NAME));
  Serial.print(F("발 "));     Serial.print(FOOT);
  Serial.print(F(" · 센서 ")); Serial.print(N);
  Serial.println(F("개로 시작합니다."));
}

void loop() {
  packet[1] = seq++;

  for (int i = 0; i < N && i < CHANNELS; i++) {
    int raw = analogRead(PINS[i]);
    packet[3 + i * 2]     = raw & 0xFF;          // little-endian 하위
    packet[3 + i * 2 + 1] = (raw >> 8) & 0xFF;   // 상위

    Serial.print(F("ch")); Serial.print(i + 1);
    Serial.print(F("=")); Serial.print(raw); Serial.print(F("  "));
  }
  Serial.println();

  BT.write(packet, PACKET);

  delay(100);                     // 10Hz. 30Hz 로 올리려면 delay(33)
}
