import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { ChatDeepSeek } from "@langchain/deepseek";
import { getBufferString } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

// TypeScript类型定义
interface AgentState {
  messages: BaseMessage[];
  supervisor_messages?: BaseMessage[];
  research_brief?: string;
  raw_notes?: string[];
  notes?: string[];
  final_report?: string;
}

interface Configuration {
  allow_clarification?: boolean;
  research_model?: string;
  research_model_max_tokens?: number;
  max_structured_output_retries?: number;
  openai_api_key?: string;
  anthropic_api_key?: string;
}

interface RunnableConfig {
  configurable?: Configuration;
}

interface Command {
  goto: "write_research_brief" | "__end__";
  update?: {
    messages: BaseMessage[];
  };
}

// 定义ClarifyWithUser结构化输出的schema
const ClarifyWithUserSchema = z.object({
  need_clarification: z.boolean().describe("Whether the user needs to be asked a clarifying question."),
  question: z.string().describe("A question to ask the user to clarify the report scope"),
  verification: z.string().describe("Verify message that we will start research after the user has provided the necessary information.")
});

type ClarifyWithUserResponse = z.infer<typeof ClarifyWithUserSchema>;

// 获取今天的日期字符串
function getTodayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// 获取模型的API密钥
function getApiKeyForModel(modelName: string, config: RunnableConfig): string | null {
  if (modelName.startsWith("openai:")) {
    return config.configurable?.openai_api_key || process.env.OPENAI_API_KEY || null;
  } else if (modelName.startsWith("anthropic:")) {
    return config.configurable?.anthropic_api_key || process.env.ANTHROPIC_API_KEY || null;
  }
  return null;
}

// 初始化聊天模型
function initChatModel(modelName: string, maxTokens: number, apiKey: string): BaseChatModel {
  if (modelName.startsWith("openai:")) {
    const model = modelName.replace("openai:", "");
    return new ChatOpenAI({
      model: model,
      maxTokens: maxTokens,
      openAIApiKey: apiKey,
      temperature: 0
    });
  } else if (modelName.startsWith("anthropic:")) {
    const model = modelName.replace("anthropic:", "");
    return new ChatAnthropic({
      model: model,
      maxTokens: maxTokens,
      anthropicApiKey: apiKey,
      temperature: 0
    });
  }
  throw new Error(`Unsupported model: ${modelName}`);
}

// clarify_with_user_instructions 提示模板
const clarifyWithUserInstructions = `
These are the messages that have been exchanged so far from the user asking for the report:
<Messages>
{messages}
</Messages>

Today's date is {date}.

Assess whether you need to ask a clarifying question, or if the user has already provided enough information for you to start research.
IMPORTANT: If you can see in the messages history that you have already asked a clarifying question, you almost always do not need to ask another one. Only ask another question if ABSOLUTELY NECESSARY.

If there are acronyms, abbreviations, or unknown terms, ask the user to clarify.
If you need to ask a question, follow these guidelines:
- Be concise while gathering all necessary information
- Make sure to gather all the information needed to carry out the research task in a concise, well-structured manner.
- Use bullet points or numbered lists if appropriate for clarity. Make sure that this uses markdown formatting and will be rendered correctly if the string output is passed to a markdown renderer.
- Don't ask for unnecessary information, or information that the user has already provided. If you can see that the user has already provided the information, do not ask for it again.

Respond in valid JSON format with these exact keys:
"need_clarification": boolean,
"question": "<question to ask the user to clarify the report scope>",
"verification": "<verification message that we will start research>"

If you need to ask a clarifying question, return:
"need_clarification": true,
"question": "<your clarifying question>",
"verification": ""

If you do not need to ask a clarifying question, return:
"need_clarification": false,
"question": "",
"verification": "<acknowledgement message that you will now start research based on the provided information>"

For the verification message when no clarification is needed:
- Acknowledge that you have sufficient information to proceed
- Briefly summarize the key aspects of what you understand from their request
- Confirm that you will now begin the research process
- Keep the message concise and professional
`;

/**
 * LangGraphJS版本的clarify_with_user函数
 * 
 * 这个函数的主要功能是：
 * 1. 检查是否允许澄清（allow_clarification配置）
 * 2. 如果允许，使用LLM分析用户消息，判断是否需要澄清
 * 3. 如果需要澄清，返回澄清问题并结束流程
 * 4. 如果不需要澄清，返回确认消息并继续到下一步
 * 
 * @param state - 代理状态，包含messages等
 * @param config - 运行配置，包含模型设置和API密钥
 * @returns Promise<Command> - 返回Command对象，指示下一步操作
 */
