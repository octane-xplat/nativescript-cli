#!/usr/bin/env python3
"""Opt-in local dependency-manager pin evidence; no native app or runtime claim.
Run under a native_builds:1 broker reservation. No devices or remote dependencies.
"""
import argparse, json, pathlib, subprocess, tempfile, zipfile, os
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('consumer', type=pathlib.Path)
p.add_argument('gradle', type=pathlib.Path, help='explicit installed Gradle executable')
a=p.parse_args()
repo=pathlib.Path(__file__).resolve().parents[2]
def run(args,cwd): subprocess.run(args,cwd=cwd,check=True)
with tempfile.TemporaryDirectory(prefix='ota-real-pins-') as tmp:
 root=pathlib.Path(tmp); ios=root/'ios'; ios.mkdir(); android=root/'android'; android.mkdir()
 pod=ios/'deps/Probe';pod.mkdir(parents=True)
 (pod/'Probe.m').write_text('void probe(void) {}\n')
 (pod/'Probe.podspec').write_text("Pod::Spec.new do |s|\n s.name='Probe'\n s.version='1.0.0'\n s.summary='Local pin qualification'\n s.homepage='https://example.invalid'\n s.license={:type=>'MIT'}\n s.author='Fixture'\n s.source={:path=>'.'}\n s.platform=:ios,'13.0'\n s.source_files='Probe.m'\nend\n")
 (ios/'Podfile').write_text("install! 'cocoapods', :integrate_targets => false\nplatform :ios, '13.0'\ntarget 'Probe' do\n pod 'Probe', :path => 'deps/Probe'\nend\n")
 run(['pod','install','--no-repo-update'],ios)
 dep=root/'SwiftProbe'; (dep/'Sources/SwiftProbe').mkdir(parents=True)
 (dep/'Package.swift').write_text('// swift-tools-version:5.7\nimport PackageDescription\nlet package = Package(name:"SwiftProbe",products:[.library(name:"SwiftProbe",targets:["SwiftProbe"])],targets:[.target(name:"SwiftProbe")])\n')
 (dep/'Sources/SwiftProbe/Probe.swift').write_text('public struct Probe {}\n')
 run(['git','init','--quiet'],dep);run(['git','add','.'],dep);run(['git','-c','user.name=OTA qualification','-c','user.email=ota@example.invalid','commit','--quiet','-m','Local resolution source'],dep)
 revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=dep,text=True).strip()
 resolver=ios/'SwiftResolver';resolver.mkdir()
 (resolver/'Package.swift').write_text('// swift-tools-version:5.7\nimport PackageDescription\nlet package = Package(name:"Resolver",dependencies:[.package(url:'+json.dumps(dep.as_uri())+',revision:'+json.dumps(revision)+')])\n')
 run(['swift','package','resolve'],resolver)
 maven=android/'maven/org/fixture/probe/1.0';maven.mkdir(parents=True)
 (maven/'probe-1.0.pom').write_text('<project><modelVersion>4.0.0</modelVersion><groupId>org.fixture</groupId><artifactId>probe</artifactId><version>1.0</version></project>')
 with zipfile.ZipFile(maven/'probe-1.0.jar','w') as z:z.writestr('META-INF/MANIFEST.MF','Manifest-Version: 1.0\n')
 (android/'settings.gradle').write_text("rootProject.name='pin-qualification'\n")
 (android/'build.gradle').write_text("plugins { id 'java' }\nrepositories { maven { url=uri('maven') } }\ndependencyLocking { lockAllConfigurations() }\ndependencies { implementation 'org.fixture:probe:1.0' }\n")
 run([str(a.gradle.resolve()),'--offline','--no-daemon','dependencies','--configuration','compileClasspath','--write-locks'],android)
 env=dict(os.environ,OTA_CONSUMER_DIR=str(a.consumer.resolve()),OTA_PINS_DIR=str(root))
 subprocess.run(['node','--test','bridge/extensions/native-pins.test.cjs'],cwd=repo,env=env,check=True)
