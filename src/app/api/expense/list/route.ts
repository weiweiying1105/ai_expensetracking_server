import { verifyToken } from "@/utils/jwt";
import { ResponseUtil } from "@/utils/response";
import { NextResponse,NextRequest } from "next/server";
import prisma  from "@/lib/prisma";

// 强制动态渲染，因为需要访问请求头
export const dynamic = 'force-dynamic';

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
        const {searchParams} = new URL(request.url);
        const dateParam = searchParams.get('month'); // 支持格式: YYYY-MM 或 YYYY-MM-DD
        if (!dateParam) {
            return NextResponse.json(
                ResponseUtil.error('缺少日期参数，格式应为: YYYY-MM 或 YYYY-MM-DD'),
                { status: 400 }
            );
        }

        // 支持两种格式：YYYY-MM 和 YYYY-MM-DD
        const dateRegex = /^(\d{4}-\d{2})(?:-(\d{2}))?$/;
        const match = dateParam.match(dateRegex);
        if (!match) {
            return NextResponse.json(
                ResponseUtil.error('日期格式错误，应为: YYYY-MM 或 YYYY-MM-DD'),
                { status: 400 }
            );
        }

        const [year, monthNum] = match[1].split('-').map(Number);
        const day = match[2] ? Number(match[2]) : null;
        
        let startDate: Date;
        let endDate: Date;
        
        if (day) {
            // YYYY-MM-DD 格式：查询当天
            startDate = new Date(year, monthNum - 1, day);
            endDate = new Date(year, monthNum - 1, day + 1);
        } else {
            // YYYY-MM 格式：查询当月
            startDate = new Date(year, monthNum - 1, 1);
            endDate = new Date(year, monthNum, 1);
        }
        const response = await prisma.expense.findMany({
            where: {
                userId: user.userId,
                date: {
                    gte: startDate,
                    lt: endDate
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
        });
         return NextResponse.json(
            ResponseUtil.success(response)
        );
    } catch (error) {
        console.error('查询静态数据列表失败:', error);
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
}