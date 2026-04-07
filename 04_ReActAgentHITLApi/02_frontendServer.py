import requests
import json
import traceback
from typing import Dict, Any, Optional
import time
from rich.console import Console
from rich.prompt import Prompt
from rich.panel import Panel
from rich.markdown import Markdown
from rich.theme import Theme
from rich.progress import Progress


# 创建自定义主题
custom_theme = Theme({
    "info": "cyan bold",
    "warning": "yellow bold",
    "success": "green bold",
    "error": "red bold",
    "heading": "magenta bold underline",
    "highlight": "blue bold",
})


# 初始化Rich控制台
console = Console(theme=custom_theme)

# 后端API地址
API_BASE_URL = "http://localhost:8001"


# 调用智能体处理查询，并等待完成或中断
def invoke_agent(user_id: str, query: str, system_message: str = "你会使用工具来帮助用户。如果工具使用被拒绝，请提示用户。"):
    """
    调用智能体处理查询，并等待完成或中断

    Args:
        user_id: 用户唯一标识
        query: 用户待查询的问题
        system_message: 系统提示词

    Returns:
        服务端返回的结果
    """
    # 发送请求到后端API
    payload = {
        "user_id": user_id,
        "query": query,
        "system_message": system_message
    }
    
    console.print("[info]正在发送请求到智能体，请稍候...[/info]")
    
    with Progress() as progress:
        task = progress.add_task("[cyan]处理中...", total=None)
        response = requests.post(f"{API_BASE_URL}/agent/invoke", json=payload)
        progress.update(task, completed=100)
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API调用失败: {response.status_code} - {response.text}")

# 发送响应以恢复智能体执行
def resume_agent(user_id: str, session_id: str, response_type: str, args: Optional[Dict[str, Any]] = None):
    """
    发送响应以恢复智能体执行

    Args:
        user_id: 用户唯一标识
        session_id: 用户的会话唯一标识
        response_type: 响应类型：accept(允许调用), edit(调整工具参数，此时args中携带修改后的调用参数), response(直接反馈信息，此时args中携带修改后的调用参数)，reject(不允许调用)
        args: 如果是edit, response类型，可能需要额外的参数

    Returns:
        服务端返回的结果
    """
    payload = {
        "user_id": user_id,
        "session_id": session_id,
        "response_type": response_type,
        "args": args
    }
    
    console.print("[info]正在恢复智能体执行，请稍候...[/info]")
    
    with Progress() as progress:
        task = progress.add_task("[cyan]恢复执行中...", total=None)
        response = requests.post(f"{API_BASE_URL}/agent/resume", json=payload)
        progress.update(task, completed=100)
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"恢复智能体执行失败: {response.status_code} - {response.text}")

# 获取智能体状态
def get_agent_status(user_id: str):
    """
    获取智能体状态

    Args:
        user_id: 用户唯一标识

    Returns:
        服务端返回的结果
    """
    response = requests.get(f"{API_BASE_URL}/agent/status/{user_id}")
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"获取智能体状态失败: {response.status_code} - {response.text}")

# 获取系统信息
def get_system_info():
    """
    获取系统信息

    Args:

    Returns:
        服务端返回的结果
    """
    response = requests.get(f"{API_BASE_URL}/system/info")
    
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"获取系统信息失败: {response.status_code} - {response.text}")

# 删除用户会话
def delete_agent_session(user_id: str):
    """
    删除用户会话

    Args:
        user_id: 用户唯一标识

    Returns:
        服务端返回的结果
    """
    response = requests.delete(f"{API_BASE_URL}/agent/session/{user_id}")

    if response.status_code == 200:
        return response.json()
    elif response.status_code == 404:
        # 会话不存在也算成功
        return {"status": "success", "message": f"用户 {user_id} 的会话不存在"}
    else:
        raise Exception(f"删除会话失败: {response.status_code} - {response.text}")


