# backend/app/core/exceptions.py


class BusinessError(Exception):
    """业务异常基类，携带 HTTP 状态码供 handler 转换"""
    status_code: int = 400

    def __init__(self, message: str):
        self.message = message
        super().__init__(message)


class TaskNotFoundError(BusinessError):
    status_code = 404


class TaskStateError(BusinessError):
    status_code = 409  # Conflict — 状态不允许该操作


class InvalidDecisionError(BusinessError):
    status_code = 400
