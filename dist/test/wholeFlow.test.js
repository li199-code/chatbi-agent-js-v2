import { runDeepResearcher } from "../chatbi_agent";
console.log("🚀 启动深度研究系统测试...");
try {
    const result = await runDeepResearcher("今年第一季度销售额");
    console.log("\n=== 最终结果 ===");
    console.log("结果对象:", JSON.stringify(result, null, 2));
    console.log("\n最终报告:");
    console.log(result.final_report || "[未生成报告]");
}
catch (error) {
    const err = error;
    console.error("❌ 运行出错:", err.message);
    console.error(err.stack);
}
