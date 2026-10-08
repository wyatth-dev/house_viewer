"""导出 HouseSpec 的 JSON Schema，供查看页等 TS 代码共享。"""
import json
from pathlib import Path

from facade_modeler.config import PACKAGE_ROOT
from facade_modeler.spec.model import HouseSpec

SCHEMA_PATH = PACKAGE_ROOT / "schema" / "house-spec.schema.json"


def export_schema(path: Path = SCHEMA_PATH) -> Path:
    schema = HouseSpec.model_json_schema(by_alias=True)
    path.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


if __name__ == "__main__":
    print(export_schema())
