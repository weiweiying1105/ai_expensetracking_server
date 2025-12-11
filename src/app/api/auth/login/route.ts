import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { ResponseUtil, createJsonResponse } from '../../../../utils/response'
import prisma from '../../../../lib/prisma'

// 强制动态渲染，因为需要访问请求头和JSON body
export const dynamic = 'force-dynamic';

// 微信小程序配置
const WECHAT_CONFIG = {
  appId: process.env.WECHAT_APP_ID!,
  appSecret: process.env.WECHAT_APP_SECRET!,
  grantType: 'authorization_code'
}

// JWT配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key'
const JWT_EXPIRES_IN = '7d' // token有效期7天

interface WechatLoginResponse {
  openid: string
  session_key: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

interface LoginRequest {
  code: string
  nickName?: string
  avatarUrl?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: LoginRequest = await request.json()
    const { code, nickName, avatarUrl } = body

    if (!code) {
      return createJsonResponse(
        ResponseUtil.error('缺少必要参数code'),
        { status: 400 }
      )
    }

    // 第一步：使用code向微信服务器获取openid和session_key
    const wechatUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_CONFIG.appId}&secret=${WECHAT_CONFIG.appSecret}&js_code=${code}&grant_type=${WECHAT_CONFIG.grantType}`
    
    const wechatResponse = await fetch(wechatUrl)
    const wechatData: WechatLoginResponse = await wechatResponse.json()

    // 检查微信API调用是否成功
    if (wechatData.errcode) {
      console.error('微信API错误:', wechatData.errmsg)
      return createJsonResponse(
        ResponseUtil.error(`微信登录失败: ${wechatData.errmsg}`),
        { status: 400 }
      )
    }

    const { openid, session_key } = wechatData

    // 第二步：根据openid查找或创建用户
    let user = await prisma.user.findUnique({
      where: { openId: openid }
    })

    if (!user) {
      // 新用户，创建用户记录
      user = await prisma.user.create({
        data: {
          openId: openid,
          nickName: nickName || '微信用户',
          avatarUrl: avatarUrl || '',
          currency: 'CNY',
          timezone: 'Asia/Shanghai'
        }
      })
    } else {
      // 老用户，更新用户信息和session_key
      user = await prisma.user.update({
        where: { openId: openid },
        data: {
          nickName: nickName || user.nickName,
          avatarUrl: avatarUrl || user.avatarUrl,
          lastLoginAt: new Date()
        }
      })
    }

    // 第三步：生成JWT token
    const tokenPayload = {
      userId: user.id,
      openId: user.openId,
      nickName: user.nickName,
      iat: Math.floor(Date.now() / 1000) // 签发时间
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    })

    // 第四步：返回登录成功信息
    const responseData = {
      token,
      userId: user.id,
      userInfo: {
        id: user.id,
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        currency: user.currency,
        timezone: user.timezone
      }
    }

    return createJsonResponse(
      ResponseUtil.success(responseData, '登录成功')
    )

  } catch (error) {
    console.error('登录处理错误:', error)
    return createJsonResponse(
      ResponseUtil.error('服务器内部错误'),
      { status: 500 }
    )
  }
}

// 支持GET请求用于测试
export async function GET() {
  return createJsonResponse(
    ResponseUtil.success(null, '微信登录接口正常运行')
  )
}

// 处理OPTIONS请求，支持CORS跨域
export async function OPTIONS() {
  return createJsonResponse(null, { status: 200 })
}