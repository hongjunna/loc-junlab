import { z } from 'zod';
import { POINT_TYPES } from './models/route';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const pointSchema = z.object({
  name: z.string().trim().min(1, '지점명이 필요합니다.'),
  location: z.object({
    type: z.literal('Point').default('Point'),
    coordinates: z.tuple([
      z.number().min(-180).max(180), // 경도
      z.number().min(-90).max(90), // 위도
    ]),
  }),
  type: z.enum(POINT_TYPES),
  scheduledTime: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || TIME_RE.test(v), '시간은 HH:mm 형식이어야 합니다.'),
  useAnnouncement: z.boolean().default(false),
});

export const routeSchema = z
  .object({
    routeName: z.string().trim().min(1, '노선 이름이 필요합니다.'),
    points: z.array(pointSchema).min(2, '지점은 최소 2개 이상이어야 합니다.'),
    settings: z
      .object({
        approachRadius: z.number().min(20).max(5000),
        arrivalRadius: z.number().min(10).max(1000),
      })
      .refine((s) => s.arrivalRadius < s.approachRadius, '도착 반경은 접근 반경보다 작아야 합니다.')
      .optional(),
  })
  .superRefine((route, ctx) => {
    const types = route.points.map((p) => p.type);
    if (types[0] !== '출발지' || types.filter((t) => t === '출발지').length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['points'],
        message: '출발지는 첫 번째에 1개만 있어야 합니다.',
      });
    }
    if (types[types.length - 1] !== '도착지' || types.filter((t) => t === '도착지').length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['points'],
        message: '도착지는 마지막에 1개만 있어야 합니다.',
      });
    }
  });

export const startDriveSchema = z.object({
  routeId: z.string().min(1),
});

export const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  heading: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
});
