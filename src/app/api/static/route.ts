import { verifyToken } from "@/utils/jwt";
import { ResponseUtil } from "@/utils/response";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

// 轻量内存缓存（TTL 15s），按用户与月份缓存结果
const staticCache = new Map<string, { data: any; expiresAt: number }>();

// 选取字段的类型定义，避免隐式 any
type ExpenseRow = {
    id: number;
    amount: any; // Prisma Decimal
    description: string | null;
    date: Date;
    categoryId: string | null;
    category: { id: string; name: string; icon: string | null; color: string | null } | null;
};

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
        const nowDate = new Date();
        const currentMonthStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
        const isCurrentMonth = month === currentMonthStr;

        // 构建查询的开始和结束日期（使用记录的业务日期 date 字段，以命中索引）
        const startDate = new Date(year, monthNum - 1, 1);
        const nextMonthStart = new Date(year, monthNum, 1);

        // 缓存命中直接返回（当月不使用缓存）
        const cacheKey = `${user.userId}:${month}`;
        const now = Date.now();
        const cached = !isCurrentMonth ? staticCache.get(cacheKey) : undefined;
        if (!isCurrentMonth && cached && cached.expiresAt > now) {
            return NextResponse.json(
                ResponseUtil.success(cached.data, '月度统计（缓存）')
            );
        }

        // 单次查询：选择必要字段，按业务日期过滤
        const expenses = await prisma.expense.findMany({
            where: {
                userId: user.userId,
                date: {
                    gte: startDate,
                    lt: nextMonthStart
                }
            },
            select: {
                id: true,
                amount: true,
                description: true,
                date: true,
                categoryId: true,
                category: {
                    select: {
                        id: true,
                        name: true,
                        icon: true,
                        color: true
                    }
                }
            },
            orderBy: {
                date: 'desc'
            }
        }) as unknown as ExpenseRow[];

        // 计算统计数据
        const totalAmount = expenses.reduce((sum: number, expense: ExpenseRow) => sum + Number(expense.amount), 0);
        const totalCount = expenses.length;

        // 按分类统计（Map 以分类名为键）
        const categoryStatsMap = new Map<string, {
            name: string;
            icon: string;
            amount: number;
            count: number;
            expenses: ExpenseRow[];
        }>();

        expenses.forEach((expense: ExpenseRow) => {
            const categoryName = expense.category?.name || '未分类';
            const categoryIcon = expense.category?.icon || '📝';

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

        // 按日期统计（YYYY-MM-DD）
        const dailyStatsMap = new Map<string, {
            date: string;
            amount: number;
            count: number;
        }>();

        expenses.forEach((expense: ExpenseRow) => {
            const dateStr = expense.date.toISOString().split('T')[0];
            if (!dailyStatsMap.has(dateStr)) {
                dailyStatsMap.set(dateStr, { date: dateStr, amount: 0, count: 0 });
            }
            const ds = dailyStatsMap.get(dateStr)!;
            ds.amount += Number(expense.amount);
            ds.count += 1;
        });

        // 转换为数组并按日期排序
        const formattedDailyStats = Array.from(dailyStatsMap.values())
            .sort((a, b) => a.date.localeCompare(b.date));

        // 计算平均每日支出
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        const averageDaily = totalCount > 0 ? Number((totalAmount / daysInMonth).toFixed(2)) : 0;

        const payload = {
            month,
            summary: {
                totalAmount,
                totalCount,
                averageDaily
            },
            categoryStats: formattedCategoryStats,
            dailyStats: formattedDailyStats,
            expenses: expenses.map((expense: ExpenseRow) => ({
                id: expense.id,
                amount: Number(expense.amount),
                description: expense.description,
                category: expense.category,
                date: expense.date,
            }))
        };

        // 写入缓存（TTL 15s，当月不写缓存）
        if (!isCurrentMonth) {
            staticCache.set(cacheKey, { data: payload, expiresAt: now + 15_000 });
        }

        return NextResponse.json(
            ResponseUtil.success(payload)
        );

    } catch (error: unknown) {
        console.error('获取月度支出统计失败:', error);
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
}