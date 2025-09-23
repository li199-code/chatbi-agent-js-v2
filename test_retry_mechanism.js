// 简单的重试机制测试
// 由于这是ES模块项目，我们需要使用.js扩展名

import fs from "fs/promises";

// 模拟验证图片文件的函数
async function validateGeneratedImage(filePath) {
  try {
    // 检查文件是否存在
    const stats = await fs.stat(filePath);
    
    // 检查文件大小（空白图片通常很小，小于1KB可能有问题）
    if (stats.size < 1024) {
      console.warn(`[validateGeneratedImage] 图片文件过小: ${stats.size} bytes`);
      return false;
    }
    
    // 检查文件是否为PNG格式（简单检查文件头）
    const buffer = await fs.readFile(filePath);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    if (!buffer.subarray(0, 8).equals(pngSignature)) {
      console.warn(`[validateGeneratedImage] 文件不是有效的PNG格式`);
      return false;
    }
    
    console.log(`[validateGeneratedImage] 图片文件验证通过: ${filePath} (${stats.size} bytes)`);
    return true;
    
  } catch (error) {
    console.error(`[validateGeneratedImage] 验证图片文件时出错:`, error);
    return false;
  }
}

// 模拟重试机制测试
async function testRetryMechanism() {
  console.log("开始测试重试机制...");
  
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`第 ${attempt} 次尝试`);
    
    try {
      // 模拟可能失败的操作
      if (attempt < 3) {
        throw new Error(`第 ${attempt} 次尝试模拟失败`);
      }
      
      console.log(`第 ${attempt} 次尝试成功！`);
      return { success: true, attempt };
      
    } catch (error) {
      lastError = error;
      console.error(`第 ${attempt} 次尝试失败:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`所有 ${maxRetries} 次尝试均失败`);
        break;
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  return {
    success: false,
    error: `经过 ${maxRetries} 次重试后仍然失败: ${lastError.message}`,
  };
}

// 运行测试
async function runTests() {
  console.log("=== 重试机制测试 ===");
  const result = await testRetryMechanism();
  console.log("测试结果:", result);
  
  console.log("\n=== 图片验证函数测试 ===");
  // 测试不存在的文件
  const invalidResult = await validateGeneratedImage("nonexistent.png");
  console.log("不存在文件的验证结果:", invalidResult);
  
  console.log("\n测试完成！");
}

runTests().catch(console.error);