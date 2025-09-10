## 本地测试

启动后端：
```
npx @langchain/langgraph-cli dev 
```

启动前端：

```
cd agent-chat-ui
pnpm dev
```

示例问题：
2024年一季度女装销售额

## 部署

### api容器

api服务：
```
npx @langchain/langgraph-cli dockerfile ./Dockerfile
```

生成一个Dockerfile，要修改如下：

```
FROM langchain/langgraphjs-api:20
ADD . /deps/chatbi-agent-js-v2
ENV LANGSERVE_GRAPHS='{"agent":"./chatbi_agent.ts:deepResearcher"}'
WORKDIR /deps/chatbi-agent-js-v2
RUN pnpm config set registry https://registry.npmmirror.com
RUN yes | pnpm i --frozen-lockfile
RUN (test ! -f /api/langgraph_api/js/build.mts && echo "Prebuild script not found, skipping") || tsx /api/langgraph_api/js/build.mts
```

生成镜像：

```
docker build --platform linux/amd64 -t chatbi-agent:latest .
```


启动容器（不推荐，推荐用下面的docker-compose方式启动）：

```
docker run -d -p 8080:8080 --name chatbi-agent-container chatbi-agent:latest 
```

### docker-compose

官方要求必须启动pg和redis存储应用运行过程中产生的日志等数据。所以compose文件加入了这两个数据库

```
volumes:
    langgraph-data:
        driver: local
services:
    langgraph-redis:
        image: redis:6
        healthcheck:
            test: redis-cli ping
            interval: 5s
            timeout: 1s
            retries: 5
    langgraph-postgres:
        image: postgres:16
        ports:
            - "5433:5432"
        environment:
            POSTGRES_DB: postgres
            POSTGRES_USER: postgres
            POSTGRES_PASSWORD: postgres
        volumes:
            - langgraph-data:/var/lib/postgresql/data
        healthcheck:
            test: pg_isready -U postgres
            start_period: 10s
            timeout: 1s
            retries: 5
            interval: 5s
    langgraph-api:
        image: chatbi-agent:latest
        ports:
            - "8080:8000"
        depends_on:
            langgraph-redis:
                condition: service_healthy
            langgraph-postgres:
                condition: service_healthy
        env_file:
            - .env
        environment:
            REDIS_URI: redis://langgraph-redis:6379
            LANGSMITH_API_KEY: xxx
            POSTGRES_URI: postgres://postgres:postgres@langgraph-postgres:5432/postgres?sslmode=disable
```

