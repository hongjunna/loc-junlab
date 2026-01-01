import { Schema, model, Document } from 'mongoose';

// 지점(Point) 타입 정의
export interface IRoutePoint {
  name: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [경도, 위도]
  };
  type: '출발지' | '경유지' | '가상정류소' | '도착지';
  scheduledTime: string; // "HH:mm" 형식
  useAnnouncement: boolean;
}

// 노선 인터페이스
export interface IRoute extends Document {
  routeName: string;
  points: IRoutePoint[];
}

const routePointSchema = new Schema<IRoutePoint>({
  name: { type: String, required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  type: {
    type: String,
    enum: ['출발지', '경유지', '가상정류소', '도착지'],
    required: true,
  },
  scheduledTime: String,
  useAnnouncement: { type: Boolean, default: false },
});

const routeSchema = new Schema<IRoute>({
  routeName: { type: String, required: true },
  points: [routePointSchema],
});

// 위치 기반 쿼리를 위해 인덱스 생성
routeSchema.index({ 'points.location': '2dsphere' });

export const Route = model<IRoute>('Route', routeSchema);

