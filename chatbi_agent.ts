import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, SupervisorState, ResearcherState, ToolCall, AnalysisResponse } from "./types";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatAlibabaTongyi } from "@langchain/community/chat_models/alibaba_tongyi";
import dotenv from 'dotenv'
dotenv.config();
import { JsonOutputParser } from "@langchain/core/output_parsers";
import { HumanMessage, AIMessage, SystemMessage, BaseMessage } from "@langchain/core/messages";
import { scopeAgentPrompt2, dimensionInsightPrompt, writerAgentPrompt } from "./prompts";
import {z} from "zod";
import { chatbiAskTool, chatbiAnalyzeTool, getChatbiAllIndicators } from "./tools";

import { SingleDimensionDrillDown, ChatbiAnalyzeResult } from "./types";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { getChatModel } from "./utils";
import { ChatOpenAI } from "@langchain/openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// AgentState类型定义
type AgentStateType = typeof AgentState.State;

// 主图节点函数
export async function planner(state: AgentStateType): Promise<Partial<AgentStateType>>{
  console.log('[planner] 制定研究计划');

  try {
    console.log('正在初始化模型...');
    const model = getChatModel("qwen-vl") as ChatOpenAI;

    const userContent = state.messages.at(-1)?.content;
    console.log('用户输入内容:', userContent);

    // 1️⃣ 先显式拿到指标全集
    const indicators = await getChatbiAllIndicators.invoke({});
    console.log("指标全集长度:", indicators.length);

    // 修改prompt，要求返回JSON格式
// 2️⃣ 拼一个带全集的 system prompt
    const modifiedPrompt = scopeAgentPrompt2(indicators);


    const response = await model.invoke([
      new SystemMessage({
        content: modifiedPrompt
      }),
      new HumanMessage({
        content: userContent
      })
    ]);

    console.log("模型返回结果:", response);
    console.log("返回结果类型:", typeof response);
    console.log("返回内容:", response.content);
    
    let finalResponse = response;
    
    if (!finalResponse || !finalResponse.content) {
      throw new Error("Model returned empty response after tool execution");
    }

    const content = finalResponse.content.toString();
    console.log("模型返回内容:", content.substring(0, 500) + '...');
    
    // 检测是否为反问（包含问题但没有完整计划）
    const hasQuestionMarkers = /[？?]|请问|能否|是否|如何|什么|哪个|哪些|clarify|question/i.test(content);
    const hasJsonStructure = /\{[\s\S]*"plan"[\s\S]*\}/.test(content);
    
    // 如果包含问题标记但没有完整的JSON计划结构，认为是反问
    if (hasQuestionMarkers && !hasJsonStructure) {
      console.log('检测到模型反问，需要用户澄清');
      
      // 提取问题
      const questions = content.split(/[\n。！!]/).filter(q => 
        q.trim() && /[？?]|请问|能否|是否|如何|什么|哪个|哪些/i.test(q)
      ).map(q => q.trim());
      
      return {
        messages: [new AIMessage(content)],
        needs_clarification: true,
        clarification_questions: questions.length > 0 ? questions : [content],
        plan: "",
        general_questions: [],
        yoymom_questions: [],
      };
    }
    
    // 尝试解析JSON
    let planRet;
    try {
      // 提取JSON部分（如果有其他文字包围）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      
      planRet = JSON.parse(jsonStr);
      console.log("JSON解析成功:", Object.keys(planRet));
    } catch (parseError) {
      console.error("JSON解析失败:", parseError);
      // 如果JSON解析失败，也可能是反问
      if (hasQuestionMarkers) {
        console.log('JSON解析失败但检测到问题，作为反问处理');
        const questions = content.split(/[\n。！!]/).filter(q => 
          q.trim() && /[？?]|请问|能否|是否|如何|什么|哪个|哪些/i.test(q)
        ).map(q => q.trim());
        
        return {
          messages: [new AIMessage(content)],
          needs_clarification: true,
          clarification_questions: questions.length > 0 ? questions : [content],
          plan: "",
          general_questions: [],
          yoymom_questions: [],
        };
      }
      throw new Error("Failed to parse model response as JSON: " + parseError.message);
    }

    const plan = planRet.plan || "未生成计划";
    const generalQuestions = planRet.general_questions || [];
    const yoymomQuestions = planRet.yoymom_questions || [];

    console.log('解析结果 - plan:', plan);
    console.log('解析结果 - general_questions:', generalQuestions);
    console.log('解析结果 - yoymom_questions:', yoymomQuestions);

    return {
      messages: [new AIMessage(plan)],
      needs_clarification: false,
      clarification_questions: [],
      plan: plan,
      general_questions: generalQuestions,
      yoymom_questions: yoymomQuestions,
    }
  } catch (error) {
    console.error("Error in planner:", error);
    console.error("Error stack:", error.stack);
    
    return {
      messages: [new AIMessage("Failed to generate plan: " + error.message)],
      needs_clarification: false,
      clarification_questions: [],
      plan: "",
      general_questions: [],
      yoymom_questions: [],
    }
  }
}


