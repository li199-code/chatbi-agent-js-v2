import { planner } from '../chatbi_agent';
import { AgentState } from '../types';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config();

async function testPlanner() {
  try {
    console.log('=== 开始测试 planner 函数（已绑定工具）===');

    const imageData = fs.readFileSync(path.join(__dirname, '../agent分析思路_长图.jpg'));
    
    // 模拟 AgentState
    const mockState: typeof AgentState.State = {
      messages: [
        new HumanMessage({
          content: [
            {
              type: "text",
              text: "我是门店店长，想了解最近3个月的销售情况，包括各个渠道的表现如何？",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageData.toString("base64")}`,
              },
            },
          ],
        }),
      ],
      normalized_questions: []
    };
    
    // console.log('\n输入状态:');
    // console.log('- 用户消息:', mockState.messages[0].content);
    // console.log('- 当前标准化问题数量:', mockState.normalized_questions.length);
    
    console.log('\n正在调用 planner 函数...');
    console.log('注意: planner 现在已绑定 getChatbiAllIndicators 工具，可能会自动调用获取指标信息');
    
    // 调用 planner 函数
    const result = await planner(mockState);
    
    console.log('\n=== planner 函数执行完成 ===');
    
    // 检查返回结果
    if (result.messages && result.messages.length > 0) {
      console.log('\n✅ 返回消息:');
      result.messages.forEach((msg, index) => {
        console.log(`  消息 ${index + 1}:`, msg.content?.substring(0, 200) + (msg.content && msg.content.length > 200 ? '...' : ''));
      });
    } else {
      console.log('\n❌ 未返回任何消息');
    }
    
    if (result.normalized_questions && result.normalized_questions.length > 0) {
      console.log('\n✅ 标准化问题列表:');
      result.normalized_questions.forEach((question, index) => {
        console.log(`  ${index + 1}. ${question}`);
      });
      console.log(`\n总共生成了 ${result.normalized_questions.length} 个标准化问题`);
    } else {
      console.log('\n❌ 未生成任何标准化问题');
    }
    
    // 验证测试结果
    const hasMessages = result.messages && result.messages.length > 0;
    const hasQuestions = result.normalized_questions && result.normalized_questions.length > 0;
    
    if (hasMessages && hasQuestions) {
      console.log('\n🎉 测试通过！planner 函数成功生成了研究计划和标准化问题');
    } else {
      console.log('\n⚠️  测试部分通过，但可能存在问题:');
      if (!hasMessages) console.log('  - 缺少返回消息');
      if (!hasQuestions) console.log('  - 缺少标准化问题');
    }
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error('错误详情:', error.stack);
    
    // 提供调试建议
    console.log('\n🔧 调试建议:');
    console.log('1. 检查 DEEPSEEK_API_KEY 是否正确配置');
    console.log('2. 确认网络连接正常');
    console.log('3. 验证 getChatbiAllIndicators 工具是否正常工作');
    console.log('4. 检查模型是否支持工具调用功能');
  }
}

// 执行测试
console.log('启动 planner 测试...');
testPlanner().then(() => {
  console.log('\n测试执行完成');
}).catch((error) => {
  console.error('测试执行异常:', error);
});