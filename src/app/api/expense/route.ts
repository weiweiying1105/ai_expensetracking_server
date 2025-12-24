import { verifyToken } from "@/utils/jwt"
import { ResponseCode, ResponseUtil, createJsonResponse } from "@/utils/response";
import { isCategoryInDatabase, quickAnalyzeExpense } from "@/utils/expense-patterns";
import { NextRequest } from "next/server";
import { OpenAI } from "openai";
import prisma from "@/lib/prisma";
import { TransactionType } from "@/generated/prisma";
import { createExpenseCategory, getExpenseAllCategory } from "../categories";
import { sanitizeEnv, logEnvStatus } from "@/utils/env";

// 强制动态渲染，因为需要访问请求头
export const dynamic = 'force-dynamic';

// 读取并清洗 DeepSeek API Key，避免环境变量包含多余引号导致 401
const rawDeepSeekKey = process.env.DEEPSEEK_API_KEY;
logEnvStatus('DEEPSEEK_API_KEY', rawDeepSeekKey);
const DEEPSEEK_API_KEY = sanitizeEnv(rawDeepSeekKey);

const client = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
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

原始文本:"${rawText}"

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
        return createJsonResponse(
            ResponseUtil.error('未授权访问'),
            { status: 401 }
        );
    }
    console.log('User Info:', user);
    console.log('User ID:', user.userId);
    console.log('User ID Type:', typeof user.userId);
    const { rawText, date } = await request.json();

    // 验证用户是否实际存在于数据库中
    console.log('Finding user with ID:', user.userId);
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser) {
        console.error('User not found with ID:', user.userId);
        return createJsonResponse(
            ResponseUtil.error('用户不存在'),
            { status: 404 } // 使用有效的HTTP状态码
        );
    }
    console.log('Found user:', dbUser.id);

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
        // 确保快速分析的结果也有有效的金额
        if (quick.data.amount !== null && quick.data.amount !== undefined && !isNaN(quick.data.amount)) {
            items = [quick.data];
        } else {
            // 快速分析结果金额无效，回退到AI分析
            console.log('快速分析结果金额无效，回退到AI分析');
        }
    } else {
        const aiAnalysis = await analyzeExpenseWithAI(rawText, expenseCategory);
        console.log('AI分析结果:', aiAnalysis);
        if (!aiAnalysis.success || !Array.isArray(aiAnalysis.data)) {
            return createJsonResponse(
                ResponseUtil.error('未能解析记账内容'),
                { status: 400 }
            );
        }

        // 过滤掉amount为null的记录，因为amount是必填字段
        items = aiAnalysis.data.filter(item => item.amount !== null && item.amount !== undefined);

        if (items.length === 0) {
            return createJsonResponse(
                ResponseUtil.error('未能从文本中提取有效金额'),
                { status: 400 }
            );
        }
    }
    console.log('items:', items);
    // 2) 批量创建（可事务），减少往返次数；并附加原始文本
    const ops = items.map((item: any) => {
        const isIncome = item.type === 'income';
        const catId = item.categoryId;
        const catName = item.categoriesText;
        const categoryPromise = (async () => {
            if (catId) return catId;
            if (!catName) return null;
            const catType = isIncome ? TransactionType.INCOME : TransactionType.EXPENSE;
            // 通过现有工具创建/获取分类
            const category = await createExpenseCategory(catName, catType);
            // 更新缓存，确保后续分析能立即命中新分类
            const current = getCacheCategory(catType);
            if (current) setCacheCategory(catType, [...current, category]);
            return category.id;
        })();


        return categoryPromise.then((finalCategoryId) => {
            // 确保日期是有效的ISO-8601格式
            let isoDate: string;
            if (date) {
                // 检查日期格式是否为YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                    // 对于YYYY-MM-DD格式，添加时间部分转换为ISO格式
                    isoDate = new Date(date + 'T00:00:00.000Z').toISOString();
                } else {
                    // 尝试直接转换其他格式
                    const dateObj = new Date(date);
                    if (!isNaN(dateObj.getTime())) {
                        isoDate = dateObj.toISOString();
                    } else {
                        // 无效日期，使用当前时间
                        isoDate = new Date().toISOString();
                    }
                }
            } else {
                // 没有提供日期，使用当前时间
                isoDate = new Date().toISOString();
            }

            return prisma.expense.create({
                data: {
                    user: {
                        connect: { id: user.userId }
                    },
                    amount: parseFloat(((item.amount * 100) / 100).toFixed(2)),
                    description: item.description,
                    date: isoDate,
                    rawText: rawText || item.description || '',
                    category: finalCategoryId ? { connect: { id: finalCategoryId } } : undefined,
                }
            });
        });
    });
    try {
        const records = await Promise.all(ops);
        return createJsonResponse(
            ResponseUtil.success({
                message: '支出/收入分类和记录创建成功',
                // categories: categories,
                records: records,
            }),
            { status: 200 }
        );
    } catch (error) {
        console.error('批量创建支出/收入记录失败:', error);
        return createJsonResponse(
            ResponseUtil.error('批量创建支出/收入记录失败'),
            { status: 500 }
        );
    }


}

export async function GET(request: NextRequest) {
    try {
        const user = await verifyToken(request);
        if (!user) {
            return createJsonResponse(
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
            where.date = {} as { gte?: Date; lte?: Date };
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
                            color: true,
                        }
                    }
                },
                orderBy: {
                    date: 'desc'
                },
                skip,
                take: limit
            }),
            prisma.expense.count({ where })
        ]);

        return createJsonResponse(
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
        return createJsonResponse(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
}