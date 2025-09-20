import { generateChart, resetSessionFolder } from "../tools";

// 模拟 createDefaultChartOption 函数
function createDefaultChartOption(table: string): any {
  console.log("[createDefaultChartOption] 创建默认图表配置");
  
  // 解析表格数据
  const lines = table.trim().split('\n');
  const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);
  const dataRows = lines.slice(2).map(line => 
    line.split('|').map(cell => cell.trim()).filter(cell => cell)
  );
  
  // 提取数据
  const categories = dataRows.map(row => row[0]);
  const values = dataRows.map(row => {
    const value = row[1];
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

async function testDefaultChart() {
  console.log("=== 测试默认图表配置 ===\n");

  // 重置会话文件夹
  resetSessionFolder();

  // 模拟一个表格
  const sampleTable = `| 维度 | 数值 |
|------|------|
| A类产品 | 1000 |
| B类产品 | 2000 |
| C类产品 | 1500 |`;

  console.log("测试表格:");
  console.log(sampleTable);

  // 生成默认图表配置
  const defaultOption = createDefaultChartOption(sampleTable);
  console.log("\n默认图表配置:");
  console.log(JSON.stringify(defaultOption, null, 2));

  // 使用默认配置生成图表
  console.log("\n生成图表...");
  try {
    const result = await generateChart.invoke({
      echartsOption: defaultOption,
      fileName: "default_chart_test",
      width: 800,
      height: 600
    });

    console.log("图表生成结果:", result);

    if (result.success) {
      console.log("✅ 默认图表生成成功");
      console.log("文件路径:", result.filePath);
    } else {
      console.log("❌ 默认图表生成失败");
    }
  } catch (error) {
    console.error("❌ 测试过程中出错:", error);
  }

  // 测试空数据的情况
  console.log("\n=== 测试空数据表格 ===");
  const emptyTable = `| 维度 | 数值 |
|------|------|`;

  const emptyOption = createDefaultChartOption(emptyTable);
  console.log("空数据图表配置:");
  console.log(JSON.stringify(emptyOption, null, 2));

  try {
    const result2 = await generateChart.invoke({
      echartsOption: emptyOption,
      fileName: "empty_chart_test",
      width: 800,
      height: 600
    });

    console.log("空数据图表生成结果:", result2);
  } catch (error) {
    console.error("❌ 空数据测试过程中出错:", error);
  }
}

testDefaultChart().catch(console.error);