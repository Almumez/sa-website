"""Read legacy local D1/R2 state into a staging directory. Never modify the source."""
from pathlib import Path
import hashlib
import json
import shutil
import sqlite3
import sys

source = Path(sys.argv[1]).resolve()
target = Path(sys.argv[2]).resolve()
target.mkdir(mode=0o700, parents=True, exist_ok=False)

def connect(filename):
    connection = sqlite3.connect(filename.resolve().as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    return connection

def find_database(directory, table):
    matches = []
    for filename in directory.rglob('*.sqlite'):
        with connect(filename) as connection:
            if connection.execute('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=?', (table,)).fetchone():
                matches.append(filename)
    if len(matches) != 1:
        raise RuntimeError(f'Expected exactly one local database with {table}; found {len(matches)}')
    return matches[0]

tables = ['documents', 'document_links', 'branding', 'portal_accounts', 'portal_settings', 'portal_sessions', 'portal_login_limits']
data = {'schemaVersion': 1}
with connect(find_database(source / 'd1', 'documents')) as connection:
    connection.execute('BEGIN')
    for table in tables:
        data[table] = [dict(row) for row in connection.execute('SELECT * FROM ' + table)]

with connect(find_database(source / 'r2', '_mf_objects')) as connection:
    objects = [dict(row) for row in connection.execute('SELECT key,blob_id,size,etag FROM _mf_objects')]
blob_paths = {}
for directory in (source / 'r2').rglob('blobs'):
    for filename in directory.iterdir():
        if filename.is_file():
            if filename.name in blob_paths:
                raise RuntimeError('Ambiguous local blob filename')
            blob_paths[filename.name] = filename

uploads = target / 'uploads'
uploads.mkdir(mode=0o700)
manifest = []
for obj in objects:
    filename = blob_paths.get(obj['blob_id'])
    if filename is None or filename.stat().st_size != obj['size']:
        raise RuntimeError('Missing or incomplete legacy object; migration stopped')
    content = filename.read_bytes()
    if hashlib.md5(content).hexdigest() != obj['etag'].strip('"'):
        raise RuntimeError('Legacy object checksum mismatch; migration stopped')
    hashed_key = hashlib.sha256(obj['key'].encode('utf-8')).hexdigest()
    destination = uploads / hashed_key
    shutil.copyfile(filename, destination)
    destination.chmod(0o600)
    manifest.append({'key': obj['key'], 'file': hashed_key, 'size': len(content), 'sha256': hashlib.sha256(content).hexdigest()})

lookup = {obj['key']: obj for obj in objects}
for document in data['documents']:
    if document['object_key'] not in lookup or lookup[document['object_key']]['size'] != document['size']:
        raise RuntimeError('A document has a missing or incomplete file; migration stopped')
for brand in data['branding']:
    if brand['logo_key'] and brand['logo_key'] not in lookup:
        raise RuntimeError('A logo file is missing; migration stopped')

for name, value in [('portal.json', data), ('migration-manifest.json', manifest)]:
    filename = target / name
    filename.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    filename.chmod(0o600)
print(json.dumps({'documents': len(data['documents']), 'accounts': len(data['portal_accounts']), 'objects': len(objects)}))
