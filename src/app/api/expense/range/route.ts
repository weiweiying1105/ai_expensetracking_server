import { verifyToken } from "@/utils/jwt"
import { ResponseUtil } from "@/utils/response";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

// 简单内存缓存，降低同一时间段的重复请求开销（TTL 15s）
const rangeCache = new Map<string, { data: any; expiresAt: number }>();

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

        // 命中缓存直接返回
        const cacheKey = `${user.userId}:${startDate}:${endDate}`;
        const now = Date.now();
        const cached = rangeCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return NextResponse.json(
                ResponseUtil.success(cached.data, '时间区间支出查询成功（缓存）')
            );
        }

        // 单次查询所有所需字段，减少往返
        const expenses = await prisma.expense.findMany({
            where: {
                userId: user.userId,
                date: {
                    gte: startOfDay,
                    lt: endOfDay
                }
            },
            select: {
                id: true,
                amount: true,
                description: true,
                date: true,
                categoryId: true,
                category: {
                    select: { id: true, name: true, icon: true, color: true }
                }
            },
            orderBy: { date: 'desc' }
        });

        // 在内存中计算总金额与分类统计，避免额外两次数据库查询
        let totalAmount = 0;
        const statMap = new Map<string | null, { totalAmount: number; count: number; name: string; icon: string | null }>();
        for (const e of expenses) {
            const amt = Number((e as any).amount);
            totalAmount += isFinite(amt) ? amt : 0;
            const key = e.categoryId ?? null;
            const name = e.category?.name || '未知分类';
            const icon = e.category?.icon || '💰';
            const prev = statMap.get(key);
            if (prev) {
                prev.totalAmount += isFinite(amt) ? amt : 0;
                prev.count += 1;
            } else {
                statMap.set(key, { totalAmount: isFinite(amt) ? amt : 0, count: 1, name, icon });
            }
        }

        const categoryStats = Array.from(statMap.entries()).map(([categoryId, data]) => ({
            categoryId,
            categoryName: data.name,
            categoryIcon: data.icon,
            totalAmount: data.totalAmount,
            count: data.count
        }));

        const payload = {
            dateRange: { startDate, endDate },
            summary: {
                totalAmount,
                totalCount: expenses.length,
                dayCount: Math.ceil((endOfDay.getTime() - startOfDay.getTime()) / (1000 * 60 * 60 * 24))
            },
            categoryStats,
            expenses
        };

        // 写入缓存（TTL 15s）
        rangeCache.set(cacheKey, { data: payload, expiresAt: now + 15_000 });

        return NextResponse.json(
            ResponseUtil.success(payload, '时间区间支出查询成功')
        );

    } catch (error) {
        console.error('查询时间区间支出失败:', error);
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
}