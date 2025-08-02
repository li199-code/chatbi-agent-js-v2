import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState } from "./types.js";
import { ChatDeepSeek } from "@langchain/deepseek";
import * as dotenv from "dotenv";
dotenv.config();
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { scopeAgentPrompt, dimensionInsightPrompt, writerAgentPrompt } from "./prompts.js";
import { z } from "zod";
import { chatbiAnalyzeTool } from "./tools.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 主图节点函数
export async function clarifyWithUser(state) {
    console.log("[clarify_with_user] 处理用户澄清请求");
    const responseSchema = z.object({
        need_clarification: z.boolean(),
        verification: z.string(),
        questions: z.array(z.string())
    });
    const model = new ChatDeepSeek({
        model: "deepseek-chat",
        apiKey: process.env.DEEPSEEK_API_KEY
    }).withStructuredOutput(responseSchema);
    const classifyRet = await model.invoke([
        new SystemMessage({
            content: scopeAgentPrompt
        }),
        new HumanMessage({
            content: state.messages[0].content
        })
    ]);
    if (classifyRet.need_clarification) {
        return {
            messages: [new AIMessage(classifyRet.verification)]
        };
    }
    else {
        return {
            messages: [new AIMessage(`理解您的研究需求，开始对${classifyRet.questions.join("、")}进行深度研究。`)],
            normalized_questions: classifyRet.questions
        };
    }
}
// 获取归因数据的节点
export async function fetchAnalyzeData(state) {
    console.log('[fetch_analyze_data] 获取归因结果');
    const questions = state.normalized_questions;
    for (const question of questions) {
        const response = await chatbiAnalyzeTool.invoke({
            query: question
        });
        // 保存归因数据
        state.chatbi_analyze_results.push(response);
    }
    return state;
}
// 准备维度分析任务的节点
export async function prepareDimensionAnalysis(state) {
    console.log('[prepare_dimension_analysis] 准备维度分析任务');
    // 收集所有需要分析的维度
    const dimensionTasks = [];
    state.chatbi_analyze_results.forEach((result, resultIndex) => {
        if (result.success) {
            result.data.drilldown.forEach((dimension, dimensionIndex) => {
                dimensionTasks.push({
                    resultIndex,
                    dimensionIndex,
                    result,
                    dimension
                });
            });
        }
    });
    // 将任务信息保存到状态中
    state.dimensionTasks = dimensionTasks;
    state.currentTaskIndex = 0;
    return state;
}
// 分析单个维度的节点
export async function analyzeSingleDimension(state) {
    const currentIndex = state.currentTaskIndex || 0;
    const tasks = state.dimensionTasks || [];
    if (currentIndex >= tasks.length) {
        return state; // 所有任务完成
    }
    const task = tasks[currentIndex];
    const { result, dimension } = task;
    // 显示进度消息
    const progressMessage = new AIMessage(`正在分析维度 ${dimension.dimension.name} 对 ${result.query} 的影响 (${currentIndex + 1}/${tasks.length})`);
    const model = new ChatDeepSeek({
        model: "deepseek-reasoner",
        apiKey: process.env.DEEPSEEK_API_KEY
    });
    const singleDimensionInsight = await model.invoke([
        new SystemMessage({
            content: dimensionInsightPrompt
        }),
        new HumanMessage({
            content: `问题：${result.query}
        维度：${dimension.dimension.name}
        积极影响项：${dimension.positive.map(item => JSON.stringify(item)).join('、')}
        消极影响项：${dimension.negative.map(item => JSON.stringify(item)).join('、')}`
        })
    ]);
    dimension.初步分析草稿 = singleDimensionInsight.content;
    // 更新任务索引
    state.currentTaskIndex = currentIndex + 1;
    return {
        messages: [progressMessage],
        currentTaskIndex: state.currentTaskIndex,
        chatbi_analyze_results: state.chatbi_analyze_results
    };
}
// 完成维度分析的节点
export async function finalizeDimensionAnalysis(state) {
    console.log('[finalize_dimension_analysis] 完成维度分析');
    // 整理分析结果
    state.chatbi_analyze_results.forEach(result => {
        if (result.success) {
            state.singleNormalizedQuestionAnalyzeResult.push({
                question: result.query,
                analyzeResult: result.data
            });
        }
    });
    return state;
}
// 检查是否还有维度需要分析
export function shouldContinueAnalysis(state) {
    const currentIndex = state.currentTaskIndex || 0;
    const tasks = state.dimensionTasks || [];
    if (currentIndex < tasks.length) {
        return "analyze_single_dimension";
    }
    else {
        return "finalize_dimension_analysis";
    }
}
async function finalReportGeneration(state) {
    console.log("[final_report_generation] 生成最终研究报告");
    const model = new ChatDeepSeek({
        model: "deepseek-reasoner",
        apiKey: process.env.DEEPSEEK_API_KEY
    });
    const finalReport = await model.invoke([
        new SystemMessage({
            content: writerAgentPrompt
        }),
        new HumanMessage({
            content: `
      {
        notes：${JSON.stringify(state.singleNormalizedQuestionAnalyzeResult)}
      }`
        })
    ]);
    state.final_report = finalReport.content;
    // 保存到本地
    fs.writeFileSync(path.join(__dirname, "reports", "final_report.md"), finalReport.content);
    state.messages.push(new AIMessage(`报告已生成`));
    return state;
}
// 主深度研究图
const deepResearcherBuilder = new StateGraph(AgentState)
    .addNode("clarify_with_user", clarifyWithUser)
    .addNode("fetch_analyze_data", fetchAnalyzeData)
    .addNode("prepare_dimension_analysis", prepareDimensionAnalysis)
    .addNode("analyze_single_dimension", analyzeSingleDimension)
    .addNode("finalize_dimension_analysis", finalizeDimensionAnalysis)
    .addNode("final_report_generation", finalReportGeneration)
    .addEdge(START, "clarify_with_user")
    .addConditionalEdges("clarify_with_user", (state) => {
    if (state.normalized_questions.length > 0) {
        return "fetch_analyze_data";
    }
    else {
        return END;
    }
}, {
    fetch_analyze_data: "fetch_analyze_data",
    [END]: END
})
    .addEdge("fetch_analyze_data", "prepare_dimension_analysis")
    .addEdge("prepare_dimension_analysis", "analyze_single_dimension")
    .addConditionalEdges("analyze_single_dimension", shouldContinueAnalysis, {
    analyze_single_dimension: "analyze_single_dimension",
    finalize_dimension_analysis: "finalize_dimension_analysis"
})
    .addEdge("finalize_dimension_analysis", "final_report_generation")
    .addEdge("final_report_generation", END);
export const deepResearcher = deepResearcherBuilder.compile();
// 导出
// export default deepResearcher;
// 运行函数
export async function runDeepResearcher(userInput) {
    const initialState = {
        messages: [new HumanMessage(userInput)],
        normalized_questions: [],
        chatbi_analyze_results: [],
        research_brief: "",
        singleNormalizedQuestionAnalyzeResult: [],
        supervisor_messages: [],
        notes: [],
        final_report: "",
        raw_notes: [],
        dimensionTasks: [],
        currentTaskIndex: 0
    };
    console.log("开始深度研究流程...");
    const result = await deepResearcher.invoke(initialState);
    console.log("研究完成！");
    return result;
}
