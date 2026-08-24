/** SPEC 5-2. 이 텍스트를 그대로 복사해 챗봇에 붙여넣으면 앱이 읽는 JSON이 나온다. */
export const PLAN_PROMPT = `아래 조건으로 식단·운동 계획을 짜줘.
결과는 반드시 아래 JSON 형식으로만 출력하고, 설명이나 코드블록 표시 없이 JSON만 줘.

[내 조건: 여기에 나이/키/몸무게/목표/알레르기/운동 가능 시간 등을 적으세요]

{
  "title": "계획 이름",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "dailyTargets": { "waterCups": 숫자, "workoutMinutes": 숫자 },
  "days": [
    {
      "day": 1,
      "meals": [{ "type": "아침", "name": "메뉴명", "items": ["재료/분량"] }],
      "workouts": [{ "name": "운동명", "minutes": 숫자, "detail": "설명" }],
      "note": "그날의 한 줄 팁"
    }
  ]
}`;
