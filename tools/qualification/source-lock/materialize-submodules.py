#!/usr/bin/env python3
"""Materialize the original native app's two exact vendor gitlinks."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat

PARENT = 'b58567933b22fc6ff076f366fba61926a090f8e4'
PINS = [
    ('packages/lottie/src/vendor/ui-lottie', 'octane-xplat/ui-lottie', '7c8a2745a9c35200f97f2dee6851a8c54d13baaa', 'eb1007c3d92103f35f10667fc8e36fb17516b11e'),
    ('packages/ui/src/vendor/ui-svg', 'octane-xplat/ui-svg', '9ca8f44e1e6509b78b0773ad86507ea93751d62b', '910723420696d601d18bb49799d771df3cd7eff0'),
]


def git_object(kind, data):
    return hashlib.sha1(kind + b' ' + str(len(data)).encode() + b'\0' + data).digest()


NESTED_LINKS = {
    'octane-xplat/ui-lottie': {'demo-ng': '9cf992d5dac51e52d1a5fc6eea131a383a0b5e67', 'demo-vue': '4e75ceb8f8b70e9f2bece00dcfbd0bd96c9f060a', 'tools': '4950c583ff075d2af8b2cbcba2c82754048aa158'},
    'octane-xplat/ui-svg': {},
}


def git_tree(root, gitlinks=None, relative=''):
    gitlinks = gitlinks or {}
    entries = []
    names = {p.name for p in root.iterdir()} if root.is_dir() else set()
    for pin in gitlinks:
        rel = Path(pin)
        if str(rel.parent) == (relative or '.'):
            names.add(rel.name)
    for name in names:
        if name == '.git':
            continue
        file = root / name
        rel = str(Path(relative) / name)
        if rel in gitlinks:
            mode_, content, sort = b'160000', bytes.fromhex(gitlinks[rel]), os.fsencode(name)
        else:
            mode = file.lstat().st_mode
            if stat.S_ISLNK(mode):
                mode_, content, sort = b'120000', git_object(b'blob', os.fsencode(os.readlink(file))), os.fsencode(name)
            elif stat.S_ISREG(mode):
                mode_, content, sort = b'100755' if mode & 0o111 else b'100644', git_object(b'blob', file.read_bytes()), os.fsencode(name)
            elif stat.S_ISDIR(mode):
                if not any(file.iterdir()) and not any(str(Path(pin).parent) == rel for pin in gitlinks):
                    continue
                mode_, content, sort = b'40000', bytes.fromhex(git_tree(file, gitlinks, rel)), os.fsencode(name) + b'/'
            else:
                raise ValueError('Unsupported source entry')
        entries.append((sort, mode_ + b' ' + os.fsencode(name) + b'\0' + content))
    return git_object(b'tree', b''.join(value for _, value in sorted(entries))).hex()


def require_unmaterialized(root, gitlinks):
    for relative in gitlinks:
        file = root / relative
        if file.is_symlink() or (file.exists() and (not file.is_dir() or any(file.iterdir()))):
            raise ValueError('Nested gitlink must be absent or empty: ' + relative)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workspace', type=Path)
    parser.add_argument('lottie_source', type=Path)
    parser.add_argument('svg_source', type=Path)
    parser.add_argument('new_report', type=Path)
    args = parser.parse_args()
    root = args.workspace.resolve()
    proof = json.loads((root / 'stage-proof.json').read_text())
    if proof['reference'] != PARENT or proof.get('sourceGitTree') != 'ea8c71e61e325d3aa185d3626de6f8b2dacc10ec' or args.new_report.exists():
        raise ValueError('Use the original frozen fixture and a new report')
    modules = root / '.gitmodules'
    expected = next(r['sha256'] for r in proof['records'] if r['path'] == '.gitmodules')
    if hashlib.sha256(modules.read_bytes()).hexdigest() != expected:
        raise ValueError('Original submodule declarations changed')
    sources = [args.lottie_source.resolve(), args.svg_source.resolve()]
    for (relative, repo, commit, tree), source in zip(PINS, sources):
        destination = root / relative
        if not destination.is_dir() or destination.is_symlink() or any(destination.iterdir()) or not destination.resolve().is_relative_to(root):
            raise ValueError('Original gitlink destination must be empty and owned')
        require_unmaterialized(source, NESTED_LINKS[repo])
        if git_tree(source, NESTED_LINKS[repo]) != tree:
            raise ValueError('Source does not match original pinned Git tree: ' + repo)
    results = []
    for (relative, repo, commit, tree), source in zip(PINS, sources):
        destination = root / relative
        shutil.copytree(source, destination, dirs_exist_ok=True, symlinks=True, ignore=shutil.ignore_patterns('.git'))
        if git_tree(destination, NESTED_LINKS[repo]) != tree:
            raise ValueError('Copied vendor tree differs')
        files = {str(p.relative_to(destination)): hashlib.sha256(p.read_bytes()).hexdigest() for p in destination.rglob('*') if p.is_file() and not p.is_symlink()}
        results.append({'path': relative, 'repository': repo, 'gitlinkCommit': commit, 'gitTree': tree, 'source': str(source), 'unmaterializedNestedGitlinks': NESTED_LINKS[repo], 'filesSHA256': files})
    result = {'scope': 'original parent gitlinks materialized with independently computed Git tree identities; no package update, API, bundle or native acceptance', 'parentCommit': PARENT, 'passed': True, 'submodules': results}
    descriptor = os.open(args.new_report, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        json.dump(result, output, indent=2)
        output.write('\n')
    args.new_report.chmod(0o600)
    print(json.dumps({'passed': True, 'submodules': len(results), 'files': sum(len(row['filesSHA256']) for row in results)}))


if __name__ == '__main__':
    main()
