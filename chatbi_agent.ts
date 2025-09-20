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
import { chatbiAskTool, chatbiAnalyzeTool, getChatbiAllIndicators, generateChart, resetSessionFolder, getCurrentReportsDir } from "./tools";
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

  // 重置会话文件夹，为新的研究生成新的时间戳文件夹
  resetSessionFolder();
  console.log('[planner] 已重置会话文件夹，将使用新的时间戳文件夹');

  try {
    console.log('正在初始化模型...');
    // 必须是多模态模型，能理解图片内容
    const model = getChatModel(config.planner_model) as ChatOpenAI;

    const userContent = state.messages.at(-1)?.content;
    console.log('用户输入内容:', userContent);

    if (!userContent) {
      throw new Error("No user message found in state");
    }

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

      // 如果返回的是纯文本而不是json，考虑手动构建json
      if (!content.includes('{')) {
        planRet = {
          needs_clarification: true,
          askBackPrompt: content,
        }
      } else {
        throw new Error("Failed to parse model response as JSON: " + parseError.message);
      }
    }

    // 检查是否需要澄清
    if (planRet.needs_clarification) {
      console.log("检测到需要澄清，返回澄清信息");
      return {
        messages: [new AIMessage(planRet.askBackPrompt)],
        needs_clarification: true,
        askBackPrompt: [planRet.askBackPrompt],
        steps: {}
      };
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

    const beautifiedPlan = `\`\`\`json
${JSON.stringify(planRet, null, 2)}
\`\`\``

    return {
      messages: [new AIMessage("我已经制定了研究计划，请你帮我看看哪些地方需要修改。")],
      needs_clarification: false,
      askBackPrompt: [],
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

// We define a fake node to ask the human
export async function askHuman(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log('[ask_human] 让用户修改研究计划');
  const request: HumanInterrupt = {
    action_request: {
      action: "ask_human",
      args: {
        steps: JSON.stringify(state.steps, null, 2)
      }
    },
    config: {
      allow_ignore: true,
      allow_respond: true,
      allow_edit: true,
      allow_accept: true,
    },
    description: "请检查并修改用户的研究计划"
  }
  const response = interrupt([request])[0];
  const newSteps = response.args.args.steps;
  // console.log('[ask_human] 收到用户修改后的研究计划:', JSON.stringify(newSteps));
  const beautified_plan = `\`\`\`json
${newSteps}
\`\`\``
  return { 
    messages: [
      new AIMessage("好的，我已经收到你的修改后的研究计划。"),
      new AIMessage(beautified_plan)
    ],
    needs_clarification: false,
    steps: JSON.parse(newSteps)
  };
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
                积极影响项：${dimension.positive?.map(item => JSON.stringify(item)).join('、')}
                消极影响项：${dimension.negative?.map(item => JSON.stringify(item)).join('、')}`
            })
          ])

          dimension.初步分析草稿 = singleDimensionInsight.content as string;
          
          // 删掉归因的明细项吧，太多了可能也没好处
          delete dimension.positive;
          delete dimension.negative;
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
  
  const model = getChatModel(config.final_report_model);

  const finalReport = await model.invoke([
    new SystemMessage({
      content: writerAgentPrompt
    }),
    new HumanMessage({
      content: JSON.stringify(state.steps)
    })
  ])

  let reportContent = finalReport.content as string;
  state.final_report = reportContent;

  // 在finalreport中插入echarts图表
  try {
    reportContent = await processTablesInReport(reportContent, model);
    state.final_report = reportContent;
  } catch (error) {
    console.error("处理表格图表时出错:", error);
    // 如果图表生成失败，继续使用原始报告
  }

  // 保存到本地时间戳文件夹
  const reportsDir = getCurrentReportsDir();
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(reportsDir, "final_report.md"), reportContent);

  return {
    ...state,
    final_report: reportContent,
    messages: [
      new AIMessage(reportContent),
      new AIMessage(`报告已生成，并保存到本地文件。`),
    ]
  }
}

/**
 * 处理报告中的表格，将"研究计划回顾"章节中的表格转换为图表
 */
async function processTablesInReport(reportContent: string, model: any): Promise<string> {
  console.log("[processTablesInReport] 开始处理报告中的表格");
  
  // 查找"研究计划回顾"章节
  // 匹配从"## 研究计划回顾"开始到下一个同级或更高级标题（## 开头）或文件结尾
  const sectionRegex = /##\s*研究计划回顾[\s\S]*?(?=\n##\s|$)/i;
  const sectionMatch = reportContent.match(sectionRegex);
  
  if (!sectionMatch) {
    console.log("未找到'研究计划回顾'章节");
    return reportContent;
  }
  
  const sectionContent = sectionMatch[0];
  console.log("找到研究计划回顾章节");
  
  // 查找章节中的markdown表格
  // 匹配完整的markdown表格：表头 + 分隔线 + 数据行
  const tableRegex = /\|[^|\n]*\|[^\n]*\n\|[-\s|:]*\|[^\n]*\n(?:\|[^|\n]*\|[^\n]*\n)*/g;
  const tables = sectionContent.match(tableRegex);
  
  if (!tables || tables.length === 0) {
    console.log("在研究计划回顾章节中未找到表格");
    return reportContent;
  }
  
  console.log(`找到 ${tables.length} 个表格`);
  
  let updatedContent = reportContent;
  
  // 处理每个表格
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    console.log(`处理第 ${i + 1} 个表格`);
    
    try {
      // 使用大模型将表格转换为ECharts配置
      const chartOption = await convertTableToEChartsOption(table, model);
      
      
      if (chartOption) {
        // 生成图表
        const chartResult = await generateChart.invoke({
          echartsOption: chartOption,
          fileName: `research_plan_chart_${i + 1}`,
          width: 800,
          height: 500
        });
        
        if (chartResult.success) {
          console.log(`图表 ${i + 1} 生成成功: ${chartResult.fileName}`);
          
          // 在原表格后插入图片引用
          // 由于markdown文件和图片都在同一个时间戳文件夹中，只需要文件名即可
          const chartMarkdown = `\n\n![研究计划图表](${chartResult.fileName})\n\n`;
          updatedContent = updatedContent.replace(table, table + chartMarkdown);
        } else {
          console.error(`图表 ${i + 1} 生成失败:`, chartResult.error);
        }
      }
    } catch (error) {
      console.error(`处理表格 ${i + 1} 时出错:`, error);
    }
  }
  
  return updatedContent;
}

/**
 * 使用大模型将markdown表格转换为ECharts配置
 */
async function convertTableToEChartsOption(table: string, model: any): Promise<any> {
  console.log("[convertTableToEChartsOption] 转换表格为ECharts配置");
  
  const prompt = `请将以下markdown表格转换为合适的ECharts配置对象。

要求：
1. 分析表格的数据结构和内容
2. 选择最合适的图表类型（柱状图、饼图、折线图等）
3. 返回完整的ECharts配置JSON对象
4. 确保图表美观且易于理解
5. 添加合适的标题、图例和提示框
6. 严格按照以下格式返回，不要添加任何解释文字：

\`\`\`json
{
  "title": {...},
  "tooltip": {...},
  "legend": {...},
  "xAxis": {...},
  "yAxis": {...},
  "series": [...]
}
\`\`\`

表格内容：
${table}`;

  try {
    const response = await model.invoke([
      new SystemMessage({
        content: "你是一个数据可视化专家，擅长将表格数据转换为美观的ECharts图表配置。"
      }),
      new HumanMessage({
        content: prompt
      })
    ]);
    
    const content = response.content as string;
    console.log("模型响应内容:", content.substring(0, 500) + "...");
    
    // 尝试多种方式提取和清理JSON配置
    let chartOption = null;
    
    // 方法1: 寻找代码块中的JSON
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      try {
        let jsonStr = codeBlockMatch[1];
        // 清理常见的JSON格式问题
        jsonStr = cleanJsonString(jsonStr);
        chartOption = JSON.parse(jsonStr);
        console.log("成功通过方法1提取JSON配置");
        return chartOption;
      } catch (error) {
        console.log("方法1解析失败，尝试方法2:", error.message);
      }
    }
    
    // 方法2: 寻找完整的JSON对象（最外层大括号匹配）
    const jsonMatch = content.match(/\{(?:[^{}]|{[^{}]*})*\}/);
    if (jsonMatch) {
      try {
        let jsonStr = jsonMatch[0];
        // 清理常见的JSON格式问题
        jsonStr = cleanJsonString(jsonStr);
        chartOption = JSON.parse(jsonStr);
        console.log("成功通过方法2提取JSON配置");
        return chartOption;
      } catch (error) {
        console.log("方法2解析失败，尝试方法3:", error.message);
      }
    }
    
    // 方法3: 清理内容后再尝试解析
    let cleanedContent = content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/^[^{]*/, '')  // 移除开头的非JSON内容
      .replace(/[^}]*$/, ''); // 移除结尾的非JSON内容
    
    if (cleanedContent.startsWith('{') && cleanedContent.endsWith('}')) {
      try {
        cleanedContent = cleanJsonString(cleanedContent);
        chartOption = JSON.parse(cleanedContent);
        console.log("成功通过方法3提取JSON配置");
        return chartOption;
      } catch (error) {
        console.error("方法3解析失败:", error.message);
      }
    }
    
    console.error("无法从模型响应中提取有效的JSON配置，使用默认配置");
    console.error("响应内容:", content);
    
    // 返回一个基本的默认图表配置
    return createDefaultChartOption(table);
  } catch (error) {
    console.error("转换表格为ECharts配置时出错:", error);
    return null;
  }
}

