import os
import logging
from concurrent_log_handler import ConcurrentRotatingFileHandler
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


async def get_mcp_tools():
    """获取 MCP 工具（高德地图），分配给 researcher 子 Agent"""
    client = MultiServerMCPClient({
        # 高德地图MCP Server
        "amap-maps-streamableHTTP": {
            "url": "https://mcp.amap.com/mcp?key=" + os.getenv("AMAP_MAPS_API_KEY"),
            "transport": "streamable_http"
        }
    })
    return await client.get_tools()


def get_custom_tools():
    """获取自定义工具（酒店预定、计算），分配给主 Agent"""
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

    return [book_hotel, multiply]


def get_hitl_config(custom_tools):
    """
    生成主 Agent 的 HITL 中断配置

    Args:
        custom_tools: 主 Agent 的自定义工具列表

    Returns:
        dict: 每个工具名称对应是否需要中断的配置字典
    """
    interrupt_on = {}

    # 自定义工具的 HITL 配置
    for t in custom_tools:
        tool_name = getattr(t, "name", str(t))
        if tool_name == "multiply":
            interrupt_on[tool_name] = False
        else:
            interrupt_on[tool_name] = True

    # Deep Agents 内置工具的 HITL 配置
    # 危险操作 → 需要 HITL 审批
    interrupt_on["execute"] = True       # Shell 命令执行
    interrupt_on["write_file"] = True    # 文件写入
    interrupt_on["edit_file"] = True     # 文件编辑
    # 安全操作 → 无需审批
    interrupt_on["read_file"] = False
    interrupt_on["ls"] = False
    interrupt_on["glob"] = False
    interrupt_on["grep"] = False
    interrupt_on["write_todos"] = False  # 任务规划
    interrupt_on["task"] = False         # 子 Agent 委派

    return interrupt_on
