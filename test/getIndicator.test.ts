import { getChatbiAllIndicators } from "../tools";
import dotenv from "dotenv";

dotenv.config();

async function testGetIndicators() {
  try {
    console.log('开始获取ChatBI指标...');
    // getChatbiAllIndicators是一个tool对象，需要调用其invoke方法
    const result = await getChatbiAllIndicators.invoke({});
    console.log('获取结果:');
    console.log(result);
  } catch (error) {
    console.error('获取指标失败:', error);
  }
}

// 执行测试
testGetIndicators();
