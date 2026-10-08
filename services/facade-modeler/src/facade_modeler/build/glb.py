"""把 MeshModel 写成 GLB（glTF 2.0 二进制）。

移植自 house-viewer：scripts/typology/prepare-sunningdale.py 的 write_glb()；
材质改为由 MaterialDef 列表驱动，贴图由 textures.texture() 按素材生成。
"""
from __future__ import annotations

import io
import json
import struct
from pathlib import Path

import numpy as np

from facade_modeler.build.materials import MaterialDef
from facade_modeler.build.model import MeshModel
from facade_modeler.build.textures import texture

FLOAT, UINT = 5126, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


class _GlbBuilder:
    def __init__(self, mode: str):
        self.json: dict = {
            "asset": {"version": "2.0", "generator": "facade-modeler", "extras": {"representation": mode}},
            "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [],
            "accessors": [], "bufferViews": [], "materials": [],
        }
        self.binary = bytearray()

    def view(self, data: bytes, target=None) -> int:
        while len(self.binary) % 4:
            self.binary.append(0)
        view = {"buffer": 0, "byteOffset": len(self.binary), "byteLength": len(data)}
        if target:
            view["target"] = target
        self.json["bufferViews"].append(view)
        self.binary.extend(data)
        return len(self.json["bufferViews"]) - 1

    def accessor(self, values: np.ndarray, kind: str, component=FLOAT, target=ARRAY_BUFFER) -> int:
        values = np.ascontiguousarray(values, dtype="<f4" if component == FLOAT else "<u4")
        accessor = {"bufferView": self.view(values.tobytes(), target), "componentType": component,
                    "count": len(values), "type": kind}
        if kind in ("VEC3", "SCALAR"):
            flat = values.reshape(len(values), -1)
            accessor.update(min=flat.min(0).tolist(), max=flat.max(0).tolist())
        self.json["accessors"].append(accessor)
        return len(self.json["accessors"]) - 1

    def material(self, material: MaterialDef) -> None:
        if material.linear:
            base = list(material.color)
        else:
            base = [(c / 255) ** 2.2 for c in material.color] + [1.0]
        entry = {"name": material.name, "doubleSided": True, "pbrMetallicRoughness": {
            "baseColorFactor": base, "metallicFactor": material.metallic, "roughnessFactor": material.roughness}}
        if material.texture:
            color_map, normal_map = texture(material.texture, tuple(int(c) for c in material.color))
            entry["pbrMetallicRoughness"]["baseColorFactor"] = [1, 1, 1, 1]
            entry["pbrMetallicRoughness"]["baseColorTexture"] = {"index": self.image(color_map, material.name + "_color")}
            entry["normalTexture"] = {"index": self.image(normal_map, material.name + "_normal"), "scale": 0.45}
        self.json["materials"].append(entry)

    def image(self, image, name: str) -> int:
        self.json.setdefault("samplers", [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}])
        self.json.setdefault("images", [])
        self.json.setdefault("textures", [])
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        self.json["images"].append({"bufferView": self.view(buffer.getvalue()), "mimeType": "image/png", "name": name})
        self.json["textures"].append({"source": len(self.json["images"]) - 1, "sampler": 0})
        return len(self.json["textures"]) - 1

    def mesh(self, name: str, groups) -> None:
        primitives = []
        for material in sorted(groups):
            group = groups[material]
            positions = np.concatenate(group.triangles).reshape(-1, 3)
            normals = np.concatenate(group.normals).reshape(-1, 3)
            uvs = np.concatenate(group.uvs).reshape(-1, 2)
            primitives.append({
                "attributes": {"POSITION": self.accessor(positions, "VEC3"), "NORMAL": self.accessor(normals, "VEC3"),
                               "TEXCOORD_0": self.accessor(uvs, "VEC2")},
                "indices": self.accessor(np.arange(len(positions)), "SCALAR", UINT, ELEMENT_ARRAY_BUFFER),
                "material": material,
            })
        if not primitives:
            return
        self.json["meshes"].append({"name": name, "primitives": primitives})
        self.json["nodes"].append({"name": name, "mesh": len(self.json["meshes"]) - 1})
        self.json["scenes"][0]["nodes"].append(len(self.json["nodes"]) - 1)

    def to_bytes(self) -> bytes:
        while len(self.binary) % 4:
            self.binary.append(0)
        self.json["buffers"] = [{"byteLength": len(self.binary)}]
        text = json.dumps(self.json, separators=(",", ":")).encode()
        text += b" " * (-len(text) % 4)
        header = struct.pack("<III", 0x46546C67, 2, 28 + len(text) + len(self.binary))
        return (header + struct.pack("<II", len(text), 0x4E4F534A) + text
                + struct.pack("<II", len(self.binary), 0x004E4942) + bytes(self.binary))


def write_glb(model: MeshModel, dest: Path) -> Path:
    builder = _GlbBuilder(model.mode)
    for material in model.materials:
        builder.material(material)
    for name, groups in model.meshes:
        builder.mesh(name, groups)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(builder.to_bytes())
    return dest
