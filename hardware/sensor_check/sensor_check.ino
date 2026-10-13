/*
 * 센서 배선 진단 · USB 만 꽂고 쓴다 (블루투스 모듈 불필요)
 *
 * 쓸 때: 눌러도 숫자가 0 이거나 몇 밖에 안 오를 때.
 *
 * 하는 일: 채널마다 두 번 잰다.
 *   ① 그냥 읽기        → 지금 값
 *   ② 내부 풀업을 켜고 읽기 → 10kΩ 저항이 GND 로 붙어 있는지
 *
 * ②가 핵심이다. 핀에 아무것도 안 달려 있으면 풀업을 켰을 때 1023 에 붙고,
 * 10kΩ 이 GND 로 제대로 붙어 있으면 150~400 쯤에서 멈춘다.
 * 그래서 "저항 쪽이 끊겼다"와 "5V/센서 쪽이 끊겼다"를 갈라낼 수 있다.
 *
 * 배선 (채널마다 저항 하나씩, 공유 금지):
 *   5V ── FSR ──┬── A0
 *                └── 10kΩ ── GND
 *
 * 시리얼 모니터 9600. 10초쯤 켜 두고 그 사이에 센서를 꾹 눌러 본다.
 */

const int PINS[] = { A0, A1 };
const int N = sizeof(PINS) / sizeof(PINS[0]);

int lo[N], hi[N];

/* 내부 풀업(약 30kΩ)을 잠깐 켜고 읽는다. 핀에 매달린 것이 있는지 본다. */
int readPulled(int pin) {
  pinMode(pin, INPUT_PULLUP);
  delay(5);
  analogRead(pin);            // 샘플홀드 커패시터를 먼저 씻어낸다
  delay(5);
  int v = analogRead(pin);
  pinMode(pin, INPUT);        // 원래대로
  delay(5);
  analogRead(pin);
  return v;
}

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < N; i++) { lo[i] = 1023; hi[i] = 0; }
  delay(300);
  Serial.println();
  Serial.println(F("센서 배선 진단 · 10초간 센서를 꾹 눌러 보세요"));
  Serial.println();
}

void loop() {
  /* 0.5초 동안 빠르게 훑어 최저/최고를 모은다 */
  unsigned long until = millis() + 500;
  while (millis() < until) {
    for (int i = 0; i < N; i++) {
      int v = analogRead(PINS[i]);
      if (v < lo[i]) lo[i] = v;
      if (v > hi[i]) hi[i] = v;
    }
    delay(5);
  }

  for (int i = 0; i < N; i++) {
    int now  = analogRead(PINS[i]);
    int pull = readPulled(PINS[i]);

    Serial.print(F("ch"));  Serial.print(i + 1);
    Serial.print(F(" A")); Serial.print(i);
    Serial.print(F("  지금="));  Serial.print(now);
    Serial.print(F("  최저="));  Serial.print(lo[i]);
    Serial.print(F("  최고="));  Serial.print(hi[i]);
    Serial.print(F("  풀업="));  Serial.print(pull);
    Serial.print(F("  → "));

    if (pull > 900) {
      Serial.println(F("핀에 아무것도 안 붙어 있음. "
                       "10kΩ 저항이 이 핀과 GND 사이에 꽂혀 있는지 보세요"));
    } else if (pull < 60) {
      Serial.println(F("저항이 10kΩ 보다 훨씬 작습니다. "
                       "색띠가 갈색-검정-주황인지 보세요 (주황이 검정이면 10Ω)"));
    } else if (hi[i] > 1000 && lo[i] > 1000) {
      Serial.println(F("1023 고정. 핀이 5V 에 바로 붙었습니다. "
                       "저항이 빠졌거나 FSR 자리를 건너뛰었습니다"));
    } else if (hi[i] == 0) {
      Serial.println(F("한 번도 안 올라감. 저항은 정상이니 5V 쪽입니다. "
                       "5V→FSR→이 핀 경로 중 한 군데가 떨어져 있습니다"));
    } else if (hi[i] < 10) {
      Serial.println(F("눌러도 거의 안 오름. FSR 탭 접촉 불량이 1순위, "
                       "저항이 10kΩ 이 맞는지가 2순위입니다"));
    } else if (hi[i] < 80) {
      Serial.println(F("약하게 오름. 센서의 둥근 면 한가운데를 "
                       "엄지로 꾹 눌러 다시 보세요"));
    } else {
      Serial.println(F("정상"));
    }
  }
  Serial.println(F("  (풀업값은 채널끼리 비슷해야 합니다. "
                   "10kΩ 이면 150~400. 한쪽만 동떨어지면 그 채널의 저항입니다)"));
  Serial.println();

  for (int i = 0; i < N; i++) { lo[i] = 1023; hi[i] = 0; }
}
