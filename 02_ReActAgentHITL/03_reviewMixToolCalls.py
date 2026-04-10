import os
import asyncio
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import InMemorySaver
# [LangChain 1.x 迁移] 使用 create_agent 替代 create_react_agent
from langchain.agents import create_agent
from langchain_core.messages import SystemMessage, HumanMessage
# [LangChain 1.x 迁移] 使用 ChatOpenAI 替代 init_chat_model
from langchain_openai import ChatOpenAI
# [LangChain 1.x 迁移] 使用中间件替代手动 interrupt 包装函数
from langchain.agents.middleware import HumanInTheLoopMiddleware
from typing import List, Any
# [LangChain 1.x 迁移] Command 仍然用于 resume 人工反馈
from langgraph.types import Command
from dotenv import load_dotenv

load_dotenv()

# [LangChain 1.x 迁移] 使用 ChatOpenAI 直接初始化大模型
llm = ChatOpenAI(
    model="moonshotai/Kimi-K2.5",
    temperature=0,
    base_url="https://api-inference.modelscope.cn/v1",
    api_key=os.getenv("MODELSCOPE_API_KEY"),
)


# [LangChain 1.x 迁移] 删除了 add_human_in_the_loop 函数
# 在 1.x 中，HITL 通过 HumanInTheLoopMiddleware 中间件实现，无需手动包装工具


# @tool("book_hotel",description="提供预订酒店的工具")
@tool("book_hotel",description="预定酒店的工具")
def book_hotel(hotel_name: str):
    return f"成功预定了在{hotel_name}的住宿。"


# 解析消息列表
def parse_messages(messages: List[Any]) -> None:
    """
    解析消息列表，打印 HumanMessage、AIMessage 和 ToolMessage 的详细信息

    Args:
        messages: 包含消息的列表，每个消息是一个对象
    """
    print("=== 消息解析结果 ===")
    for idx, msg in enumerate(messages, 1):
        print(f"\n消息 {idx}:")
        # 获取消息类型
        msg_type = msg.__class__.__name__
        print(f"类型: {msg_type}")
        # 提取消息内容
        content = getattr(msg, 'content', '')
        print(f"内容: {content if content else '<空>'}")
        # 处理附加信息
        additional_kwargs = getattr(msg, 'additional_kwargs', {})
        if additional_kwargs:
            print("附加信息:")
            for key, value in additional_kwargs.items():
                if key == 'tool_calls' and value:
                    print("  工具调用:")
                    for tool_call in value:
                        print(f"    - ID: {tool_call['id']}")
                        print(f"      函数: {tool_call['function']['name']}")
                        print(f"      参数: {tool_call['function']['arguments']}")
                else:
                    print(f"  {key}: {value}")
        # 处理 ToolMessage 特有字段
        if msg_type == 'ToolMessage':
            tool_name = getattr(msg, 'name', '')
            tool_call_id = getattr(msg, 'tool_call_id', '')
            print(f"工具名称: {tool_name}")
            print(f"工具调用 ID: {tool_call_id}")
        # 处理 AIMessage 的工具调用和元数据
        if msg_type == 'AIMessage':
            tool_calls = getattr(msg, 'tool_calls', [])
            if tool_calls:
                print("工具调用:")
                for tool_call in tool_calls:
                    print(f"  - 名称: {tool_call['name']}")
                    print(f"    参数: {tool_call['args']}")
                    print(f"    ID: {tool_call['id']}")
            # 提取元数据
            metadata = getattr(msg, 'response_metadata', {})
            if metadata:
                print("元数据:")
                token_usage = metadata.get('token_usage', {})
                print(f"  令牌使用: {token_usage}")
                print(f"  模型名称: {metadata.get('model_name', '未知')}")
                print(f"  完成原因: {metadata.get('finish_reason', '未知')}")
        # 打印消息 ID
        msg_id = getattr(msg, 'id', '未知')
        print(f"消息 ID: {msg_id}")
        print("-" * 50)


# 保存状态图的可视化表示
def save_graph_visualization(graph, filename: str = "graph.png") -> None:
    """保存状态图的可视化表示。

    Args:
        graph: 状态图实例。
        filename: 保存文件路径。
    """
    # 尝试执行以下代码块
    try:
        # 以二进制写模式打开文件
        with open(filename, "wb") as f:
            # 将状态图转换为Mermaid格式的PNG并写入文件
            f.write(graph.get_graph().draw_mermaid_png())
        # 记录保存成功的日志
        print(f"Graph visualization saved as {filename}")
    # 捕获IO错误
    except IOError as e:
        # 记录警告日志
        print(f"Failed to save graph visualization: {e}")


