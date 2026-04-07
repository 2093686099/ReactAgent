# 1. 主要内容
- 使用LangGraph中预置的ReAct架构的Agent集成MCP Server
- 使用高德地图的MCP Server进行测试

# 2. 项目依赖
```
pip install langgraph==1.1.6
pip install langchain==1.2.15
pip install langchain-openai==1.1.12
pip install langchain-mcp-adapters
```

# 3. 高德地图 MCP Server 介绍
为实现 LBS 服务与 LLM 更好的交互，高德地图 MCP Server 现已覆盖12大核心服务接口，提供全场景覆盖的地图服务包括地理编码、逆地理编码、IP 定位、天气查询、骑行路径规划、步行路径规划、驾车路径规划、公交路径规划、距离测量、关键词搜索、周边搜索、详情搜索等
链接地址：https://lbs.amap.com/api/mcp-server/summary 
