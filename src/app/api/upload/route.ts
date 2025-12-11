

// 上传图片到CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@dc6wdjxld

// JWT相关导入已移除，因为此接口不需要验证token
import { ResponseCode, ResponseUtil } from '@/utils/response';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { NextResponse, NextRequest } from 'next/server';

// 强制动态渲染，因为需要处理文件上传
export const dynamic = 'force-dynamic';

// 配置 Cloudinary
cloudinary.config({
    cloud_name: 'dc6wdjxld',
    api_key: '925588468673723',
    api_secret: 'gBuAbiJsd-4jaWEDqpCkbwNMogk'
});

/**
 * 上传小程序头像临时地址到 Cloudinary
 * 路径：/api/upload
 * @param request 包含临时头像地址的请求
 * @returns 永久图片地址
 */
const postHandler = async (body: { filePath: string }): Promise<Response> => {
    try {
        const { filePath } = body;
        const formData = new FormData();
        formData.append('file', filePath);
        formData.append('upload_preset', 'inventory');
        const _response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.config().cloud_name}/image/upload`, {
            method: 'POST',
            body: formData
        });
        console.log('HHHHHHHH', _response);

        if (!filePath) {
            return NextResponse.json(
                ResponseUtil.error('请提供头像临时地址'),
                { status: 400 }
            );
        }

        // 检查是否为小程序本地临时路径
        if (filePath.startsWith('http://tmp/') || filePath.startsWith('https://tmp/')) {
            return NextResponse.json(
                ResponseUtil.error('不支持小程序本地临时路径，请使用网络地址或上传文件流'),
                { status: 400 }
            );
        }

        // 验证是否为有效的网络URL格式
        try {
            const url = new URL(filePath);
            if (!['http:', 'https:'].includes(url.protocol)) {
                throw new Error('不支持的协议');
            }
        } catch {
            return NextResponse.json(
                ResponseUtil.error('请提供有效的网络地址（http或https）'),
                { status: 400 }
            );
        }

        // 从网络地址下载头像文件
        const response = await axios.get(filePath, {
            responseType: 'arraybuffer',
            timeout: 10000 // 10秒超时
        });

        const buffer = Buffer.from(response.data);

        // 验证文件大小（限制5MB）
        if (buffer.length > 5 * 1024 * 1024) {
            return NextResponse.json(
                ResponseUtil.error('头像文件大小不能超过5MB'),
                { status: 400 }
            );
        }

        // 上传到 Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    resource_type: 'image',
                    folder: 'avatars', // 专门的头像文件夹
                    upload_preset: 'ml_default', // 使用默认的upload preset
                    transformation: [
                        { width: 200, height: 200, crop: 'fill' }, // 统一头像尺寸
                        { quality: 'auto' } // 自动优化质量
                    ]
                },
                (error: any, result: any) => {
                    if (error) {
                        console.error('Cloudinary上传错误:', error);
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            ).end(buffer);
        });

        const result = uploadResult as any;
        const avatarInfo = {
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            format: result.format,
            size: result.bytes
        };

        return NextResponse.json(
            ResponseUtil.success(avatarInfo, '头像上传成功')
        );

    } catch (error: any) {
        console.error('头像上传错误:', error);

        // 根据错误类型返回不同的错误信息
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return NextResponse.json(
                ResponseUtil.error('无法访问临时地址，请重新获取头像'),
                { status: 400 }
            );
        }

        if (error.code === 'ECONNABORTED') {
            return NextResponse.json(
                ResponseUtil.error('下载超时，请重试'),
                { status: 408 }
            );
        }

        return NextResponse.json(
            ResponseUtil.error('头像上传失败，请重试'),
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    console.log('上传头像');

    // 添加调试日志
    try {
        const body = await request.json();
        console.log('接收到的参数:', body);

        return await postHandler(body);
    } catch (error) {
        console.error('解析请求参数失败:', error);
        return NextResponse.json(
            ResponseUtil.error('请求参数格式错误'),
            { status: 400 }
        );
    }
}