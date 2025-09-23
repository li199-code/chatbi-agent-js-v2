import { echartOptionPrompt } from "./prompts";
import { generateChart } from "./tools";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import fs from "fs/promises";

/**
 * 处理报告中的表格，将"研究计划回顾"章节中的表格转换为图表
 */
export async function processTablesInReport(reportContent: string, model: any): Promise<string> {
  console.log("[processTablesInReport] 开始处理报告中的表格");
  
  // 查找"研究计划回顾"章节
  // 匹配从"## 研究计划回顾"开始到下一个同级或更高级标题（## 开头）或文件结尾
  const sectionRegex = /##\s*研究计划回顾[\s\S]*?(?=\n##\s|$)/i;
  const sectionMatch = reportContent.match(sectionRegex);
  
  if (!sectionMatch) {
    console.log("未找到'研究计划回顾'章节");
    return reportContent;
  }
  
  const sectionContent = sectionMatch[0];
  console.log("找到研究计划回顾章节");
  
  // 查找章节中的markdown表格
  // 匹配完整的markdown表格：表头 + 分隔线 + 数据行
  const tableRegex = /\|[^|\n]*\|[^\n]*\n\|[-\s|:]*\|[^\n]*\n(?:\|[^|\n]*\|[^\n]*\n)*/g;
  const tables = sectionContent.match(tableRegex);
  
  if (!tables || tables.length === 0) {
    console.log("在研究计划回顾章节中未找到表格");
    return reportContent;
  }
  
  console.log(`找到 ${tables.length} 个表格`);
  
  let updatedContent = reportContent;
  
  // 处理每个表格
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    console.log(`处理第 ${i + 1} 个表格`);
    
    try {
      // 使用重试机制生成图表
      const chartResult = await generateChartWithRetry(table as string, model, `research_plan_chart_${i + 1}`, 800, 500);
      
      if (chartResult.success && chartResult.fileName) {
        console.log(`图表 ${i + 1} 生成成功: ${chartResult.fileName}`);
        
        // 在原表格后插入图片引用
        // 由于markdown文件和图片都在同一个时间戳文件夹中，只需要文件名即可
        const chartMarkdown = `\n\n![研究计划图表](${chartResult.fileName})\n\n`;
        updatedContent = updatedContent.replace(table as string, table + chartMarkdown);
      } else {
        console.error(`图表 ${i + 1} 生成失败:`, chartResult.error);
      }
    } catch (error) {
      console.error(`处理表格 ${i + 1} 时出错:`, error);
    }
  }
  
  return updatedContent;
}

/**
 * 带重试机制的图表生成函数
 * @param table 表格内容
 * @param model 大模型实例
 * @param fileName 文件名
 * @param width 图表宽度
 * @param height 图表高度
 * @param maxRetries 最大重试次数，默认3次
 */
async function generateChartWithRetry(
  table: string, 
  model: any, 
  fileName: string, 
  width: number = 800, 
  height: number = 500,
  maxRetries: number = 3
): Promise<any> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[generateChartWithRetry] 第 ${attempt} 次尝试生成图表: ${fileName}`);
    
    try {
      // 第一步：生成ECharts配置
      const chartOption = await convertTableToEChartsOptionWithRetry(table, model, attempt);
      
      if (!chartOption) {
        throw new Error(`第 ${attempt} 次尝试：无法生成有效的ECharts配置`);
      }
      
      // 第二步：生成图表文件
      const chartResult = await generateChart.invoke({
        echartsOption: chartOption,
        fileName: fileName,
        width: width,
        height: height
      });
      
      if (!chartResult.success) {
        throw new Error(`第 ${attempt} 次尝试：图表生成失败 - ${chartResult.error}`);
      }
      
      // 第三步：验证生成的图片文件
      const isValid = await validateGeneratedImage(chartResult.filePath as string);
      
      if (!isValid) {
        throw new Error(`第 ${attempt} 次尝试：生成的图片文件无效或为空白`);
      }
      
      console.log(`[generateChartWithRetry] 第 ${attempt} 次尝试成功生成图表: ${fileName}`);
      return chartResult;
      
    } catch (error) {
      lastError = error;
      console.error(`[generateChartWithRetry] 第 ${attempt} 次尝试失败:`, error instanceof Error ? error.message : String(error));
      
      if (attempt === maxRetries) {
        console.error(`[generateChartWithRetry] 所有 ${maxRetries} 次尝试均失败，放弃生成图表: ${fileName}`);
        break;
      }
      
      // 等待一段时间后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  return {
    success: false,
    error: `经过 ${maxRetries} 次重试后仍然失败: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    fileName: null
  };
}