# 定义并运行agent
async def run_agent():
    # 实例化MCP Server客户端
    client = MultiServerMCPClient({
        # 高德地图MCP Server
        # "amap-amap-sse": {
        #     "url": "https://mcp.amap.com/sse?key="+os.getenv("AMAP_MAPS_API_KEY"),
        #     "transport": "sse",
        # },
        "amap-maps-streamableHTTP": {
            "url": "https://mcp.amap.com/mcp?key=" + os.getenv("AMAP_MAPS_API_KEY"),
            "transport": "streamable_http"
        }
    })

    # [LangChain 1.x 迁移] 直接获取MCP工具并合并自定义工具，不再需要 add_human_in_the_loop 包装
    # HITL 通过 middleware 参数中的 HumanInTheLoopMiddleware 配置
    all_tools = await client.get_tools()
    tools = all_tools + [book_hotel]
    # 只有MCP工具需要人工审查，book_hotel 不需要（保持原有行为）
    interrupt_on = {t.name: True for t in all_tools}
    interrupt_on["book_hotel"] = False

    # 基于内存存储的short-term
    checkpointer = InMemorySaver()

    # 定义系统消息
    system_message = SystemMessage(content=(
        "你是一个AI助手。"
    ))

    # [LangChain 1.x 迁移] 使用 create_agent 替代 create_react_agent
    # middleware 参数配置哪些工具需要人工审查
    agent = create_agent(
        model=llm,
        tools=tools,
        system_prompt=system_message,
        middleware=[
            HumanInTheLoopMiddleware(interrupt_on=interrupt_on)
        ],
        checkpointer=checkpointer
    )

    # 将定义的agent的graph进行可视化输出保存至本地
    # save_graph_visualization(agent)

    # 定义short-term需使用的thread_id
    config = {"configurable": {"thread_id": "1"}}

    # 官方流式示例做法：stream_mode=["updates", "messages"] + version="v2"
    # - "messages" 用于实时 token 输出
    # - "updates" 用于捕获 __interrupt__
    text = input("请输入查询内容:")
    stream_input = {"messages": [HumanMessage(content=text)]}
    pending_interrupts = ()

    async for chunk in agent.astream(
        input=stream_input,
        config=config,
        stream_mode=["updates", "messages"],
        version="v2",
    ):
        if not isinstance(chunk, dict):
            continue

        if chunk.get("type") == "messages":
            message_chunk, metadata = chunk.get("data", (None, None))
            # 如需过滤工具节点 token，可放开这个判断
            # if metadata and metadata.get("langgraph_node") == "tools":
            #     continue
            if message_chunk and message_chunk.content:
                print(message_chunk.content, end="", flush=True)

        elif chunk.get("type") == "updates":
            updates = chunk.get("data", {})
            if isinstance(updates, dict) and "__interrupt__" in updates:
                pending_interrupts = updates["__interrupt__"]
                print("\n\n[HITL] 检测到人工审批中断，等待决策...")
                break

    # 流式中断后的恢复（approve/edit/reject）
    if pending_interrupts:
        interrupt_obj = pending_interrupts[0]
        hitl_request = getattr(interrupt_obj, "value", {})
        if isinstance(interrupt_obj, dict):
            hitl_request = interrupt_obj.get("value", hitl_request)

        action_requests = hitl_request.get("action_requests", [])
        # decisions = [{"type": "approve"} for _ in action_requests]
        decisions = [{
            "type": "edit",
            "edited_action": {"name": "book_hotel", "args": {"hotel_name": "改成查询北京的天气吧"}}
        }]
        # decisions = [{"type": "reject", "message": "我不想查询了"} for _ in action_requests]

        async for chunk in agent.astream(
            Command(resume={"decisions": decisions}),
            config=config,
            stream_mode=["updates", "messages"],
            version="v2",
        ):
            if not isinstance(chunk, dict):
                continue
            if chunk.get("type") == "messages":
                message_chunk, _metadata = chunk.get("data", (None, None))
                if message_chunk and message_chunk.content:
                    print(message_chunk.content, end="", flush=True)

    print()



if __name__ == "__main__":
    asyncio.run(run_agent())




