import { Schema, model, Document } from 'mongoose';

interface IVisitRecord {
  pointName: string;
  scheduledTime: string; // 예정 시각
  arrivalTime?: Date; // 실제 도착 시각
  departureTime?: Date; // 실제 출발 시각
  status: 'pending' | 'approaching' | 'arrived' | 'departed';
  minDistance?: number | null; // 최소 접근 거리 (km)
}

export interface IDriveLog extends Document {
  routeId: Schema.Types.ObjectId;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed';
  currentLocation: {
    type: 'Point';
    coordinates: [number, number];
  };
  prevLocation?: {
    type: 'Point';
    coordinates: [number, number];
  };
  checkpoints: IVisitRecord[];
  settings: {
    approachRadius: number; // 안내방송/접근 판정 반경 (km)
    arrivalRadius: number; // 도착 판정 반경 (km)
  };
  currentIndex: number;
}

const driveLogSchema = new Schema<IDriveLog>({
  routeId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  status: { type: String, enum: ['running', 'completed'], default: 'running' },
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
  },
  prevLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: undefined,
    },
  },
  checkpoints: [
    {
      pointName: String,
      scheduledTime: String,
      arrivalTime: Date,
      departureTime: Date,
      status: {
        type: String,
        enum: ['pending', 'approaching', 'arrived', 'departed'],
        default: 'pending',
      },
      minDistance: { type: Number, default: null },
    },
  ],
  settings: {
    approachRadius: { type: Number, default: 0.5 }, // 기본 500m
    arrivalRadius: { type: Number, default: 0.1 }, // 기본 100m
  },
  currentIndex: { type: Number, default: 0 },
});

export const DriveLog = model<IDriveLog>('DriveLog', driveLogSchema);

