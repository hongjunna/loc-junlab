import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export const getRoutes = () => api.get('/routes');
export const createRoute = (data: any) => api.post('/routes', data);
export const startDrive = (routeId: string) =>
  api.post('/drive/start', {
    routeId,
    approachRadius: 0.3, // 기본값 500m
    arrivalRadius: 0.04, // 기본값 100m
  });
export const updateLocation = (driveLogId: string, lat: number, lng: number) =>
  api.post(`/drive/${driveLogId}/location`, { latitude: lat, longitude: lng });

export default api;