export async function clarifyWithUser(
  state: AgentState, 
  config: RunnableConfig
): Promise<Command> {
  // 从配置中获取可配置参数
  const configurable = config.configurable || {};
  const allowClarification = configurable.allow_clarification !== false; // 默认为true
  
  // 如果不允许澄清，直接跳转到写研究简报
  if (!allowClarification) {
    return {
      goto: "write_research_brief"
    };
  }
  
  const messages = state.messages || [];
  
  // 模型配置
  const researchModel = configurable.research_model || "openai:gpt-4";
  const researchModelMaxTokens = configurable.research_model_max_tokens || 10000;
  const maxStructuredOutputRetries = configurable.max_structured_output_retries || 3;
  const apiKey = getApiKeyForModel(researchModel, config);
  
  if (!apiKey) {
    throw new Error(`No API key found for model: ${researchModel}`);
  }
  
  // 初始化模型
  const model = initChatModel(researchModel, researchModelMaxTokens, apiKey);
  
  // 准备提示内容
  const messagesBuffer = getBufferString(messages);
  const todayStr = getTodayStr();
  const promptContent = clarifyWithUserInstructions
    .replace("{messages}", messagesBuffer)
    .replace("{date}", todayStr);
  
  // 重试逻辑
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxStructuredOutputRetries; attempt++) {
    try {
      // 调用模型获取结构化输出
      const response = await model.withStructuredOutput(ClarifyWithUserSchema).invoke([
        new HumanMessage({ content: promptContent })
      ]) as ClarifyWithUserResponse;
      
      // 根据响应决定下一步操作
      if (response.need_clarification) {
        return {
          goto: "__end__",
          update: {
            messages: [new AIMessage({ content: response.question })]
          }
        };
      } else {
        return {
          goto: "write_research_brief",
          update: {
            messages: [new AIMessage({ content: response.verification })]
          }
        };
      }
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt + 1} failed:`, error);
      
      // 如果不是最后一次尝试，继续重试
      if (attempt < maxStructuredOutputRetries - 1) {
        // 添加指数退避延迟
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        continue;
      }
    }
  }
  
  // 如果所有重试都失败了，抛出错误
  throw new Error(
    `Failed to get structured output after ${maxStructuredOutputRetries} attempts. Last error: ${lastError?.message}`
  );
}

// 导出相关类型和常量
export { 
  ClarifyWithUserSchema, 
  clarifyWithUserInstructions,
  type AgentState,
  type Configuration,
  type RunnableConfig,
  type Command,
  type ClarifyWithUserResponse
};

// 使用示例和完整的集成代码
/*
使用示例：

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { clarifyWithUser, type AgentState } from "./clarify_with_user";
import { HumanMessage } from "@langchain/core/messages";

// 定义状态reducer
const stateReducer = {
  messages: {
    value: (x: any[], y: any[]) => x.concat(y),
    default: () => []
  },
  research_brief: {
    value: (x: string, y: string) => y || x,
    default: () => ""
  }
};

// 创建状态图
const builder = new StateGraph<AgentState>(stateReducer);

// 添加节点
builder.addNode("clarify_with_user", clarifyWithUser);
// builder.addNode("write_research_brief", writeResearchBrief); // 需要另外实现

// 添加边
builder.addEdge(START, "clarify_with_user");
// 条件边将在clarifyWithUser函数内部通过Command返回值处理

// 编译图
const graph = builder.compile();

// 运行示例
async function runExample() {
  try {
    const result = await graph.invoke(
      {
        messages: [
          new HumanMessage({ content: "I want to research about AI trends in 2024" })
        ]
      },
      {
        configurable: {
          research_model: "openai:gpt-4",
          research_model_max_tokens: 10000,
          allow_clarification: true,
          max_structured_output_retries: 3,
          openai_api_key: process.env.OPENAI_API_KEY
        }
      }
    );
    
    console.log("Result:", result);
  } catch (error) {
    console.error("Error:", error);
  }
}

// runExample();
```

安装依赖：
```bash
npm install @langchain/core @langchain/openai @langchain/anthropic @langchain/langgraph zod
```

环境变量设置：
```bash
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```
*/