import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import dotenv from "dotenv";

dotenv.config();

const client = new ChatOpenAI({
      model: "kimi-k2-0711-preview",
      apiKey: process.env.MOONSHOT_API_KEY!,
      configuration: {
        baseURL: "https://api.moonshot.cn/v1",
      },
    })

console.log(await client.invoke([
  new HumanMessage({
    content: "你好",
  }),
]))
