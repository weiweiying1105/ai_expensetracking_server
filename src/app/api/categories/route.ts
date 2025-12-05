import { NextRequest, NextResponse } from 'next/server'
import { ResponseUtil } from '@/utils/response'
import { verifyToken } from '@/utils/jwt'
import { Category } from '@/generated/prisma'
import prisma from '@/lib/prisma'

// 获取分类列表
export async function GET(request: NextRequest) {
    try {
        const user = await verifyToken(request)

        if (!user) {
            return NextResponse.json(
                ResponseUtil.error('未授权访问'),
                { status: 401 }
            )
        }

        // 获取系统默认分类和用户自定义分类
        const categories = await prisma.category.findMany({
            where: {
                OR: [
                    { isDefault: true, userId: null }, // 系统默认分类
                    { userId: user.userId } // 用户自定义分类
                ]
            },
            orderBy: [
                { type: 'asc' }, // 先按类型排序（收入/支出）
                { sortOrder: 'asc' }, // 再按排序字段
                { name: 'asc' } // 最后按名称排序
            ]
        })

        // 按类型分组
        const groupedCategories = {
            INCOME: categories.filter(c => c.type === 'INCOME'),
            EXPENSE: categories.filter(c => c.type === 'EXPENSE')
        }

        return NextResponse.json(
            ResponseUtil.success(groupedCategories, '获取分类列表成功')
        )

    } catch (error) {
        console.error('获取分类列表错误:', error)
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        )
    }
}

// 创建自定义分类
export async function POST(request: NextRequest) {
    try {
        const user = await verifyToken(request)

        if (!user) {
            return NextResponse.json(
                ResponseUtil.error('未授权访问'),
                { status: 401 }
            )
        }

        const body = await request.json()
        const { name, icon, color, type, sortOrder } = body

        // 验证必填字段
        if (!name || !type) {
            return NextResponse.json(
                ResponseUtil.error('分类名称和类型不能为空'),
                { status: 400 }
            )
        }

        // 验证类型
        if (!['INCOME', 'EXPENSE'].includes(type)) {
            return NextResponse.json(
                ResponseUtil.error('分类类型必须是 INCOME 或 EXPENSE'),
                { status: 400 }
            )
        }

        // 检查同名分类是否已存在
        const existingCategory = await prisma.category.findFirst({
            where: {
                userId: user.userId,
                name: name,
                type: type
            }
        })

        if (existingCategory) {
            return NextResponse.json(
                ResponseUtil.error('该分类名称已存在'),
                { status: 400 }
            )
        }

        // 创建新分类
        const newCategory = await prisma.category.create({
            data: {
                name,
                icon: icon || '📝',
                color: color || '#DDD',
                type,
                sortOrder: sortOrder || 0,
                isDefault: false,
                userId: user.userId
            }
        })

        return NextResponse.json(
            ResponseUtil.success(newCategory, '创建分类成功')
        )

    } catch (error) {
        console.error('创建分类错误:', error)
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        )
    }
}