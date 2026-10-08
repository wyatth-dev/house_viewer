"""检查构建产物是否符合 typology 契约（spec 13 节"契约"测试）。"""
from __future__ import annotations

import json
import struct
from pathlib import Path

from facade_modeler.build.typology import MODEL_FILES
from facade_modeler.spec.validate import Issue

TOLERANCE_MM = 1.0


def verify_build(directory: Path) -> list[Issue]:
    issues: list[Issue] = []
    scene_path = directory / "scene.json"
    if not scene_path.is_file():
        return [Issue("missing_file", "scene.json is missing")]
    scene = json.loads(scene_path.read_text(encoding="utf-8"))
    issues += _check_scene(scene)
    for mode, relative in MODEL_FILES.items():
        path = directory / relative
        if not path.is_file():
            issues.append(Issue("missing_file", f"{relative} is missing", [mode]))
            continue
        issues += _check_glb(path, mode, scene)
    return issues


def _check_scene(scene: dict) -> list[Issue]:
    issues = []
    if scene.get("units") != "mm" or scene.get("axes") != {"up": "+Y", "front": "+Z"}:
        issues.append(Issue("contract", "Units or axes do not match the typology contract"))
    calibration = scene["calibration"]
    footprint = calibration["sourceFootprint"]
    width = calibration["actualWidthMm"]
    if abs((footprint["maxX"] - footprint["minX"]) - width) > TOLERANCE_MM:
        issues.append(Issue("width_mismatch", "actualWidthMm does not match the envelope width along X"))
    faces = scene.get("installationFaces", [])
    facade_width = (footprint["maxZ"] - footprint["minZ"]
                    if faces and faces[0]["side"] in ("left", "right") else width)
    if len(faces) != 1 or abs(faces[0]["lengthMm"] - facade_width) > TOLERANCE_MM:
        issues.append(Issue("width_mismatch", "The installation face length must equal the facade width"))
    if calibration.get("yawDegrees") != 0:
        issues.append(Issue("contract", "yawDegrees must be 0"))
    return issues


def _check_glb(path: Path, mode: str, scene: dict) -> list[Issue]:
    data = path.read_bytes()
    magic, version, length = struct.unpack("<III", data[:12])
    if (magic, version, length) != (0x46546C67, 2, len(data)):
        return [Issue("invalid_glb", f"{path.name} ({mode}) is not a valid GLB 2.0 file", [mode])]
    gltf = json.loads(data[20:20 + struct.unpack("<I", data[12:16])[0]])
    issues = []
    if not all(m.get("doubleSided") for m in gltf["materials"]):
        issues.append(Issue("contract", f"{mode}: materials must be double-sided", [mode]))
    if "Facade" not in {mesh["name"] for mesh in gltf["meshes"]}:
        issues.append(Issue("contract", f"{mode}: the Facade mesh is missing", [mode]))
    footprint = scene["calibration"]["sourceFootprint"]
    for mesh in gltf["meshes"]:
        for primitive in mesh["primitives"]:
            if not {"POSITION", "NORMAL", "TEXCOORD_0"} <= set(primitive["attributes"]) or "indices" not in primitive:
                issues.append(Issue("contract", f"{mode}/{mesh['name']}: normals, UVs or indices are missing", [mode]))
            if mesh["name"] == "Facade":
                position = gltf["accessors"][primitive["attributes"]["POSITION"]]
                lateral = scene["installationFaces"][0]["side"] in ("left", "right")
                axis, name = (2, "Z") if lateral else (0, "X")
                if (abs(position["min"][axis] - footprint[f"min{name}"]) > TOLERANCE_MM
                        or abs(position["max"][axis] - footprint[f"max{name}"]) > TOLERANCE_MM):
                    issues.append(Issue("width_mismatch", f"{mode}: facade mesh width does not match scene.json", [mode]))
    return issues
