// ./src/agent/app.ts
import { Hono } from "hono";

export const app = new Hono();

app.get("/hello", (c) => c.json({ hello: "world" }));

