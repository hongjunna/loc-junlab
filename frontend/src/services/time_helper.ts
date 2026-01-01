/**
 * DB의 예정 시간을 실제 시작 시간에 맞춰 재계산하는 함수
 * @param scheduledTime DB에 저장된 예정 시간 (예: "05:00")
 * @param baseScheduledTime DB의 첫 정류장 예정 시간 (예: "05:00")
 * @param actualStartTime 실제 첫 정류장 도착/시작 시간 (Date 객체)
 */
const getAdjustedTime = (
  scheduledTime: string,
  baseScheduledTime: string,
  actualStartTime: Date | null
) => {
  if (!actualStartTime) return scheduledTime;

  // 1. "HH:mm"을 분 단위 숫자로 변환
  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const schedMin = toMinutes(scheduledTime);
  const baseMin = toMinutes(baseScheduledTime);

  // 2. 첫 정류장 대비 시간 차이(오프셋) 계산
  const offsetMinutes = schedMin - baseMin;

  // 3. 실제 시작 시간에 오프셋을 더함
  const adjustedDate = new Date(actualStartTime.getTime());
  adjustedDate.setMinutes(adjustedDate.getMinutes() + offsetMinutes);

  // 4. 다시 "HH:mm" 형태로 포맷팅
  const h = adjustedDate.getHours().toString().padStart(2, '0');
  const m = adjustedDate.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
};

export { getAdjustedTime };
