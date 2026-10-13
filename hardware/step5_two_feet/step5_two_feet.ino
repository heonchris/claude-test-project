/*
 * 5단계 · 양발 — 발마다 아두이노 하나씩  (우노 · 나노 · 메가 공용)
 *
 * 두 신발 사이에 선을 둘 수 없으므로 발마다 아두이노와 블루투스 모듈을
 * 하나씩 둔다. 휴대폰이 두 기기에 동시에 연결한다.
 *
 * ★ 아두이노 두 대에 같은 코드를 올리되, 아래 FOOT 만 서로 다르게 한다 ★
 *
 * ── 보드마다 블루투스 연결 핀이 다르다 ──────────────────
 *
 *   우노 · 나노 : 소프트웨어 시리얼
 *       모듈 TXD → 4번,  모듈 RXD → 5번
 *
 *   메가       : 하드웨어 시리얼 Serial1 (훨씬 안정적이다)
 *       모듈 TXD → 19번(RX1),  모듈 RXD → 18번(TX1)
 *
 *   메가에서 4·5번을 쓰면 안 된다. 메가의 소프트웨어 시리얼은 받는 핀으로
 *   10~15, 50~53, A8~A15 만 쓸 수 있다. 4번은 그 목록에 없어서 **컴파일은
 *   되지만 한 바이트도 받지 못한다.** 오류도 나지 않아 원인을 찾기 어렵다.
 *   메가는 하드웨어 시리얼이 4개나 있으므로 그냥 Serial1 을 쓴다.
 *
 *   아래 코드가 보드를 알아서 가려내므로 고칠 것은 없다.
 *
 * ── 업로드가 '타임아웃' 으로 실패하면 ───────────────────
 *   [도구] → [보드] 가 실제 보드와 달라서다. 메가는
 *     보드: Arduino Mega or Mega 2560,  프로세서: ATmega2560
 *   을 골라야 한다. 우노로 둔 채 메가에 올리면 timeout 이 난다.
 *
 * ── 패킷 ───────────────────────────────────────────────
 *   [0] 0xA6  [1] 순번  [2] 'L'|'R'  [3~18] ch1~ch8 uint16 LE   = 19바이트
 *   19바이트라 BLE 한 번에 들어가고, 9600 baud 로 30Hz 까지 여유가 있다.
 *
 * ── 배선 공통 ──────────────────────────────────────────
 *   모듈 VCC → 5V,  GND → GND
 *   센서마다 10kΩ 저항을 하나씩 따로 둔다. 공유하면 서로 값이 섞인다
 *
 * ── 모듈 이름을 발마다 다르게 ──────────────────────────
 *   둘 다 공장 기본값(HMSoft)이면 휴대폰에서 구분할 수 없다.
 *     AT+NAMEinsoleL      AT+NAMEinsoleR
 */

/* ★★ 두 대에서 서로 다르게 ★★  왼발 'L' · 오른발 'R' */
const char FOOT = 'L';

/* ★ 이 발에 단 센서를 순서대로 ★  ch1, ch2, …
 * 메가는 A0~A15 가 있어 발당 8개를 그대로 꽂을 수 있다. */
const int PINS[] = { A0, A1 };

/* ── 보드 구분 ─────────────────────────────────────────── */
#if defined(ARDUINO_AVR_MEGA2560) || defined(ARDUINO_AVR_MEGA) || defined(ARDUINO_AVR_MEGA_ADK)
  #define BT Serial1          /* 메가: 하드웨어 시리얼. TXD→19, RXD→18 */
  #define BOARD_NAME "메가 (Serial1 · TXD->19, RXD->18)"
#else
  #include <SoftwareSerial.h>
  SoftwareSerial btSoft(4, 5);   /* RX=4(모듈 TXD), TX=5(모듈 RXD) */
  #define BT btSoft
  #define BOARD_NAME "우노/나노 (소프트웨어 시리얼 · TXD->4, RXD->5)"
#endif

const int  N        = sizeof(PINS) / sizeof(PINS[0]);
const int  CHANNELS = 8;          // 발당 채널 수. 패킷 크기를 고정한다
const byte HEADER   = 0xA6;
const int  PACKET   = 3 + CHANNELS * 2;   // 19

byte seq = 0;
byte packet[PACKET];

void setup() {
  Serial.begin(9600);
  BT.begin(9600);

  packet[0] = HEADER;
  packet[2] = (byte)FOOT;
  for (int i = 3; i < PACKET; i++) packet[i] = 0;   // 안 쓰는 채널은 0

  Serial.println();
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

    Serial.print(F("ch"));
    Serial.print(i + 1);
    Serial.print(F("="));
    Serial.print(raw);
    Serial.print(F("  "));
  }
  Serial.println();

  BT.write(packet, PACKET);

  delay(100);                     // 10Hz. 30Hz 로 올리려면 delay(33)
}
