FROM langchain/langgraphjs-api:20
ADD . /deps/chatbi-agent-js-v2
ENV LANGSERVE_GRAPHS='{"agent":"./chatbi_agent.ts:deepResearcher"}'
WORKDIR /deps/chatbi-agent-js-v2
RUN pnpm config set registry https://registry.npmmirror.com
RUN yes | pnpm i --frozen-lockfile
RUN (test ! -f /api/langgraph_api/js/build.mts && echo "Prebuild script not found, skipping") || tsx /api/langgraph_api/js/build.mts