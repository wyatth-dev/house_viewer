import json

import pytest

from facade_modeler.projects.migrate import migrate_legacy
from facade_modeler.projects.store import (
    InvalidProject, ProjectNotFound, ProjectRegistry, ProjectUnreadable, RevisionConflict,
)

PRODUCT = {
    "instanceId": "varenda-1", "productType": "varenda", "name": "Varenda 1",
    "attachment": {"wallFaceId": "facade-main", "alongWallOffsetMm": 1200},
    "params": {"widthMm": 4000, "depthMm": 2000, "wallHeightMm": 2500, "undersideHeightMm": 1800,
               "postInterval": 1000, "rafterInterval": 500},
    "lockedDimensions": [], "lockedParameters": [],
}


def test_create_and_get_default_project(tmp_path):
    registry = ProjectRegistry(tmp_path / "projects")
    doc = registry.create("My house")
    assert doc.id == "p-0001" and doc.revision == 0
    dumped = doc.model_dump(by_alias=True)
    assert dumped["house"] == {"source": "preset", "typologyId": "fairy-house"}
    assert dumped["site"]["dimensionsMm"] == {"front": 5000, "back": 7000, "left": 2000, "right": 2000}
    assert dumped["display"] == {"representation": "render", "trees": True, "fence": False, "dimensions": True}
    assert dumped["media"] == {"renders": [], "references": []}
    assert dumped["schemaVersion"] == 1 and dumped["products"] == []
    assert registry.get("p-0001") == doc
    assert registry.list()[0]["name"] == "My house"
    assert registry.create().name == "Untitled project"
    assert registry.create().id == "p-0003"


def test_save_increments_revision_and_updates_index(tmp_path):
    registry = ProjectRegistry(tmp_path / "projects")
    doc = registry.create("A")
    before = registry.list()[0]["updatedAt"]
    payload = doc.model_dump(by_alias=True)
    payload["site"]["dimensionsMm"]["front"] = 8000
    payload["updatedAt"] = "1999-01-01T00:00:00"
    saved = registry.save("p-0001", payload)
    assert saved.revision == 1
    assert registry.get("p-0001").site.dimensions_mm.front == 8000
    row = registry.list()[0]
    assert row["updatedAt"] == saved.updated_at and row["updatedAt"] >= before and row["updatedAt"] != "1999-01-01T00:00:00"


def test_save_with_stale_revision_conflicts(tmp_path):
    registry = ProjectRegistry(tmp_path / "projects")
    payload = registry.create("A").model_dump(by_alias=True)
    registry.save("p-0001", payload)
    with pytest.raises(RevisionConflict) as caught:
        registry.save("p-0001", payload)
    assert caught.value.current.revision == 1


def test_save_rejects_invalid_document(tmp_path):
    registry = ProjectRegistry(tmp_path / "projects")
    payload = registry.create("A").model_dump(by_alias=True)
    bad = {**payload, "products": [{**PRODUCT, "params": {**PRODUCT["params"], "widthMm": "wide"}}]}
    with pytest.raises(InvalidProject) as caught:
        registry.save("p-0001", bad)
    assert "widthMm" in str(caught.value)
    with pytest.raises(InvalidProject):
        registry.save("p-0001", {**payload, "foo": 1})
    good = registry.save("p-0001", {**payload, "products": [PRODUCT]})
    assert good.products[0].params.width_mm == 4000
    with pytest.raises(ProjectNotFound):
        registry.save("p-0099", payload)


def test_unreadable_project_is_not_overwritten(tmp_path):
    registry = ProjectRegistry(tmp_path / "projects")
    payload = registry.create("A").model_dump(by_alias=True)
    path = registry.directory("p-0001") / "project.json"
    path.write_text("{bad", encoding="utf-8")
    with pytest.raises(ProjectUnreadable):
        registry.get("p-0001")
    with pytest.raises(ProjectUnreadable):
        registry.save("p-0001", payload)
    assert path.read_text(encoding="utf-8") == "{bad"
    path.write_text(json.dumps({**payload, "schemaVersion": 9}), encoding="utf-8")
    with pytest.raises(ProjectUnreadable):
        registry.get("p-0001")


def test_delete_removes_photo_models_and_typologies(tmp_path):
    registry = ProjectRegistry(tmp_path / "projects")
    registry.create("A")
    for folder in (registry.photo_models_dir("p-0001"), registry.typologies_dir("p-0001")):
        (folder / "x").mkdir(parents=True)
        (folder / "x" / "f.txt").write_text("1")
    registry.delete("p-0001")
    assert not registry.directory("p-0001").exists()
    assert registry.list() == []
    with pytest.raises(ProjectNotFound):
        registry.delete("p-0001")


