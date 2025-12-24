import { NextRequest } from 'next/server'
import { ResponseUtil, createJsonResponse } from '@/utils/response'
import { verifyToken } from '@/utils/jwt'
import { TransactionType } from '@/generated/prisma'
import prisma from '@/lib/prisma'

// 强制动态渲染，因为需要访问请求头
export const dynamic = 'force-dynamic';

// 获取分类列表
export async function GET(request: NextRequest) {
    try {
        const user = await verifyToken(request)

        if (!user) {
            return createJsonResponse(
                ResponseUtil.error('未授权访问'),
                { status: 401 }
            )
        }

        // 获取所有分类（仅选择现有列，避免选择不存在的 userId）
        const categories = await prisma.category.findMany({
            orderBy: [
                { type: 'asc' }, // 先按类型排序（收入/支出）
                { sortOrder: 'asc' }, // 再按排序字段
                { name: 'asc' } // 最后按名称排序
            ],
            select: {
                id: true,
                name: true,
                icon: true,
                color: true,
                type: true,
                sortOrder: true,
                isDefault: true
            }
        })

        // 按类型分组
        const groupedCategories = {
            INCOME: categories.filter(c => c.type === TransactionType.INCOME),
            EXPENSE: categories.filter(c => c.type === TransactionType.EXPENSE)
        }

        return createJsonResponse(
            ResponseUtil.success(groupedCategories, '获取分类列表成功')
        )

    } catch (error) {
        console.error('获取分类列表错误:', error)
        return createJsonResponse(
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
            return createJsonResponse(
                ResponseUtil.error('未授权访问'),
                { status: 401 }
            )
        }

        const body = await request.json()
        const { name, icon, color, type, sortOrder } = body

        // 验证必填字段
        if (!name || !type) {
            return createJsonResponse(
                ResponseUtil.error('分类名称和类型不能为空'),
                { status: 400 }
            )
        }

        // 验证类型
        if (type !== TransactionType.INCOME && type !== TransactionType.EXPENSE) {
            return createJsonResponse(
                ResponseUtil.error('分类类型必须是 INCOME 或 EXPENSE'),
                { status: 400 }
            )
        }

        // 检查同名分类是否已存在
        const existingCategory = await prisma.category.findFirst({
            where: {
                name: name,
                type: type as TransactionType
            },
            select: { id: true }
        })

        if (existingCategory) {
            return createJsonResponse(
                ResponseUtil.error('该分类名称已存在'),
                { status: 400 }
            )
        }

        // 创建新分类（仅返回现有列，避免选择不存在的 userId）
        const newCategory = await prisma.category.create({
            data: {
                name,
                icon: icon || '📝',
                color: color || '#DDD',
                type,
                sortOrder: sortOrder || 0,
                isDefault: false
            },
            select: {
                id: true,
                name: true,
                icon: true,
                color: true,
                type: true,
                sortOrder: true,
                isDefault: true
            }
        })

        return createJsonResponse(
            ResponseUtil.success(newCategory, '创建分类成功')
        )

    } catch (error) {
        console.error('创建分类错误:', error)
        return createJsonResponse(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        )
    }
}

// 处理OPTIONS请求，支持CORS跨域
export async function OPTIONS() {
    return createJsonResponse(null, { status: 200 })
}