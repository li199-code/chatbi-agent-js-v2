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
    // 绑定工具
    const modelWithTools = model.bindTools([getChatbiAllIndicators]);
    console.log('基础模型初始化完成，已绑定getChatbiAllIndicators工具');

    const userContent = state.messages.at(-1)?.content;
    console.log('用户输入内容:', userContent);

    // 修改prompt，要求返回JSON格式
    const modifiedPrompt = scopeAgentPrompt2;

    const response = await modelWithTools.invoke([
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
    console.log("工具调用:", response.tool_calls);
    
    let finalResponse = response;
    
    // 如果模型返回了工具调用，需要执行工具并获取结果
    if (response.tool_calls && response.tool_calls.length > 0) {
      console.log('检测到工具调用，正在执行...');
      
      const messages = [
        new SystemMessage({ content: modifiedPrompt }),
        new HumanMessage({ content: userContent }),
        response // 包含工具调用的AI消息
      ];
      
      // 执行工具调用
      for (const toolCall of response.tool_calls) {
        console.log(`执行工具: ${toolCall.name}`);
        
        if (toolCall.name === 'get_chatbi_all_indicators') {
          try {
            const toolResult = await getChatbiAllIndicators.invoke({});
            console.log('工具执行结果长度:', toolResult.length);
            
            // 添加工具结果消息
            messages.push({
              role: 'tool',
              content: toolResult,
              tool_call_id: toolCall.id
            } as any);
          } catch (toolError) {
            console.error('工具执行失败:', toolError);
            messages.push({
              role: 'tool',
              content: `工具执行失败: ${toolError.message}`,
              tool_call_id: toolCall.id
            } as any);
          }
        }
      }
      
      // 重新调用模型，让它基于工具结果生成最终计划
      console.log('基于工具结果重新生成计划...');
      finalResponse = await modelWithTools.invoke(messages);
      console.log('最终响应:', finalResponse.content);
    }
    
    if (!finalResponse || !finalResponse.content) {
      throw new Error("Model returned empty response after tool execution");
    }

    // 尝试解析JSON
    let planRet;
    try {
      const content = finalResponse.content.toString();
      console.log("尝试解析的内容:", content.substring(0, 500) + '...');
      
      // 提取JSON部分（如果有其他文字包围）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      
      planRet = JSON.parse(jsonStr);
      console.log("JSON解析成功:", Object.keys(planRet));
    } catch (parseError) {
      console.error("JSON解析失败:", parseError);
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
      plan: plan,
      general_questions: generalQuestions,
      yoymom_questions: yoymomQuestions,
    }
  } catch (error) {
    console.error("Error in planner:", error);
    console.error("Error stack:", error.stack);
    
    return {
      messages: [new AIMessage("Failed to generate plan: " + error.message)],
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

