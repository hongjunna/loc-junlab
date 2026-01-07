import { Router } from 'express';
import { getDistance } from 'geolib'; // 거리 계산 라이브러리 설치 필요: npm install geolib
import { DriveLog } from '../models/drive_log';
import { Route } from '../models/route';
import gpsRouter from './gps';

const router = Router();

// --- Vector helpers for fail-safe ---
const toRad = (deg: number) => (deg * Math.PI) / 180;

const vectorBetween = (
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) => ({
  x:
    (to.longitude - from.longitude) *
    Math.cos(toRad((from.latitude + to.latitude) / 2)),
  y: to.latitude - from.latitude,
});

const normalize = (v: { x: number; y: number }) => {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

const dot = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  a.x * b.x + a.y * b.y;
router.use(gpsRouter);

// 2-1. 노선 등록 API
router.post('/routes', async (req, res) => {
  try {
    const route = new Route(req.body);
    await route.save();
    res.status(201).json(route);
  } catch (err) {
    res.status(400).json({ error: '노선 등록 실패' });
  }
});

// 노선 목록 조회
router.get('/routes', async (req, res) => {
  const routes = await Route.find({ is_deleted: { $ne: true } });
  res.json(routes);
});

// 모든 정류소(포인트) 목록 조회 (중복 제거)
router.get('/routes/data/points', async (req, res) => {
  try {
    const routes = await Route.find({ is_deleted: { $ne: true } }, 'points');
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
  } catch (err) {
    res.status(500).json({ error: '정류소 목록 조회 실패' });
  }
});

// 특정 노선 조회 (수정용)
router.get('/routes/:id', async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route)
      return res.status(404).json({ error: '노선을 찾을 수 없습니다.' });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: '노선 조회 실패' });
  }
});

// 노선 수정
router.put('/routes/:id', async (req, res) => {
  try {
    const updatedRoute = await Route.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true, // 업데이트된 문서를 반환
      }
    );
    if (!updatedRoute)
      return res.status(404).json({ error: '노선을 찾을 수 없습니다.' });
    res.json(updatedRoute);
  } catch (err) {
    res.status(400).json({ error: '노선 수정 실패' });
  }
});

// 노선 삭제 (Soft Delete)
router.delete('/routes/:id', async (req, res) => {
  try {
    const result = await Route.findByIdAndUpdate(
      req.params.id,
      { is_deleted: true },
      { strict: false } // 스키마에 정의되지 않은 필드도 강제로 업데이트 허용
    );
    if (!result)
      return res.status(404).json({ error: '노선을 찾을 수 없습니다.' });
    res.json({ message: '노선이 삭제되었습니다.' });
  } catch (err) {
    res.status(500).json({ error: '노선 삭제 실패' });
  }
});

// 2-2 & 2-6. 운행 시작 (노선 선택 후 운행 기록 생성)
router.post('/drive/start', async (req, res) => {
  try {
    const { routeId, approachRadius, arrivalRadius } = req.body;
    const route = await Route.findById(routeId);

    if (!route)
      return res.status(404).json({ error: '노선을 찾을 수 없습니다.' });

    // 노선 정보를 바탕으로 체크포인트 초기화
    const checkpoints = route.points.map((p) => ({
      pointName: p.name,
      scheduledTime: p.scheduledTime,
      status: 'pending',
      type: p.type,
    }));

    const driveLog = new DriveLog({
      routeId,
      checkpoints,
      settings: { approachRadius, arrivalRadius },
    });

    await driveLog.save();
    res.status(201).json(driveLog);
  } catch (err) {
    res.status(500).json({ error: '운행 시작 실패' });
  }
});

