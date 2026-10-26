import type {
  AuthConfig,
  CheckpointUpdate,
  Member,
  Tracker,
  TrackerSummary,
  DriveLog,
  LocationResponse,
  PublicDrive,
  Route,
  RouteInput,
  RoutePoint,
} from '../types';
import { auth, request } from './client';

export { ApiError, auth, errorMessage, type AuthUser } from './client';

export const login = async (password: string) => {
  const res = await request<{ token: string; expiresAt: string }>('POST', '/auth/login', {
    password,
  });
  auth.setToken(res.token);
  return res;
};

export const getAuthConfig = () => request<AuthConfig>('GET', '/auth/config');

export const loginWithGoogle = async (credential: string) => {
  const res = await request<{ token: string; expiresAt: string }>('POST', '/auth/google', {
    credential,
  });
  auth.setToken(res.token);
  return res;
};

export const logout = () => {
  auth.setToken(null);
  window.dispatchEvent(new Event('auth:logout'));
};

// 노선
export const getRoutes = () => request<Route[]>('GET', '/routes');
export const getRoute = (id: string) => request<Route>('GET', `/routes/${id}`);
export const createRoute = (data: RouteInput) => request<Route>('POST', '/routes', data);
export const updateRoute = (id: string, data: RouteInput) =>
  request<Route>('PUT', `/routes/${id}`, data);
export const deleteRoute = (id: string, force = false) =>
  request<{ message: string }>('DELETE', `/routes/${id}${force ? '?force=true' : ''}`);
export const getAllPoints = () => request<RoutePoint[]>('GET', '/routes/data/points');

// 운행
export const startDrive = (routeId: string, trackerId?: string | null) =>
  request<DriveLog>('POST', '/drives', { routeId, trackerId: trackerId || null });
export const setDriveTracker = (id: string, trackerId: string | null) =>
  request<{ trackerId: TrackerSummary | null }>('PUT', `/drives/${id}/tracker`, { trackerId });
export const getActiveDrives = () => request<DriveLog[]>('GET', '/drives/active');
export const getDrives = (params: { before?: string; routeId?: string } = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  return request<DriveLog[]>('GET', `/drives${qs.size ? `?${qs}` : ''}`);
};
export const getDrive = (id: string) => request<DriveLog>('GET', `/drives/${id}`);
export const sendLocation = (
  id: string,
  pos: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number | null;
    speed?: number | null;
  }
) => request<LocationResponse>('POST', `/drives/${id}/location`, pos);
export const arriveCheckpoint = (id: string, index: number) =>
  request<CheckpointUpdate>('POST', `/drives/${id}/checkpoints/${index}/arrive`);
export const undoCheckpoint = (id: string) =>
  request<CheckpointUpdate>('POST', `/drives/${id}/undo`);
export const endDrive = (id: string) => request<DriveLog>('POST', `/drives/${id}/end`);

// 트래커 기기 (Traccar Client)
export const getTrackers = () => request<Tracker[]>('GET', '/trackers');
export const getTracker = (id: string) => request<Tracker>('GET', `/trackers/${id}`);
export const createTracker = (name: string) => request<Tracker>('POST', '/trackers', { name });
export const renameTracker = (id: string, name: string) =>
  request<Tracker>('PUT', `/trackers/${id}`, { name });
export const regenerateTracker = (id: string) =>
  request<Tracker>('POST', `/trackers/${id}/regenerate`);
export const deleteTracker = (id: string) =>
  request<{ message: string }>('DELETE', `/trackers/${id}`);

// 구글 로그인 허용 사용자
export const getMembers = () =>
  request<{ admins: string[]; members: Member[]; googleEnabled: boolean }>('GET', '/members');
export const addMember = (email: string, name?: string) =>
  request<Member>('POST', '/members', { email, name });
export const removeMember = (id: string) =>
  request<{ message: string }>('DELETE', `/members/${id}`);

// 승객
export const getPublicDrive = (code: string) =>
  request<PublicDrive>('GET', `/public/drives/${encodeURIComponent(code)}`);
