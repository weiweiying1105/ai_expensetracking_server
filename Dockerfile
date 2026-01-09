# 使用 Node.js 18 作为基础镜像
FROM node:18-alpine AS base
FROM node:20-bullseye


WORKDIR /app

# 先拷贝 package.json
COPY package*.json ./

# 安装依赖（不会再触发 prisma）
RUN npm ci

# 再拷贝完整源码（包括 prisma/schema.prisma）
COPY . .

# 显式执行 prisma generate
RUN npx prisma generate

# 构建 NestJS
RUN npm run build

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8000

# 暴露端口
EXPOSE 8000

CMD ["node", ".next/standalone/server.js"]

