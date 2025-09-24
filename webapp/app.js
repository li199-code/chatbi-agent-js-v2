import { Hono } from "hono";

export const app = new Hono();

app.get("/hello", (c) => c.json({ hello: "world" }));

// 下载报告和图片的压缩包
import archiver from 'archiver';
import fs from 'fs/promises';
import path from 'path';

// 下载指定文件夹的报告文件接口
app.get("/download-report/:folderName", async (c) => {
  try {
    const folderName = c.req.param('folderName');
    
    if (!folderName) {
      return c.json({ error: "文件夹名称不能为空" }, 400);
    }

    // 构建报告文件夹路径
    const reportsDir = path.join(process.cwd(), 'reports', folderName);
    
    // 检查文件夹是否存在
    try {
      await fs.access(reportsDir);
    } catch (error) {
      return c.json({ error: `报告文件夹不存在: ${folderName}` }, 404);
    }

    // 检查文件夹是否为空
    const files = await fs.readdir(reportsDir);
    if (files.length === 0) {
      return c.json({ error: `报告文件夹为空: ${folderName}` }, 404);
    }

    // 设置响应头
    c.header('Content-Type', 'application/zip');
    c.header('Content-Disposition', `attachment; filename="${folderName}-reports.zip"`);

    // 创建压缩包
    const archive = archiver('zip', {
      zlib: { level: 9 } // 设置压缩级别
    });

    // 处理压缩错误
    archive.on('error', (err) => {
      console.error('压缩文件时出错:', err);
      throw err;
    });

    // 将整个文件夹添加到压缩包中
    archive.directory(reportsDir, false);

    // 完成压缩
    archive.finalize();

    // 返回压缩包流
    return new Response(archive, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${folderName}-reports.zip"`
      }
    });

  } catch (error) {
    console.error('下载报告文件时出错:', error);
    return c.json({ error: "服务器内部错误" }, 500);
  }
});



