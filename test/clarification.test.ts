import { runDeepResearcher } from '../chatbi_agent';

async function testClarificationFlow() {
  console.log('=== 测试反问功能 ===');
  
  try {
    // 测试一个可能引起反问的模糊问题
    const ambiguousInput = "帮我分析一下业务情况";
    console.log('\n用户输入:', ambiguousInput);
    
    const result = await runDeepResearcher(ambiguousInput);
    
    console.log('\n=== 执行结果 ===');
    console.log('需要澄清:', result.needs_clarification);
    console.log('澄清问题:', result.askBackPrompt);
    console.log('计划:', result.plan);
    console.log('最后消息:', result.messages[result.messages.length - 1]?.content);
    
    if (result.needs_clarification) {
      console.log('\n✅ 成功检测到反问情况');
      console.log('反问的问题:');
      result.askBackPrompt.forEach((q, i) => {
        console.log(`${i + 1}. ${q}`);
      });
    } else {
      console.log('\n❌ 未检测到反问，直接生成了计划');
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
testClarificationFlow();