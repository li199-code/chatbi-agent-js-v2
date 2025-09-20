import { generateChart, resetSessionFolder } from "../tools";

async function testChartGeneration() {
  console.log("=== 测试图表生成功能 ===\n");

  // 1. 重置会话文件夹
  console.log("1. 重置会话文件夹");
  resetSessionFolder();

  // 2. 创建一个简单的测试图表配置
  const testChartOption = {
    title: {
      text: '测试柱状图',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: ['A', 'B', 'C', 'D', 'E']
    },
    yAxis: {
      type: 'value'
    },
    series: [{
      name: '销售额',
      type: 'bar',
      data: [120, 200, 150, 80, 70],
      itemStyle: {
        color: '#5470c6'
      }
    }]
  };

  console.log("\n2. 生成测试图表");
  try {
    const result = await generateChart.invoke({
      echartsOption: testChartOption,
      fileName: "test_chart",
      width: 800,
      height: 600
    });

    console.log("图表生成结果:", result);

    if (result.success) {
      console.log("✅ 图表生成成功");
      console.log("文件路径:", result.filePath);
      
      // 检查文件是否存在和大小
      const fs = require('fs');
      if (fs.existsSync(result.filePath)) {
        const stats = fs.statSync(result.filePath);
        console.log("文件大小:", stats.size, "字节");
        
        if (stats.size > 1000) {
          console.log("✅ 文件大小正常，图表应该包含内容");
        } else {
          console.log("❌ 文件太小，可能是空图片");
        }
      } else {
        console.log("❌ 文件不存在");
      }
    } else {
      console.log("❌ 图表生成失败:", result.error);
    }
  } catch (error) {
    console.error("❌ 测试过程中出错:", error);
  }

  // 3. 测试另一个不同的图表类型
  console.log("\n3. 生成饼图测试");
  const pieChartOption = {
    title: {
      text: '测试饼图',
      left: 'center'
    },
    tooltip: {
      trigger: 'item'
    },
    series: [{
      name: '访问来源',
      type: 'pie',
      radius: '50%',
      data: [
        { value: 1048, name: '搜索引擎' },
        { value: 735, name: '直接访问' },
        { value: 580, name: '邮件营销' },
        { value: 484, name: '联盟广告' },
        { value: 300, name: '视频广告' }
      ]
    }]
  };

  try {
    const result2 = await generateChart.invoke({
      echartsOption: pieChartOption,
      fileName: "test_pie_chart",
      width: 600,
      height: 600
    });

    console.log("饼图生成结果:", result2);

    if (result2.success) {
      console.log("✅ 饼图生成成功");
      
      const fs = require('fs');
      if (fs.existsSync(result2.filePath)) {
        const stats = fs.statSync(result2.filePath);
        console.log("饼图文件大小:", stats.size, "字节");
      }
    } else {
      console.log("❌ 饼图生成失败:", result2.error);
    }
  } catch (error) {
    console.error("❌ 饼图测试过程中出错:", error);
  }
}

testChartGeneration().catch(console.error);