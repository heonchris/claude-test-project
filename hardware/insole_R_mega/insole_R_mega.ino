/* ============================================================
 * 오른발 — 아두이노 메가
 *
 * 보드 한 대에 이 파일 하나. **코드는 고칠 것이 없습니다.**
 * 올리기 전에 Tools > Board 만 아래로 맞추세요.
 *
 *   Board : Arduino Mega or Mega 2560
 *   발    : R
 *
 * 보드를 잘못 고르면 업로드 전에 빨간 글씨로 막힙니다. 조용히 안 되는
 * 것보다 낫습니다. 어느 파일을 어느 보드로 올려야 하는지 알려 줍니다.
 *
 * 배선
 *   모듈 VCC->5V · GND->GND · TXD->19번(RX1) · RXD->18번(TX1)
 *   센서는 A0 · A1. 센서마다 10kΩ 저항을 하나씩 따로 (공유 금지)
 *
 * 블루투스 모듈 이름을 기기마다 다르게 해 두세요. 휴대폰이 구분할
 * 방법이 이름뿐입니다.  예) AT+NAMEinsoleR1
 * ============================================================ */

#define FILE_NAME "insole_R_mega"

const char FOOT = 'R';

/* ★ 이 발에 단 센서를 순서대로 ★  ch1, ch2, …
 * 센서를 늘리면 여기에 A2, A3 … 를 더하면 됩니다. */
const int PINS[] = { A0, A1 };

#if !(defined(ARDUINO_AVR_MEGA2560) || defined(ARDUINO_AVR_MEGA) || defined(ARDUINO_AVR_MEGA_ADK))
  #error "이 파일은 메가용입니다. 우노에는 insole_L_uno 또는 insole_R_uno 를 올리세요. (Tools > Board 를 Arduino Mega or Mega 2560 으로 바꾸세요)"
#endif

/* 메가는 하드웨어 시리얼을 쓴다. 메가의 소프트웨어 시리얼은 받는 핀으로
 * 10~15, 50~53, A8~A15 만 쓸 수 있어 4번으로는 한 바이트도 못 받는다. */
#define BT Serial1
#define BOARD_NAME "메가 (하드웨어 Serial1 · 모듈 TXD->19, RXD->18)"

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
