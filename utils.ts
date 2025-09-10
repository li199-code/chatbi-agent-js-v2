import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenAI } from "@langchain/openai";

import { ChatAlibabaTongyi } from "@langchain/community/chat_models/alibaba_tongyi";
import { ChatMoonshot } from "@langchain/community/chat_models/moonshot";
import dotenv from 'dotenv'
dotenv.config();

export const getChatModel = (model: string) => {
  if (model === "deepseek-chat") {
    return new ChatDeepSeek({
      model: "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY!
    })
  } else if (model === 'deepseek-reasoner') {
    return new ChatDeepSeek({
      model: "deepseek-reasoner",
      apiKey: process.env.DEEPSEEK_API_KEY!
    })
  } else if (model === "qwen") {
    return new ChatAlibabaTongyi({
      model: "qwen3-235b-a22b-instruct-2507",
      // model: "qwen3-max-preview",
      alibabaApiKey: process.env.ALIBABA_API_KEY!
    })
  } else if (model === "qwen-vl") {
    return new ChatOpenAI({
      model: "qwen-vl-max-latest",
      apiKey: process.env.ALIBABA_API_KEY!,
      configuration: {
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
    })
  } else if (model === "kimi") {
    return new ChatOpenAI({
      model: "kimi-k2-0905-preview",
      apiKey: process.env.MOONSHOT_API_KEY!,
      maxTokens: 20000,
      configuration: {
        baseURL: "https://api.moonshot.cn/v1",
      },
    })
  } else if (model === "kimi-thinking") {
    return new ChatOpenAI({
      model: "kimi-thinking-preview",
      apiKey: process.env.MOONSHOT_API_KEY!,
      maxTokens: 20000,
      configuration: {
        baseURL: "https://api.moonshot.cn/v1",
      },
    })
  } else {
    throw new Error(`不支持的模型: ${model}`)
  }
}
