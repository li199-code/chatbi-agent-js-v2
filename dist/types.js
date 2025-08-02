console.log("Loading types.ts...");
import { Annotation } from "@langchain/langgraph";
// 状态接口定义 - 使用LangGraph Annotation格式
export const AgentState = Annotation.Root({
    messages: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    normalized_questions: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    chatbi_analyze_results: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    research_brief: Annotation({
        reducer: (x, y) => y ?? x ?? "",
        default: () => "",
    }),
    supervisor_messages: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    notes: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    final_report: Annotation({
        reducer: (x, y) => y ?? x ?? "",
        default: () => "",
    }),
    raw_notes: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    singleNormalizedQuestionAnalyzeResult: Annotation({
        reducer: (x, y) => x.concat(y),
        default: () => [],
    }),
    dimensionTasks: Annotation({
        reducer: (x, y) => y ?? x ?? [],
        default: () => [],
    }),
    currentTaskIndex: Annotation({
        reducer: (x, y) => y ?? x ?? 0,
        default: () => 0,
    }),
});
