import { PrismaClient } from '@/generated/prisma'

// 全局PrismaClient实例，避免每次请求创建新实例
// 这是Prisma推荐的最佳实践，可减少数据库连接开销

// 扩展NodeJS全局类型
declare global {
  var prisma: PrismaClient | undefined
}

// 创建或使用全局PrismaClient实例
const prisma = global.prisma || new PrismaClient({
  // 可选：启用日志记录以便调试
  // log: ['query', 'info', 'warn', 'error']
})

// 在开发环境中将实例挂载到全局对象
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}

export default prisma