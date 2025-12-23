import jwt, { Secret, SignOptions } from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { ResponseCode, ResponseMessage } from './response'
const JWT_SECRET = (process.env.JWT_SECRET || 'your-jwt-secret-key') as Secret;
import { StringValue } from 'ms'
export interface JWTPayload {
  userId: string
  openId: string
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
export async function verifyToken(requestOrToken: NextRequest | string ): Promise<JWTPayload | null> {
  try {
    let token: string | null = null

    // 优先：直接字符串
    if (typeof requestOrToken === 'string') {
      token = requestOrToken
    } else {
      // 请求对象：从 Authorization 或 Cookie 获取
      const authHeader = requestOrToken.headers.get('authorization') || ''
      if (/^Bearer\s+/i.test(authHeader)) {
        token = authHeader.replace(/^Bearer\s+/i, '')
      }
      if (!token) {
        const cookieToken = requestOrToken.cookies?.get?.('token')?.value
        if (cookieToken) token = cookieToken
      }
    }

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return null
    }

    // Ensure token is a string
    if (typeof token !== 'string') {
      console.error('Token is not a string:', token)
      return null
    }

    console.log('JWT_SECRET used for verification:', JWT_SECRET)
    console.log('JWT_SECRET length:', typeof JWT_SECRET === 'string' ? JWT_SECRET.length : 'N/A')
    
    // 验证token
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    console.log('Token verification successful, decoded:', decoded)

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
    expiresIn: (process.env.JWT_EXPIRES_IN || '15d') as StringValue
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
      openId: decoded.openId
    })

  } catch {
    return null
  }
}