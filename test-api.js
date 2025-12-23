const axios = require('axios');

// 测试API响应时间
async function testApiResponseTime() {
    const testData = {
        rawText: "午饭22",
        date: "2025-12-22"
    };

    try {
        // 先获取登录token
        const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
            username: 'test@example.com',
            password: 'testpassword'
        });

        const token = loginResponse.data.data.token;
        console.log('登录成功，获取到token');

        // 测试API响应时间
        const startTime = Date.now();
        const response = await axios.post('http://localhost:3000/api/expense', testData, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        console.log(`API响应时间: ${responseTime}ms`);
        console.log('响应数据:', response.data);

        return responseTime;
    } catch (error) {
        console.error('测试失败:', error.message);
        if (error.response) {
            console.error('错误响应:', error.response.data);
        }
        return -1;
    }
}

// 运行测试
testApiResponseTime().then(time => {
    if (time > 0) {
        console.log(`\n优化后API响应时间: ${time}ms`);
        if (time < 2000) {
            console.log('✓ 响应时间优化成功！');
        } else {
            console.log('⚠ 响应时间仍有待优化');
        }
    } else {
        console.log('测试失败');
    }
});
