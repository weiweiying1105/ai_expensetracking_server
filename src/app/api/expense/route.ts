import { verifyToken } from "@/utils/jwt"
import { ResponseUtil } from "@/utils/response";
import { quickAnalyzeExpense } from "@/utils/expense-patterns";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { OpenAI } from "openai";
import prisma from "@/lib/prisma";

const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
});

// 分析支出数量（单项还是多项）
function analyzeExpenseCount(rawText: string) {
    const text = rawText.trim();

    // 统计金额数量
    const amounts = text.match(/\d+(?:\.\d+)?\s*[元块钱]?/g) || [];

    // 统计分隔符
    const separators = text.match(/[，,、；;]/g) || [];

    // 统计关键词
    const keywords = text.match(/(早餐|午餐|午饭|晚餐|晚饭|夜宵|打车|滴滴|出租车|地铁|公交|咖啡|奶茶|买菜|停车|购物|超市)/g) || [];

    return {
        isMultiple: amounts.length > 1 || separators.length > 0 || keywords.length > 1,
        amountCount: amounts.length,
        separatorCount: separators.length,
        keywordCount: keywords.length
    };
}

// 分析多项支出
async function analyzeMultipleExpenses(rawText: string, availableCategories: any[]) {
    try {
        const categoriesText = availableCategories.map(c => `${c.id}: ${c.name} (${c.icon})`).join('\n');
        const prompt = `
请分析以下支出描述，如果包含多个支出项目，请拆分为多个独立的支出：

原始文本："${rawText}"

可选分类：
${categoriesText}

请返回JSON格式的分析结果：
{
  "expenses": [
    {
      "amount": 30,
      "description": "午饭",
      "categoryId": "推荐的分类ID",
      "confidence": 0.95,
      "tags": ["午餐", "餐饮"],
      "merchant": "商家名称（可选）",
      "reasoning": "识别理由",
      "isExpense": true
    },
    {
      "amount": 15,
      "description": "打车",
      "categoryId": "推荐的分类ID",
      "confidence": 0.9,
      "tags": ["交通", "打车"],
      "merchant": "滴滴（可选）",
      "reasoning": "识别理由",
      "isExpense": true
    }
  ]
}

注意：
- 如果只有一个支出，expenses数组只包含一个对象
- amount必须是数字类型，如果无法识别金额则设为null
- 如果文本不是支出描述，设置isExpense为false
- categoryId必须从提供的分类列表中选择
`;

        const response = await client.chat.completions.create({
            model: "deepseek-chat",
            messages: [
                {
                    role: "system",
                    content: "你是一个专业的财务分析助手，擅长从自然语言中提取和拆分多项支出信息。请严格按照JSON格式返回结果，确保金额为数字类型。"
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.2,
            max_tokens: 1000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('AI响应为空');
        }

        // 提取JSON内容
        let jsonContent = content.trim();
        if (jsonContent.startsWith('```json')) {
            jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonContent.startsWith('```')) {
            jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const aiResult = JSON.parse(jsonContent);
        return {
            success: true,
            data: aiResult,
            usage: response.usage,
            isQuickMatch: false
        };
    } catch (error: any) {
        console.error('多项支出分析失败:', error);
        return {
            success: false,
            error: error.message,
            isQuickMatch: false
        };
    }
}



// AI分析支出信息
async function analyzeExpenseWithAI(rawText: string, availableCategories: any[]) {
    try {
        const categoriesText = availableCategories.map(c => `${c.id}: ${c.name} (${c.icon})`).join('\n');
        const prompt = `
请分析以下支出描述，提取金额、描述等信息，并推荐分类：

原始文本："${rawText}"

可选分类：
${categoriesText}

请返回JSON格式的分析结果：
{
  "amount": 25.5,
  "description": "星巴克咖啡",
  "categoryId": "推荐的分类ID",
  "confidence": 0.95,
  "tags": ["咖啡", "饮品"],
  "merchant": "星巴克",
  "reasoning": "从文本中识别出在星巴克消费25.5元买咖啡",
  "isExpense": true
}

注意：
- amount必须是数字类型，如果无法识别金额则设为null
- 如果文本不是支出描述，设置isExpense为false
- categoryId必须从提供的分类列表中选择
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
            temperature: 0.2, // 降低温度提高准确性
            max_tokens: 600
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


// 最主要的接口，接收到内容，分析后返回结果
export async function POST(request: NextRequest) {
    try {
        // 性能监控：记录开始时间
        const startTime = performance.now();
        const performanceData: { [key: string]: number } = {};

        const user = await verifyToken(request);
        if (!user) {
            return NextResponse.json(
                ResponseUtil.error('未授权访问'),
                { status: 401 }
            );
        }

        const body = await request.json();
        const { rawText, categoryId, date } = body;

        // 验证输入
        if (!rawText || rawText.trim().length === 0) {
            return NextResponse.json(
                ResponseUtil.error('原始文本不能为空'),
                { status: 400 }
            );
        }

        if (rawText.length > 500) {
            return NextResponse.json(
                ResponseUtil.error('文本长度不能超过500个字符'),
                { status: 400 }
            );
        }

        // 获取可用分类
        const categoriesStartTime = performance.now();
        const availableCategories = await prisma.category.findMany({
            where: {
                type: 'EXPENSE'
            },
            select: {
                id: true,      // 只返回需要的字段
                name: true,    // 分类名称
                icon: true     // 分类图标
            }
        });
        performanceData['database_categories'] = performance.now() - categoriesStartTime;
        console.log('支出分类', availableCategories);

        // 检查是否为多项支出
        const expenseCount = analyzeExpenseCount(rawText);

        if (expenseCount.isMultiple) {
            // 处理多项支出
            const aiMultiStartTime = performance.now();
            const multiAnalysis = await analyzeMultipleExpenses(rawText, availableCategories);
            performanceData['ai_multiple_analysis'] = performance.now() - aiMultiStartTime;

            if (!multiAnalysis.success || !multiAnalysis.data?.expenses) {
                return NextResponse.json(
                    ResponseUtil.error('多项支出分析失败，请稍后重试'),
                    { status: 500 }
                );
            }

            // 创建多个支出记录
            const createdExpenses = [];
            const dbCreateTotalStartTime = performance.now();

            for (const expenseData of multiAnalysis.data.expenses) {
                
                const { amount, description, categoryId: analyzedCategoryId, confidence, tags, merchant, reasoning, isExpense } = expenseData;

                // 验证是否为支出
                if (!isExpense) {
                    continue; // 跳过非支出项
                }

                // 验证金额
                if (!amount || typeof amount !== 'number' || amount <= 0) {
                    continue; // 跳过无效金额的项
                }

                // 使用用户指定的分类或分析推荐的分类
                let finalCategoryId = categoryId || analyzedCategoryId;
                console.log('finalCategoryId', finalCategoryId);

                // 验证分类是否存在，如果不存在则创建新分类
                if (finalCategoryId) {
                    const categoryExists = availableCategories.some((c: any) => c.id === finalCategoryId);
                    if (!categoryExists) {
                        // 如果是AI分析推荐的分类ID不存在，尝试根据描述创建新分类
                        if (!categoryId && analyzedCategoryId) {
                            try {
                                // 根据AI分析的描述和标签推断分类名称
                                let categoryName = '其他';
                                let categoryIcon = '📝';

                                // 根据标签或描述推断分类
                                if (tags && tags.length > 0) {
                                    const tag = tags[0].toLowerCase();
                                    if (tag.includes('餐') || tag.includes('食') || tag.includes('饮')) {
                                        categoryName = '餐饮';
                                        categoryIcon = '🍽️';
                                    } else if (tag.includes('交通') || tag.includes('车') || tag.includes('地铁')) {
                                        categoryName = '交通';
                                        categoryIcon = '🚗';
                                    } else if (tag.includes('购物') || tag.includes('买') || tag.includes('超市')) {
                                        categoryName = '购物';
                                        categoryIcon = '🛒';
                                    } else if (tag.includes('娱乐') || tag.includes('电影') || tag.includes('游戏')) {
                                        categoryName = '娱乐';
                                        categoryIcon = '🎮';
                                    } else if (tag.includes('医疗') || tag.includes('药') || tag.includes('医院')) {
                                        categoryName = '医疗';
                                        categoryIcon = '🏥';
                                    } else {
                                        categoryName = tags[0];
                                    }
                                }

                                // 检查是否已存在同名分类
                                const existingCategory = availableCategories.find(c => c.name === categoryName);
                                if (existingCategory) {
                                    finalCategoryId = existingCategory.id;
                                } else {
                                    // 创建新分类
                                    const newCategory = await prisma.category.create({
                                        data: {
                                            name: categoryName,
                                            icon: categoryIcon,
                                            type: 'EXPENSE',
                                            sortOrder: availableCategories.length + 1
                                        }
                                    });
                                    finalCategoryId = newCategory.id;
                                    availableCategories.push(newCategory); // 添加到可用分类列表
                                    console.log(`创建新分类: ${categoryName} (${newCategory.id})`);
                                }
                            } catch (error) {
                                console.error('创建新分类失败:', error);
                                continue; // 如果创建失败，跳过这个项目
                            }
                        } else {
                            continue; // 跳过无效分类的项
                        }
                    }
                }

                try {
                    const expense = await prisma.expense.create({
                        data: {
                            amount,
                            description: description || rawText,
                            categoryId: finalCategoryId,
                            userId: user.userId,
                            rawText: rawText,
                            date: new Date(),
                            aiMerchant: merchant || null,
                            aiConfidence: confidence || 0.5,
                            aiReasoning: reasoning || '多项支出分析',
                            createdAt: new Date()
                        },
                        include: {
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                    icon: true,
                                    type: true,
                                    sortOrder: true
                                }
                            }
                        }
                    });

                    createdExpenses.push(expense);
                } catch (error) {
                    console.error('创建支出记录失败:', error);
                    // 继续处理其他项目
                }
            }

            // 记录多项支出创建总时间
            performanceData['database_create_multiple'] = performance.now() - dbCreateTotalStartTime;

            if (createdExpenses.length === 0) {
                return NextResponse.json(
                    ResponseUtil.error('没有成功创建任何支出记录'),
                    { status: 400 }
                );
            }

            // 记录总执行时间
            performanceData['total'] = performance.now() - startTime;
            console.log('性能监控数据(多项支出):', JSON.stringify(performanceData, null, 2));

            return NextResponse.json(
                ResponseUtil.success({
                    expenses: createdExpenses,
                    count: createdExpenses.length,
                    totalAmount: createdExpenses.reduce((sum, exp) => sum + Number(exp.amount), 0),
                    analysis: {
                        isMultiple: true,
                        originalText: rawText,
                        usage: multiAnalysis.usage
                    },
                    performance: performanceData
                })
            );
        }

        // 处理单项支出
        const quickMatchStartTime = performance.now();
        let analysis = quickAnalyzeExpense(rawText, availableCategories);
        performanceData['quick_match'] = performance.now() - quickMatchStartTime;

        // 如果快速匹配失败，使用AI分析
        if (!analysis.success) {
            console.log('快速匹配失败，使用AI分析');
            const aiSingleStartTime = performance.now();
            analysis = await analyzeExpenseWithAI(rawText, availableCategories);
            performanceData['ai_single_analysis'] = performance.now() - aiSingleStartTime;

            if (!analysis.success) {
                return NextResponse.json(
                    ResponseUtil.error('分析失败，请稍后重试'),
                    { status: 500 }
                );
            }
        } else {
            console.log('快速匹配成功:', analysis.data?.description);
        }

        if (!analysis.data) {
            return NextResponse.json(
                ResponseUtil.error('分析结果为空'),
                { status: 500 }
            );
        }

        const { amount, description, categoryId: analyzedCategoryId, confidence, tags, merchant, reasoning, isExpense } = analysis.data;

        // 验证是否为支出
        if (!isExpense) {
            return NextResponse.json(
                ResponseUtil.error('输入的文本不像是支出描述'),
                { status: 400 }
            );
        }

        // 验证金额
        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return NextResponse.json(
                ResponseUtil.error('无法识别有效的支出金额'),
                { status: 400 }
            );
        }

        // 使用用户指定的分类或分析推荐的分类（来自正则匹配或AI）
        let finalCategoryId = categoryId || analyzedCategoryId;
        // 初始化分类名称和图标变量
        let categoryName = '其他';
        let categoryIcon = '📝';

        // 验证分类是否存在，如果不存在则创建新分类
        if (finalCategoryId) {
            const categoryExists = availableCategories.some((c: any) => c.id === finalCategoryId);
            if (!categoryExists) {
                // 如果是AI分析推荐的分类ID不存在，尝试根据描述创建新分类
                if (!categoryId && analyzedCategoryId) {
                    try {
                        // 根据AI分析的描述和标签推断分类名称

                        // 根据标签或描述推断分类
                        if (tags && tags.length > 0) {
                            const tag = tags[0].toLowerCase();
                            if (tag.includes('餐') || tag.includes('食') || tag.includes('饮')|| tag.includes('饭')) {
                                categoryName = '餐饮';
                                categoryIcon = '🍽️';
                            } else if (tag.includes('交通') || tag.includes('车') || tag.includes('地铁')|| tag.includes('公交')) {
                                categoryName = '交通';
                                categoryIcon = '🚗';
                            } else if (tag.includes('购物') || tag.includes('买') || tag.includes('超市')) {
                                categoryName = '购物';
                                categoryIcon = '🛒';
                            } else if (tag.includes('娱乐') || tag.includes('电影') || tag.includes('游戏')) {
                                categoryName = '娱乐';
                                categoryIcon = '🎮';
                            } else if (tag.includes('医疗') || tag.includes('药') || tag.includes('医院')) {
                                categoryName = '医疗';
                                categoryIcon = '🏥';
                            } else {
                                categoryName = tags[0];
                            }
                        }

                        // 检查是否已存在同名分类
                        const existingCategory = availableCategories.find(c => c.name === categoryName);
                        if (existingCategory) {
                            finalCategoryId = existingCategory.id;
                        }
                    } catch (error) {
                        console.error('创建新分类失败:', error);
                        finalCategoryId = null; // 如果创建失败，设为null
                    }
                } else {
                    // 用户指定的分类ID不存在
                    return NextResponse.json(
                        ResponseUtil.error('指定的分类不存在'),
                        { status: 400 }
                    );
                }
            }
        }

        // 使用事务批量处理分类创建和支出创建
        const dbCreateStartTime = performance.now();
        const expense = await prisma.$transaction(async (prisma) => {
            let categoryId = finalCategoryId;
            
            // 如果需要创建新分类
            if (!categoryId && categoryName) {
                // 创建新分类
                const newCategory = await prisma.category.create({
                    data: {
                        name: categoryName,
                        icon: categoryIcon,
                        type: 'EXPENSE',
                        sortOrder: availableCategories.length + 1
                    }
                });
                categoryId = newCategory.id;
                console.log(`创建新分类: ${categoryName} (${newCategory.id})`);
            }
            
            // 创建支出记录
            return await prisma.expense.create({
                data: {
                    amount: amount,
                    description: description || rawText,
                    categoryId: categoryId,
                    date: date ? new Date(date) : new Date(),
                    userId: user.userId,
                    // AI分析相关字段
                    rawText: rawText,
                    aiConfidence: confidence,
                    aiTags: tags ? tags.join(',') : null,
                    aiMerchant: merchant,
                    aiReasoning: reasoning,
                    aiUsage: JSON.stringify((analysis as any).usage || null)
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            icon: true,
                            type: true,
                            sortOrder: true
                        }
                    }
                }
            });
        });

        performanceData['database_create_with_transaction'] = performance.now() - dbCreateStartTime;

        // 记录总执行时间
        performanceData['total'] = performance.now() - startTime;
        console.log('性能监控数据(单项支出):', JSON.stringify(performanceData, null, 2));

        return NextResponse.json(
            ResponseUtil.success({
                expense,
                aiAnalysis: {
                    confidence,
                    tags,
                    merchant,
                    reasoning
                },
                performance: performanceData
            }, '支出记录创建成功')
        );

    } catch (error) {
        console.error('创建支出记录失败:', error);
        return NextResponse.json(
            ResponseUtil.error('服务器内部错误'),
            { status: 500 }
        );
    }
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