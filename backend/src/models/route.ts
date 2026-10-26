import { Schema, model, type Types } from 'mongoose';

export const POINT_TYPES = ['출발지', '경유지', '가상정류소', '도착지'] as const;
export type PointType = (typeof POINT_TYPES)[number];

// 반경 기본값 (m)
export const DEFAULT_APPROACH_RADIUS = 300;
export const DEFAULT_ARRIVAL_RADIUS = 50;

// 지점(Point) 타입 정의
export interface IRoutePoint {
  _id?: Types.ObjectId;
  name: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [경도, 위도]
  };
  type: PointType;
  scheduledTime?: string; // "HH:mm" 형식
  useAnnouncement: boolean;
}

export interface IRouteSettings {
  approachRadius: number; // 접근(안내방송) 판정 반경 (m)
  arrivalRadius: number; // 도착 판정 반경 (m)
}

// 노선 인터페이스
export interface IRoute {
  routeName: string;
  points: IRoutePoint[];
  settings: IRouteSettings;
  is_deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const routePointSchema = new Schema<IRoutePoint>({
  name: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  type: { type: String, enum: POINT_TYPES, required: true },
  scheduledTime: String,
  useAnnouncement: { type: Boolean, default: false },
});

const routeSchema = new Schema<IRoute>(
  {
    routeName: { type: String, required: true },
    points: [routePointSchema],
    settings: {
      approachRadius: { type: Number, default: DEFAULT_APPROACH_RADIUS },
      arrivalRadius: { type: Number, default: DEFAULT_ARRIVAL_RADIUS },
    },
    is_deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 위치 기반 쿼리를 위해 인덱스 생성
routeSchema.index({ 'points.location': '2dsphere' });

export const Route = model<IRoute>('Route', routeSchema);
