import shutil
from pathlib import Path


def sync(source, target, dry_run=False):
    for path in Path(source).rglob("*"):
        dest = Path(target) / path.relative_to(source)
        if path.is_file() and not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
