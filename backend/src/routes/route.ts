import { Router } from 'express';
import { HttpError, notFound } from '../http';
import { DriveLog } from '../models/drive_log';
import { Route } from '../models/route';
import { routeSchema } from '../validation';

const router = Router();

// 노선 목록 조회 (진행 중 운행 수 포함)
router.get('/routes', async (_req, res) => {
  const [routes, active] = await Promise.all([
    Route.find({ is_deleted: { $ne: true } }).sort({ updatedAt: -1 }).lean(),
    DriveLog.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'running' } },
      { $group: { _id: '$routeId', count: { $sum: 1 } } },
    ]),
  ]);
  const activeMap = new Map(active.map((a) => [String(a._id), a.count]));
  res.json(routes.map((r) => ({ ...r, activeDriveCount: activeMap.get(String(r._id)) || 0 })));
});

// 노선 등록
router.post('/routes', async (req, res) => {
  const data = routeSchema.parse(req.body);
  const route = await Route.create(data);
  res.status(201).json(route);
});

// 모든 정류소(포인트) 목록 조회 (중복 제거)
router.get('/routes/data/points', async (_req, res) => {
  const routes = await Route.find({ is_deleted: { $ne: true } }, 'points').lean();
  const allPoints = routes.flatMap((r) => r.points || []);

  // 이름과 좌표가 모두 같은 경우 중복 제거
  const uniquePoints = Array.from(
    new Map(
      allPoints.map((p) => [
        `${p.name}-${p.location.coordinates[0]}-${p.location.coordinates[1]}`,
        p,
      ])
    ).values()
  );
  res.json(uniquePoints);
});

// 특정 노선 조회 (수정용)
router.get('/routes/:id', async (req, res) => {
  const route = await Route.findOne({ _id: req.params.id, is_deleted: { $ne: true } }).lean();
  if (!route) throw notFound('노선');
  const activeDriveCount = await DriveLog.countDocuments({ routeId: route._id, status: 'running' });
  res.json({ ...route, activeDriveCount });
});

// 노선 수정 (진행 중인 운행은 시작 시점의 스냅샷을 사용하므로 영향 없음)
router.put('/routes/:id', async (req, res) => {
  const data = routeSchema.parse(req.body);
  const updatedRoute = await Route.findOneAndUpdate(
    { _id: req.params.id, is_deleted: { $ne: true } },
    data,
    { new: true, runValidators: true }
  );
  if (!updatedRoute) throw notFound('노선');
  res.json(updatedRoute);
});

// 노선 삭제 (Soft Delete)
router.delete('/routes/:id', async (req, res) => {
  const running = await DriveLog.countDocuments({ routeId: req.params.id, status: 'running' });
  if (running > 0 && req.query.force !== 'true') {
    throw new HttpError(409, `이 노선으로 진행 중인 운행이 ${running}건 있습니다.`);
  }
  const result = await Route.findByIdAndUpdate(req.params.id, { is_deleted: true });
  if (!result) throw notFound('노선');
  res.json({ message: '노선이 삭제되었습니다.' });
});

export default router;
