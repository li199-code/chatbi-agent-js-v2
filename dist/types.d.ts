import { BaseMessage } from "@langchain/core/messages";
export interface Message {
    id: string;
    type: "human" | "ai" | "system";
    content: string | any[];
}
export interface ToolCall {
    id: string;
    name: string;
    args: Record<string, any>;
}
export declare const AgentState: import("@langchain/langgraph").AnnotationRoot<{
    messages: import("@langchain/langgraph").BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
    normalized_questions: import("@langchain/langgraph").BinaryOperatorAggregate<string[], string[]>;
    chatbi_analyze_results: import("@langchain/langgraph").BinaryOperatorAggregate<ChatbiAnalyzeResult[], ChatbiAnalyzeResult[]>;
    research_brief: import("@langchain/langgraph").BinaryOperatorAggregate<string, string>;
    supervisor_messages: import("@langchain/langgraph").BinaryOperatorAggregate<BaseMessage[], BaseMessage[]>;
    notes: import("@langchain/langgraph").BinaryOperatorAggregate<any[], any[]>;
    final_report: import("@langchain/langgraph").BinaryOperatorAggregate<string, string>;
    raw_notes: import("@langchain/langgraph").BinaryOperatorAggregate<string[], string[]>;
    singleNormalizedQuestionAnalyzeResult: import("@langchain/langgraph").BinaryOperatorAggregate<SingleNormalizedQuestionAnalyzeResult[], SingleNormalizedQuestionAnalyzeResult[]>;
    dimensionTasks: import("@langchain/langgraph").BinaryOperatorAggregate<DimensionTask[], DimensionTask[]>;
    currentTaskIndex: import("@langchain/langgraph").BinaryOperatorAggregate<number, number>;
}>;
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
export interface AnalysisResponse {
    title: string;
    data_table: string;
    findings: string;
    conclusion: string;
}
export interface ChatbiAnalyzeResult {
    success: boolean;
    data?: {
        total: any;
        drilldown: SingleDimensionDrillDown[];
        impactFactorProperties: any;
    };
    query: string;
    timestamp: string;
    error?: string;
}
export interface SingleNormalizedQuestionAnalyzeResult {
    question: string;
    analyzeResult: any;
}
export interface DimensionTask {
    resultIndex: number;
    dimensionIndex: number;
    result: any;
    dimension: SingleDimensionDrillDown;
}
