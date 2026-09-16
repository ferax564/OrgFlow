"""Temporary checksum-verified source transport; removed before merging."""
from pathlib import Path
import hashlib
import lzma
import subprocess

root = Path(__file__).resolve().parents[1]
compressed = b''.join((root / 'scripts' / 'pr14-patch' / f'{i:02d}').read_bytes() for i in range(6))
assert hashlib.sha256(compressed).hexdigest() == '3e2ab51def46aae2c2279495c0949b7b54f9f6c54da105f40cb5947de796c854'
patch = lzma.decompress(compressed)
assert hashlib.sha256(patch).hexdigest() == '3baf19ebe36c38c3257235abdcd52c083fed7ebae673b28d18ec1fbec06bd74e'
subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=root, check=True)
subprocess.run(['git', 'apply', '-'], input=patch, cwd=root, check=True)

def replace_once(path, old, new):
    file = root / path
    text = file.read_text()
    assert text.count(old) == 1, f'Unexpected source at {path}'
    file.write_text(text.replace(old, new, 1))

# Preserve no-undef; these callbacks execute in the browser, not Node.
replace_once('scripts/capture-examples.cjs', "'use strict';", "'use strict';\n/* global document, localStorage */")
replace_once('README.md', '| Shareable HTML snapshot | Self-contained page with the chart inline and workspace JSON for restore |', '| Chart-only HTML | Self-contained visible chart without workspace JSON or hidden scenarios; not a restorable backup |')
replace_once('README.md', '- **Multi-select** with ⌘/Ctrl-click or Shift-click (or the checkboxes on Positions). The bulk bar applies type/tag, group, site, approval, hiring state, start/end dates, cost center or job family to the selection; empty fields stay unchanged and Vacant/Recruiting unassigns the seat.', '- **Multi-select** with ⌘/Ctrl-click or Shift-click (or the checkboxes on Positions). Open the bulk-edit sheet, choose Keep / Set / Clear per field, review the changes, then apply atomically. Keep is the default; Vacant/Recruiting explicitly unassigns a snapshot seat.')
replace_once('electron-builder.yml', '  - README.md\n', '  - README.md\n  - MANAGEMENT.md\n')
# Playwright's expression polling uses eval, which the real host correctly bans.
# Function polling needs no unsafe-eval and leaves the actual CSP unchanged.
f = root / 'tests/browser-regressions.py'
t = f.read_text()
assert t.count('wait_for_function(') == 6
t = t.replace('wait_for_function("', 'wait_for_function("() => ').replace("wait_for_function('", "wait_for_function('() => ")
f.write_text(t)
subprocess.run(['git', 'diff', '--check'], cwd=root, check=True)
print('Applied reviewed source and explicit lint/documentation/CSP-test corrections.')
