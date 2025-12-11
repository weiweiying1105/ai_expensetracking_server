import { NextRequest, NextResponse } from 'next/server'
import { ResponseUtil } from '../../../../utils/response'
import { verifyToken } from '../../../../utils/jwt'
import prisma from '../../../../lib/prisma'

// 强制动态渲染，因为需要访问请求头
export const dynamic = 'force-dynamic';

// 获取用户信息
export async function GET(request: NextRequest) {
  try {
    const user = await verifyToken(request)

    if (!user) {
      return NextResponse.json(
        ResponseUtil.error('未授权访问'),
        { status: 401 }
      )
    }

    // 获取用户详细信息
    const userInfo = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        id: true,
        nickName: true,
        avatarUrl: true,
        currency: true,
        timezone: true,
        createdAt: true,
        lastLoginAt: true
      }
    })

    if (!userInfo) {
      return NextResponse.json(
        ResponseUtil.error('用户不存在'),
        { status: 404 }
      )
    }

    return NextResponse.json(
      ResponseUtil.success(userInfo, '获取用户信息成功')
    )

  } catch (error) {
    console.error('获取用户信息错误:', error)
    return NextResponse.json(
      ResponseUtil.error('服务器内部错误'),
      { status: 500 }
    )
  }
}

// 更新用户信息
export async function PUT(request: NextRequest) {
  try {
    const user = await verifyToken(request)

    if (!user) {
      return NextResponse.json(
        ResponseUtil.error('未授权访问'),
        { status: 401 }
      )
    }

    const body = await request.json()
    const { nickName, avatarUrl, currency, timezone } = body

    const updatedUser = await prisma.user.update({
      where: { id: user.userId },
      data: {
        ...(nickName && { nickName }),
        ...(avatarUrl && { avatarUrl }),
        ...(currency && { currency }),
        ...(timezone && { timezone })
      },
      select: {
        id: true,
        nickName: true,
        avatarUrl: true,
        currency: true,
        timezone: true
      }
    })

    return NextResponse.json(
      ResponseUtil.success(updatedUser, '更新用户信息成功')
    )

  } catch (error) {
    console.error('更新用户信息错误:', error)
    return NextResponse.json(
      ResponseUtil.error('服务器内部错误'),
      { status: 500 }
    )
  }
}