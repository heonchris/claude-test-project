/*
 * 3단계 · 앱에 연결되는 규격 패킷 보내기
 *
 * 목적: 센서 1개를 실제 앱 화면에 띄워 경로 전체를 증명한다.
 *       센서 → 아두이노 → 블루투스 → 휴대폰 → 앱 히트맵
 *
 * 보내는 것: DATA_CONTRACT.md 의 34바이트 패킷
 *   [0]      0xA5   헤더
 *   [1]      순번   0~255 순환
 *   [2~3]    ch1    ← A0 의 실제 값이 여기 들어간다 (왼발 엄지)
 *   [4~33]   ch2~16 전부 0
 *
 * 그래서 센서를 누르면 앱 히트맵의 **왼발 엄지 한 곳만** 밝아진다.
 * 그 한 점이 손가락을 따라 움직이면 경로 전체가 살아 있는 것이다.
 *
 * ── 전송 속도를 10Hz 로 둔 이유 (중요) ──────────────────
 * 9600 baud 는 초당 약 960바이트를 보낸다.
 *   34바이트 × 30Hz = 1020 B/s  →  9600 baud 로는 안 들어간다
 *   34바이트 × 10Hz =  340 B/s  →  여유 있음
 * 규격의 30Hz 를 쓰려면 모듈과 스케치의 속도를 함께 올려야 한다.
 *   AT+BAUD4  (38400)  또는  AT+BAUD8 (115200)   ※ 모델마다 번호가 다름
 * 속도를 바꾸면 bt.begin() 의 숫자도 같이 바꿔야 한다.
 *
 * ── 배선 ───────────────────────────────────────────────
 *   2단계와 동일 (모듈 TXD→2번, RXD→3번 분압, 센서는 A0)
 *
 * ── 핀을 4·5번으로 쓰는 이유 ───────────────────────────
 * 처음에는 2·3번을 썼다. 그런데 실기기에서 아두이노 -> 모듈 방향만
 * 끝까지 동작하지 않았다. 배선 순서·통신 속도·모듈·앱을 모두 확인해
 * 정상임을 증명한 뒤에야, 핀을 4·5번으로 옮기자 바로 동작했다.
 * 즉 그 보드의 디지털 3번 핀이 죽어 있었다. 코드로는 찾을 수 없는
 * 고장이므로, 막히면 핀을 옮겨 보는 것을 점검 목록에 넣어 둔다.
 */

#include <SoftwareSerial.h>

SoftwareSerial bt(4, 5);          // RX=4(모듈 TXD), TX=5(모듈 RXD)

const int FSR_PIN   = A0;
const byte HEADER   = 0xA5;
const int  CHANNELS = 16;
const int  PACKET   = 2 + CHANNELS * 2;   // 34

byte seq = 0;
byte packet[PACKET];

void setup() {
  Serial.begin(9600);
  bt.begin(9600);

  packet[0] = HEADER;
  for (int i = 2; i < PACKET; i++) packet[i] = 0;   // ch2~16 은 계속 0
}

void loop() {
  int raw = analogRead(FSR_PIN);    // 0 ~ 1023

  packet[1] = seq++;
  packet[2] = raw & 0xFF;           // little-endian 하위 바이트
  packet[3] = (raw >> 8) & 0xFF;    // 상위 바이트

  bt.write(packet, PACKET);

  // USB 로는 사람이 읽을 수 있게. 무선이 안 될 때 비교용.
  Serial.print(F("seq="));  Serial.print(packet[1]);
  Serial.print(F(" ch1=")); Serial.println(raw);

  delay(100);                       // 10Hz
}
