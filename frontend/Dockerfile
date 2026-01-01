# [Stage 1] 빌드 단계
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Vite 빌드 실행 -> /app/dist 폴더에 결과물 생성됨
RUN npm run build

# [Stage 2] 실행 단계 (Nginx)
FROM nginx:alpine
# 빌드된 결과물을 Nginx가 서빙할 폴더로 복사
COPY --from=builder /app/dist /usr/share/nginx/html
# 리액트 라우터(SPA) 새로고침 404 에러 방지용 설정 덮어쓰기
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]