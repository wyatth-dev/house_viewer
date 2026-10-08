"""所有操作的统一返回结构：{ok, result, issues, images}。"""
from __future__ import annotations

from dataclasses import dataclass, field

from PIL import Image

from facade_modeler.spec.validate import Issue


@dataclass
class Result:
    ok: bool
    result: dict = field(default_factory=dict)
    issues: list[Issue] = field(default_factory=list)
    images: list[Image.Image] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"ok": self.ok, "result": self.result, "issues": [i.to_dict() for i in self.issues]}


def ok(result: dict | None = None, issues=None, images=None) -> Result:
    return Result(True, result or {}, list(issues or []), list(images or []))


def fail(message: str, **extra) -> Result:
    """参数非法：拒绝并说明原因，不写入任何东西。"""
    return Result(False, {"error": message, **extra})
