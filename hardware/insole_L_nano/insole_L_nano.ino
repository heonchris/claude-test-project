/* ============================================================
 * 왼발 — 아두이노 나노
 *
 * 보드 한 대에 이 파일 하나. **코드는 고칠 것이 없습니다.**
 * 올리기 전에 Tools 에서 아래 세 가지를 맞추세요.
 *
 *   Board     : Arduino Nano
 *   Processor : ATmega328P      ← 안 되면 ATmega328P (Old Bootloader)
 *   발        : L
 *
 * 나노는 우노와 같은 칩(ATmega328P)이라 코드가 완전히 같습니다.
 * 핀 번호도 배선도 우노와 똑같습니다. 다른 것은 업로드 설정뿐입니다.
 *
 * ★ 나노에서만 걸리는 함정 ★
 *   업로드가 이렇게 실패하면
 *       avrdude: stk500_recv(): programmer is not responding
 *   선이나 보드 고장이 아닙니다. **부트로더 선택**입니다.
 *   Tools > Processor 를 'ATmega328P (Old Bootloader)' 로 바꾸고
 *   다시 올리면 대개 그냥 됩니다. 중국산 나노는 대부분 구형
 *   부트로더를 쓰는데, 둘은 업로드 속도가 달라 섞이면 응답이 없습니다.
 *   어느 쪽인지는 겉모습으로 알 수 없으니 그냥 둘 다 해 보면 됩니다.
 *
 * 배선 (우노와 동일)
 *   모듈 VCC->5V · GND->GND · TXD->4번 · RXD->5번
 *   센서는 A0 · A1. 센서마다 10kΩ 저항을 하나씩 따로 (공유 금지)
 *
 * 블루투스 모듈 이름을 기기마다 다르게 해 두세요. 휴대폰이 구분할
 * 방법이 이름뿐입니다.  예) AT+NAMEinsoleL4
 * ============================================================ */

#define FILE_NAME "insole_L_nano"

const char FOOT = 'L';

/* ★ 이 발에 단 센서를 순서대로 ★  ch1, ch2, …
 * 센서를 늘리면 여기에 A2, A3 … 를 더하면 됩니다. */
const int PINS[] = { A0, A1 };

/* 나노가 아닌 보드를 고르면 여기서 막는다.
 * 메가에 올리면 4번 핀으로 한 바이트도 안 나가 조용히 실패하고,
 * 우노로 골라 두면 부트로더 속도가 달라 업로드 자체가 안 된다. */
#if !defined(ARDUINO_AVR_NANO)
  #error "이 파일은 나노용입니다. Tools > Board 를 Arduino Nano 로 바꾸세요. (우노는 insole_L_uno, 메가는 insole_R_mega)"
#endif

#include <SoftwareSerial.h>
SoftwareSerial btSoft(4, 5);      // RX=4(모듈 TXD), TX=5(모듈 RXD)
#define BT btSoft
#define BOARD_NAME "나노 (소프트웨어 시리얼 · 모듈 TXD->4, RXD->5)"

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
