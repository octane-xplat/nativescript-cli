#!/usr/bin/env python3
"""Local, non-release qualification: actual host binary, labeled foreign fixtures."""
import json, os, pathlib, shutil, subprocess, tempfile, tarfile, signal, time
root = pathlib.Path(__file__).resolve().parents[2]
def run(args, cwd, **kwargs):
    return subprocess.run(args, cwd=cwd, check=True, text=True, **kwargs)
def output(args, cwd):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()
with tempfile.TemporaryDirectory(prefix='q1 npm distribution ') as tmp:
    work = pathlib.Path(tmp)
    host = output(['node', '-p', 'process.platform+"-"+process.arch'], root)
    version = json.loads((root/'package.json').read_text())['version']
    binary = work/'real-cli'
    run(['go', 'build', '-o', str(binary), './cmd/xplat-ns'], root)
    fixture = work/'FIXTURE-NOT-A-NATIVE-BINARY'
    fixture.write_text('Q1 packaging fixture; never execute as native evidence\n')
    targets = ['darwin-arm64','darwin-x64','linux-arm64','linux-x64','win32-arm64','win32-x64']
    inputs = work/'binaries.json'
    inputs.write_text(json.dumps({t:str(binary if t == host else fixture) for t in targets}))
    bad = work/'bad.json'; bad.write_text(json.dumps({'freebsd-x64':str(fixture)}))
    rejected = subprocess.run(['node','tools/packaging/stage.mjs',str(bad),str(work/'rejected')],cwd=root,capture_output=True,text=True)
    assert rejected.returncode != 0 and not (work/'rejected').exists()
    staged = work/'staged'
    run(['node','tools/packaging/stage.mjs',str(inputs),str(staged)],root)
    tarballs = {}
    for target in targets+['launcher']:
        directory = staged/target
        manifest = json.loads((directory/'package.json').read_text())
        assert manifest['version'] == version and manifest['private'] is True
        assert (directory/'NOTICES.txt').read_bytes() == (root/'assets/NOTICES.txt').read_bytes()
        if target != 'launcher':
            assert manifest['os'] == [target.split('-')[0]]
            assert manifest['cpu'] == [target.split('-')[1]]
        packed = json.loads(output(['npm','pack','--ignore-scripts','--json'],directory))[0]
        tarballs[target] = directory/packed['filename']
        with tarfile.open(tarballs[target]) as archive:
            names = archive.getnames()
            assert 'package/NOTICES.txt' in names and 'package/LICENSE' in names
            assert not any('node_modules' in n or n.endswith('.go') for n in names)
    consumer = work/'isolated consumer'
    consumer.mkdir()
    # Direct local tarball dependencies satisfy the launcher's exact optional version.
    consumer.joinpath('package.json').write_text(json.dumps({'private':True,'dependencies':{
        '@octane-xplat/nativescript-cli': 'file:'+str(tarballs['launcher']),
        '@octane-xplat/nativescript-cli-'+host: 'file:'+str(tarballs[host])}}))
    run(['npm','install','--offline','--ignore-scripts','--no-audit','--no-fund','--package-lock=false'],consumer,stdout=subprocess.DEVNULL)
    installed = consumer/'node_modules/@octane-xplat/nativescript-cli'
    launcher = installed/'launcher.cjs'
    # Remove all staging/source binary inputs before running installed artifacts.
    shutil.rmtree(staged)
    binary.unlink()
    assert output(['node',str(launcher),'--version'],consumer) == 'xplat-ns version '+version
    project = consumer/'app with spaces'; project.mkdir()
    source = project/'project.pbxproj'
    source.write_bytes((root/'internal/jsbridge/testdata/project.pbxproj').read_bytes())
    result = json.loads(output(['node',str(launcher),'inspect-xcode','--project',str(project),'--file',str(source),'--cache',str(consumer/'cache'),'--json'],consumer))
    assert 'PBXProject' in result['result']['Text']
    assert any(p.name == 'helper.cjs' for p in (consumer/'cache').rglob('*'))
    assert any(p.name == 'NOTICES.txt' for p in (consumer/'cache').rglob('*'))
    fifo = project/'blocked.pbxproj'; os.mkfifo(fifo)
    process = subprocess.Popen(['node',str(launcher),'inspect-xcode','--project',str(project),'--file',str(fifo),'--cache',str(consumer/'cache'),'--json'],cwd=consumer,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        deadline = time.monotonic()+10
        while not list((consumer/'cache').glob('request-*.json')):
            if process.poll() is not None or time.monotonic()>deadline: raise AssertionError('helper did not start')
            time.sleep(.02)
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 130 and json.loads(stdout)['error']['code'] == 'cancelled'
        assert not list((consumer/'cache').glob('request-*.json'))
    finally:
        if process.poll() is None: process.kill(); process.wait()
    failed = subprocess.run(['node',str(launcher),'build','--json'],cwd=consumer,capture_output=True,text=True)
    assert failed.returncode == 2 and json.loads(failed.stdout)['error']['code'] == 'invalid_input'
    script = "const assert=require('node:assert'); const {binary}=require('./launcher.cjs'); assert.throws(()=>binary('freebsd','x64'),/Unsupported/); assert.throws(()=>binary('linux','mips'),/Unsupported/);"
    run(['node','-e',script],installed)
    platform = consumer/('node_modules/@octane-xplat/nativescript-cli-'+host)
    manifest = platform/'package.json'
    data = json.loads(manifest.read_text()); data['version']='99.0.0'; manifest.write_text(json.dumps(data))
    failed = subprocess.run(['node',str(launcher),'--version'],cwd=consumer,capture_output=True,text=True)
    assert failed.returncode == 1 and 'Version mismatch' in failed.stderr
    shutil.rmtree(platform)
    failed = subprocess.run(['node',str(launcher),'--version'],cwd=consumer,capture_output=True,text=True)
    assert failed.returncode == 1 and 'optional dependencies' in failed.stderr
    print('PASS: local npm tarballs, actual '+host+' CLI/helper, notices, version, argv/exit, missing/mismatched/unsupported host failures')
    print('FIXTURE ONLY: foreign target payloads; no native or release qualification')