/**
 * 带重试逻辑的表格转ECharts配置函数
 */
async function convertTableToEChartsOptionWithRetry(table: string, model: any, attempt: number): Promise<any> {
  console.log(`[convertTableToEChartsOptionWithRetry] 第 ${attempt} 次尝试转换表格为ECharts配置`);
  
  // 根据尝试次数调整提示词策略
  let prompt = echartOptionPrompt(table);
  
  if (attempt > 1) {
    prompt += `\n\n注意：这是第 ${attempt} 次尝试，请确保返回的JSON格式完全正确，避免语法错误。`;
  }
  
  if (attempt === 3) {
    prompt += `\n\n重要：这是最后一次尝试，请使用最简单可靠的图表配置，确保JSON格式绝对正确。`;
  }

  try {
    const response = await model.invoke([
      new SystemMessage({
        content: "你是一个数据可视化专家，擅长将表格数据转换为美观的ECharts图表配置。请确保返回的JSON格式完全正确。"
      }),
      new HumanMessage({
        content: prompt
      })
    ]);
    
    const content = response.content as string;
    console.log(`模型响应内容 (第${attempt}次):`, content.substring(0, 500) + "...");
    
    // 尝试多种方式提取和清理JSON配置
    let chartOption = null;
    
    // 方法1: 寻找代码块中的JSON
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        let jsonStr = codeBlockMatch[1];
        // 清理常见的JSON格式问题
        jsonStr = cleanJsonString(jsonStr);
        chartOption = JSON.parse(jsonStr);
        console.log(`成功通过方法1提取JSON配置 (第${attempt}次)`);
        return chartOption;
      } catch (error) {
        console.log(`方法1解析失败 (第${attempt}次)，尝试方法2:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    // 方法2: 寻找完整的JSON对象（最外层大括号匹配）
    const jsonMatch = content.match(/\{(?:[^{}]|{[^{}]*})*\}/);
    if (jsonMatch && jsonMatch[0]) {
      try {
        let jsonStr = jsonMatch[0];
        // 清理常见的JSON格式问题
        jsonStr = cleanJsonString(jsonStr);
        chartOption = JSON.parse(jsonStr);
        console.log(`成功通过方法2提取JSON配置 (第${attempt}次)`);
        return chartOption;
      } catch (error) {
        console.log(`方法2解析失败 (第${attempt}次)，尝试方法3:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    // 方法3: 清理内容后再尝试解析
    let cleanedContent = content
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .replace(/^[^{]*/, '')  // 移除开头的非JSON内容
      .replace(/[^}]*$/, ''); // 移除结尾的非JSON内容
    
    if (cleanedContent.startsWith('{') && cleanedContent.endsWith('}')) {
      try {
        cleanedContent = cleanJsonString(cleanedContent);
        chartOption = JSON.parse(cleanedContent);
        console.log(`成功通过方法3提取JSON配置 (第${attempt}次)`);
        return chartOption;
      } catch (error) {
        console.error(`方法3解析失败 (第${attempt}次):`, error instanceof Error ? error.message : String(error));
      }
    }
    
    console.error(`无法从模型响应中提取有效的JSON配置 (第${attempt}次)，使用默认配置`);
    console.error("响应内容:", content);
    
    // 如果是最后一次尝试，返回默认配置
    if (attempt === 3) {
      return createDefaultChartOption(table);
    }
    
    return null;
  } catch (error) {
    console.error(`转换表格为ECharts配置时出错 (第${attempt}次):`, error);
    
    // 如果是最后一次尝试，返回默认配置
    if (attempt === 3) {
      return createDefaultChartOption(table);
    }
    
    return null;
  }
}

/**
 * 验证生成的图片文件是否有效
 */
async function validateGeneratedImage(filePath: string): Promise<boolean> {
  try {
    // 检查文件是否存在
    const stats = await fs.stat(filePath);
    
    // 检查文件大小（空白图片通常很小，小于1KB可能有问题）
    if (stats.size < 1024) {
      console.warn(`[validateGeneratedImage] 图片文件过小: ${stats.size} bytes`);
      return false;
    }
    
    // 检查文件是否为PNG格式（简单检查文件头）
    const buffer = await fs.readFile(filePath);
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    if (!buffer.subarray(0, 8).equals(pngSignature)) {
      console.warn(`[validateGeneratedImage] 文件不是有效的PNG格式`);
      return false;
    }
    
    console.log(`[validateGeneratedImage] 图片文件验证通过: ${filePath} (${stats.size} bytes)`);
    return true;
    
  } catch (error) {
    console.error(`[validateGeneratedImage] 验证图片文件时出错:`, error);
    return false;
  }
}

// 清理JSON字符串中的常见格式问题
function cleanJsonString(jsonStr: string): string {
  return jsonStr
    // 修复属性名前的空格问题
    .replace(/"\s+([a-zA-Z_][a-zA-Z0-9_]*)"/g, '"$1"')
    // 修复属性名中的空格问题
    .replace(/"\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*"/g, '"$1"')
    // 移除注释
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    // 修复函数定义（将函数转换为字符串）
    .replace(/function\s*\([^)]*\)\s*\{[^}]*\}/g, '"[Function]"')
    // 移除多余的逗号
    .replace(/,(\s*[}\]])/g, '$1')
    // 标准化空白字符
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 创建默认的图表配置
 */
