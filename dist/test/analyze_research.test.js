import * as dotenv from "dotenv";
dotenv.config();
import { fetchAnalyzeData } from "../chatbi_agent.js";
import { HumanMessage } from "@langchain/core/messages";
// 测试 fetchAnalyzeData 函数
async function testFetchAnalyzeData() {
    console.log("\n=== 测试 analyzeResearcher 函数 ===");
    // 测试用例1：包含多个标准化问题的状态
    console.log("\n--- 测试用例1：多个标准化问题 ---");
    const testState1 = {
        messages: [new HumanMessage("分析销售数据的变化趋势")],
        normalized_questions: [
            "今年一季度销售额",
            //   "今年一季度客单价",
        ],
        chatbi_analyze_results: [],
        research_brief: "",
        supervisor_messages: [],
        notes: [],
        final_report: "",
        raw_notes: [],
        singleNormalizedQuestionAnalyzeResult: [],
        dimensionTasks: [],
        currentTaskIndex: 0
    };
    try {
        const result1 = await fetchAnalyzeData(testState1);
        console.log("✅ 测试用例1通过");
        console.log(`处理了 ${result1.normalized_questions?.length} 个问题`);
        console.log(`获得了 ${result1.chatbi_analyze_results?.length} 个分析结果`);
        console.log(`获得了 ${result1.notes?.length} 个分析报告`);
        console.log('====报告内容\n', result1.notes);
        // 检查结果结构
        // if (result1.chatbi_analyze_results && result1.chatbi_analyze_results.length > 0) {
        //   console.log("分析结果示例:", JSON.stringify(result1.chatbi_analyze_results[0], null, 2));
        // }
    }
    catch (error) {
        console.error("❌ 测试用例1失败:", error);
    }
    // 测试用例2：空的标准化问题列表
    //   console.log("\n--- 测试用例2：空问题列表 ---");
    //   const testState2: AgentState = {
    //     messages: [{
    //       role: "user",
    //       content: "测试空问题列表"
    //     }],
    //     normalized_questions: [],
    //     chatbi_analyze_results: [],
    //     research_brief: "",
    //     supervisor_messages: [],
    //     notes: [],
    //     final_report: "",
    //     raw_notes: []
    //   };
    //   try {
    //     const result2 = await analyzeResearcher(testState2);
    //     console.log("✅ 测试用例2通过");
    //     console.log(`处理了 ${result2.normalized_questions?.length} 个问题`);
    //     console.log(`获得了 ${result2.chatbi_analyze_results?.length} 个分析结果`);
    //   } catch (error) {
    //     console.error("❌ 测试用例2失败:", error);
    //   }
    //   // 测试用例3：单个问题
    //   console.log("\n--- 测试用例3：单个问题 ---");
    //   const testState3: AgentState = {
    //     messages: [{
    //       role: "user",
    //       content: "分析单个业务指标"
    //     }],
    //     normalized_questions: [
    //       "分析用户留存率下降的主要原因"
    //     ],
    //     chatbi_analyze_results: [],
    //     research_brief: "",
    //     supervisor_messages: [],
    //     notes: [],
    //     final_report: "",
    //     raw_notes: []
    //   };
    //   try {
    //     const result3 = await analyzeResearcher(testState3);
    //     console.log("✅ 测试用例3通过");
    //     console.log(`处理了 ${result3.normalized_questions?.length} 个问题`);
    //     console.log(`获得了 ${result3.chatbi_analyze_results?.length} 个分析结果`);
    //     // 详细检查单个结果
    //     if (result3.chatbi_analyze_results && result3.chatbi_analyze_results.length > 0) {
    //       const singleResult = result3.chatbi_analyze_results[0];
    //       console.log("单个分析结果详情:");
    //       console.log("- 成功状态:", singleResult.success);
    //       console.log("- 查询内容:", singleResult.query);
    //       console.log("- 时间戳:", singleResult.timestamp);
    //       if (singleResult.success && singleResult.data) {
    //         console.log("- 数据结构:", {
    //           hasTotal: !!singleResult.data.total,
    //           hasDrilldown: !!singleResult.data.drilldown,
    //           hasImpactFactorProperties: !!singleResult.data.impactFactorProperties,
    //           drilldownCount: singleResult.data.drilldown?.length || 0
    //         });
    //       }
    //     }
    //   } catch (error) {
    //     console.error("❌ 测试用例3失败:", error);
    //   }
    //   // 测试用例4：已有分析结果的状态（测试累积行为）
    //   console.log("\n--- 测试用例4：累积分析结果 ---");
    //   const testState4: AgentState = {
    //     messages: [{
    //       role: "user",
    //       content: "继续分析更多数据"
    //     }],
    //     normalized_questions: [
    //       "分析新增的业务指标变化"
    //     ],
    //     chatbi_analyze_results: [{
    //       success: true,
    //       data: { total: "existing_data", drilldown: [], impactFactorProperties: {} },
    //       query: "之前的查询",
    //       timestamp: new Date().toISOString()
    //     }],
    //     research_brief: "",
    //     supervisor_messages: [],
    //     notes: [],
    //     final_report: "",
    //     raw_notes: []
    //   };
    //   try {
    //     const result4 = await analyzeResearcher(testState4);
    //     console.log("✅ 测试用例4通过");
    //     console.log(`最终分析结果数量: ${result4.chatbi_analyze_results?.length}`);
    //     console.log("验证累积行为: 新结果应该添加到现有结果中");
    //   } catch (error) {
    //     console.error("❌ 测试用例4失败:", error);
    //   }
}
// 运行测试
console.log("🚀 开始测试 fetchAnalyzeData 函数...");
testFetchAnalyzeData()
    .then(() => {
    console.log("\n✅ 所有 analyzeResearcher 测试完成!");
})
    .catch((error) => {
    console.error("\n❌ 测试运行失败:", error);
});
// 导出测试函数供其他模块使用
export { testFetchAnalyzeData };
