"""Temporary, hash-verified transport of the locally reviewed source diff.

This installer and its six chunks are removed before the PR is merged.
"""
from pathlib import Path
import hashlib
import lzma
import subprocess

root = Path(__file__).resolve().parents[1]
parts = root / 'scripts' / 'pr14-patch'
compressed = b''.join((parts / f'{i:02d}').read_bytes() for i in range(6))
assert hashlib.sha256(compressed).hexdigest() == '3e2ab51def46aae2c2279495c0949b7b54f9f6c54da105f40cb5947de796c854', 'Transport checksum mismatch'
patch = lzma.decompress(compressed)
assert hashlib.sha256(patch).hexdigest() == '3baf19ebe36c38c3257235abdcd52c083fed7ebae673b28d18ec1fbec06bd74e', 'Source checksum mismatch'
subprocess.run(['git', 'apply', '--check', '-'], input=patch, cwd=root, check=True)
subprocess.run(['git', 'apply', '-'], input=patch, cwd=root, check=True)
subprocess.run(['git', 'diff', '--check'], cwd=root, check=True)
print('Applied exact reviewed OrgFlow 2.1 source diff.')
