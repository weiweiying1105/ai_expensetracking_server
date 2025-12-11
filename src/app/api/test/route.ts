import { NextResponse } from 'next/server'
import { ResponseUtil } from '../../../utils/response'

export async function GET() {
  try {
    // 简单的测试数据
    const testData = {
      message: '测试接口正常工作',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    }

    // 返回成功响应
    return NextResponse.json(
      ResponseUtil.success(testData, '测试接口调用成功')
    )
  } catch (error) {
    console.error('测试接口错误:', error)
    return NextResponse.json(
      ResponseUtil.error('服务器内部错误'),
      { status: 500 }
    )
  }
}
