console.log("Loading types.ts...");

import { Annotation } from "@langchain/langgraph";
import { BaseMessage } from "@langchain/core/messages";

// 使用LangChain消息对象格式
export interface Message {
  id: string;
  type: "human" | "ai" | "system";
  content: string | any[];
}

// 工具调用接口
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

// 状态接口定义 - 使用LangGraph Annotation格式
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  steps: Annotation<Record<string, any>>({
    reducer: (x, y) => y ?? x ?? {},
    default: () => {},
  }),
  plan: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  planRet: Annotation<any>({
    reducer: (x, y) => y ?? x ?? {},
    default: () => {},
  }),
  yoymom_questions: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
  general_questions: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
  chatbi_analyze_results: Annotation<ChatbiAnalyzeResult[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
  general_questions_result: Annotation<any[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
  notes: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  final_report: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  raw_notes: Annotation<string[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  singleNormalizedQuestionAnalyzeResult: Annotation<SingleNormalizedQuestionAnalyzeResult[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
  clarification_questions: Annotation<string[]>({
    reducer: (x, y) => y ?? x ?? [],
    default: () => [],
  }),
  needs_clarification: Annotation<boolean>({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),
});

export interface SupervisorState {
  supervisor_messages: Message[];
  research_iterations: number;
  research_brief: string;
  notes: string[];
  raw_notes: string[];
}

export interface ResearcherState {
  researcher_messages: Message[];
  research_topic: string;
  tool_call_iterations: number;
}

export interface SingleDimensionDrillDown {
  dimension: any;
  negative: any[];
  positive: any[];
  初步分析草稿: string;
}

// 分析结果响应接口
export interface AnalysisResponse {
  title: string;
  data_table: string;
  findings: string;
  conclusion: string;
}

export interface ChatbiAnalyzeResult {
  success: boolean;
  data?: {
    total?: any;
    drilldown?: SingleDimensionDrillDown[];
    impactFactorProperties?: any;
  };
  query: string;
  timestamp: string;
  error?: string
}

export interface SingleNormalizedQuestionAnalyzeResult {
  question: string;
  analyzeResult: any;
}

