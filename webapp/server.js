import { serve } from '@hono/node-server'
import { app } from './app.js'


serve({
  fetch: app.fetch,
  port: 8082,
}, (info) => {
  console.log(`Listening on http://localhost:${info.port}`) 
})