function createDefaultChartOption(table: string): any {
  console.log("[createDefaultChartOption] 创建默认图表配置");
  
  // 解析表格数据
  const lines = table.trim().split('\n');
  if (lines.length < 3) {
    console.error("表格格式不正确，行数不足");
    return null;
  }
  
  const headers = lines[0]?.split('|').map(h => h.trim()).filter(h => h) || [];
  const dataRows = lines.slice(2).map(line => 
    line.split('|').map(cell => cell.trim()).filter(cell => cell)
  );
  
  if (headers.length === 0 || dataRows.length === 0) {
    console.error("无法解析表格数据");
    return null;
  }
  
  // 提取数据
  const categories = dataRows.map(row => row[0] || '');
  const values = dataRows.map(row => {
    const value = row[1] || '';
    // 尝试提取数字
    const numMatch = value.match(/[\d,]+/);
    return numMatch ? parseInt(numMatch[0].replace(/,/g, '')) : 0;
  });
  
  // 创建基本的柱状图配置
  return {
    title: {
      text: headers.join(' vs '),
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold'
      }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        rotate: 45,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: function(value: number) {
          if (value >= 1000000000) {
            return (value / 1000000000).toFixed(1) + 'B';
          } else if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          }
          return value.toString();
        }
      }
    },
    series: [{
      name: headers[1] || '数值',
      type: 'bar',
      data: values,
      itemStyle: {
        color: '#5470c6'
      },
      label: {
        show: true,
        position: 'top',
        formatter: function(params: any) {
          const value = params.value;
          if (value >= 1000000000) {
            return (value / 1000000000).toFixed(1) + 'B';
          } else if (value >= 1000000) {
            return (value / 1000000).toFixed(1) + 'M';
          } else if (value >= 1000) {
            return (value / 1000).toFixed(1) + 'K';
          }
          return value.toString();
        }
      }
    }]
  };
}