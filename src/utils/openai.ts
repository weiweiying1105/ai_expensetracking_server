import { OpenAI } from "openai";

// 定义分类类型接口
interface Category {
    id: string;
    name: string;
}

// 配置OpenAI客户端
const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // OpenAI API默认URL，不需要额外配置
});

// AI分析支出信息（使用OpenAI）
export async function analyzeExpenseWithAI(rawText: string, availableCategories: Category[]) {
    try {
        // 仅传递精简的分类信息，减少token占用
        const categoriesText = availableCategories.map((c: Category) => `${c.id}: ${c.name}`).join('\n');
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
            model: "gpt-3.5-turbo", // 可以根据需要调整为gpt-4等其他模型
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
        console.log('OpenAI响应:', response.choices[0]?.message?.content);

        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('OpenAI响应为空');
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
    } catch (error: unknown) {
        console.error('OpenAI分析失败:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误',
            isQuickMatch: false
        };
    }
}