# 显示会话的详细信息，包括会话状态、上次查询、响应数据等
def display_session_info(status_response):
    """
    显示会话的详细信息，包括会话状态、上次查询、响应数据等

    参数:
        status_response: 会话状态响应数据
    """
    # 基本会话信息面板
    user_id = status_response["user_id"]
    session_id = status_response.get("session_id", "未知")
    status = status_response["status"]
    last_query = status_response.get("last_query", "无")
    last_updated = status_response.get("last_updated")

    # 构建信息面板内容
    panel_content = [
        f"用户ID: {user_id}",
        f"会话ID: {session_id}",
        f"状态: [bold]{status}[/bold]",
        f"上次查询: {last_query}"
    ]

    # 添加时间戳
    if last_updated:
        time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(last_updated))
        panel_content.append(f"上次更新: {time_str}")

    # 根据状态设置合适的面板样式
    if status == "interrupted":
        border_style = "yellow"
        title = "[warning]中断会话[/warning]"
    elif status == "completed":
        border_style = "green"
        title = "[success]完成会话[/success]"
    elif status == "error":
        border_style = "red"
        title = "[error]错误会话[/error]"
    elif status == "running":
        border_style = "blue"
        title = "[info]运行中会话[/info]"
    elif status == "idle":
        border_style = "cyan"
        title = "[info]空闲会话[/info]"
    else:
        border_style = "white"
        title = "[info]未知状态会话[/info]"

    # 显示基本面板
    console.print(Panel(
        "\n".join(panel_content),
        title=title,
        border_style=border_style
    ))

    # 显示额外的响应数据
    if status_response.get("last_response"):
        last_response = status_response["last_response"]

        # 根据会话状态显示不同的响应数据
        if status == "completed" and last_response.get("result"):
            result = last_response["result"]
            if "messages" in result:
                final_message = result["messages"][-1]
                console.print(Panel(
                    Markdown(final_message["content"]),
                    title="[success]上次智能体回答[/success]",
                    border_style="green"
                ))

        elif status == "interrupted" and last_response.get("interrupt_data"):
            interrupt_data = last_response["interrupt_data"]
            message = interrupt_data.get("description", "需要您的输入")
            console.print(Panel(
                message,
                title=f"[warning]中断消息[/warning]",
                border_style="yellow"
            ))

        elif status == "error":
            error_msg = last_response.get("message", "未知错误")
            console.print(Panel(
                error_msg,
                title="[error]错误信息[/error]",
                border_style="red"
            ))

