# backend/app/core/streaming.py
import logging
import re
from typing import AsyncGenerator, Any

from langgraph.graph.state import CompiledStateGraph
from langchain_core.runnables import RunnableConfig


logger = logging.getLogger(__name__)

# 事件类型常量
EVT_TOKEN = "token"
EVT_TOOL = "tool"
EVT_TODO = "todo"
EVT_HITL = "hitl"
EVT_DONE = "done"
EVT_ERROR = "error"

# deepagents 的 `task` 工具是子 Agent 委派的入口，args 结构为 {description, subagent_type}。
# 前端展示更有信息量的应该是子 Agent 名（researcher / data_analyst），而不是 `task` 本身 —
# 所以解析 chunk 时 sniff 出 subagent_type 覆盖工具名再下发事件。
_TASK_TOOL_NAME = "task"
_SUBAGENT_TYPE_RE = re.compile(r'"subagent_type"\s*:\s*"([^"]+)"')


def _extract_subagent(args_buffer: str) -> str | None:
    """从（可能不完整的）JSON 字符串中抽取 subagent_type 字面量。"""
    m = _SUBAGENT_TYPE_RE.search(args_buffer)
    return m.group(1) if m else None


def _extract_text(content: Any) -> str:
    """
    提取流式消息中的纯文本内容。
    来源：07/utils/tasks.py:177-189 _extract_text_from_content
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            item if isinstance(item, str)
            else item.get("text", "") if isinstance(item, dict) and item.get("type") == "text"
            else ""
            for item in content
        )
    return ""


async def parse_agent_events(
    agent: CompiledStateGraph, agent_input, config: RunnableConfig,
) -> AsyncGenerator[tuple[str, dict], None]:
    """
    将 agent.astream() 的输出解析为结构化事件元组 (event_type, data)。
    不处理 SSE 格式，也不写入任何后端 — 纯转换。

    调用方：TaskService.run() 遍历事件写入 Redis Stream，
    SSE 端点从 Stream 读取并格式化为 `event: X\\ndata: Y\\n\\n`。

    遇到 __interrupt__ 时 yield ("hitl", ...) 后立即 return，调用方负责后续处理。
    正常结束 yield ("done", {"message": 累积文本})。

    ⚠️ LangGraph astream() 协议（已对照官方文档）：
    - 多 stream_mode 时产出 (mode, data) 元组，不是 dict
    - "messages" 模式：data = (message_chunk, metadata) 二元组
    - "updates" 模式：data = {node_name: node_state_update} dict
    - "values" 模式：data = 完整状态 dict
    07 的 stream_and_collect_result 用 chunk.get("type") 是错的（把 astream 和
    astream_events 的格式混起来了）— 这里已经修正。
    """
    final_text = ""

    # task 工具委派追踪：
    # langchain tool_call_chunks 协议：name 和 id 只在**首个** chunk 出现，
    # 后续 delta chunk 只带 args 片段 + 同一 `index`（表示该消息里第几个 tool call）。
    # 因此按 (message_id, index) → tool_call_id 建立映射才能把后续 args 续上去。
    # {tool_call_id: {"args": "累积片段", "resolved": "researcher" | None, "emitted": bool}}
    task_calls: dict[str, dict] = {}
    # (message_id, index) → tool_call_id，只收 task 工具
    index_to_task_id: dict[tuple[str, int], str] = {}

    # 只订阅需要的模式。values 对流式没用，去掉减少开销。
    async for mode, data in agent.astream(
        input=agent_input,
        config=config,
        stream_mode=["updates", "messages"],
    ):
        if mode == "messages":
            # data 是 (message_chunk, metadata) 二元组
            if not isinstance(data, tuple) or len(data) != 2:
                continue
            message_chunk, _metadata = data
            msg_type = type(message_chunk).__name__

            if msg_type == "AIMessageChunk":
                # 检测工具调用发起 — tool_call_chunks 是流式增量，name 只在首个 chunk 出现
                # 前端只展示"AI 正在调用 XXX 工具"，不暴露 args，详细信息走后端日志
                chunk_msg_id = getattr(message_chunk, "id", "") or ""
                for tc in (getattr(message_chunk, "tool_call_chunks", None) or []):
                    tool_name = tc.get("name")
                    tool_id = tc.get("id")
                    tool_args = tc.get("args") or ""
                    tool_index = tc.get("index")

                    # 首个 chunk：携带 name + id（有时还携带完整/部分 args）
                    if tool_name:
                        logger.info(
                            f"tool call: {tool_name} args={tool_args} id={tool_id}"
                        )
                        if tool_name == _TASK_TOOL_NAME and tool_id:
                            task_calls[tool_id] = {
                                "args": tool_args,
                                "resolved": None,
                                "emitted": False,
                            }
                            if tool_index is not None:
                                index_to_task_id[(chunk_msg_id, tool_index)] = tool_id
                            # 首个 chunk 也可能带全部 args，直接尝试解析一次
                            resolved = _extract_subagent(tool_args)
                            if resolved:
                                task_calls[tool_id]["resolved"] = resolved
                                task_calls[tool_id]["emitted"] = True
                                logger.info(
                                    f"task → subagent: {resolved} id={tool_id}"
                                )
                                yield EVT_TOOL, {
                                    "name": resolved,
                                    "status": "calling",
                                }
                        else:
                            yield EVT_TOOL, {"name": tool_name, "status": "calling"}
                        continue

                    # 后续 chunk：只有 args + index，没有 name/id。
                    # 按 (message_id, index) 回查对应的 task tool_call_id。
                    if tool_index is None:
                        continue
                    tracked_id = index_to_task_id.get((chunk_msg_id, tool_index))
                    if not tracked_id:
                        continue
                    entry = task_calls.get(tracked_id)
                    if not entry:
                        continue
                    entry["args"] += tool_args
                    if not entry["emitted"]:
                        resolved = _extract_subagent(entry["args"])
                        if resolved:
                            entry["resolved"] = resolved
                            entry["emitted"] = True
                            logger.info(
                                f"task → subagent: {resolved} id={tracked_id}"
                            )
                            yield EVT_TOOL, {
                                "name": resolved,
                                "status": "calling",
                            }

                # 文本 token — 仅 AI 的自然语言输出
                text = _extract_text(getattr(message_chunk, "content", None))
                if text:
                    final_text += text
                    yield EVT_TOKEN, {"text": text}

            elif msg_type == "ToolMessage":
                # 工具结果 — 只发一个"完成"信号到前端，内容写日志
                tool_name = getattr(message_chunk, "name", "") or "unknown"
                tool_call_id = getattr(message_chunk, "tool_call_id", None)
                result_content = getattr(message_chunk, "content", "")

                # task 工具返回时，按 id 回查用子 Agent 名替代
                if tool_name == _TASK_TOOL_NAME and tool_call_id in task_calls:
                    entry = task_calls.pop(tool_call_id)
                    # 清除对应 index 映射，避免长对话累积
                    for k, v in list(index_to_task_id.items()):
                        if v == tool_call_id:
                            index_to_task_id.pop(k, None)
                    resolved = entry.get("resolved") or _extract_subagent(
                        entry.get("args", "")
                    )
                    # 如果解析成功且之前没发过 calling，先补一条 —
                    # 确保前端能形成 calling → done 的完整段
                    if resolved:
                        if not entry.get("emitted"):
                            yield EVT_TOOL, {
                                "name": resolved,
                                "status": "calling",
                            }
                        tool_name = resolved
                    else:
                        # 解析失败：保持 "task" 原名，但同样补一条 calling —
                        # 首个 chunk 时也因为等 subagent_type 没发，不补就只剩孤 done
                        yield EVT_TOOL, {
                            "name": _TASK_TOOL_NAME,
                            "status": "calling",
                        }

                logger.info(
                    f"tool result: {tool_name} content={str(result_content)[:500]}"
                )
                yield EVT_TOOL, {"name": tool_name, "status": "done"}

            # 其他消息类型（HumanMessage / SystemMessage）直接忽略，不进流式输出

        elif mode == "updates":
            # data 是 dict，形如 {node_name: {field: value}}
            if not isinstance(data, dict):
                continue

            # HITL 中断 — LangGraph 用顶层键 __interrupt__ 标识
            if "__interrupt__" in data:
                interrupts = data["__interrupt__"]
                first = interrupts[0] if interrupts else None
                interrupt_value = getattr(first, "value", first)
                if not isinstance(interrupt_value, dict):
                    interrupt_value = {"raw": str(interrupt_value)}
                yield EVT_HITL, interrupt_value
                return

            # Todo 更新：deepagents TodoListMiddleware 把 todos 写到 state.todos
            # updates 模式是 {node_name: {todos: [...]}}，需要遍历节点
            # ⚠️ 实测点：首次运行确认 TodoListMiddleware 对应的节点名
            logger.debug(f"updates chunk: {data}")
            for node_name, node_state in data.items():
                if isinstance(node_state, dict) and "todos" in node_state:
                    yield EVT_TODO, {"todos": node_state["todos"]}
                    break

    yield EVT_DONE, {"message": final_text}