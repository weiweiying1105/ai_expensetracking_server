import { verifyToken } from "@/utils/jwt"
import { ResponseUtil } from "@/utils/response";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const user = await verifyToken(request);
        if (!user) {
            return NextResponse.json(
                ResponseUtil.error('未授权访问'),
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        // 验证必需参数
        if (!startDate || !endDate) {
            return NextResponse.json(
                ResponseUtil.error('缺少必需参数：startDate 和 endDate'),
                { status: 400 }
            );
        }

        // 验证日期格式
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return NextResponse.json(
                ResponseUtil.error('日期格式无效，请使用 YYYY-MM-DD 格式'),
                { status: 400 }
            );
        }

        if (start > end) {
            return NextResponse.json(
                ResponseUtil.error('开始时间不能晚于结束时间'),
                { status: 400 }
            );
        }

        // 设置时间范围（包含结束日期的整天）
        const startOfDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);

        // 查询指定时间范围内的支出记录和统计信息
        const [expenses, totalAmount, categoryStats] = await Promise.all([
            // 获取支出列表
            prisma.expense.findMany({
                where: {
                    userId: user.userId,
                    date: {
                        gte: startOfDay,
                        lt: endOfDay
                    }
                },
                include: {
                    category: true
                },
                orderBy: {
                    date: 'desc'
                }
            }),
            // 获取总金额
            prisma.expense.aggregate({
                where: {
                    userId: user.userId,
                    date: {
                        gte: startOfDay,
                        lt: endOfDay
                    }
                },
                _sum: {
                    amount: true
                }
            }),
            // 获取分类统计
            prisma.expense.groupBy({
                by: ['categoryId'],
                where: {
                    userId: user.userId,
                    date: {
                        gte: startOfDay,
                        lt: endOfDay
                    }
                },
                _sum: {
                    amount: true
                },
                _count: {
                    id: true
                }
            })
        ]);

        // 获取分类信息并组合统计数据
        const categoryIds = categoryStats.map(stat => stat.categoryId).filter((id): id is string => id !== null);
        const categories = await prisma.category.findMany({
            where: {
                id: {
                    in: categoryIds
                }
            }
        });

        const categoryStatsWithNames = categoryStats.map(stat => {
            const category = categories.find(cat => cat.id === stat.categoryId);
            return {
                categoryId: stat.categoryId,
                categoryName: category?.name || '未知分类',
                categoryIcon: category?.icon || '💰',
                totalAmount: stat._sum.amount || 0,
                count: stat._count.id
            };
        });

        return NextResponse.json(
            ResponseUtil.success({
                dateRange: {
                    startDate: startDate,
                    endDate: endDate
                },
                summary: {
                    totalAmount: totalAmount._sum.amount || 0,
                    totalCount: expenses.length,
                    dayCount: Math.ceil((endOfDay.getTime() - startOfDay.getTime()) / (1000 * 60 * 60 * 24))
                },
                categoryStats: categoryStatsWithNames,
                expenses
            }, '时间区间支出查询成功')
        );

    } catch (error) {
        console.error('查询时间区间支出失败:', error);
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
}