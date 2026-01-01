# 1. Node 이미지 사용
FROM node:18-alpine

# 2. 작업 폴더 설정
WORKDIR /app

# 3. 패키지 파일 복사 및 설치
COPY package*.json ./
RUN npm install

# 4. 소스 코드 복사
COPY . .

# 5. TypeScript 빌드 (ts-node를 안 쓰고 빌드해서 실행하는게 정석)
RUN npm run build

# 6. 실행 포트 노출 (컨테이너 내부 포트)
EXPOSE 5678

# 7. 서버 실행 (빌드된 JS 실행)
CMD ["npm", "start"]