# 检查用户会话状态并尝试恢复
def check_and_restore_session(user_id: str):
    """
    检查用户会话状态并尝试恢复

    参数:
        user_id: 用户ID

    返回:
        tuple: (是否有活跃会话, 会话状态响应)
    """
    try:
        # 获取用户会话状态
        status_response = get_agent_status(user_id)

        # 如果没有找到会话
        if status_response["status"] == "not_found":
            console.print("[info]没有找到现有会话，将创建新会话[/info]")
            return False, None

        # 显示会话详细信息
        console.print(Panel(
            f"用户ID: {user_id}\n"
            f"会话ID: {status_response.get('session_id', '未知')}\n"
            f"状态: [bold]{status_response['status']}[/bold]\n"
            f"上次查询: {status_response.get('last_query', '无')}\n"
            f"上次更新: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(status_response['last_updated'])) if status_response.get('last_updated') else '未知'}\n",
            title="[info]发现现有会话[/info]",
            border_style="cyan"
        ))

        # 显示会话的详细信息
        display_session_info(status_response)

        # 根据会话状态进行自动处理
        if status_response["status"] == "interrupted":
            console.print(Panel(
                "会话处于中断状态，需要您的响应才能继续。\n"
                "系统将自动恢复上次的中断点，您需要提供决策。",
                title="[warning]会话已中断[/warning]",
                border_style="yellow"
            ))

            # 如果有上次的响应且包含中断数据
            if (status_response.get("last_response") and
                    status_response["last_response"].get("interrupt_data")):

                # 显示中断类型和相关信息
                interrupt_data = status_response["last_response"]["interrupt_data"]

                action_request = interrupt_data.get("action_request","未知中断")
                tool = action_request.get("action","未知工具")
                args = action_request.get("args","未知参数")
                console.print(f"[info]相关工具: {tool}[/info]")
                console.print(f"[info]工具参数: {args}[/info]")

                # 自动恢复中断处理
                console.print("[info]自动恢复中断处理...[/info]")
                return True, status_response
            else:
                console.print("[warning]中断状态会话缺少必要的中断数据，无法恢复[/warning]")
                console.print("[info]将创建新会话[/info]")
                return False, None

        elif status_response["status"] == "completed":
            console.print(Panel(
                "会话已完成，上次响应结果可用。\n"
                "系统将显示上次结果并自动开启新会话。",
                title="[success]会话已完成[/success]",
                border_style="green"
            ))

            # 显示上次的结果
            if (status_response.get("last_response") and
                    status_response["last_response"].get("result")):

                # 提取并显示结果
                last_result = status_response["last_response"]["result"]
                if "messages" in last_result:
                    final_message = last_result["messages"][-1]

                    console.print(Panel(
                        Markdown(final_message["content"]),
                        title="[success]上次智能体回答[/success]",
                        border_style="green"
                    ))

            console.print("[info]基于当前会话开始继续...[/info]")
            return False, None

        elif status_response["status"] == "error":
            # 获取错误信息
            error_msg = "未知错误"
            if status_response.get("last_response"):
                error_msg = status_response["last_response"].get("message", "未知错误")

            console.print(Panel(
                f"上次会话发生错误: {error_msg}\n"
                "系统将自动开始新会话。",
                title="[error]会话错误[/error]",
                border_style="red"
            ))

            console.print("[info]自动开始新会话...[/info]")
            return False, None

        elif status_response["status"] == "running":
            console.print(Panel(
                "会话正在运行中，这可能是因为:\n"
                "1. 另一个客户端正在使用此会话\n"
                "2. 上一次会话异常终止，状态未更新\n"
                "系统将自动等待会话状态变化。",
                title="[warning]会话运行中[/warning]",
                border_style="yellow"
            ))

            # 自动等待会话状态变化
            console.print("[info]自动等待会话状态变化...[/info]")
            with Progress() as progress:
                task = progress.add_task("[cyan]等待会话完成...", total=None)
                max_attempts = 30  # 最多等待30秒
                attempt_count = 0

                for i in range(max_attempts):
                    attempt_count = i
                    # 检查状态
                    current_status = get_agent_status(user_id)
                    if current_status["status"] != "running":
                        progress.update(task, completed=100)
                        console.print(f"[success]会话状态已更新为: {current_status['status']}[/success]")
                        break
                    time.sleep(1)

                # 如果等待超时
                if attempt_count >= max_attempts - 1:
                    console.print("[warning]等待超时，会话可能仍在运行[/warning]")
                    console.print("[info]为避免冲突，将创建新会话[/info]")
                    return False, None

                # 获取最新状态（递归调用）
                return check_and_restore_session(user_id)

        elif status_response["status"] == "idle":
            console.print(Panel(
                "会话处于空闲状态，准备接收新查询。\n"
                "系统将自动使用现有会话。",
                title="[info]会话空闲[/info]",
                border_style="blue"
            ))

            # 自动使用现有会话
            console.print("[info]自动使用现有会话[/info]")
            return True, status_response

        else:
            # 未知状态
            console.print(Panel(
                f"会话处于未知状态: {status_response['status']}\n"
                "系统将自动创建新会话以避免潜在问题。",
                title="[warning]未知状态[/warning]",
                border_style="yellow"
            ))

            console.print("[info]自动创建新会话...[/info]")
            return False, None

    except Exception as e:
        console.print(f"[error]检查会话状态时出错: {str(e)}[/error]")
        console.print(traceback.format_exc())
        console.print("[info]将创建新会话[/info]")
        return False, None

