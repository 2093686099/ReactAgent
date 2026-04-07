import os
import logging
from concurrent_log_handler import ConcurrentRotatingFileHandler
# [LangChain 1.x 迁移] 移除了HITL相关导入（HumanInterruptConfig, HumanInterrupt, interrupt, RunnableConfig, BaseTool, create_tool, Callable）
# HITL功能现在通过 HumanInTheLoopMiddleware 在 agent 创建时统一配置
from langchain_core.tools import tool
from .config import Config
from langchain_mcp_adapters.client import MultiServerMCPClient


# 设置日志基本配置，级别为DEBUG或INFO
logger = logging.getLogger(__name__)
# 设置日志器级别为DEBUG
logger.setLevel(logging.DEBUG)
# logger.setLevel(logging.INFO)
logger.handlers = []  # 清空默认处理器
# 使用ConcurrentRotatingFileHandler
handler = ConcurrentRotatingFileHandler(
    # 日志文件
    Config.LOG_FILE,
    # 日志文件最大允许大小为5MB，达到上限后触发轮转
    maxBytes = Config.MAX_BYTES,
    # 在轮转时，最多保留3个历史日志文件
    backupCount = Config.BACKUP_COUNT
)
# 设置处理器级别为DEBUG
handler.setLevel(logging.DEBUG)
handler.setFormatter(logging.Formatter(
    "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
))
logger.addHandler(handler)


# 获取工具列表 提供给第三方调用
# [LangChain 1.x 迁移] 移除了 add_human_in_the_loop() 函数
# HITL功能现在通过 HumanInTheLoopMiddleware 中间件在 agent 创建时统一配置
async def get_tools():
    # 自定义工具 模拟酒店预定工具
    @tool("book_hotel", description="酒店预定工具")
    async def book_hotel(hotel_name: str):
        """
       支持酒店预定的工具

        Args:
            hotel_name: 酒店名称

        Returns:
            工具的调用结果
        """
        return f"成功预定了在{hotel_name}的住宿。"

    # 自定义工具 计算两个数的乘积的工具
    @tool("multiply", description="计算两个数的乘积的工具")
    async def multiply(a: float, b: float) -> float:
        """
       支持计算两个数的乘积的工具

        Args:
            a: 参数1
            b: 参数2

        Returns:
            工具的调用结果
        """
        result = a * b
        return f"{a}乘以{b}等于{result}。"

    # MCP Server工具 高德地图
    client = MultiServerMCPClient({
        # 高德地图MCP Server
        # "amap-amap-sse": {
        #     "url": "https://mcp.amap.com/sse?key=" + os.getenv("AMAP_MAPS_API_KEY"),
        #     "transport": "sse",
        # },
        "amap-maps-streamableHTTP": {
            "url": "https://mcp.amap.com/mcp?key=" + os.getenv("AMAP_MAPS_API_KEY"),
            "transport": "streamable_http"
        }
    })
    # 从MCP Server中获取可提供使用的全部工具
    amap_tools = await client.get_tools()

    # [LangChain 1.x 迁移] 工具列表不再包裹HITL，直接返回原始工具
    # HITL通过 HumanInTheLoopMiddleware 在 agent 创建时统一配置
    tools = list(amap_tools)

    # 追加自定义工具（不再包裹HITL）
    tools.append(book_hotel)
    tools.append(multiply)

    # 返回工具列表
    return tools


# [LangChain 1.x 迁移] 新增 get_hitl_config 函数
# 返回每个工具是否需要HITL中断的配置字典，供 HumanInTheLoopMiddleware 使用
def get_hitl_config(tools):
    """
    根据工具列表生成HITL中断配置

    Args:
        tools: 工具列表

    Returns:
        dict: 每个工具名称对应是否需要中断的配置字典
              multiply 工具不需要中断（False），其余工具需要中断（True）
    """
    interrupt_on = {}
    for t in tools:
        tool_name = getattr(t, "name", str(t))
        if tool_name == "multiply":
            interrupt_on[tool_name] = False
        else:
            interrupt_on[tool_name] = True
    return interrupt_on