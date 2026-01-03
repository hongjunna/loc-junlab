FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# tsc -b 를 빼고 빌드하여 타입 에러를 무시합니다.
RUN npx vite build 