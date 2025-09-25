import { ChatZhipuAI } from "@langchain/community/chat_models/zhipuai";
import { HumanMessage } from "@langchain/core/messages";
import fs from 'fs'
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 把图片转码为base64
const imageData = fs.readFileSync(path.join(__dirname, '../agent分析思路.jpg'));

// Use glm-4
const glm4 = new ChatZhipuAI({
  model: "glm-4v-plus-0111", // Available models:
  temperature: 1,
  zhipuAIApiKey: "xxx", // In Node.js defaults to process.env.ZHIPUAI_API_KEY
});

const messages = [new HumanMessage({
    content: [
        {type: "text", text: "图片内容总结"},
        {type: "image_url", image_url: {
            url: `data:image/jpeg;base64,${imageData.toString("base64")}`
        }}
    ]
})];

console.log('==message', messages)



const res2 = await glm4.invoke(messages);
console.log('res2', res2)
/*
AIMessage {
  text: "Hello! How can I help you today? Is there something you would like to talk about or ask about? I'm here to assist you with any questions you may have.",
}
*/
