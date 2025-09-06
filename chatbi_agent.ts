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
import { interrupt, Command } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import { HumanInterrupt, HumanInterruptConfig } from "@langchain/langgraph/prebuilt";

import { SingleDimensionDrillDown, ChatbiAnalyzeResult } from "./types";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { getChatModel } from "./utils";
import { ChatOpenAI } from "@langchain/openai";
import {config} from "./config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// AgentState类型定义
type AgentStateType = typeof AgentState.State;

// 主图节点函数
export async function planner(state: AgentStateType): Promise<Partial<AgentStateType>>{
  console.log('[planner] 制定研究计划');

  try {
    console.log('正在初始化模型...');
    // 必须是多模态模型，能理解图片内容
    const model = getChatModel(config.planner_model) as ChatOpenAI;

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

    // console.log("模型返回结果:", response);
    // console.log("返回结果类型:", typeof response);
    // console.log("返回内容:", response.content);
    
    let finalResponse = response;
    
    if (!finalResponse || !finalResponse.content) {
      throw new Error("Model returned empty response after tool execution");
    }

    const content = finalResponse.content.toString();
    
    // 尝试解析JSON
    let planRet;
    try {
      // 提取JSON部分（如果有其他文字包围）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      
      planRet = JSON.parse(jsonStr);
      console.log("JSON解析成功:", Object.keys(planRet));
    } catch (parseError: any) {
      console.error("JSON解析失败:", parseError);
      throw new Error("Failed to parse model response as JSON: " + parseError.message);
    }

    const steps = planRet.steps;

    // console.log('解析结果 - steps:', steps);

    const beautifiedSteps = Object.entries(steps).map(([name, step]: [string, any]) => {
      return `
      ### ${name}
      思路：${step.reason}
      维度提问：${step.general_questions.join(', ')}
      同环比提问：${step.yoymom_questions.join(', ')}
      `
    }).join('\n\n');

    // const beautifiedPlan = `
    // ## 研究计划
    // ${planRet.prefix}\n
    // ${beautifiedSteps}
    // `

    const beautifiedPlan = `\`\`\`json
${JSON.stringify(planRet, null, 2)}
\`\`\``



    return {
      messages: [new AIMessage(beautifiedPlan)],
      needs_clarification: false,
      clarification_questions: [],
      steps: planRet.steps
    }
  } catch (error: any) {
    console.error("Error in planner:", error);
    console.error("Error stack:", error.stack);
    
    return {
      messages: [new AIMessage("Failed to generate plan: " + error.message)],
      needs_clarification: false,
      steps: {}
    }
  }
}


export async function analyzeResearcher(state: AgentStateType): Promise<Partial<AgentStateType>>{
  console.log('[analyze_researcher] 获取归因结果，并逐个进行分析');
  
  const model = getChatModel(config.researcher_model);

  // 针对plan中的steps，每个step都进行一次分析
  const steps = state.steps;
  for (const [name, stepBody] of Object.entries(steps)){
    const { reason, general_questions, yoymom_questions } = stepBody;

    // 串行执行general_questions
    const generalResults:any[] = [];
    for (const q of general_questions) {
      const response: ChatbiAnalyzeResult = await chatbiAskTool.invoke({
        query: q
      });
      if (response.success){
        generalResults.push({
          question: q,
          answer: response.data
        });
      }
    }
    stepBody.general_questions = generalResults;

    // 等general_questions执行完毕后，再串行执行yoymom_questions
    const yoymomResults:any[] = [];
    for (const q of yoymom_questions) {
      const result: ChatbiAnalyzeResult = await chatbiAnalyzeTool.invoke({
        query: q
      });
      if (result.success){
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

        yoymomResults.push({
          question: q,
          analyzeResult: result.data
        });
      }
    }
    stepBody.yoymom_questions = yoymomResults;
  }

  const draftWordCount = JSON.stringify(steps).length;

  return {
    ...state,
    steps: steps,
    messages: [new AIMessage(`对各维度的分析完成，共生成${draftWordCount}字草稿，开始撰写报告`)]
  };
}

async function finalReportGeneration(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log("[final_report_generation] 生成最终研究报告");
  
  // const model = new ChatDeepSeek({
  //   model: "deepseek-reasoner",
  //   apiKey: process.env.DEEPSEEK_API_KEY!
  // })

  const model = getChatModel(config.final_report_model);

  const finalReport = await model.invoke([
    new SystemMessage({
      content: writerAgentPrompt
    }),
    new HumanMessage({
      content: JSON.stringify(state.steps)
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
    messages: [
      new AIMessage(finalReport.content as string),
      new AIMessage(`报告已生成，并保存到本地文件。`),
    ]
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
      
      const steps = state.steps;
      if (Object.keys(steps).length === 0) {
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


// 创建checkpointer以支持interrupt功能
const checkpointer = new MemorySaver();

export const deepResearcher = deepResearcherBuilder.compile({
  checkpointer: checkpointer
});

