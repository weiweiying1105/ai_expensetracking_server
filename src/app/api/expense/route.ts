import { verifyToken } from "@/utils/jwt"
import { ResponseUtil } from "@/utils/response";
import { isCategoryInDatabase, quickAnalyzeExpense } from "@/utils/expense-patterns";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { OpenAI } from "openai";
import prisma from "@/lib/prisma";
import { createExpenseCategory, getExpenseAllCategory } from "../categories";

const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
});
// 缓存分类信息
const CATEGORY_CACHE_TTL_MS = 15_000;
type CategoryCacheEntry = { value: any[]; expiresAt: number };
const cachedCategories = new Map<string, CategoryCacheEntry>();
function getCacheCategory(type: 'EXPENSE' | 'INCOME' = 'EXPENSE') {
    const entry = cachedCategories.get(type);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cachedCategories.delete(type);
        return null;
    }
    return entry.value;
}
function setCacheCategory(type: 'EXPENSE' | 'INCOME', categories: any[]) {
    cachedCategories.set(type, { value: categories, expiresAt: Date.now() + CATEGORY_CACHE_TTL_MS });
}
// AI分析支出信息
async function analyzeExpenseWithAI(rawText: string, availableCategories: any[]) {
    try {
        // 仅传递精简的分类信息，减少token占用
        const categoriesText = availableCategories.map((c: any) => `${c.id}: ${c.name}`).join('\n');
        const prompt = `
请分析以下支出描述，提取金额、描述等信息，并推荐分类：

原始文本："${rawText}"

可选分类：
${categoriesText}

请返回JSON格式的分析结果：
    [{
  "amount": 25.5,
  "description": "星巴克咖啡",
  "confidence": 0.95,
  "tags": ["咖啡", "饮品"],
  "type": "expense",    // 或者income
  "merchant": "星巴克",
  "reasoning": "从文本中识别出在星巴克消费25.5元买咖啡",
  "categoryId": "餐饮",//如果从数据库中找到了，则返回分类id，否则返回null
  "categoriesText": "餐饮" //如果从数据库中找到了，则返回分类名称，否则通过ai识别，如果真的识别不出，就返回null
}]

注意：
- amount必须是数字类型，如果无法识别金额则设为null
- categoryId必须从提供的分类列表中选择
- categoriesText应该是餐饮，服装，交通，工资，购物等常见支出类型
`;

        const response = await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: "你是一个专业的财务分析助手，擅长从自然语言中提取支出信息。请严格按照JSON格式返回结果，确保金额为数字类型。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.2,
            max_tokens: 400 // 降低最大tokens以缩短响应时间
        });
        console.log('AI响应:', response.choices[0]?.message?.content);

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('AI响应为空');
        }

        // 提取JSON内容（处理可能的markdown代码块格式）
        let jsonContent = content.trim();
        if (jsonContent.startsWith('```json')) {
            jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonContent.startsWith('```')) {
            jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        // 尝试解析JSON响应
        const aiResult = JSON.parse(jsonContent);
        return {
            success: true,
            data: aiResult,
            usage: response.usage,
            isQuickMatch: false
        };
    } catch (error: any) {
        console.error('AI分析失败:', error);
        return {
            success: false,
            error: error.message,
            isQuickMatch: false
        };
    }
}

// POST 请求处理,分析文本，返回是支出还是收入的数据数组，批量创建支出/收入分类然后创建记录
export async function POST(request: NextRequest) {
    const user = await verifyToken(request);
    if (!user) {
        return NextResponse.json(
            ResponseUtil.error('未授权访问'),
            { status: 401 }
        );
    }
    const { rawText, date } = await request.json();

    // 读取缓存分类，未命中则查询并写入
    let expenseCategory = getCacheCategory('EXPENSE') as any[] | null;
    if (!expenseCategory) {
        const fetched = await getExpenseAllCategory();
        setCacheCategory('EXPENSE', fetched as any[]);
        expenseCategory = fetched as any[];
    }

    // 1) 先使用本地快速分析，命中则跳过AI，显著缩短时间
    const quick = quickAnalyzeExpense(rawText, expenseCategory as any);
    let items: any[] = [];
    if (quick.success && quick.data) {
        items = [quick.data];
    } else {
        const aiAnalysis = await analyzeExpenseWithAI(rawText, expenseCategory);
        console.log('AI分析结果:', aiAnalysis);
        if (!aiAnalysis.success || !Array.isArray(aiAnalysis.data)) {
            return NextResponse.json(
                ResponseUtil.error('未能解析记账内容'),
                { status: 400 }
            );
        }
        items = aiAnalysis.data;
    }

    // 2) 批量创建（可事务），减少往返次数；并附加原始文本
    const ops = items.map((item: any) => {
        const isIncome = item.type === 'income';
        const catId = item.categoryId;
        const catName = item.categoriesText;
        const categoryPromise = (async () => {
            if (catId) return catId;
            if (!catName) return null;
            const catType: 'INCOME' | 'EXPENSE' = isIncome ? 'INCOME' : 'EXPENSE';
            // 通过现有工具创建/获取分类
            const category = await createExpenseCategory(catName, catType);
            // 更新缓存，确保后续分析能立即命中新分类
            const current = getCacheCategory(catType);
            if (current) setCacheCategory(catType, [...current, category]);
            return category.id;
        })();

        return categoryPromise.then((finalCategoryId) =>
            prisma.expense.create({
                data: {
                    userId: user.userId,
                    amount: item.amount,
                    description: item.description,
                    date: date ? date : new Date().toISOString(),
                    categoryId: finalCategoryId || null,
                }
            })
        );
    });

    const records = await Promise.all(ops);

    return NextResponse.json(
        ResponseUtil.success({
            message: '支出/收入分类和记录创建成功',
            // categories: categories,
            records: records,
        }),
        { status: 200 }
    );
}

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
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const categoryId = searchParams.get('categoryId');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        const skip = (page - 1) * limit;

        // 构建查询条件
        const where: any = {
            userId: user.userId
        };

        if (categoryId) {
            where.categoryId = categoryId;
        }

        if (startDate || endDate) {
            where.date = {};
            if (startDate) {
                where.date.gte = new Date(startDate);
            }
            if (endDate) {
                where.date.lte = new Date(endDate);
            }
        }

        // 获取支出记录
        const [expenses, total] = await Promise.all([
            prisma.expense.findMany({
                where,
                include: {
                    category: true
                },
                orderBy: {
                    date: 'desc'
                },
                skip,
                take: limit
            }),
            prisma.expense.count({ where })
        ]);

        return NextResponse.json(
            ResponseUtil.success({
                expenses,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            })
        );

    } catch (error) {
        console.error('获取支出记录失败:', error);
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
}