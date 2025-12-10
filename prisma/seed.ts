import prisma from '@/lib/prisma'
async function main() {
  // 创建默认分类
  const defaultCategories = [
    // 支出分类
    { name: '餐饮', icon: '🍽️', color: '#FF6B6B', type: 'EXPENSE' },
    { name: '交通', icon: '🚗', color: '#4ECDC4', type: 'EXPENSE' },
    { name: '购物', icon: '🛍️', color: '#45B7D1', type: 'EXPENSE' },
    { name: '娱乐', icon: '🎮', color: '#96CEB4', type: 'EXPENSE' },
    { name: '医疗', icon: '🏥', color: '#FFEAA7', type: 'EXPENSE' },
    { name: '教育', icon: '📚', color: '#DDA0DD', type: 'EXPENSE' },
    { name: '住房', icon: '🏠', color: '#98D8C8', type: 'EXPENSE' },
    { name: '其他', icon: '📦', color: '#F7DC6F', type: 'EXPENSE' },

    // 收入分类
    { name: '工资', icon: '💰', color: '#58D68D', type: 'INCOME' },
    { name: '奖金', icon: '🎁', color: '#85C1E9', type: 'INCOME' },
    { name: '投资', icon: '📈', color: '#F8C471', type: 'INCOME' },
    { name: '兼职', icon: '💼', color: '#BB8FCE', type: 'INCOME' },
    { name: '其他', icon: '💎', color: '#82E0AA', type: 'INCOME' },
  ]

  for (const category of defaultCategories) {
    await prisma.category.upsert({
      where: {
        userId_name_type: {
          userId: undefined,
          name: category.name,
          type: category.type as any
        }
      },
      update: {},
      create: {
        ...category,
        isDefault: true,
        sortOrder: defaultCategories.indexOf(category),
        type: category.type as any,
      },
    })
  }

  console.log('✅ 默认分类创建完成')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })