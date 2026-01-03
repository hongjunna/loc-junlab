# 1단계: 빌드
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx vite build 

# 2단계: 실행 (Nginx 사용)
FROM nginx:stable-alpine
# Vite의 기본 빌드 폴더는 dist입니다. 이를 Nginx 경로로 복사
COPY --from=builder /app/dist /usr/share/nginx/html
# SPA 라우팅을 위한 Nginx 설정 (필수)
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
