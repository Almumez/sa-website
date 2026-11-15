"""Package source only, excluding local JSON data, secrets and generated files."""
from pathlib import Path
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent
output = root / 'outputs' / 'files-portal-local-json.zip'
output.parent.mkdir(exist_ok=True)
names = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=root).decode('utf-8').split('\0')
excluded = {'.git', '.sites-runtime', '.wrangler', '.vinext', '.next', 'dist', 'node_modules', 'backups', 'data', 'outputs', 'work'}
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, strict_timestamps=False) as archive:
    for name in sorted(set(names)):
        if not name:
            continue
        relative = Path(name)
        if relative.parts[0] in excluded or relative.parts[0].startswith('data-import-') or (relative.name.startswith('.env') and relative.name != '.env.example') or relative.name.startswith('.dev.vars'):
            continue
        source = (root / relative).resolve()
        if not source.is_relative_to(root) or not source.is_file() or source.is_symlink():
            continue
        archive.write(source, name)
print(output)
print(f'{output.stat().st_size / 1024 / 1024:.2f} MB')
