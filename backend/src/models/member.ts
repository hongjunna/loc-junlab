import { Schema, model } from 'mongoose';

// 구글 로그인을 허용할 사용자 (관리 화면에서 추가)
export interface IMember {
  email: string;
  name?: string;
  addedBy?: string;
  lastLoginAt?: Date;
  createdAt: Date;
}

const memberSchema = new Schema<IMember>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: String,
    addedBy: String,
    lastLoginAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Member = model<IMember>('Member', memberSchema);
