import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenAI } from "@langchain/openai";

import { ChatAlibabaTongyi } from "@langchain/community/chat_models/alibaba_tongyi";
import { ChatMoonshot } from "@langchain/community/chat_models/moonshot";
import dotenv from 'dotenv'
dotenv.config();
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import fs from 'fs/promises';
import path from 'path';

// 注册字体（如果字体文件存在）
const __filename = new URL(import.meta.url).pathname;
// 在Windows上修复路径
const currentDir = process.platform === 'win32' 
  ? path.dirname(__filename.substring(1)) // 移除开头的斜杠
  : path.dirname(__filename);
const fontPath = path.join(currentDir, "fonts", "AlibabaPuHuiTi-3-55-Regular.otf");

// 检查字体文件是否存在并注册
import { existsSync } from 'fs';
if (existsSync(fontPath)) {
  try {
    GlobalFonts.registerFromPath(fontPath, "sans-serif");
    console.log("Font registered successfully:", fontPath);
  } catch (error) {
    console.warn("Font registration failed:", error);
  }
} else {
  console.warn("Font file not found, using system fonts:", fontPath);
}

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

export async function renderEChartsToFile(
  echartsOption: EChartsOption,
  filePath: string,
  width = 800,
  height = 600,
  theme = "default"
): Promise<void> {
  // 创建Canvas
  const canvas = createCanvas(width, height) as unknown as HTMLCanvasElement;
  
  // 初始化ECharts实例
  const chart = echarts.init(canvas, theme, {
    devicePixelRatio: 3,
  });

  // 设置平台API（用于图片加载）
  echarts.setPlatformAPI({
    loadImage(src, onload, onerror) {
      const img = new Image();
      img.onload = onload.bind(img);
      img.onerror = onerror.bind(img);
      img.src = src;
      return img;
    },
  });

  // 设置图表选项（禁用动画）
  chart.setOption({
    ...echartsOption,
    animation: false,
  });

  // 生成PNG Buffer
  // @ts-ignore
  const buffer = canvas.toBuffer("image/png");
  
  // 确保目录存在
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  
  // 保存文件
  await fs.writeFile(filePath, buffer);
  
  // 释放资源
  chart.dispose();
}
