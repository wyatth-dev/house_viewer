"""文件式照片模型存储。"""
import json

import pytest

from facade_modeler.config import load_defaults
from facade_modeler.photo_model.store import PhotoModelStore
from facade_modeler.spec.model import HouseSpec


@pytest.fixture
def store(tmp_path):
    return PhotoModelStore(tmp_path)


def test_create_open_list(store):
    project = store.create()
    assert project.id == "house-001"
    assert store.create().id == "house-002"
    assert store.list() == ["house-001", "house-002"]
    assert store.open("house-001").load_spec().id == "house-001"


def test_open_missing_raises(store):
    with pytest.raises(KeyError):
        store.open("house-999")


def test_spec_roundtrip(store):
    project = store.create()
    spec = project.load_spec()
    spec.facade.width_mm = 7000
    project.save_spec(spec)
    assert store.open(project.id).load_spec().facade.width_mm == 7000


def test_photo_ids_increment(store):
    project = store.create()
    assert project.add_photo(b"abc", "IMG_1.JPG") == "p1"
    assert project.add_photo(b"def", "back.png") == "p2"
    spec = project.load_spec()
    assert spec.photos["p1"].file == "photos/p1.jpg"
    assert spec.photos["p1"].primary is True and spec.photos["p2"].primary is False
    assert project.photo_path("p2").read_bytes() == b"def"


def test_build_versions_and_latest(store):
    project = store.create()
    v1, dir1 = project.new_build()
    v2, _ = project.new_build()
    assert (v1, v2) == (1, 2) and dir1.is_dir()
    assert project.latest_build() is None
    project.commit_build(v1)
    assert project.latest_build() == 1


def test_ops_log_appends_jsonl(store):
    project = store.create()
    project.append_op("set_roof", {"pitchDeg": 35})
    project.append_op("build", {})
    lines = (project.root / "ops.jsonl").read_text().splitlines()
    assert [json.loads(line)["tool"] for line in lines] == ["set_roof", "build"]


def test_status(store):
    project = store.create()
    assert project.get_status()["state"] == "draft"
    project.set_status("submitted", "完成")
    assert project.get_status() == {"state": "submitted", "note": "完成"}


def test_lock_is_reentrant_per_process(store):
    project = store.create()
    with project.lock():
        project.save_spec(HouseSpec.new(project.id, load_defaults()))
