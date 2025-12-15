import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { ResponseCode, ResponseMessage } from './response'
import prisma from '../lib/prisma'
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key'

export interface JWTPayload {
  userId: string
  openId: string
  nickName: string
  iat: number
  exp: number
}

export interface AuthenticatedRequest extends NextRequest {
  user?: JWTPayload
}

// JWT验证中间件
export async function withAuth(handler: (request: AuthenticatedRequest) => Promise<Response>) {
  return async (request: NextRequest) => {
    const user = await verifyToken(request)

    if (!user) {
      return new Response(
        JSON.stringify({
          success: false,
          message: ResponseMessage.UNAUTHORIZED,
          code: ResponseCode.UNAUTHORIZED
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    }

    // 将用户信息附加到请求对象
    const authenticatedRequest = request as AuthenticatedRequest
    authenticatedRequest.user = user

    return await handler(authenticatedRequest)
  }
}

// 验证JWT token
export async function verifyToken(request: NextRequest): Promise<JWTPayload | null> {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7) // 移除 'Bearer ' 前缀

    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload

    // 只进行token验证，不额外查询数据库，减少性能开销
    return decoded

  } catch (error) {
    console.error('Token验证失败:', error)
    return null
  }
}

// 生成新的token
export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(
    { ...payload, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '7d' }
  )
}

// 刷新token
export function refreshToken(oldToken: string): string | null {
  try {
    const decoded = jwt.verify(oldToken, JWT_SECRET) as JWTPayload

    // 生成新token
    return generateToken({
      userId: decoded.userId,
      openId: decoded.openId,
      nickName: decoded.nickName
    })

  } catch {
    return null
  }
}