#!/usr/bin/env python3
"""Stage an owned hook probe using explicit existing runtime and engine inputs."""
import argparse, json, pathlib, re, os
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('destination',type=pathlib.Path)
p.add_argument('--engine-project',type=pathlib.Path,required=True)
p.add_argument('--runtime',type=pathlib.Path,required=True)
p.add_argument('--platform',choices=['ios','android'],required=True)
p.add_argument('--nonce',required=True)
p.add_argument('--gradle-arg',action='append',default=[],help='explicit extra Gradle argument for the Android probe hook')
a=p.parse_args()
if not re.fullmatch(r'[A-Za-z0-9_-]+',a.nonce): p.error('nonce must be a plain identifier')
root=a.destination.resolve()
root.mkdir(parents=True,exist_ok=False)
def write(name,text):
 f=root/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_text(text)
runtime=a.runtime.resolve()
version=json.loads((runtime/'package.json').read_text())['version']
write('package.json',json.dumps({'name':'registered-hooks-native-probe','version':'1.0.0','main':'app/app.ts','dependencies':{'@nativescript/core':'9.1.3'},'devDependencies':{'@nativescript/'+a.platform:version,'@nativescript/vite':'8.0.21','vite':'8.3.0','typescript':'5.9.3'}}))
write('nativescript.config.cjs',"module.exports={id:'org.example.registeredhooks',appPath:'app',appResourcesPath:'App_Resources'};\n")
write('app/app.ts',"import {Application,Label} from '@nativescript/core';Application.run({create:()=>{const l=new Label();l.text='Hook proof';return l;}});console.log('"+a.nonce+"');setInterval(()=>console.log('"+a.nonce+"'),1000);\n")
(root/'App_Resources').mkdir()
if a.platform=='ios':
 write('App_Resources/iOS/Info.plist', '''<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
<key>CFBundleExecutable</key><string>$(EXECUTABLE_NAME)</string>
<key>CFBundleName</key><string>$(PRODUCT_NAME)</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSRequiresIPhoneOS</key><true/>
<key>UIApplicationSceneManifest</key><dict>
<key>UIApplicationSupportsMultipleScenes</key><false/>
<key>UISceneConfigurations</key><dict/>
</dict>
</dict></plist>''')
else:
 write('App_Resources/Android/src/main/res/drawable/icon.xml', '''<vector xmlns:android="http://schemas.android.com/apk/res/android"
 android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
 <path android:fillColor="#336699" android:pathData="M0,0h24v24h-24z"/>
</vector>''')
engine=a.engine_project.resolve()/'node_modules'
for name in ['@nativescript/core','@nativescript/vite','vite','typescript']:
 target=root/'node_modules'/name;target.parent.mkdir(parents=True,exist_ok=True);os.symlink((engine/name).resolve(strict=True),target)
target=root/'node_modules'/'@nativescript'/a.platform
os.symlink(runtime,target)
names=['before-prepare','before-prepareNativeApp','after-prepareNativeApp','after-prepare','before-'+('buildIOS' if a.platform=='ios' else 'buildAndroid')]
if a.platform=='android':names.append('before-build-task-args')
names+=['after-'+('buildIOS' if a.platform=='ios' else 'buildAndroid'),'before-install','after-install']
for name in names:
 body="const fs=require('node:fs'),path=require('node:path');fs.appendFileSync(path.join(hookArgs.projectDir,'hook-order.txt'),"+json.dumps(name+'\n')+");"
 if name=='before-prepare':
  if a.platform=='ios':body+="fs.mkdirSync(path.join(hookArgs.projectDir,'App_Resources/iOS'),{recursive:true});fs.writeFileSync(path.join(hookArgs.projectDir,'App_Resources/iOS/build.xcconfig'),"+json.dumps('IPHONEOS_DEPLOYMENT_TARGET = 15.0\nHOOK_PROBE = YES\n')+");"
  else:body+="fs.mkdirSync(path.join(hookArgs.projectDir,'App_Resources/Android'),{recursive:true});fs.writeFileSync(path.join(hookArgs.projectDir,'App_Resources/Android/app.gradle'),"+json.dumps('// authored by registered hook\n')+");"
 if name=='after-prepare':body+="fs.writeFileSync(path.join(hookArgs.bundleDir,'hook-stamp.txt'),"+json.dumps(a.nonce)+");"
 if name=='before-build-task-args':body+="hookArgs.args.push(..."+json.dumps(['--stacktrace']+a.gradle_arg)+");"
 if name.startswith('after-build') or name=='before-install':
  if a.platform=='ios':body+="if(fs.readFileSync(path.join(hookArgs.artifactPath,'app/hook-stamp.txt'),'utf8')!=="+json.dumps(a.nonce)+")throw Error('hook stamp missing from native product');"
  else:body+="if(require('node:child_process').execFileSync('/usr/bin/unzip',['-p',hookArgs.artifactPath,'assets/app/hook-stamp.txt'],{encoding:'utf8'})!=="+json.dumps(a.nonce)+")throw Error('hook stamp missing from APK');"
 if name=='after-install':body+="if(!hookArgs.deviceIdentifier)throw Error('missing device identity');"
 write('hooks/'+name+'/probe.cjs','module.exports=function(hookArgs){'+body+'};\n')
write('expected-order.json',json.dumps(names))
print(root)