// 2-2 & 2-3 & 2-4 실시간 위치 전송 및 판정
router.post('/drive/:driveLogId/location', async (req, res) => {
  try {
    const { driveLogId } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res
        .status(400)
        .json({ error: '좌표(lat, lng)가 누락되었습니다.' });
    }

    const driveLog = await DriveLog.findById(driveLogId).populate('routeId');
    if (!driveLog || driveLog.status === 'completed') {
      return res.status(404).json({ error: '활성화된 운행 기록이 없습니다.' });
    }

    const route = driveLog.routeId as any;
    if (!route || !route.points) {
      return res
        .status(500)
        .json({ error: '연결된 노선 정보를 불러오지 못했습니다.' });
    }

    const { approachRadius, arrivalRadius } = driveLog.settings;
    driveLog.currentLocation.coordinates = [longitude, latitude];

    let message = '';
    let playAnnouncement = false;

    // 이전 위치 계산용 (벡터 기반 자동 통과)
    const prevLocation = driveLog.prevLocation?.coordinates
      ? {
          longitude: driveLog.prevLocation.coordinates[0],
          latitude: driveLog.prevLocation.coordinates[1],
        }
      : null;

    const curLocation = { latitude, longitude };

    // 모든 체크포인트를 순회
    for (let i = 0; i < driveLog.checkpoints.length; i++) {
      const cp = driveLog.checkpoints[i];
      const routePoint = route.points[i];

      // 이미 해당 정류소를 떠난 경우 계산 생략
      if (cp.status === 'departed') continue;

      const distance =
        getDistance(
          { latitude, longitude },
          {
            latitude: routePoint.location.coordinates[1],
            longitude: routePoint.location.coordinates[0],
          }
        ) / 1000; // km 단위

      /**
       * 1. 접근 판정 (Pending -> Approaching)
       */
      if (cp.status === 'pending' && distance <= approachRadius) {
        cp.status = 'approaching';
        message = `${cp.pointName}에 접근 중입니다.`;
        if (routePoint.useAnnouncement) playAnnouncement = true;
        break; // 하나라도 변하면 DB 저장 후 종료 (데이터 안정성)
      }

      /**
       * 2. 도착 판정 (Approaching -> Arrived)
       */
      if (cp.status === 'approaching' && distance <= arrivalRadius) {
        cp.status = 'arrived';
        const now = new Date();
        cp.arrivalTime = now;
        if (i === 0) {
          driveLog.startTime = now;
          console.log(
            `[Start-Sync] 첫 정류장 도착에 따른 시작 시각 동기화: ${now}`
          );
        }
        message = `${cp.pointName}에 도착했습니다.`;
        break;
      }

      /**
       * 3. 출발 판정 (Arrived -> Departed)
       * 차가 도착 상태였는데 반경을 1.2배(오차 범위) 이상 벗어났을 때
       */
      if (cp.status === 'arrived' && distance > arrivalRadius * 1.2) {
        cp.status = 'departed';
        cp.departureTime = new Date();
        message = `${cp.pointName}에서 출발했습니다.`;
        break;
      }

      /**
       * 4. 자동 통과 판정 (Vector-based Fail-safe)
       * - B 정류소에 도착을 찍지 못했지만
       * - B에서 멀어지고 있고
       * - C 방향으로 확실히 진행 중이며
       * - C가 B보다 가까워졌다면
       * → B를 통과한 것으로 추론
       */
      if (
        cp.status === 'pending' &&
        prevLocation &&
        i < driveLog.checkpoints.length - 1
      ) {
        const nextRoutePoint = route.points[i + 1];

        const distPrevToB =
          getDistance(prevLocation, {
            latitude: routePoint.location.coordinates[1],
            longitude: routePoint.location.coordinates[0],
          }) / 1000;

        const distNowToB = distance;

        const distNowToNext =
          getDistance(
            { latitude, longitude },
            {
              latitude: nextRoutePoint.location.coordinates[1],
              longitude: nextRoutePoint.location.coordinates[0],
            }
          ) / 1000;

        const moveVec = normalize(vectorBetween(prevLocation, curLocation));

        const routeVec = normalize(
          vectorBetween(
            {
              latitude: routePoint.location.coordinates[1],
              longitude: routePoint.location.coordinates[0],
            },
            {
              latitude: nextRoutePoint.location.coordinates[1],
              longitude: nextRoutePoint.location.coordinates[0],
            }
          )
        );

        const dirScore = dot(moveVec, routeVec);

        const DIR_THRESHOLD = 0.5;

        if (
          distNowToB > distPrevToB && // B에서 멀어지고 있음
          distNowToNext < distNowToB && // C가 더 가까움
          dirScore > DIR_THRESHOLD // C 방향 진행
        ) {
          const now = new Date();
          cp.status = 'departed';
          cp.arrivalTime = cp.arrivalTime ?? now;
          cp.departureTime = now;
          message = `${cp.pointName}을(를) 통과했습니다.`;
          break;
        }
      }
    }

    // 이전 위치 저장 (다음 요청에서 벡터 계산용)
    driveLog.prevLocation = {
      type: 'Point',
      coordinates: [longitude, latitude],
    };

    // 변경 사항 저장
    await driveLog.save();

    res.json({
      status: driveLog.status,
      checkpoints: driveLog.checkpoints,
      playAnnouncement,
      message,
    });
  } catch (err) {
    console.error('📍 Location Update Error:', err);
    res.status(500).json({ error: '위치 업데이트 중 오류 발생' });
  }
});

// 2-5 수기 도착 완료 처리
router.patch(
  '/drive/:driveLogId/checkpoint/:index/complete',
  async (req, res) => {
    try {
      const { driveLogId, index } = req.params;
      const driveLog = await DriveLog.findById(driveLogId);

      if (driveLog && driveLog.checkpoints[Number(index)]) {
        const targetIdx = Number(index);
        const now = new Date();

        // 선택한 정류장(targetIdx)을 포함하여 그 이전의 모든 정류장을 순회
        for (let i = 0; i <= targetIdx; i++) {
          const cp = driveLog.checkpoints[i];
          if (cp.status !== 'arrived' && cp.status !== 'departed') {
            cp.status = 'arrived';
            cp.arrivalTime = now;
          }
        }
        await driveLog.save();
        res.json(driveLog);
      } else {
        res.status(404).send('기록을 찾을 수 없습니다.');
      }
    } catch (err) {
      res.status(500).send('처리 중 오류 발생');
    }
  }
);

router.post('/drive/:driveLogId/end', async (req, res) => {
  try {
    const { driveLogId } = req.params;
    const driveLog = await DriveLog.findById(driveLogId);

    if (!driveLog) return res.status(404).json({ error: '기록 없음' });

    driveLog.status = 'completed';
    driveLog.endTime = new Date();

    // 마지막 지점의 상태가 pending이라면 강제 완료 처리 등의 로직 추가 가능

    await driveLog.save();
    res.json({ message: '운행 종료 성공', driveLog });
  } catch (err) {
    res.status(500).json({ error: '종료 처리 실패' });
  }
});

router.get('/drive/:driveLogId', async (req, res) => {
  try {
    const { driveLogId } = req.params;
    // populate('routeId')를 해줘야 노선 이름(routeName) 등을 가져올 수 있습니다.
    const driveLog = await DriveLog.findById(driveLogId).populate('routeId');

    if (!driveLog)
      return res.status(404).json({ error: '기록을 찾을 수 없습니다.' });

    res.json(driveLog);
  } catch (err) {
    res.status(500).json({ error: '조회 중 오류 발생' });
  }
});

router.get('/drive/active/all', async (req, res) => {
  try {
    const activeDrives = await DriveLog.find({ status: 'running' }).populate(
      'routeId'
    );
    res.json(activeDrives);
  } catch (err) {
    res.status(500).json({ error: '운행 목록 조회 실패' });
  }
});

export default router;

