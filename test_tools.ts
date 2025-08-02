import * as dotenv from "dotenv";
dotenv.config();

import { chatbiAskTool, chatbiAnalyzeTool, saveFile } from "./tools";

// 测试 chatbiAskTool
async function testChatbiAskTool() {
  console.log("\n=== 测试 chatbiAskTool ===");
  
  try {
    const result = await chatbiAskTool.invoke({
      query: "查询最近一个月的销售数据"
    });
    
    console.log("查询结果:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("chatbiAskTool 调用失败:", error);
  }
}

// 测试 chatbiAnalyzeTool
async function testChatbiAnalyzeTool() {
  console.log("\n=== 测试 chatbiAnalyzeTool ===");
  
  try {
    const result = await chatbiAnalyzeTool.invoke({
      query: "分析销售额下降的原因"
    });
    
    console.log("分析结果:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("chatbiAnalyzeTool 调用失败:", error);
  }
}

// 测试 saveFile
async function testSaveFile() {
  console.log("\n=== 测试 saveFile ===");
  
  try {
    const result = await saveFile.invoke({
      fileName: "test_report.md",
      content: "# 测试报告\n\n这是一个测试报告文件。\n\n## 数据分析\n\n- 项目1: 完成\n- 项目2: 进行中\n"
    });
    
    console.log("保存结果:", result);
  } catch (error) {
    console.error("saveFile 调用失败:", error);
  }
}

// 主函数
async function main() {
  console.log("🚀 开始测试工具函数...");
  
  // 测试各个工具
  await testChatbiAskTool();
  await testChatbiAnalyzeTool();
  await testSaveFile();
  
  console.log("\n✅ 所有工具测试完成!");
}

// 运行测试
main().catch(console.error);

// 导出工具函数供其他模块使用
export { chatbiAskTool, chatbiAnalyzeTool, saveFile };

/* 
使用说明：

1. 直接调用工具函数：
   const result = await chatbiAskTool.invoke({ query: "你的查询" });

2. 在 LangChain Agent 中使用：
   const tools = [chatbiAskTool, chatbiAnalyzeTool, saveFile];
   const agent = createReactAgent({ llm, tools, prompt });

3. 环境变量配置（.env 文件）：
   CHATBI_DOMAIN=你的ChatBI域名
   CHATBI_TOKEN=你的ChatBI访问令牌
*/