# 处理工具使用审批类型的中断
def handle_tool_interrupt(interrupt_data, user_id, session_id):
    """
    处理工具使用审批类型的中断

    参数:
        interrupt_data: 中断数据
        user_id: 用户ID
        session_id: 会话ID

    返回:
        处理后的响应
    """
    message = interrupt_data.get("description", "需要您的输入")

    # 显示工具使用审批提示
    console.print(Panel(
        f"{message}",
        title=f"[warning]智能体需要您的决定[/warning]",
        border_style="yellow"
    ))

    # 获取用户输入
    user_input = Prompt.ask("[highlight]您的选择[/highlight]")

    # 处理用户输入
    try:
        while True:
            if user_input.lower() == "yes":
                response = resume_agent(user_id, session_id, "accept")
                break
            elif user_input.lower() == "no":
                response = resume_agent(user_id, session_id, "reject")
                break
            elif user_input.lower() == "edit":
                # 获取新的查询内容
                new_query = Prompt.ask("[highlight]请调整新的参数[/highlight]")
                response = resume_agent(user_id, session_id, "edit", args={"args": json.loads(new_query)})
                break
            elif user_input.lower() == "response":
                # 获取新的查询内容
                new_query = Prompt.ask("[highlight]不调用工具直接反馈信息[/highlight]")
                response = resume_agent(user_id, session_id, "response", args={"args": new_query})
                break
            else:
                console.print("[error]无效输入，请输入 'yes'、'no' 、'edit' 或 'response'[/error]")
                user_input = Prompt.ask("[highlight]您的选择[/highlight]")

        # 重新获取用户输入（维持当前响应不变）
        return process_agent_response(response, user_id)

    except Exception as e:
        console.print(f"[error]处理响应时出错: {str(e)}[/error]")
        return None

# 处理智能体响应，包括处理中断和显示结果
def process_agent_response(response, user_id):
    # 防御性检查，确保response不为空
    if not response:
        console.print("[error]收到空响应，无法处理[/error]")
        return None

    try:
        session_id = response["session_id"]
        status = response["status"]
        timestamp = response.get("timestamp", time.time())

        # 显示时间戳和会话ID（便于调试和跟踪）
        time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp))
        console.print(f"[info]响应时间: {time_str} | 会话ID: {session_id}[/info]")

        # 处理不同状态
        if status == "interrupted":
            # 获取中断数据
            interrupt_data = response.get("interrupt_data", {})

            try:
                # 进入中断处理函数
                return handle_tool_interrupt(interrupt_data, user_id, session_id)

            except Exception as e:
                console.print(f"[error]处理中断响应时出错: {str(e)}[/error]")
                console.print(f"[info]中断状态已保存，您可以稍后恢复会话[/info]")
                console.print(traceback.format_exc())
                return None

        elif status == "completed":
            # 显示结果
            result = response.get("result", {})
            if result and "messages" in result:
                final_message = result["messages"][-1]
                console.print(Panel(
                    Markdown(final_message["content"]),
                    title="[success]智能体回答[/success]",
                    border_style="green"
                ))
            else:
                console.print("[warning]智能体没有返回有效的消息[/warning]")
                if isinstance(result, dict):
                    console.print("[info]原始结果数据结构:[/info]")
                    console.print(result)

            return result

        elif status == "error":
            # 显示错误信息
            error_msg = response.get("message", "未知错误")
            console.print(Panel(
                f"{error_msg}",
                title="[error]处理过程中出错[/error]",
                border_style="red"
            ))
            return None

        elif status == "running":
            # 处理正在运行状态
            console.print("[info]智能体正在处理您的请求，请稍候...[/info]")
            return response

        elif status == "idle":
            # 处理空闲状态
            console.print("[info]智能体处于空闲状态，准备接收新的请求[/info]")
            return response

        else:
            # 其他未知状态
            console.print(f"[warning]智能体处于未知状态: {status} - {response.get('message', '无消息')}[/warning]")
            return response

    except KeyError as e:
        console.print(f"[error]响应格式错误，缺少关键字段 {e}[/error]")
        return None
    except Exception as e:
        console.print(f"[error]处理智能体响应时出现未预期错误: {str(e)}[/error]")
        console.print(traceback.format_exc())
        return None


