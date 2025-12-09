import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { ResponseUtil } from '../../../../utils/response'
import prisma from '../../../../lib/prisma'

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = '7d';

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
            return NextResponse.json(
                ResponseUtil.error('缺少必要参数token'),
                { status: 400 }
            )
        }

        if (!JWT_SECRET) {
            return NextResponse.json(
                ResponseUtil.error('服务器未配置JWT密钥'),
                { status: 500 }
            )
        }
        // 验证旧 token
        let payload: any = null
        try {
            payload = jwt.verify(oldToken, JWT_SECRET)
        } catch (err) {
            return NextResponse.json(
                ResponseUtil.error('旧 token 无效'),
                { status: 401 }
            )
        }

        // 可选：确保用户仍然存在
        if (!payload?.userId) {
            return NextResponse.json(
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
            return NextResponse.json(
                ResponseUtil.error('用户不存在'),
                { status: 404 }
            )
        }
        const newTokenPayload = {
            userId: user.id,
            openid: user.openId,
            nickname: user.nickName,
            iat: Math.floor(Date.now() / 1000),
        }
        const newToken = jwt.sign(newTokenPayload, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN
        })
        return NextResponse.json(
            ResponseUtil.success({ token: newToken }, '刷新成功'),
            { status: 200 }
        )
    } catch (error) {
        console.error('刷新token处理错误:', error)
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        )
    }
}