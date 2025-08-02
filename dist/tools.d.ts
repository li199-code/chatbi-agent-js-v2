import { z } from "zod";
import type { SingleDimensionDrillDown } from "./types.js";
export declare const chatbiAskTool: import("@langchain/core/tools.js").DynamicStructuredTool<z.ZodObject<{
    query: z.ZodString;
}, z.core.$strip>, unknown, unknown, {
    success: boolean;
    data: any;
    query: any;
    timestamp: string;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    query: any;
    timestamp: string;
    data?: undefined;
}>;
export declare const chatbiAnalyzeTool: import("@langchain/core/tools.js").DynamicStructuredTool<z.ZodObject<{
    query: z.ZodString;
}, z.core.$strip>, unknown, unknown, {
    success: boolean;
    data: {
        total: any;
        drilldown: SingleDimensionDrillDown[];
        impactFactorProperties: any;
    };
    query: any;
    timestamp: string;
    error?: undefined;
} | {
    success: boolean;
    error: any;
    query: any;
    timestamp: string;
    data?: undefined;
}>;
export declare const saveFile: import("@langchain/core/tools.js").DynamicStructuredTool<z.ZodObject<{
    fileName: z.ZodString;
    content: z.ZodString;
}, z.core.$strip>, unknown, unknown, "保存成功" | "保存失败">;
