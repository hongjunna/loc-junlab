// 기본값 '/api' : 운영에서는 같은 도메인의 Nginx가, 개발에서는 Vite proxy가 백엔드로 넘겨줌
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const TOKEN_KEY = 'authToken';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const storage = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (token: string | null) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // 저장소를 사용할 수 없는 환경(사파리 비공개 모드 등)
    }
  },
};

export interface AuthUser {
  method: 'password' | 'google';
  email?: string;
  name?: string;
  picture?: string;
  exp: number;
}

// 토큰 앞부분(base64url JSON)에서 사용자 정보 읽기. 검증은 서버가 함
const decode = (token: string | null): AuthUser | null => {
  if (!token) return null;
  try {
    const b64 = token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      Array.from(atob(b64), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
    );
    return JSON.parse(json) as AuthUser;
  } catch {
    return null;
  }
};

export const auth = {
  getToken: storage.get,
  setToken: storage.set,
  user: () => decode(storage.get()),
  isLoggedIn: () => {
    const user = decode(storage.get());
    return !!user && user.exp > Date.now();
  },
};

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export const request = async <T>(method: Method, path: string, body?: unknown): Promise<T> => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = storage.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      storage.set(null);
      window.dispatchEvent(new Event('auth:logout'));
    }
    throw new ApiError(res.status, data?.error || `요청 실패 (${res.status})`);
  }
  return data as T;
};

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';
