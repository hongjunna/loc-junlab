import type { CheckpointStatus, DriveLog, PointType } from '../types';

export const TYPE_BADGE: Record<PointType, { bg: string; text?: string; label: string }> = {
  출발지: { bg: 'primary', label: '출발' },
  경유지: { bg: 'warning', text: 'dark', label: '정차' },
  가상정류소: { bg: 'secondary', label: '통과' },
  도착지: { bg: 'success', label: '도착' },
};

export const STATUS_BADGE: Record<CheckpointStatus, { bg: string; text?: string; label: string }> =
  {
    pending: { bg: 'light', text: 'dark', label: '예정' },
    approaching: { bg: 'danger', label: '곧 도착' },
    arrived: { bg: 'success', label: '정차 중' },
    departed: { bg: 'secondary', label: '지나감' },
  };

export const DEFAULT_SETTINGS = { approachRadius: 300, arrivalRadius: 50 };

export const DEFAULT_CENTER: [number, number] = [37.5665, 126.978];

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors';

// 운전자 기기에서 마지막으로 접속한 운행 (새로고침/재접속 시 복구용)
export const ACTIVE_DRIVE_KEY = 'activeDriveId';

export const shareUrlOf = (drive: Pick<DriveLog, '_id' | 'shareCode'>) =>
  drive.shareCode
    ? `${window.location.origin}/p/${drive.shareCode}`
    : `${window.location.origin}/passenger?id=${drive._id}`;
