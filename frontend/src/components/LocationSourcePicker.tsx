import { Form } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import TrackerStatus from './TrackerStatus';
import type { Tracker } from '../types';

interface Props {
  trackers: Tracker[];
  value: string | null; // null: 이 폰 브라우저
  onChange: (trackerId: string | null) => void;
  currentDriveId?: string; // 이 운행에 이미 연결된 기기는 선택 가능
}

// 위치 전송 방식 선택: 이 폰 브라우저 / Traccar 위치 앱 기기
const LocationSourcePicker = ({ trackers, value, onChange, currentDriveId }: Props) => (
  <div className="source-picker">
    <label className={`source-option ${value === null ? 'active' : ''}`}>
      <Form.Check
        type="radio"
        name="source"
        checked={value === null}
        onChange={() => onChange(null)}
      />
      <div className="min-w-0">
        <div className="fw-semibold">🌐 이 폰 (브라우저)</div>
        <div className="small text-muted">운행 화면을 켜둔 채로 유지해야 합니다</div>
      </div>
    </label>
    {trackers.map((t) => {
      const busy = !!t.activeDrive && t.activeDrive._id !== currentDriveId;
      return (
        <label
          key={t._id}
          className={`source-option ${value === t._id ? 'active' : ''} ${busy ? 'disabled' : ''}`}
        >
          <Form.Check
            type="radio"
            name="source"
            disabled={busy}
            checked={value === t._id}
            onChange={() => onChange(t._id)}
          />
          <div className="min-w-0">
            <div className="fw-semibold text-truncate">📱 {t.name}</div>
            <div className="small text-muted">
              {busy
                ? `'${t.activeDrive!.routeName}' 운행에서 사용 중`
                : '화면을 꺼도 전송 (Traccar Client)'}
            </div>
            <TrackerStatus tracker={t} compact />
          </div>
        </label>
      );
    })}
    {trackers.length === 0 && (
      <div className="small text-muted ps-1">
        화면을 끈 채로 위치를 보내려면 <Link to="/config/trackers">위치 앱 기기를 등록</Link>하세요.
      </div>
    )}
  </div>
);

export default LocationSourcePicker;
