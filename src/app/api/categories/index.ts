import prisma from "@/lib/prisma";

// 查询所有支出分类
export function getExpenseAllCategory() {
    return prisma.category.findMany({
        where: {
            type: 'EXPENSE'
        }
    })
}

// 创建支出分类

export function createExpenseCategory(name: string, type: string = 'EXPENSE') {
    return prisma.category.create({
        data: {
            name,
            type,

        }
    })
}