# 主函数，运行客户端
def main():
    console.print(Panel(
        "前端客户端",
        title="[heading]智能体交互系统[/heading]",
        border_style="magenta"
    ))

    # 获取系统信息
    try:
        system_info = get_system_info()
        console.print(f"[info]系统活跃会话: {system_info['sessions_count']}[/info]")
        if system_info['active_users']:
            console.print(f"[info]活跃用户: {', '.join(system_info['active_users'])}[/info]")
    except Exception:
        console.print("[warning]无法获取系统状态，但这不影响使用[/warning]")

    # 获取用户ID（在真实应用中可能是登录后的用户标识）
    default_user_id = f"user_{int(time.time())}"
    user_id = Prompt.ask("[info]请输入用户ID[/info] (新ID创建新会话，已有ID自动恢复会话)", default=default_user_id)

    # 检查并尝试自动恢复现有会话
    has_active_session, session_status = check_and_restore_session(user_id)

    # 主交互循环
    while True:
        try:
            # 会话恢复处理 - 根据状态自动处理
            if has_active_session and session_status:

                # 如果是中断状态，自动处理中断
                if session_status["status"] == "interrupted":
                    console.print("[info]自动处理中断的会话...[/info]")
                    if "last_response" in session_status and session_status["last_response"]:
                        # 使用process_agent_response处理之前的中断
                        result = process_agent_response(session_status["last_response"], user_id)

                        # 重新检查状态
                        current_status = get_agent_status(user_id)

                        # 如果通过处理中断后完成了会话，自动创建新会话
                        if current_status["status"] == "completed":
                            # 显示完成消息
                            console.print("[success]会话已完成[/success]")
                            console.print("[info]自动开始新会话...[/info]")
                            has_active_session = False
                            session_status = None
                        else:
                            # 更新会话状态
                            has_active_session = True
                            session_status = current_status

            # 获取用户查询
            query = Prompt.ask(
                "\n[info]请输入您的问题[/info] (输入 'exit' 退出，输入 'status' 查询状态，输入 'new' 开始新会话)",
                default="你好")

            # 处理特殊命令
            if query.lower() == 'exit':
                console.print("[info]感谢使用，再见！[/info]")
                break
            elif query.lower() == 'status':
                # 查询当前会话状态
                status_response = get_agent_status(user_id)
                console.print(Panel(
                    f"用户ID: {status_response['user_id']}\n"
                    f"会话ID: {status_response.get('session_id', '未知')}\n"
                    f"会话状态: {status_response['status']}\n"
                    f"上次查询: {status_response['last_query'] or '无'}\n"
                    f"上次更新: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(status_response['last_updated'])) if status_response.get('last_updated') else '未知'}\n",
                    title="[info]当前会话状态[/info]",
                    border_style="cyan"
                ))
                continue
            elif query.lower() == 'new':
                # 主动开始新会话 - 先删除服务端的旧会话
                console.print("[info]正在开始新会话...[/info]")
                try:
                    delete_response = delete_agent_session(user_id)
                    console.print(f"[success]已清理旧会话: {delete_response['message']}[/success]")
                except Exception as e:
                    console.print(f"[warning]清理旧会话时出错: {str(e)}[/warning]")
                    console.print("[info]将继续创建新会话...[/info]")

                # 重置本地状态
                has_active_session = False
                session_status = None
                console.print("[success]新会话已准备就绪！[/success]")
                continue

            # 调用智能体
            console.print("[info]正在提交查询到智能体...[/info]")
            response = invoke_agent(user_id, query)

            # 处理智能体响应
            result = process_agent_response(response, user_id)

            # 获取最新状态
            latest_status = get_agent_status(user_id)

            # 根据响应状态自动处理
            if latest_status["status"] == "completed":
                # 处理已完成状态 - 自动开始新会话
                console.print("[info]会话已完成，准备接收新的查询[/info]")
                has_active_session = False
                session_status = None
            elif latest_status["status"] == "error":
                # 处理错误状态 - 自动开始新会话
                console.print("[info]会话发生错误，将开始新会话[/info]")
                has_active_session = False
                session_status = None
            else:
                # 其他状态（idle、interrupted）- 保持会话活跃
                has_active_session = True
                session_status = latest_status

        except KeyboardInterrupt:
            console.print("\n[warning]用户中断，正在退出...[/warning]")
            # 保存当前状态，使会话可以在下次启动时恢复
            console.print("[info]会话状态已保存，可以在下次使用相同用户ID恢复[/info]")
            break
        except Exception as e:
            console.print(f"[error]运行过程中出错: {str(e)}[/error]")
            console.print(traceback.format_exc())
            # 尝试自动恢复或创建新会话
            has_active_session, session_status = check_and_restore_session(user_id)
            continue



if __name__ == "__main__":
    main()