// 清理JSON字符串中的常见格式问题
function cleanJsonString(jsonStr: string): string {
  return jsonStr
    // 修复属性名前的空格问题
    .replace(/"\s+([a-zA-Z_][a-zA-Z0-9_]*)"/g, '"$1"')
    // 修复属性名中的空格问题
    .replace(/"\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*"/g, '"$1"')
    // 移除注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    // 修复函数定义（将函数转换为字符串）
    .replace(/function\s*\([^)]*\)\s*\{[^}]*\}/g, '"[Function]"')
    // 移除多余的逗号
    .replace(/,(\s*[}\]])/g, '$1')
    // 标准化空白字符
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 创建默认的图表配置
 */
function createDefaultChartOption(table: string): any {
  console.log("[createDefaultChartOption] 创建默认图表配置");
  
  // 解析表格数据
  const lines = table.trim().split('\n');
  const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);
  const dataRows = lines.slice(2).map(line => 
    line.split('|').map(cell => cell.trim()).filter(cell => cell)
  );
  
  // 提取数据
  const categories = dataRows.map(row => row[0]);
  const values = dataRows.map(row => {
    const value = row[1];
    // 尝试提取数字
    const numMatch = value.match(/[\d,]+/);
    return numMatch ? parseInt(numMatch[0].replace(/,/g, '')) : 0;
  });
  
  // 创建基本的柱状图配置
  return {
    title: {
      text: headers.join(' vs '),
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        rotate: 45,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: function(value: number) {
          if (value >= 1000000000) {
            return (value / 1000000000).toFixed(1) + 'B';
          } else if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          }
          return value.toString();
        }
      }
    },
    series: [{
      name: headers[1] || '数值',
      type: 'bar',
      data: values,
      itemStyle: {
        color: '#5470c6'
      },
      label: {
        show: true,
        position: 'top',
        formatter: function(params: any) {
          const value = params.value;
          if (value >= 1000000000) {
            return (value / 1000000000).toFixed(1) + 'B';
          } else if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          }
          return value.toString();
        }
      }
    }]
  };
}
 
 // 主深度研究图
const deepResearcherBuilder = new StateGraph(AgentState)
  .addNode("planner", planner)
  .addNode("ask_human", askHuman)
  .addNode("analyze_researcher", analyzeResearcher)
  .addNode("final_report_generation", finalReportGeneration)
  
  .addEdge(START, "planner")
  .addConditionalEdges(
    "planner",
    (state: AgentStateType) => {
      // 如果需要澄清，直接结束并返回问题给用户
      if (state.needs_clarification) {
        console.log('planner检测到需要澄清，结束流程');
        return END;
      }
      
      // 否则继续到ask_human节点
      return "ask_human";
    },
    {
      ask_human: "ask_human",
      [END]: END
    }
  )
  .addConditionalEdges(
    "ask_human",
    (state: AgentStateType) => {
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

