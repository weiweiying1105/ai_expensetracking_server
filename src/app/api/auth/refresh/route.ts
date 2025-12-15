import { NextRequest } from 'next/server'
import { ResponseCode, ResponseUtil, createJsonResponse } from '../../../../utils/response'
import prisma from '../../../../lib/prisma'
import { generateToken, verifyToken } from '../../../../utils/jwt'

// 强制动态渲染，因为需要访问请求头和JSON body
export const dynamic = 'force-dynamic';

interface RefreshRequest {
    token?: string
}
export async function POST(request: NextRequest) {
    try {
        const body: RefreshRequest = await request.json().catch(() => ({}))
        // 支持从 Authorization: Bearer xxx 或 body.token 读取旧 token
        const tokenFromHeader = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
        const oldToken = body?.token || tokenFromHeader

        if (!oldToken) {
            return createJsonResponse(
                ResponseUtil.error('缺少必要参数token'),
                { status: 400 }
            )
        }

        // 验证旧 token
        const payload = await verifyToken(oldToken)
        if (!payload) {
            return createJsonResponse(
                ResponseUtil.error('旧 token 无效'),
                { status: 401 }
            )
        }

        // 可选：确保用户仍然存在
        if (!payload?.userId) {
            return createJsonResponse(
                ResponseUtil.error('token载荷缺少用户信息'),
                { status: 400 }
            )
        }
        const user = await prisma.user.findUnique({
            where: {
                id: payload.userId
            }
        })
        if (!user) {
            return createJsonResponse(
                ResponseUtil.error('用户不存在'),
                { status: 404 } // 用户不存在应该返回404 Not Found
            )
        }
        const newTokenPayload = {
            userId: user.id,
            openId: user.openId,
            nickName: user.nickName || ''
        }
        const newToken = generateToken(newTokenPayload)
        return createJsonResponse(
            ResponseUtil.success({ token: newToken }, '刷新成功'),
            { status: 200 }
        )
    } catch (error) {
        console.error('刷新token处理错误:', error)
        return createJsonResponse(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        )
    }
}