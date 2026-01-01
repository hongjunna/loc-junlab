export interface Point {
  name: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [경도, 위도]
  };
  type: '출발지' | '경유지' | '가상정류소' | '도착지';
  scheduledTime: string;
  useAnnouncement: boolean;
}

export interface Route {
  _id: string;
  routeName: string;
  points: Point[];
}

export interface DriveLog {
  _id: string;
  routeId: string;
  status: 'running' | 'completed';
  checkpoints: any[];
}
