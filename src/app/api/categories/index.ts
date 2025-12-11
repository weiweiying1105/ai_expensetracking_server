import prisma from "@/lib/prisma";
import { TransactionType } from "@/generated/prisma";

// 查询所有支出分类
export function getExpenseAllCategory() {
    return prisma.category.findMany({
        where: {
            type: TransactionType.EXPENSE
        }
    })
}

// 创建支出分类
export function createExpenseCategory(name: string, type: TransactionType = TransactionType.EXPENSE) {
    return prisma.category.create({
        data: {
            name,
            type
        }
    })
}