import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

// 받침 유무에 따라 을/를 선택
const objectJosa = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '을(를)';
  return code % 28 ? '을' : '를';
};

export const notFound = (what: string) =>
  new HttpError(404, `${what}${objectJosa(what)} 찾을 수 없습니다.`);

// 모든 에러를 { error: string } 형태의 JSON으로 통일
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      error: `입력값이 올바르지 않습니다: ${first.path.join('.')} ${first.message}`,
    });
    return;
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(404).json({ error: '대상을 찾을 수 없습니다.' });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: '잘못된 JSON 형식입니다.' });
    return;
  }
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
};
