#!/usr/bin/env python3
"""Build via a local Go module proxy zip, then execute helper/extensions without source or npm CLI."""
import json, os, pathlib, shutil, subprocess, tempfile, zipfile
root = pathlib.Path(__file__).resolve().parents[2]
module = 'github.com/octane-xplat/nativescript-cli'
version = 'v' + json.loads((root / 'package.json').read_text())['version']
with tempfile.TemporaryDirectory(prefix='j1-distribution-') as tmp:
    work = pathlib.Path(tmp)
    proxy = work / 'proxy' / module / '@v'
    proxy.mkdir(parents=True)
    (proxy / (version + '.mod')).write_bytes((root / 'go.mod').read_bytes())
    (proxy / (version + '.info')).write_text(json.dumps({'Version': version, 'Time': '2026-11-03T00:00:00Z'}))
    (proxy / 'list').write_text(version + '\n')
    files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
    with zipfile.ZipFile(proxy / (version + '.zip'), 'w') as archive:
        for file in files:
            if file and (root / file).is_file():
                archive.write(root / file, module + '@' + version + '/' + file)
    # Seed only declared dependency module artifacts into the isolated file proxy.
    depsmod = work / 'dependencies.mod'
    depsmod.write_bytes((root / 'go.mod').read_bytes())
    depsmod.with_suffix('.sum').write_bytes((root / 'go.sum').read_bytes())
    downloads = subprocess.check_output(['go', 'mod', 'download', '-modfile='+str(depsmod), '-json', 'all'], cwd=root, text=True)
    decoder = json.JSONDecoder()
    while downloads.strip():
        item, end = decoder.raw_decode(downloads.lstrip())
        downloads = downloads.lstrip()[end:]
        for key in ['Info', 'GoMod', 'Zip']:
            source = pathlib.Path(item[key])
            cache = pathlib.Path(subprocess.check_output(['go','env','GOMODCACHE'],cwd=root,text=True).strip()) / 'cache/download'
            target = work / 'proxy' / source.relative_to(cache)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source.parent,target.parent,dirs_exist_ok=True)
    consumer = work / 'consumer'
    consumer.mkdir()
    (consumer / 'main.go').write_bytes((root / 'tools/helper/consumer/main.go').read_bytes())
    (consumer / 'fixture.pbxproj').write_bytes((root / 'internal/jsbridge/testdata/project.pbxproj').read_bytes())
    (consumer / 'go.mod').write_text('module example.invalid/consumer\n\ngo 1.26.0\n\nrequire ' + module + ' ' + version + '\n')
    env = dict(os.environ, GOPROXY=(work / 'proxy').as_uri(), GOSUMDB='off', GOMODCACHE=str(work / 'modcache'), GOWORK='off')
    subprocess.run(['go', 'mod', 'tidy'], cwd=consumer, env=env, check=True)
    subprocess.run(['go', 'build', '-o', str(work / 'consumer-bin'), '.'], cwd=consumer, env=env, check=True)
    extensions = work / 'extensions'
    extensions.mkdir()
    (extensions / 'go.mod').write_bytes((consumer / 'go.mod').read_bytes())
    (extensions / 'main.go').write_bytes((root / 'tools/extensions/consumer/main.go').read_bytes())
    subprocess.run(['go', 'mod', 'tidy'], cwd=extensions, env=env, check=True)
    subprocess.run(['go', 'build', '-o', str(work / 'extension-consumer'), '.'], cwd=extensions, env=env, check=True)
    runtime = work / 'IOS-RUNTIME-FIXTURE'
    shutil.copytree(root / 'internal/ios/prepare/testdata/runtime', runtime)
    # Distribution execution has no checkout cwd, compiler, npm or source module cache.
    for directory, _, _ in os.walk(work / 'modcache'):
        os.chmod(directory, 0o700)
    shutil.rmtree(work / 'modcache')
    shutil.rmtree(work / 'proxy')
    shutil.rmtree(extensions)
    nodebin = work / 'node-only-path'
    nodebin.mkdir()
    (nodebin / 'node').symlink_to(shutil.which('node'))
    env['PATH'] = str(nodebin)
    env.pop('NODE_OPTIONS', None)
    env.pop('NODE_PATH', None)
    fifo = work / 'blocked.pbxproj'
    os.mkfifo(fifo)
    subprocess.run([str(work / 'consumer-bin'), str(consumer / 'fixture.pbxproj'), str(fifo), version[1:]], cwd=work, env=env, check=True)
    subprocess.run([str(work / 'extension-consumer'), str(runtime)], cwd=work, env=env, check=True)
