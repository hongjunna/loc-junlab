import { Badge } from 'react-bootstrap';
import { delayMinutes, formatDelay, formatTime, hhmm, scheduleOf } from '../lib/format';
import { STATUS_BADGE, TYPE_BADGE } from '../lib/ui';
import type { Checkpoint } from '../types';

interface Props {
  checkpoints: Checkpoint[];
  currentIndex: number;
  baseDate: string;
  running: boolean;
  highlightIndex?: number | null;
  onRowClick?: (index: number) => void;
}

/**
 * 정류장 시간표: 예정 시각(실제 출발 기준 보정), 실제 도착/출발, 지연 여부
 */
const DriveTimetable = ({
  checkpoints,
  currentIndex,
  baseDate,
  running,
  highlightIndex,
  onRowClick,
}: Props) => {
  const schedule = scheduleOf(checkpoints, baseDate);
  const hasSchedule = schedule.some((s) => s.planned);

  return (
    <table className="timetable">
      <thead>
        <tr>
          <th className="text-start">정류장</th>
          {hasSchedule && <th>예정</th>}
          <th>도착</th>
          <th>출발</th>
          <th>상태</th>
        </tr>
      </thead>
      <tbody>
        {checkpoints.map((cp, i) => {
          const type = TYPE_BADGE[cp.type] || TYPE_BADGE['경유지'];
          const isNext =
            running &&
            i === currentIndex &&
            (cp.status === 'pending' || cp.status === 'approaching');
          const status = STATUS_BADGE[cp.status];
          const sched = schedule[i];
          const expected = sched.adjusted || sched.planned;
          const delay = formatDelay(
            delayMinutes(sched.planned, cp.arrivalTime || cp.departureTime)
          );
          return (
            <tr
              key={i}
              className={[
                `tt-${cp.status}`,
                isNext ? 'tt-next' : '',
                highlightIndex === i ? 'tt-highlight' : '',
                onRowClick ? 'tt-clickable' : '',
              ].join(' ')}
              onClick={onRowClick ? () => onRowClick(i) : undefined}
            >
              <td className="text-start">
                <div className="d-flex align-items-center gap-2">
                  <Badge bg={type.bg} text={type.text as 'dark' | undefined} className="tt-type">
                    {type.label}
                  </Badge>
                  <span className="tt-name">{cp.pointName}</span>
                </div>
              </td>
              {hasSchedule && (
                <td>
                  {sched.planned ? (
                    <>
                      <div className="fw-semibold">{hhmm(expected)}</div>
                      {sched.adjusted && hhmm(sched.adjusted) !== hhmm(sched.planned) && (
                        <div className="tt-sub text-decoration-line-through">
                          {hhmm(sched.planned)}
                        </div>
                      )}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
              )}
              <td className="fw-semibold">{formatTime(cp.arrivalTime)}</td>
              <td className="fw-semibold">{formatTime(cp.departureTime)}</td>
              <td>
                {isNext && cp.status === 'pending' ? (
                  <Badge bg="warning" text="dark" pill>
                    다음
                  </Badge>
                ) : (
                  <Badge bg={status.bg} text={status.text as 'dark' | undefined}>
                    {cp.type === '가상정류소' && cp.status === 'departed' ? '통과' : status.label}
                  </Badge>
                )}
                {delay && cp.status !== 'pending' && cp.status !== 'approaching' && (
                  <div
                    className={`tt-sub ${delay.includes('지연') ? 'text-danger' : 'text-success'}`}
                  >
                    {delay}
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default DriveTimetable;
