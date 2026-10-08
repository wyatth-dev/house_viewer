"""测试共用的小工具：构造 HouseSpec 与读取 fixture。"""
import json
from pathlib import Path

from facade_modeler.config import load_defaults
from facade_modeler.spec.model import HouseSpec, Opening

FIXTURES = Path(__file__).parent / "fixtures"


def make_spec(width=6000.0, roof_type="gable", ridge="parallel", eave=3000.0, pitch=45.0, depth=8000.0):
    spec = HouseSpec.new("test", load_defaults())
    spec.facade.width_mm = width
    spec.roof.type = roof_type
    spec.roof.ridge = ridge
    spec.roof.eave_height_mm = eave
    spec.roof.pitch_deg = pitch
    spec.massing.depth_mm = depth
    return spec


def add_opening(spec, asset="win/casement", u=1500.0, sill=900.0, w=1200.0, h=1200.0, **params):
    opening = Opening(id=spec.next_id("o"), asset=asset, u_mm=u, sill_mm=sill, width_mm=w, height_mm=h, params=params)
    spec.facade.openings.append(opening)
    return opening


def sunningdale_spec():
    data = json.loads((FIXTURES / "sunningdale_back.json").read_text(encoding="utf-8"))
    return HouseSpec.model_validate(data)


def jpeg_bytes(size=(640, 480), color=(180, 170, 160)) -> bytes:
    """一张真实可解码的 JPEG（上传接口会拒绝非图片）。"""
    import io

    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="JPEG")
    return buffer.getvalue()
