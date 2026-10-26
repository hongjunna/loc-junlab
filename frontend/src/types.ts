export const POINT_TYPES = ['출발지', '경유지', '가상정류소', '도착지'] as const;
export type PointType = (typeof POINT_TYPES)[number];

export type LngLat = [number, number]; // [경도, 위도] (서버/GeoJSON 순서)
export type LatLng = [number, number]; // [위도, 경도] (Leaflet 순서)

export interface RoutePoint {
  _id?: string;
  name: string;
  location: { type: 'Point'; coordinates: LngLat };
  type: PointType;
  scheduledTime?: string;
  useAnnouncement: boolean;
}

export interface RouteSettings {
  approachRadius: number; // m
  arrivalRadius: number; // m
}

export interface Route {
  _id: string;
  routeName: string;
  points: RoutePoint[];
  settings?: RouteSettings;
  activeDriveCount?: number;
  updatedAt?: string;
}

export type RouteInput = Pick<Route, 'routeName' | 'points'> & { settings: RouteSettings };

export type CheckpointStatus = 'pending' | 'approaching' | 'arrived' | 'departed';

export interface Checkpoint {
  pointName: string;
  type: PointType;
  coordinates: LngLat;
  scheduledTime?: string;
  useAnnouncement?: boolean;
  status: CheckpointStatus;
  arrivalTime?: string;
  departureTime?: string;
  manual?: boolean;
}

export interface CurrentLocation {
  coordinates: LngLat;
  accuracy?: number;
  heading?: number;
  speed?: number;
  updatedAt?: string;
}

export interface DriveLog {
  _id: string;
  routeId: string;
  routeName: string;
  shareCode?: string;
  status: 'running' | 'completed';
  endReason?: 'manual' | 'stale';
  startTime: string;
  endTime?: string;
  currentIndex: number;
  currentLocation?: CurrentLocation;
  checkpoints: Checkpoint[];
  settings: RouteSettings;
  track?: { lat: number; lng: number; t: string }[];
  canUndo?: boolean;
}

export interface TrackerEvent {
  kind: 'approach' | 'arrive' | 'depart' | 'pass';
  index: number;
  pointName: string;
  announce: boolean;
  message: string;
}

export interface LocationResponse {
  checkpoints: Checkpoint[];
  currentIndex: number;
  currentLocation: CurrentLocation;
  events: TrackerEvent[];
  judged: boolean;
}

export interface CheckpointUpdate {
  checkpoints: Checkpoint[];
  currentIndex: number;
  events?: TrackerEvent[];
  canUndo: boolean;
}

export interface PublicDrive {
  shareCode?: string;
  routeName: string;
  status: 'running' | 'completed';
  startTime: string;
  endTime?: string;
  startedAt: string | null;
  currentIndex: number;
  checkpoints: Checkpoint[];
  currentLocation: CurrentLocation | null;
  track: LatLng[];
  serverTime: string;
}
