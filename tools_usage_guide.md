# ChatBI 工具使用指南

本文档介绍如何单独调用 `tools.ts` 中定义的工具函数。

## 工具概览

`tools.ts` 文件导出了三个主要工具：

1. **chatbiAskTool** - ChatBI 数据查询工具
2. **chatbiAnalyzeTool** - ChatBI 数据分析工具  
3. **saveFile** - 文件保存工具

## 环境配置

在使用工具前，需要在 `.env` 文件中配置以下环境变量：

```env
CHATBI_DOMAIN=你的ChatBI域名
CHATBI_TOKEN=你的ChatBI访问令牌
```

## 工具详细说明

### 1. chatbiAskTool - 数据查询工具

**功能**: 通过 ChatBI API 获取数据查询结果

**参数**:
- `query` (string): 查询描述，说明需要获取什么数据

**返回格式**:
```typescript
{
  success: boolean,
  data: any, // 成功时为数组，每个元素代表一个数据项
  query: string,
  timestamp: string
}
```

**使用示例**:
```typescript
import { chatbiAskTool } from "./tools";

const result = await chatbiAskTool.invoke({
  query: "查询最近一个月的销售数据"
});

console.log(result);
```

### 2. chatbiAnalyzeTool - 数据分析工具

**功能**: 通过 ChatBI 归因接口获取影响因素分析

**参数**:
- `query` (string): 查询描述，说明要分析的问题

**返回格式**:
```typescript
{
  success: boolean,
  data: {
    total: any, // 问题结果总计
    drilldown: Array<{ // 影响的维度及其影响程度（前5个）
      dimension: string,
      negative: any[], // 负面影响因素（前20个）
      positive: any[]  // 正面影响因素（前20个）
    }>,
    impactFactorProperties: any // 影响的指标
  },
  query: string,
  timestamp: string
}
```

**使用示例**:
```typescript
import { chatbiAnalyzeTool } from "./tools";

const result = await chatbiAnalyzeTool.invoke({
  query: "分析销售额下降的原因"
});

console.log(result);
```

### 3. saveFile - 文件保存工具

**功能**: 将内容保存为 Markdown 文件到 `reports` 目录

**参数**:
- `fileName` (string): 文件名
- `content` (string): 文件内容

**返回**: "保存成功" 或 "保存失败"

**使用示例**:
```typescript
import { saveFile } from "./tools";

const result = await saveFile.invoke({
  fileName: "sales_report.md",
  content: "# 销售报告\n\n## 数据分析\n\n销售额同比增长 15%"
});

console.log(result); // "保存成功"
```

## 完整使用示例

参考 `test_tools.ts` 文件，它展示了如何完整地测试所有工具：

```bash
# 运行测试
npx tsx test_tools.ts
```

## 在 LangChain Agent 中使用

这些工具也可以直接在 LangChain Agent 中使用：

```typescript
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { chatbiAskTool, chatbiAnalyzeTool, saveFile } from "./tools";

const tools = [chatbiAskTool, chatbiAnalyzeTool, saveFile];
const agent = createReactAgent({ llm, tools, prompt });
```

## 错误处理

所有工具都包含错误处理机制：

- 网络请求失败时会返回 `success: false` 和错误信息
- 文件保存失败时会返回 "保存失败"
- 建议在调用时使用 try-catch 包装

```typescript
try {
  const result = await chatbiAskTool.invoke({ query: "你的查询" });
  if (result.success) {
    // 处理成功结果
    console.log(result.data);
  } else {
    // 处理错误
    console.error(result.error);
  }
} catch (error) {
  console.error("工具调用异常:", error);
}
```

## 注意事项

1. 确保 `.env` 文件中的 ChatBI 配置正确
2. `chatbiAnalyzeTool` 会先调用查询接口获取 logicform，再调用分析接口
3. `saveFile` 会自动创建 `reports` 目录
4. 所有工具都会返回时间戳用于追踪调用时间