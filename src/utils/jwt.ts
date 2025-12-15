import jwt, { Secret, SignOptions } from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { ResponseCode, ResponseMessage } from './response'
import prisma from '../lib/prisma'
const JWT_SECRET = (process.env.JWT_SECRET || 'your-jwt-secret-key') as Secret;

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
export async function verifyToken(requestOrToken: NextRequest | string): Promise<JWTPayload | null> {
  try {
    let token: string | null = null
    
    // 如果是NextRequest对象，从请求头获取token
    if (requestOrToken instanceof NextRequest) {
      const authHeader = requestOrToken.headers.get('authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7) // 移除 'Bearer ' 前缀
      }
    } else {
      // 如果直接传入token字符串，使用它
      token = requestOrToken
    }
    
    if (!token) {
      return null
    }

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
  const options: SignOptions = {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  }
  return jwt.sign(
    { ...payload, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    options
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