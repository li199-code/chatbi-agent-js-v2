import fs from "fs/promises";
import { z } from "zod";
import path from "path";
import axios from "axios";
import { tool } from "@langchain/core/tools";
import dotenv from "dotenv";
import type { SingleDimensionDrillDown } from "./types";
import { GlobalFonts, createCanvas } from "@napi-rs/canvas";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import moment from "moment";
dotenv.config();

// 全局变量存储当前会话的时间戳文件夹
let currentSessionFolder: string | null = null;

/**
 * 获取或创建当前会话的时间戳文件夹
 * 格式: YYYY-MM-DD-HH:MM:SS
 */
function getCurrentSessionFolder(): string {
  if (!currentSessionFolder) {
    // 使用连字符替代冒号，以兼容Windows文件系统
    const timestamp = moment().format("YYYY-MM-DD-HH-mm-ss");
    currentSessionFolder = timestamp;
  }
  return currentSessionFolder;
}

/**
 * 重置会话文件夹（用于新的报告生成会话）
 */
export function resetSessionFolder(): void {
  currentSessionFolder = null;
}

/**
 * 获取当前会话的reports目录路径
 */
export function getCurrentReportsDir(): string {
  const sessionFolder = getCurrentSessionFolder();
  return path.join(process.cwd(), "reports", sessionFolder);
}

