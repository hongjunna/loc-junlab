import { Schema, model, type Types } from 'mongoose';
import { POINT_TYPES, type PointType } from './route';

export const CHECKPOINT_STATUSES = ['pending', 'approaching', 'arrived', 'departed'] as const;
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];

// 운행 시작 시점의 정류장 정보를 그대로 복사해 둔 스냅샷 + 실적
export interface ICheckpoint {
  pointName: string;
  type: PointType;
  coordinates: [number, number]; // [경도, 위도]
  scheduledTime?: string; // 예정 시각 "HH:mm"
  useAnnouncement: boolean;
  status: CheckpointStatus;
  arrivalTime?: Date; // 실제 도착 시각
  departureTime?: Date; // 실제 출발 시각
  manual?: boolean; // 수기 처리 여부
}

export interface ITrackPoint {
  lat: number;
  lng: number;
  t: Date;
}

export type LocationSource = 'browser' | 'traccar';

export interface IDriveLog {
  routeId: Types.ObjectId;
  routeName: string;
  shareCode?: string;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed';
  endReason?: 'manual' | 'stale';
  currentIndex: number; // 다음 목표 정류장 인덱스
  currentLocation?: {
    type: 'Point';
    coordinates: [number, number];
    accuracy?: number;
    heading?: number;
    speed?: number; // m/s
    battery?: number; // 0~100 (Traccar)
    recordedAt?: Date; // 기기에서 측정한 시각
    updatedAt?: Date; // 서버 수신 시각
    source?: LocationSource;
  };
  track: ITrackPoint[];
  checkpoints: ICheckpoint[];
  settings: {
    approachRadius: number; // m
    arrivalRadius: number; // m
  };
  // 수기 처리 직전 상태 (되돌리기용)
  undoSnapshot?: { checkpoints: ICheckpoint[]; currentIndex: number } | null;
  // 위치를 보내는 Traccar 기기 (없으면 운전자 폰 브라우저)
  trackerId?: Types.ObjectId | null;
  startedBy?: { method: string; email?: string; name?: string };
  // 마지막 판정 안내 (Traccar 운행 시 운전자 화면에 표시)
  lastMessage?: string;
  lastEventAt?: Date;
  updatedAt: Date;
}

// 궤적은 최근 N개만 보관
export const MAX_TRACK_POINTS = 2000;

const checkpointSchema = new Schema<ICheckpoint>(
  {
    pointName: String,
    type: { type: String, enum: POINT_TYPES },
    coordinates: { type: [Number] },
    scheduledTime: String,
    useAnnouncement: { type: Boolean, default: false },
    status: { type: String, enum: CHECKPOINT_STATUSES, default: 'pending' },
    arrivalTime: Date,
    departureTime: Date,
    manual: Boolean,
  },
  { _id: false }
);

const driveLogSchema = new Schema<IDriveLog>(
  {
    routeId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
    routeName: String,
    shareCode: { type: String, unique: true, sparse: true },
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    status: { type: String, enum: ['running', 'completed'], default: 'running' },
    endReason: { type: String, enum: ['manual', 'stale'] },
    currentIndex: { type: Number, default: 0 },
    currentLocation: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
      accuracy: Number,
      heading: Number,
      speed: Number,
      battery: Number,
      recordedAt: Date,
      updatedAt: Date,
      source: { type: String, enum: ['browser', 'traccar'] },
    },
    track: {
      type: [{ lat: Number, lng: Number, t: Date, _id: false }],
      default: [],
      select: false,
    },
    checkpoints: [checkpointSchema],
    settings: {
      approachRadius: Number,
      arrivalRadius: Number,
    },
    trackerId: { type: Schema.Types.ObjectId, ref: 'Tracker', default: null },
    startedBy: { method: String, email: String, name: String, _id: false },
    lastMessage: String,
    lastEventAt: Date,
    undoSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
      select: false,
    },
  },
  { timestamps: true }
);

driveLogSchema.index({ status: 1, updatedAt: -1 });
driveLogSchema.index({ trackerId: 1, status: 1 });

export const DriveLog = model<IDriveLog>('DriveLog', driveLogSchema);
