import * as dotenv from "dotenv";
dotenv.config();
import { clarifyWithUser } from "../chatbi_agent.js";
import { HumanMessage } from "@langchain/core/messages";
// 测试 clarifyWithUser 函数
async function testClarifyWithUser() {
    console.log("\n=== 测试 clarifyWithUser 函数 ===");
    // 测试用例 1: 清晰的研究问题
    const testState1 = {
        messages: [new HumanMessage("今年一季度销售额")],
        normalized_questions: [],
        research_brief: "",
        supervisor_messages: [],
        notes: [],
        final_report: "",
        raw_notes: [],
        chatbi_analyze_results: [],
        singleNormalizedQuestionAnalyzeResult: [],
        dimensionTasks: [],
        currentTaskIndex: 0,
    };
    try {
        console.log("\n测试用例 1: 清晰的研究问题");
        console.log("输入:", testState1.messages[0].content);
        const result1 = await clarifyWithUser(testState1);
        console.log("输出:", result1);
        if (result1.messages && result1.messages.length > 0) {
            console.log("✅ 测试通过: 函数返回了响应消息");
            console.log("响应内容:", result1.messages[0].content);
        }
        else {
            console.log("❌ 测试失败: 没有返回响应消息");
        }
    }
    catch (error) {
        console.error("❌ 测试用例 1 出错:", error);
    }
    // 测试用例 2: 模糊的问题
    const testState2 = {
        messages: [new HumanMessage("我想了解一些东西")],
        normalized_questions: [],
        research_brief: "",
        supervisor_messages: [],
        notes: [],
        final_report: "",
        raw_notes: [],
        chatbi_analyze_results: [],
        singleNormalizedQuestionAnalyzeResult: [],
        dimensionTasks: [],
        currentTaskIndex: 0,
    };
    try {
        console.log("\n测试用例 2: 模糊的问题");
        console.log("输入:", testState2.messages[0].content);
        const result2 = await clarifyWithUser(testState2);
        console.log("输出:", result2);
        if (result2.messages && result2.messages.length > 0) {
            console.log("✅ 测试通过: 函数返回了响应消息");
            console.log("响应内容:", result2.messages[0].content);
        }
        else {
            console.log("❌ 测试失败: 没有返回响应消息");
        }
    }
    catch (error) {
        console.error("❌ 测试用例 2 出错:", error);
    }
    // 测试用例 3: 复杂的多个问题
    const testState3 = {
        messages: [new HumanMessage("今年一季度女装销售额和客单价")],
        normalized_questions: [],
        research_brief: "",
        supervisor_messages: [],
        notes: [],
        final_report: "",
        raw_notes: [],
        chatbi_analyze_results: [],
        singleNormalizedQuestionAnalyzeResult: [],
        dimensionTasks: [],
        currentTaskIndex: 0,
    };
    try {
        console.log("\n测试用例 3: 复杂的多个问题");
        console.log("输入:", testState3.messages[0].content);
        const result3 = await clarifyWithUser(testState3);
        console.log("输出:", result3);
        if (result3.messages && result3.messages.length > 0) {
            console.log("✅ 测试通过: 函数返回了响应消息");
            console.log("响应内容:", result3.messages[0].content);
            if (result3.normalized_questions && result3.normalized_questions.length > 0) {
                console.log("✅ 额外检查: 返回了标准化问题");
                console.log("标准化问题:", result3.normalized_questions);
            }
        }
        else {
            console.log("❌ 测试失败: 没有返回响应消息");
        }
    }
    catch (error) {
        console.error("❌ 测试用例 3 出错:", error);
    }
}
// 运行测试
async function runTests() {
    console.log("🚀 开始测试 clarifyWithUser 函数...");
    try {
        await testClarifyWithUser();
        console.log("\n✅ 所有测试完成!");
    }
    catch (error) {
        console.error("\n❌ 测试过程中出现错误:", error);
    }
}
// 执行测试
runTests();
