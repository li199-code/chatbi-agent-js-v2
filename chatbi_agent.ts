import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, SupervisorState, ResearcherState, ToolCall, AnalysisResponse } from "./types";
import { ChatDeepSeek } from "@langchain/deepseek";
import * as dotenv from "dotenv";
dotenv.config();
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { scopeAgentPrompt, dimensionInsightPrompt, writerAgentPrompt } from "./prompts";
import {z} from "zod";
import { chatbiAskTool, chatbiAnalyzeTool } from "./tools";
import { SingleDimensionDrillDown } from "./types";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// AgentState类型定义
type AgentStateType = typeof AgentState.State;

// 主图节点函数
export async function clarifyWithUser(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log("[clarify_with_user] 处理用户澄清请求");

  const responseSchema = z.object({
    need_clarification: z.boolean(),
    verification: z.string(),
    questions: z.array(z.string())
  })

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
  ])

  if (classifyRet.need_clarification){
    return {
      messages: [new AIMessage(classifyRet.verification)]
    };
  }else {
    return {
      messages: [new AIMessage(`理解您的研究需求，开始对${classifyRet.questions.join("、")}进行深度研究。`)],
      normalized_questions: classifyRet.questions
    };
  }
}

export async function analyzeResearcher(state: AgentStateType): Promise<Partial<AgentStateType>>{
  console.log('[analyze_researcher] 获取归因结果，并逐个进行分析');
  
  // 方法1: 手动创建与 AnalysisResponse 接口对应的 zod schema
  const responseSchema = z.object({
    title: z.string(),
    data_table: z.string(),
    findings: z.string(),
    conclusion: z.string()
  })
  const model = new ChatDeepSeek({
    model: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY
  })
  // .withStructuredOutput(responseSchema);

  const questions = state.normalized_questions;
  for (const question of questions) {
    const response = await chatbiAnalyzeTool.invoke({
      query: question
    });

    // 保存归因数据
    state.chatbi_analyze_results.push(response);
  }

  // 分析归因结果
  const analyzeResults = state.chatbi_analyze_results;
  for (const result of analyzeResults) {
    if (result.success){
      // 调用llm分析归因结果
      for (const dimension of result.data!.drilldown as SingleDimensionDrillDown[]){
        // 给state.messages添加一条消息，作为进度
        // state.messages.push(new AIMessage(`正在分析维度 ${dimension.dimension.name} 对 ${result.query} 的影响`))

        const singleDimensionInsight = await model.invoke([
          new SystemMessage({
            content: dimensionInsightPrompt
          }),
          new HumanMessage({
            content: 
              `问题：${result.query}
              维度：${dimension.dimension.name}
              积极影响项：${dimension.positive.map(item => JSON.stringify(item)).join('、')}
              消极影响项：${dimension.negative.map(item => JSON.stringify(item)).join('、')}`
          })
        ])

        dimension.初步分析草稿 = singleDimensionInsight.content as string;
      }

      // 带上初步草稿后准备进入最终的报告生成
      state.singleNormalizedQuestionAnalyzeResult.push({
        question: result.query,
        analyzeResult: result.data
      })



    }
  }

  return state;
}

async function finalReportGeneration(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log("[final_report_generation] 生成最终研究报告");
  
  const model = new ChatDeepSeek({
    model: "deepseek-reasoner",
    apiKey: process.env.DEEPSEEK_API_KEY
  })

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
  ])

  state.final_report = finalReport.content as string;

  // 保存到本地
  fs.writeFileSync(path.join(__dirname, "reports", "final_report.md"), finalReport.content as string);

  state.messages.push(new AIMessage(`报告已生成`))
  
  return state
}

// 主深度研究图
const deepResearcherBuilder = new StateGraph(AgentState)
  .addNode("clarify_with_user", clarifyWithUser)
  .addNode("analyze_researcher", analyzeResearcher)
  .addNode("final_report_generation", finalReportGeneration)
  
  .addEdge(START, "clarify_with_user")
  .addConditionalEdges(
    "clarify_with_user",
    (state: AgentStateType) => {
      const normalized_questions = state.normalized_questions;
      if (normalized_questions.length === 0) {
        return END;
      } else {
        return "analyze_researcher";
      }
    },
    {
      analyze_researcher: "analyze_researcher",
      [END]: END
    }
  )
  .addEdge("analyze_researcher", "final_report_generation")
  .addEdge("final_report_generation", END);

export const deepResearcher = deepResearcherBuilder.compile();

// 导出
// export default deepResearcher;

// 运行函数
export async function runDeepResearcher(userInput: string): Promise<AgentStateType> {
  const initialState: AgentStateType = {
    messages: [new HumanMessage(userInput)],
    normalized_questions: [],
    chatbi_analyze_results: [],
    research_brief: "",
    singleNormalizedQuestionAnalyzeResult: [],
    supervisor_messages: [],
    notes: [],
    final_report: "",
    raw_notes: []
  };
  
  console.log("开始深度研究流程...");
  const result = await deepResearcher.invoke(initialState);
  console.log("研究完成！");
  
  return result as AgentStateType;
}

