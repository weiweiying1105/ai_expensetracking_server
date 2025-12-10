import { TransactionType } from '@/generated/prisma'
import prisma from '@/lib/prisma'

// 初始化分类数据
const categories = [
  // 支出分类
  {
    name: '餐饮美食',
    icon: '🍽️',
    color: '#FF6B6B',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 1
  },
  {
    name: '交通出行',
    icon: '🚗',
    color: '#4ECDC4',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 2
  },
  {
    name: '购物消费',
    icon: '🛍️',
    color: '#45B7D1',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 3
  },
  {
    name: '生活缴费',
    icon: '💡',
    color: '#F9CA24',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 4
  },
  {
    name: '医疗健康',
    icon: '🏥',
    color: '#6C5CE7',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 5
  },
  {
    name: '教育学习',
    icon: '📚',
    color: '#A29BFE',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 6
  },
  {
    name: '娱乐休闲',
    icon: '🎮',
    color: '#FD79A8',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 7
  },
  {
    name: '住房租金',
    icon: '🏠',
    color: '#00B894',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 8
  },
  {
    name: '服装美容',
    icon: '👗',
    color: '#E17055',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 9
  },
  {
    name: '数码电器',
    icon: '📱',
    color: '#636E72',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 10
  },
  {
    name: '旅游度假',
    icon: '✈️',
    color: '#00CEC9',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 11
  },
  {
    name: '人情往来',
    icon: '🎁',
    color: '#FDCB6E',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 12
  },
  {
    name: '金融保险',
    icon: '🏦',
    color: '#74B9FF',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 13
  },
  {
    name: '其他支出',
    icon: '💸',
    color: '#DDD',
    type: TransactionType.EXPENSE,
    isDefault: true,
    sortOrder: 99
  },

  // 收入分类
  {
    name: '工资收入',
    icon: '💰',
    color: '#00B894',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 1
  },
  {
    name: '兼职收入',
    icon: '💼',
    color: '#00CEC9',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 2
  },
  {
    name: '投资理财',
    icon: '📈',
    color: '#6C5CE7',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 3
  },
  {
    name: '奖金补贴',
    icon: '🎉',
    color: '#FDCB6E',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 4
  },
  {
    name: '礼金收入',
    icon: '🧧',
    color: '#E17055',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 5
  },
  {
    name: '退款返现',
    icon: '💳',
    color: '#74B9FF',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 6
  },
  {
    name: '租金收入',
    icon: '🏘️',
    color: '#A29BFE',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 7
  },
  {
    name: '其他收入',
    icon: '💵',
    color: '#DDD',
    type: TransactionType.INCOME,
    isDefault: true,
    sortOrder: 99
  }
]

async function initCategories() {
  console.log('开始初始化分类数据...')

  try {
    // 清空现有的默认分类
    await prisma.category.deleteMany({
      where: {
        isDefault: true,
        userId: null
      }
    })

    console.log('已清空现有默认分类')

    // 批量创建新分类
    const result = await prisma.category.createMany({
      data: categories.map(category => ({
        ...category,
        userId: null // 系统默认分类
      }))
    })

    console.log(`成功创建 ${result.count} 个默认分类`)

    // 查询并显示创建的分类
    const createdCategories = await prisma.category.findMany({
      where: {
        isDefault: true,
        userId: null
      },
      orderBy: [
        { type: 'asc' },
        { sortOrder: 'asc' }
      ]
    })

    console.log('\n创建的分类列表:')
    console.log('支出分类:')
    createdCategories
      .filter((c: any) => c.type === TransactionType.EXPENSE)
      .forEach((c: any) => console.log(`  ${c.icon} ${c.name}`))

    console.log('\n收入分类:')
    createdCategories
      .filter((c: any) => c.type === TransactionType.INCOME)
      .forEach((c: any) => console.log(`  ${c.icon} ${c.name}`))

    console.log('\n分类初始化完成！')

  } catch (error) {
    console.error('初始化分类失败:', error)
  } finally {
    await prisma.$disconnect()
  }
}

// 执行初始化
if (require.main === module) {
  initCategories()
}

module.exports = { initCategories }