export const chatbiAskTool = tool(
  async (input: any) => {
    try {
      // 构建请求参数
      const requestBody = {
        ask: input.query,
        exec_logicform: true
      };

      const domain = process.env.CHATBI_DOMAIN
      const token = process.env.CHATBI_TOKEN

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await axios.post(`${domain}/api/v1/ask`, requestBody, {
        headers,
      });

      // 返回格式化的数据
      return {
        success: true,
        data: response.data.result?.slice(0, 10) || 'analyze工具未理解问题',
        query: input.query,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error("ChatBI Ask Tool Error:", error);
      
      return {
        success: false,
        error: error.message,
        query: input.query,
        timestamp: new Date().toISOString(),
      };
    }
  },
  {
    name: "chatbi_ask",
    description: `通过请求ChatBI取数接口获取问题的答案。
    
    参数说明：
    - query: 查询描述，说明需要获取什么数据
    
    返回格式：
    {
      "success": boolean,
      "data": any, // success为true时，data为数组，里面的每个元素代表一个数据项
      "query": string,
      "timestamp": string
    }`,
    schema: z.object({
      query: z.string().describe("查询描述，说明需要获取什么数据")
    }),
  }
);

export const chatbiAnalyzeTool = tool(
  async (input: any) => {
    try {
      // 两步骤，先获取lf，然后归因

      // 构建请求参数
      const requestBody = {
        ask: input.query,
      };

      const domain = process.env.CHATBI_DOMAIN
      const token = process.env.CHATBI_TOKEN

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await axios.post(`${domain}/api/v1/ask`, requestBody, {
        headers,
      });

      const lf = Array.isArray(response.data?.logicform)? response.data.logicform[0] : response.data.logicform;


      const analyzeRet = await axios.post(`${domain}/api/v1/analyzer/analyze2`, { logicform: lf }, {
        headers,
      })

      const { drilldown, total } = analyzeRet.data;

      // 不要在报告中体现贡献度
      const itemMapFunc = (item) => {
        const newItem = JSON.parse(JSON.stringify(item));
        delete newItem.contrib;
        delete newItem.contrib_abs;
        return newItem;
      }

      // drilldown做一些处理
      // 取前五个
      if (!Array.isArray(drilldown) || drilldown.length < 1){
        throw new Error(`${input.query} 没有可分析维度`);
      }
      const topNdimensions = drilldown.slice(0, 3);
      const normalizedDrilldown: SingleDimensionDrillDown[] = topNdimensions.map(item => {
        const { dimension, dimensionProperty, negative, positive, result } = item;
        
        return {
          dimension,
          negative: negative.slice(0, 10).map(itemMapFunc),
          positive: positive.slice(0, 10).map(itemMapFunc),
          初步分析草稿: ""
        };
      });

      // total的positive和negative删除了
      if (total) {
        delete total.positive;
        delete total.negative;
      }


      return {
        success: true,
        data: {
          total,
          drilldown:normalizedDrilldown
        },
        query: input.query,
        timestamp: new Date().toISOString(),
      };

    } catch (error: any) {
      
      return {
        success: false,
        error: error.message,
        query: input.query,
        timestamp: new Date().toISOString(),
      };
    }
  },
  {
    name: "chatbi_analyze",
    description: `通过请求ChatBI归因接口获取对问题结果造成影响的维度或指标及其影响程度数据。
    
    参数说明：
    - query: 查询描述，说明要询问的问题。
    
    返回格式：
    {
      "success": boolean,
      "data": any, // success为true时，data的drilldown表示影响的维度及其影响程度，total表示问题结果，impactFactorProperties表示影响的指标
      "query": string,
      "timestamp": string
    }`,
    schema: z.object({
      query: z.string().describe("查询描述，说明需要获取什么数据")
    }),
  }
);

export const saveFile = tool(
  async (input: any) => {
    try {
      const folder = getCurrentReportsDir();
      await fs.mkdir(folder, { recursive: true });

      const filePath = path.join(folder, input.fileName);
      await fs.writeFile(filePath, input.content, "utf-8");
      return `保存成功到: ${folder}/${input.fileName}`
    } catch (error) {
      return "保存失败"
    }
  },
  {
    name: "save_report_file",
    description: `保存生成的报告为markdown文件，参数为文件名，返回值为保存成功与否`,
    schema: z.object({
      fileName: z.string().describe("文件名"),
      content: z.string().describe("文件内容")
    }),
  }
)

export const getChatbiAllIndicators = tool(
  async (input: any) => {
    try {
      const domain = process.env.CHATBI_DOMAIN
      const token = process.env.CHATBI_TOKEN

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await axios.get(`${domain}/api/v1/llm/prompts/measurementAndDimension`, {
        headers,
      })

      const data = response.data.prompt;

      // // json转为xml
      // const xml = jsonToXml(data);
      // return xml;

      return JSON.stringify(data)
      
    } catch (error) {
      return "获取指标失败"
    }
  },
  {
    name: "get_chatbi_all_indicators",
    description: `获取ChatBI所有指标和维度
    
    返回格式：
    {
      [schema表名]: {
        指标: [
          指标1,
          指标2,
          ...
        ],
        维度: [
          维度1,
          维度2,
          ...
        ]
      },
      ...
    }
    `,
    schema: z.object({}),
  }
);

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

/**
 * 渲染ECharts图表并保存为PNG文件
 */
async function renderEChartsToFile(
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

export const generateChart = tool(
  async (input: any) => {
    try {
      const { echartsOption, fileName, width = 800, height = 600, theme = "default" } = input;
      
      // 生成文件名（如果未提供）
      const timestamp = moment().format("YYYYMMDD_HHmmss");
      const finalFileName = fileName || `chart_${timestamp}.png`;
      
      // 确保文件名以.png结尾
      const pngFileName = finalFileName.endsWith('.png') ? finalFileName : `${finalFileName}.png`;
      
      // 构建完整的文件路径
      const reportsDir = getCurrentReportsDir();
      await fs.mkdir(reportsDir, { recursive: true });
      const filePath = path.join(reportsDir, pngFileName);
      
      // 渲染并保存图表
      await renderEChartsToFile(echartsOption, filePath, width, height, theme);
      
      return {
        success: true,
        filePath: filePath,
        fileName: pngFileName,
        message: `图表已成功保存到: ${filePath}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error("Generate Chart Error:", error);
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
  {
    name: "generate_chart",
    description: `根据ECharts配置生成图表并保存为PNG文件到/reports文件夹

    参数说明：
    - echartsOption: ECharts配置对象
    - fileName: 可选，文件名（不包含扩展名，会自动添加.png）
    - width: 可选，图表宽度，默认800
    - height: 可选，图表高度，默认600
    - theme: 可选，ECharts主题，默认"default"

    返回格式：
    {
      "success": boolean,
      "filePath": string, // 完整的文件路径
      "fileName": string, // 文件名
      "message": string,
      "timestamp": string
    }`,
    schema: z.object({
      echartsOption: z.any().describe("ECharts配置对象"),
      fileName: z.string().optional().describe("文件名（可选，不包含扩展名）"),
      width: z.number().optional().describe("图表宽度，默认800"),
      height: z.number().optional().describe("图表高度，默认600"),
      theme: z.string().optional().describe("ECharts主题，默认default")
    }),
  }
);
