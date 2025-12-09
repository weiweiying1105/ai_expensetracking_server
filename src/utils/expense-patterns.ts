// 支出匹配模式定义
export interface ExpensePattern {
    regex: RegExp;
    category: string;
    getResult: (match: RegExpMatchArray) => {
        amount: number;
        description: string;
        tags: string[];
        confidence: number;
    };
}

// 常见支出模式
export const expensePatterns: ExpensePattern[] = [
    // 模式1: "午饭30元" "晚餐50" "早餐15块"
    {
        regex: /^(早餐|午餐|午饭|晚餐|晚饭|夜宵|早饭|早饭钱|午餐费|晚餐费)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '餐饮',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '餐饮'],
            confidence: 0.95
        })
    },
    // 模式2: "打车15元" "滴滴20" "出租车30" "共享单车5元"
    {
        regex: /^(打车|滴滴|出租车|网约车|地铁|公交|交通|共享单车|单车|摩拜|哈啰|青桔|美团单车|ofo|地铁票|公交车票|车票|车票钱)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '交通',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1].includes('单车') || ['摩拜', '哈啰', '青桔', '美团单车', 'ofo'].includes(match[1]) ? '共享单车' : match[1],
            tags: [match[1].includes('单车') || ['摩拜', '哈啰', '青桔', '美团单车', 'ofo'].includes(match[1]) ? '共享单车' : match[1], '交通'],
            confidence: 0.9
        })
    },
    // 模式3: "咖啡25" "奶茶18" "星巴克35"
    {
        regex: /^(咖啡|奶茶|饮料|可乐|果汁|星巴克|瑞幸|茶|奶茶店|咖啡店|饮品|汽水|雪碧|芬达|王老吉|冰红茶)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '餐饮',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '饮品'],
            confidence: 0.9
        })
    },
    // 模式4: "超市购物100" "买菜50" "水果30"
    {
        regex: /^(超市|买菜|水果|蔬菜|购物|日用品|生活用品|食品|零食|生鲜|杂货|便利店|小卖部)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '购物',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '生活用品'],
            confidence: 0.85
        })
    },
    // 模式5: "加油200" "油费150"
    {
        regex: /^(加油|油费|汽油|柴油|中石化|中石油|加油站|油钱)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '交通',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: '加油',
            tags: ['加油', '汽车'],
            confidence: 0.95
        })
    },
    // 模式6: "电影票45" "看电影60"
    {
        regex: /^(电影|看电影|电影票|娱乐|电影院|观影|电影钱|电影票钱)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '娱乐',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: '电影',
            tags: ['电影', '娱乐'],
            confidence: 0.9
        })
    },
    // 模式7: "彩票10元" "买彩票20" "福利彩票50"
    {
        regex: /^(彩票|买彩票|福利彩票|体育彩票|刮刮乐|双色球|大乐透|彩票钱)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '娱乐',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: '彩票',
            tags: ['彩票', '娱乐'],
            confidence: 0.95
        })
    },
    // 模式8: "水电费100" "电费50" "水费30"
    {
        regex: /^(水电费|电费|水费|燃气费|煤气费|水电煤气费|物业费|房租|租金)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '生活缴费',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '生活缴费'],
            confidence: 0.95
        })
    },
    // 模式9: "医疗费100" "买药50" "看病300"
    {
        regex: /^(医疗费|买药|看病|医院|挂号|药费|医疗|体检|检查费)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '医疗',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '医疗'],
            confidence: 0.95
        })
    },
    // 模式10: "学费1000" "书本费50" "培训费300"
    {
        regex: /^(学费|书本费|培训费|教育费|学习费|课程费|辅导费)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '教育',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '教育'],
            confidence: 0.95
        })
    },
    // 模式11: "电话费50" "手机费30" "网费100"
    {
        regex: /^(电话费|手机费|网费|宽带费|通讯费|话费)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '通讯',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '通讯'],
            confidence: 0.95
        })
    },
    // 模式12: "衣服100" "鞋子50" "裤子30"
    {
        regex: /^(衣服|鞋子|裤子|裙子|外套|衬衫|T恤|服装|服饰|衣帽)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '购物',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '购物'],
            confidence: 0.95
        })
    },
    // 模式13: "健身50" "健身房100" "瑜伽30"
    {
        regex: /^(健身|健身房|瑜伽|运动|锻炼|健身卡|运动器材)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '运动',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '运动'],
            confidence: 0.95
        })
    },
    // 模式14: "礼物50" "红包100" "礼金200"
    {
        regex: /^(礼物|红包|礼金|压岁钱|份子钱|人情)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '人情往来',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '人情往来'],
            confidence: 0.95
        })
    },
    // 模式15: "维修费50" "保养100" "修理200"
    {
        regex: /^(维修费|保养|修理|维修|维护|检修)\s*(\d+(?:\.\d+)?)\s*[元块钱]?$/,
        category: '其他',
        getResult: (match: RegExpMatchArray) => ({
            amount: parseFloat(match[2]),
            description: match[1],
            tags: [match[1], '其他'],
            confidence: 0.95
        })
    }
];

// 定义分类接口
interface Category {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    name: string;
    icon: string | null;
    color: string | null;
    type: string;
    isDefault: boolean;
    sortOrder: number;
    userId: string | null;
}
// 判断分类在不在数据库中的分类中
export function isCategoryInDatabase(category: string, availableCategories: Category[]) {
    return availableCategories.some((availableCategory) => availableCategory.name === category);
}
// 快速分析支出的工具函数
export function quickAnalyzeExpense(rawText: string, availableCategories: Category[]) {
    const text = rawText.trim();

    // 尝试匹配模式
    for (const pattern of expensePatterns) {
        const match = text.match(pattern.regex);
        if (match) {
            const result = pattern.getResult(match);

            // 查找对应的分类ID
            const category = availableCategories.find(c =>
                c.name.includes(pattern.category) ||
                c.name === pattern.category
            );

            return {
                success: true,
                data: {
                    ...result,
                    categoryId: category?.id || null,
                    merchant: null,
                    reasoning: `通过正则匹配识别为${pattern.category}支出`,
                    isExpense: true,
                    categoryName: pattern.category
                },
                isQuickMatch: true
            };
        }
    }

    return { success: false, isQuickMatch: false };
}