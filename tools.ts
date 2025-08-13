import fs from "fs/promises";
import { z } from "zod";
import path from "path";
import axios from "axios";
import { tool } from "@langchain/core/tools";
import dotenv from "dotenv";
import type { SingleDimensionDrillDown } from "./types";
dotenv.config();

// JSON转XML的辅助函数 - 专门为ChatBI指标数据设计
function jsonToXml(obj: any, rootName: string = 'chatbi_indicators'): string {
  function escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
  
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<${rootName}>\n`;
  
  // 遍历每个业务领域
  for (const [domain, data] of Object.entries(obj)) {
    xml += `  <domain name="${escapeXml(domain)}">\n`;
    
    // 处理指标
    if (data && typeof data === 'object' && '指标' in data) {
      xml += `    <indicators>\n`;
      const indicators = (data as any)['指标'];
      if (Array.isArray(indicators)) {
        indicators.forEach(indicator => {
          xml += `      <indicator>${escapeXml(indicator)}</indicator>\n`;
        });
      }
      xml += `    </indicators>\n`;
    }
    
    // 处理维度
    if (data && typeof data === 'object' && '维度' in data) {
      xml += `    <dimensions>\n`;
      const dimensions = (data as any)['维度'];
      if (Array.isArray(dimensions)) {
        dimensions.forEach(dimension => {
          xml += `      <dimension>${escapeXml(dimension)}</dimension>\n`;
        });
      }
      xml += `    </dimensions>\n`;
    }
    
    xml += `  </domain>\n`;
  }
  
  xml += `</${rootName}>`;
  return xml;
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

      const { drilldown, total, impactFactorProperties } = analyzeRet.data;

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
          negative: negative.slice(0, 10),
          positive: positive.slice(0, 10),
          初步分析草稿: ""
        };
      });


      return {
        success: true,
        data: {
          total,
          drilldown:normalizedDrilldown,
          impactFactorProperties
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
      const folder = path.resolve(process.cwd(), "reports");
      await fs.mkdir(folder, { recursive: true });

      const filePath = path.join(folder, input.fileName);
      await fs.writeFile(filePath, input.content, "utf-8");
      return "保存成功"
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