export async function analyzeResearcher(state: AgentStateType): Promise<Partial<AgentStateType>>{
  console.log('[analyze_researcher] 获取归因结果，并逐个进行分析');
  
  const model = getChatModel("deepseek-chat");

  // 一般问题
  const generalQuestions = state.general_questions;
  const generalResults:any[] = [];
  for (const question of generalQuestions) {
    const response: ChatbiAnalyzeResult = await chatbiAskTool.invoke({
      query: question
    });
    if (response.success){
      generalResults.push(response);
    }
  }



  const yoymomQuestions = state.yoymom_questions;
  const analyzeResults: ChatbiAnalyzeResult[] = [];
  for (const question of yoymomQuestions) {
    const response: ChatbiAnalyzeResult = await chatbiAnalyzeTool.invoke({
      query: question
    });

    // 保存归因数据
    analyzeResults.push(response);
  }


  // 分析归因结果
  const processResults: any[] = [];
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
      processResults.push({
        question: result.query,
        analyzeResult: result.data
      })

    }
  }

  if (processResults.length === 0) {
    return {
      ...state,
      messages: [new AIMessage(`维度分析失败，无法生成报告`)]
    };
  }

  return {
    ...state,
    singleNormalizedQuestionAnalyzeResult: [...processResults],
    general_questions_result: generalResults,
    messages: [new AIMessage(`对各维度的分析完成，开始生成报告`)]
  };
}

async function finalReportGeneration(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log("[final_report_generation] 生成最终研究报告");
  
  // const model = new ChatDeepSeek({
  //   model: "deepseek-reasoner",
  //   apiKey: process.env.DEEPSEEK_API_KEY!
  // })

  const model = getChatModel("kimi");

  const finalReport = await model.invoke([
    new SystemMessage({
      content: writerAgentPrompt
    }),
    new HumanMessage({
      content: `
      {
        一般问题分析：${JSON.stringify(state.general_questions_result)}
        归因分析：${JSON.stringify(state.singleNormalizedQuestionAnalyzeResult)}
        研究计划：${state.plan}
      }`
    })
  ])

  state.final_report = finalReport.content as string;

  // 保存到本地
  if (!fs.existsSync(path.join(__dirname, "reports"))) {
    fs.mkdirSync(path.join(__dirname, "reports"));
  }
  fs.writeFileSync(path.join(__dirname, "reports", "final_report.md"), finalReport.content as string);

  return {
    ...state,
    messages: [new AIMessage(`报告已生成`)]
  }
}

// 主深度研究图
const deepResearcherBuilder = new StateGraph(AgentState)
  .addNode("planner", planner)
  .addNode("analyze_researcher", analyzeResearcher)
  .addNode("final_report_generation", finalReportGeneration)
  
  .addEdge(START, "planner")
  .addConditionalEdges(
    "planner",
    (state: AgentStateType) => {
      // 如果需要澄清，直接结束并返回问题给用户
      if (state.needs_clarification) {
        console.log('检测到需要澄清，结束流程');
        return END;
      }
      
      const general_questions = state.general_questions;
      const yoymom_questions = state.yoymom_questions;
      if (general_questions.length === 0 && yoymom_questions.length === 0) {
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
  .addConditionalEdges(
    "analyze_researcher",
    (state: AgentStateType) => {
      const singleNormalizedQuestionAnalyzeResult = state.singleNormalizedQuestionAnalyzeResult;
      if (singleNormalizedQuestionAnalyzeResult.length === 0) {
        return END;
      } else {
        return "final_report_generation";
      }
    },
    {
      final_report_generation: "final_report_generation",
      [END]: END
    }
  )
  .addEdge("final_report_generation", END);

export const deepResearcher = deepResearcherBuilder.compile();

// 导出
// export default deepResearcher;

export async function runDeepResearcher(userInput: string): Promise<AgentStateType> {
  const initialState: AgentStateType = {
    messages: [new HumanMessage(userInput)],
    plan: "",
    yoymom_questions: [],
    general_questions: [],
    chatbi_analyze_results: [],
    general_questions_result: [], 
    singleNormalizedQuestionAnalyzeResult: [],
    notes: [],
    final_report: "",
    raw_notes: []
  };
  
  console.log("开始深度研究流程...");
  const result = await deepResearcher.invoke(initialState);
  console.log("研究完成！");
  
  return result as AgentStateType;
}

