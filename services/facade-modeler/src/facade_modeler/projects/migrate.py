"""旧数据迁移：data/intake、data/typologies → data/projects/p-0001（复制，不删除旧目录，只迁一次）。"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Optional

from facade_modeler.photo_model.lock import project_lock
from facade_modeler.projects.store import ProjectRegistry

MARKER = ".migrated"


def migrate_legacy(data: Path, registry: ProjectRegistry) -> Optional[str]:
    intake, typologies = Path(data) / "intake", Path(data) / "typologies"
    marker = registry.root / MARKER
    with project_lock(registry.root / ".index.lock"):
        if marker.exists() or registry.list():
            return None
        if not intake.is_dir() and not typologies.is_dir():
            return None
        document = registry.create("My first project")
        try:
            if intake.is_dir():
                shutil.copytree(intake, registry.photo_models_dir(document.id), dirs_exist_ok=True)
            if typologies.is_dir():
                shutil.copytree(typologies, registry.typologies_dir(document.id), dirs_exist_ok=True)
        except BaseException:
            registry.delete(document.id)  # 不留半迁移的项目；没有标记，下次启动会重试
            registry.index_path.unlink(missing_ok=True)  # 此时目录表为空：连同 id 计数一起回到初始状态
            raise
        marker.write_text("migrated from data/intake and data/typologies\n", encoding="utf-8")  # 最后写标记
        return document.id


def split_legacy_photo_projects(registry: ProjectRegistry) -> list[str]:
    """旧迁移把照片模型合在 p-0001；逐个复制成独立项目，原数据保留。"""
    import json
    from facade_modeler.projects.model import House
    from facade_modeler.projects.store import _atomic_write

    source = 'p-0001'
    catalog = registry.typologies_dir(source) / 'index.json'
    ledger = registry.root / '.photo-projects-migrated.json'
    if not (registry.root / MARKER).exists() or not catalog.exists():
        return []
    created = []
    with project_lock(registry.root / '.index.lock'):
        completed = json.loads(ledger.read_text()) if ledger.exists() else {}
        rows = json.loads(catalog.read_text()).get('typologies', [])
        for row in rows:
            mid = row['id']
            if mid in completed:
                continue
            # 仅处理迁移目录里的已发布模型；不删除原始工作区和当前项目。
            published = registry.typologies_dir(source) / mid
            if not published.is_dir():
                continue
            doc = registry.create(row.get('name') or mid)
            try:
                workspace = registry.photo_models_dir(source) / mid
                if workspace.is_dir():
                    shutil.copytree(workspace, registry.photo_models_dir(doc.id) / mid)
                shutil.copytree(published, registry.typologies_dir(doc.id) / mid)
                _atomic_write(registry.typologies_dir(doc.id) / 'index.json',
                              json.dumps({'schemaVersion': 1, 'typologies': [row]}, indent=2))
                payload = doc.model_copy(update={'house': House(source='photo', typology_id=mid)})
                registry.save(doc.id, payload.model_dump(by_alias=True))
                completed[mid] = doc.id
                _atomic_write(ledger, json.dumps(completed, indent=2))
            except BaseException:
                completed.pop(mid, None)
                registry.delete(doc.id)
                raise
            created.append(doc.id)
    return created
