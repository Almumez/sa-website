"""Create a consistent SQLite snapshot and copy local R2 state without changing it.

Stop the local app before running so database and object storage remain consistent.
The backup contains account password hashes and must be kept private.
"""
from pathlib import Path
from datetime import datetime, timezone
import shutil
import sqlite3

root = Path(__file__).resolve().parent.parent
source = root / '.wrangler' / 'state' / 'v3'
if not source.is_dir():
    raise SystemExit('Local .wrangler/state/v3 was not found.')
target = root / 'backups' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
target.mkdir(parents=True, exist_ok=False)
for database in source.rglob('*.sqlite'):
    destination = target / database.relative_to(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as original:
        with sqlite3.connect(destination) as snapshot:
            original.backup(snapshot)
for blob_directory in source.rglob('blobs'):
    shutil.copytree(blob_directory, target / blob_directory.relative_to(source))
print('Private local backup:', target)
