import { verifyToken } from "@/utils/jwt";
import { ResponseUtil } from "@/utils/response";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        // 验证用户身份
        const user = await verifyToken(request);
        if (!user) {
            return NextResponse.json(
                ResponseUtil.error('未授权访问'),
                { status: 401 }
            );
        }

        // 获取并验证月份参数
        const { searchParams } = new URL(request.url);
        const month = searchParams.get('month'); // 格式: 2022-09

        if (!month) {
            return NextResponse.json(
                ResponseUtil.error('缺少月份参数，格式应为: YYYY-MM'),
                { status: 400 }
            );
        }

        const monthRegex = /^\d{4}-\d{2}$/;
        if (!monthRegex.test(month)) {
            return NextResponse.json(
                ResponseUtil.error('月份格式错误，应为: YYYY-MM'),
                { status: 400 }
            );
        }

        // 解析年月
        const [year, monthNum] = month.split('-').map(Number);

        // 构建查询的开始和结束日期
        const startDate = new Date(year, monthNum - 1, 1); // 月份从0开始
        const endDate = new Date(year, monthNum, 0, 23, 59, 59, 999); // 该月最后一天的最后时刻

        // 查询支出列表（仅选择必要字段，减少数据传输）
        const expenses = await prisma.expense.findMany({
            where: {
                userId: user.userId,
                createdAt: {
                    gte: startDate,
                    lte: endDate
                }
            },
            select: {
                id: true,
                amount: true,
                description: true,
                createdAt: true,
                rawText: true,
                aiMerchant: true,
                aiConfidence: true,
                categoryId: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // 获取所有涉及的分类信息（避免在循环中多次查询）
        const categoryIds = Array.from(new Set(expenses
            .filter(expense => expense.categoryId)
            .map(expense => expense.categoryId!)));
            
        const categories = await prisma.category.findMany({
            where: {
                id: { in: categoryIds }
            },
            select: {
                id: true,
                name: true,
                icon: true
            }
        });
        
        const categoryMap = new Map(categories.map(cat => [cat.id, cat]));

        // 计算统计数据
        const totalAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
        const totalCount = expenses.length;

        // 按分类统计（优化：使用Map提高查找效率）
        const categoryStatsMap = new Map<string, {
            name: string;
            icon: string;
            amount: number;
            count: number;
            expenses: typeof expenses;
        }>();

        expenses.forEach(expense => {
            const categoryId = expense.categoryId;
            const category = categoryId ? categoryMap.get(categoryId) : null;
            const categoryName = category?.name || '未分类';
            const categoryIcon = category?.icon || '📝';

            if (!categoryStatsMap.has(categoryName)) {
                categoryStatsMap.set(categoryName, {
                    name: categoryName,
                    icon: categoryIcon,
                    amount: 0,
                    count: 0,
                    expenses: []
                });
            }

            const stats = categoryStatsMap.get(categoryName)!;
            stats.amount += Number(expense.amount);
            stats.count += 1;
            stats.expenses.push(expense);
        });

        // 转换为数组并按金额排序
        const formattedCategoryStats = Array.from(categoryStatsMap.values())
            .sort((a, b) => b.amount - a.amount);

        // 按日期统计（优化：使用Map提高查找效率）
        const dailyStatsMap = new Map<string, {
            date: string;
            amount: number;
            count: number;
        }>();

        expenses.forEach(expense => {
            const date = expense.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD

            if (!dailyStatsMap.has(date)) {
                dailyStatsMap.set(date, {
                    date,
                    amount: 0,
                    count: 0
                });
            }

            const stats = dailyStatsMap.get(date)!;
            stats.amount += Number(expense.amount);
            stats.count += 1;
        });

        // 转换为数组并按日期排序
        const formattedDailyStats = Array.from(dailyStatsMap.values())
            .sort((a, b) => a.date.localeCompare(b.date));

        // 计算平均每日支出
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const averageDaily = totalCount > 0 
            ? (totalAmount / daysInMonth).toFixed(2)
            : 0;

        return NextResponse.json(
            ResponseUtil.success({
                month,
                summary: {
                    totalAmount,
                    totalCount,
                    averageDaily: Number(averageDaily)
                },
                categoryStats: formattedCategoryStats,
                dailyStats: formattedDailyStats,
                expenses: expenses.map(expense => ({
                    id: expense.id,
                    amount: Number(expense.amount),
                    description: expense.description,
                    category: expense.category,
                    date: expense.createdAt,
                    rawText: expense.rawText,
                    aiMerchant: expense.aiMerchant,
                    aiConfidence: expense.aiConfidence
                }))
            })
        );

    } catch (error: unknown) {
        console.error('获取月度支出统计失败:', error);
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
}