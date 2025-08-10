import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import dotenv from "dotenv";
import openai from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { scopeAgentPrompt2 } from "../prompts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const imageData = fs.readFileSync(path.join(__dirname, '../agent分析思路_长图.jpg'));

const client = new ChatOpenAI({
      model: "qwen-vl-max-latest",
      apiKey: process.env.ALIBABA_API_KEY!,
      configuration: {
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
    })

console.log(await client.invoke([
  new SystemMessage({
    content: scopeAgentPrompt2,
  }),
  new HumanMessage({
    content: [
      {
        type: "text",
        text: "我是门店店长，想了解最近3个月的销售情况，包括各个渠道的表现如何？",
      },
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imageData.toString("base64")}`,
        },
      },
    ],
  }),
]))
