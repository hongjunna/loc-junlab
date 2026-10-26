import { Schema, model, type Types } from 'mongoose';

// Traccar Client 등 외부 위치 전송 앱이 설치된 기기
export interface ITracker {
  name: string;
  deviceId: string; // 앱의 "기기 식별자"에 입력하는 값 (비밀번호처럼 취급)
  createdBy?: string;
  lastSeenAt?: Date;
  lastLocation?: {
    lat: number;
    lng: number;
    accuracy?: number;
    battery?: number; // 0~100
    recordedAt?: Date;
  };
  lastDriveId?: Types.ObjectId;
  createdAt: Date;
}

const trackerSchema = new Schema<ITracker>(
  {
    name: { type: String, required: true, trim: true },
    deviceId: { type: String, required: true, unique: true },
    createdBy: String,
    lastSeenAt: Date,
    lastLocation: {
      lat: Number,
      lng: Number,
      accuracy: Number,
      battery: Number,
      recordedAt: Date,
    },
    lastDriveId: { type: Schema.Types.ObjectId, ref: 'DriveLog' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Tracker = model<ITracker>('Tracker', trackerSchema);