def _legacy(tmp_path):
    (tmp_path / "intake" / "house-001").mkdir(parents=True)
    (tmp_path / "intake" / "house-001" / "spec.json").write_text("{}")
    (tmp_path / "typologies" / "house-001").mkdir(parents=True)
    (tmp_path / "typologies" / "index.json").write_text('{"schemaVersion":1,"typologies":[{"id":"house-001"}]}')
    (tmp_path / "typologies" / "house-001" / "scene.json").write_text("{}")


def test_migration_copies_legacy_data_once(tmp_path):
    _legacy(tmp_path)
    registry = ProjectRegistry(tmp_path / "projects")
    assert migrate_legacy(tmp_path, registry) == "p-0001"
    assert registry.get("p-0001").name == "My first project"
    assert (registry.photo_models_dir("p-0001") / "house-001" / "spec.json").exists()
    assert (registry.typologies_dir("p-0001") / "house-001" / "scene.json").exists()
    assert (registry.typologies_dir("p-0001") / "index.json").exists()
    assert (tmp_path / "intake" / "house-001" / "spec.json").exists()
    assert (tmp_path / "typologies" / "house-001" / "scene.json").exists()


def test_migration_runs_once(tmp_path):
    _legacy(tmp_path)
    registry = ProjectRegistry(tmp_path / "projects")
    migrate_legacy(tmp_path, registry)
    assert migrate_legacy(tmp_path, registry) is None
    assert migrate_legacy(tmp_path, ProjectRegistry(tmp_path / "projects")) is None
    assert len(registry.list()) == 1
    assert (tmp_path / "projects" / ".migrated").exists()


def test_deleted_migrated_project_is_not_resurrected(tmp_path):
    _legacy(tmp_path)
    registry = ProjectRegistry(tmp_path / "projects")
    migrate_legacy(tmp_path, registry)
    registry.delete("p-0001")
    assert migrate_legacy(tmp_path, ProjectRegistry(tmp_path / "projects")) is None
    assert registry.list() == []


def test_failed_migration_leaves_no_marker_and_retries(tmp_path, monkeypatch):
    import shutil
    _legacy(tmp_path)
    registry = ProjectRegistry(tmp_path / "projects")
    real = shutil.copytree
    monkeypatch.setattr(shutil, "copytree", lambda *a, **k: (_ for _ in ()).throw(OSError("disk full")))
    with pytest.raises(OSError):
        migrate_legacy(tmp_path, registry)
    assert not (tmp_path / "projects" / ".migrated").exists()
    assert registry.list() == []
    monkeypatch.setattr(shutil, "copytree", real)
    assert migrate_legacy(tmp_path, registry) == "p-0001"
    assert (registry.photo_models_dir("p-0001") / "house-001" / "spec.json").exists()


def test_no_migration_without_legacy_data(tmp_path):
    registry = ProjectRegistry(tmp_path / "projects")
    assert migrate_legacy(tmp_path, registry) is None
    assert registry.list() == []


def test_legacy_photo_houses_become_independent_projects_without_losing_sources(tmp_path):
    from facade_modeler.projects.migrate import split_legacy_photo_projects
    registry = ProjectRegistry(tmp_path / 'projects')
    original = registry.create('My first project')
    (registry.root / '.migrated').write_text('legacy migration completed')
    model = registry.photo_models_dir(original.id) / 'house-002'
    model.mkdir()
    (model / 'spec.json').write_text('{"name":"TestHouse-002"}')
    published = registry.typologies_dir(original.id) / 'house-002'
    published.mkdir()
    (published / 'scene.json').write_text('{}')
    row = {'id': 'house-002', 'name': 'TestHouse-002', 'manifest': 'house-002/scene.json'}
    (published.parent / 'index.json').write_text(json.dumps({'schemaVersion': 1, 'typologies': [row]}))
    split_legacy_photo_projects(registry)
    created = [r for r in registry.list() if r['id'] != original.id]
    assert len(created) == 1
    doc = registry.get(created[0]['id'])
    assert doc.name == 'TestHouse-002'
    assert doc.house.source == 'photo' and doc.house.typology_id == 'house-002'
    assert (registry.photo_models_dir(doc.id) / 'house-002/spec.json').exists()
    assert (registry.typologies_dir(doc.id) / 'house-002/scene.json').exists()
    assert (model / 'spec.json').exists()
    split_legacy_photo_projects(registry)
    assert len(registry.list()) == 2
