import os
import asyncio
from langchain_core.tools import tool
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


# [LangChain 1.x 迁移] 使用 ChatOpenAI 直接初始化大模型
llm = ChatOpenAI(
    model="deepseek-chat",
    temperature=0,
    base_url=os.getenv("https://api.deepseek.com/v1"),
    api_key=os.getenv("DEEPSEEK_API_KEY")
)


# [LangChain 1.x 迁移] 删除了 add_human_in_the_loop 函数
# 在 1.x 中，HITL 通过 HumanInTheLoopMiddleware 中间件实现，无需手动包装工具


# @tool("book_hotel",description="提供预订酒店的工具")
@tool("book_hotel",description="需要人工审查/批准的预定酒店的工具")
def book_hotel(hotel_name: str):
    # 实际业务场景：处理酒店预定的业务逻辑
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
    # [LangChain 1.x 迁移] 工具直接传入，不再需要 add_human_in_the_loop 包装
    # HITL 通过 middleware 参数中的 HumanInTheLoopMiddleware 配置
    tools = [book_hotel]

    # 基于内存存储的 short-term
    # 生产环境中需要使用数据库落盘（持久化）
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
            HumanInTheLoopMiddleware(interrupt_on={"book_hotel": True})
        ],
        checkpointer=checkpointer  # 开启记忆能力
    )

    # 将定义的agent的graph进行可视化输出保存至本地
    # save_graph_visualization(agent)

    # 定义short-term需使用的 thread_id
    config = {"configurable": {"thread_id": "1"}}

    # 1、非流式处理查询
    agent_response = await agent.ainvoke({"messages": [HumanMessage(content="预定一个汉庭酒店")]}, config)
    # 将返回的messages进行格式化输出
    parse_messages(agent_response['messages'])
    agent_response_content = agent_response["messages"][-1].content
    print(f"agent_response:{agent_response_content}")

    # (1)模拟人类反馈：测试3种反馈方式
    agent_response = agent.invoke(
        # Command(resume=[{"type": "accept"}]),
        # Command(resume=[{"type": "edit", "args": {"args": {"hotel_name": "汉庭酒店(软件园店)"}}}]),
        Command(resume=[{"type": "response", "args": "我不想预定这个酒店了"}]),
        config
    )
    # 将返回的messages进行格式化输出
    parse_messages(agent_response['messages'])
    agent_response_content = agent_response["messages"][-1].content
    print(f"agent_response:{agent_response_content}")

    # # (2)模拟人类反馈：测试多伦反馈
    # agent_response = agent.invoke(
    #     Command(resume=[{"type": "response", "args": "把酒店名称换为：汉庭酒店(软件园店)"}]),
    #     config
    # )
    # # 将返回的messages进行格式化输出
    # parse_messages(agent_response['messages'])
    # agent_response_content = agent_response["messages"][-1].content
    # print(f"agent_response:{agent_response_content}")
    #
    # agent_response = agent.invoke(
    #     Command(resume=[{"type": "accept"}]),
    #     config
    # )
    # # 将返回的messages进行格式化输出
    # parse_messages(agent_response['messages'])
    # agent_response_content = agent_response["messages"][-1].content
    # print(f"agent_response:{agent_response_content}")


    # # 2、流式处理查询
    # async for message_chunk, metadata in agent.astream(
    #         input={"messages": [HumanMessage(content="预定一个汉庭酒店")]},
    #         config=config,
    #         stream_mode="messages"
    # ):
    #     # 测试原始输出
    #     # print(f"Token:{message_chunk}\n")
    #     # print(f"Metadata:{metadata}\n\n")
    #
    #     # 跳过工具输出
    #     # if metadata["langgraph_node"]=="tools":
    #     #     continue
    #
    #     # 输出最终结果
    #     if message_chunk.content:
    #         print(message_chunk.content, end="|", flush=True)
    #
    # # 模拟人类反馈：测试3种反馈方式
    # async for message_chunk, metadata in agent.astream(
    #     # Command(resume=[{"type": "accept"}]),
    #     Command(resume=[{"type": "edit", "args": {"args": {"hotel_name": "汉庭酒店(软件园店)"}}}]),
    #     # Command(resume=[{"type": "response", "args": "我不想预定这个酒店了"}]),
    #     config,
    #     stream_mode="messages"
    # ):
    #     # 测试原始输出
    #     # print(f"Token:{message_chunk}\n")
    #     # print(f"Metadata:{metadata}\n\n")
    #
    #     # 跳过工具输出
    #     # if metadata["langgraph_node"]=="tools":
    #     #     continue
    #     # 输出最终结果
    #     if message_chunk.content:
    #         print(message_chunk.content, end="|", flush=True)



if __name__ == "__main__":
    asyncio.run(run_agent())




