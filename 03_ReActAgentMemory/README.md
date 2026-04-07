# 1. 主要内容
- 如何在LangGraph提供的ReAct架构的Agent中使用Memory

# 2. Memory
- **Short-Term Memory（短期记忆）**
  也称为线程级记忆，在LangGraph中与特定对话线程（thread）或会话（session）绑定的临时状态信息，
  这种记忆仅在当前会话或线程的生命周期内有效，适合处理短时间内需要快速访问的上下文信息。
- **Long-Term Memory（长期记忆）**
  也称为跨线程记忆，在LangGraph中能够在不同会话或线程之间持久化存储和检索的信息，这种记忆允许Agent记住用户的历史交互、
  偏好或关键信息，从而支持更个性化和智能化的交互，与短期记忆不同，长期记忆可以在多个会话或线程之间共享和访问，适合存储需
  要长期保留的信息，如用户偏好、历史行为或学习到的知识。

# 3. 项目依赖
```
pip install langgraph==1.1.6
pip install langchain==1.2.15
pip install langchain-openai==1.1.12
pip install langgraph-checkpoint-postgres==3.0.5
```

# 4. 使用Docker方式运行PostgreSQL数据库
1. 进入官网 https://www.docker.com/ 下载安装Docker Desktop软件并安装
2. 打开命令行终端，cd 03_ReActAgentMemory文件夹下，PostgreSQL的docker配置文件为`docker-compose.yml`
3. 运行 `docker-compose up -d` 命令，后台启动PostgreSQL数据库服务
4. 运行成功后可在Docker Desktop软件中进行管理操作或使用命令行操作或使用指令
5. 使用数据库客户端软件（Navicat）远程登陆进行可视化操作
