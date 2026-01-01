import { Router } from 'express';
import { getDistance } from 'geolib'; // 거리 계산 라이브러리 설치 필요: npm install geolib
import { DriveLog } from '../models/drive_log';
import { Route } from '../models/route';

const router = Router();

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
  const routes = await Route.find();
  res.json(routes);
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

    // 모든 체크포인트를 돌며 상태 업데이트 판정
    for (let i = 0; i < driveLog.checkpoints.length; i++) {
      const cp = driveLog.checkpoints[i];
      const routePoint = route.points[i];

      // 현재 정류소까지의 거리 (km)
      const distance =
        getDistance(
          { latitude, longitude },
          {
            latitude: routePoint.location.coordinates[1],
            longitude: routePoint.location.coordinates[0],
          }
        ) / 1000;

      // 1. 접근 판정
      if (cp.status === 'pending' && distance <= approachRadius) {
        cp.status = 'approaching';
        message = `${cp.pointName}에 접근 중입니다.`;
        if (routePoint.useAnnouncement) playAnnouncement = true;
      }

      // 2. 도착 판정
      if (cp.status === 'approaching' && distance <= arrivalRadius) {
        cp.status = 'arrived';
        cp.arrivalTime = new Date();
        message = `${cp.pointName}에 도착했습니다.`;
      }

      // 3. 출발 판정 (정상적인 흐름)
      if (cp.status === 'arrived' && distance > arrivalRadius) {
        cp.status = 'departed';
        cp.departureTime = new Date();
        message = `${cp.pointName}에서 출발했습니다.`;
      }

      // [추가된 로직] 4. 자동 통과 판정 (Fail-safe)
      // 조건: 상태가 'approaching'이고, 다음 정류소가 존재할 때
      if (cp.status === 'approaching' && i < driveLog.checkpoints.length - 1) {
        const nextRoutePoint = route.points[i + 1];

        // 다음 정류소까지의 거리 계산 (km)
        const distToNext =
          getDistance(
            { latitude, longitude },
            {
              latitude: nextRoutePoint.location.coordinates[1],
              longitude: nextRoutePoint.location.coordinates[0],
            }
          ) / 1000;

        // 핵심 로직: 다음 정류소가 현재 정류소보다 더 가까워졌다면 (중간 지점 통과)
        if (distToNext < distance) {
          console.log(`[Auto-Pass] ${cp.pointName} 자동 통과 처리됨`);

          cp.status = 'departed'; // 강제로 출발 상태로 변경

          // 시간이 기록되지 않았다면 현재 시간으로 채움
          if (!cp.arrivalTime) cp.arrivalTime = new Date();
          cp.departureTime = new Date();

          message = `${cp.pointName}을(를) 통과했습니다. (자동 보정)`;
        }
      }
    }

    await driveLog.save();

    res.json({
      status: driveLog.status,
      checkpoints: driveLog.checkpoints,
      playAnnouncement,
      message,
    });
  } catch (err) {
    res.status(500).json({ error: '위치 업데이트 중 오류 발생' });
    console.error('📍 Location Update Error:', err);
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
        const cp = driveLog.checkpoints[Number(index)];
        cp.status = 'arrived';
        cp.arrivalTime = new Date();
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

