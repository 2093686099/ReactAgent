# backend/app/core/tools.py
from __future__ import annotations

import asyncio
import logging
import json
from urllib.request import urlopen
from langchain_core.tools import tool
from langchain_mcp_adapters.client import MultiServerMCPClient
from app.config import settings


logger = logging.getLogger(__name__)

_mcp_tools_cache: list | None = None
_mcp_lock: asyncio.Lock | None = None


def _is_amap_key_valid() -> bool:
    """轻量检查高德 MCP key 是否可用。"""
    if not settings.amap_maps_api_key:
        return False
    url = f"https://mcp.amap.com/mcp?key={settings.amap_maps_api_key}"
    try:
        with urlopen(url, timeout=8) as response:
            body = response.read().decode("utf-8", errors="ignore")
            data = json.loads(body)
            # 高德错误格式：{"status":"0","info":"INVALID_USER_KEY","infocode":"10001"}
            if isinstance(data, dict) and data.get("status") == "0":
                logger.warning(f"高德 MCP key 无效：info={data.get('info')} infocode={data.get('infocode')}")
                return False
            return True
    except Exception as exc:
        logger.warning(f"高德 MCP key 可用性检查失败，将禁用 researcher：{exc}")
        return False


async def get_mcp_tools():
    """获取 MCP 工具（高德地图），分配给 researcher 子 Agent。
    首次调用走网络，后续返回缓存。asyncio.Lock 保证并发安全。"""
    global _mcp_tools_cache, _mcp_lock
    if _mcp_tools_cache is not None:
        return _mcp_tools_cache
    if _mcp_lock is None:
        _mcp_lock = asyncio.Lock()
    async with _mcp_lock:
        if _mcp_tools_cache is not None:
            return _mcp_tools_cache
        if not _is_amap_key_valid():
            _mcp_tools_cache = []
            return _mcp_tools_cache
        client = MultiServerMCPClient({
            "amap-maps-streamableHTTP": {
                "url": f"https://mcp.amap.com/mcp?key={settings.amap_maps_api_key}",
                "transport": "streamable_http",
            }
        })
        _mcp_tools_cache = await client.get_tools()
        logger.info(f"MCP 工具已缓存，共 {len(_mcp_tools_cache)} 个")
        return _mcp_tools_cache


async def refresh_mcp_tools() -> list:
    """强制清除缓存并重新获取 MCP 工具列表"""
    global _mcp_tools_cache
    _mcp_tools_cache = None
    return await get_mcp_tools()


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
        return f"{a}乘以{b}等于{a * b}。"

    return [book_hotel, multiply]


def get_hitl_config(custom_tools):
    """
    生成主 Agent 的 HITL 中断配置。

    危险操作需要审批：book_hotel, execute, write_file, edit_file
    安全操作免审批：multiply, read_file, ls, glob, grep, write_todos, task
    """
    interrupt_on = {}

    for t in custom_tools:
        name = getattr(t, "name", str(t))
        interrupt_on[name] = name != "multiply"

    # Deep Agents 内置工具
    interrupt_on.update({
        "execute": True,
        "write_file": True,
        "edit_file": True,
        "read_file": False,
        "ls": False,
        "glob": False,
        "grep": False,
        "write_todos": False,
        "task": False,
    })

    return interrupt_on