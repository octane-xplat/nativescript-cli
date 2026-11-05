const test=require('node:test'),assert=require('node:assert/strict');
const swift=require('./swift-packages.cjs');
const pkg=(version='1.4.0',libs=['Pulsar'])=>({name:'Pulsar',repositoryURL:'https://github.com/software-mansion-labs/pulsar-ios',version,libs});
test('remote Swift requirements and safe typed declarations',()=>{
 assert.deepEqual(swift.requirement('1.4.0'),{kind:'exactVersion',version:'1.4.0'});
 assert.deepEqual(swift.requirement('#'+'a'.repeat(40)),{kind:'revision',revision:'a'.repeat(40)});
 assert.deepEqual(swift.requirement('^1.4.0'),{kind:'upToNextMajorVersion',minimumVersion:'1.4.0'});
 assert.deepEqual(swift.requirement('~1.4.0'),{kind:'upToNextMinorVersion',minimumVersion:'1.4.0'});
 assert.deepEqual(swift.requirement('develop'),{kind:'branch',branch:'develop'});
 assert.deepEqual(swift.parse([pkg()])[0].products,['Pulsar']);
 for(const value of [null,[{...pkg(),repositoryURL:'https://token@github.com/a/b'}],[{...pkg(),repositoryURL:'https://github.com/a/b?token=secret'}],[{...pkg(),libs:[]}],[pkg(),pkg()]])assert.throws(()=>swift.parse(value),e=>e.code==='invalid_input');
 for(const value of [{...pkg(),repositoryURL:'http://github.com/a/b'},pkg('>=1.0.0 <2.0.0')])assert.throws(()=>swift.parse([value]),e=>e.code==='unavailable');
});
test('remote declarations merge deterministically without losing required products',()=>{
 const contribution=(owner,p)=>({packageDirectory:owner,path:owner+'/nativescript.config.js',platform:'ios',kind:'spm-remote',spm:swift.parse([p])[0]});
 const a=contribution('/plugin-a',pkg('1.4.0',['Pulsar'])),b=contribution('/plugin-b',pkg('1.4.0',['PulsarExtra']));
 assert.deepEqual(swift.merge([a,b],'/app'),swift.merge([b,a],'/app'));
 assert.deepEqual(swift.merge([a,b],'/app')[0].spm.products,['Pulsar','PulsarExtra']);
 const app=contribution('/app',pkg('2.0.0',['AppExtra']));assert.equal(swift.merge([a,app],'/app')[0].spm.version,'2.0.0');assert.deepEqual(swift.merge([a,app],'/app')[0].spm.products,['AppExtra','Pulsar']);
 assert.throws(()=>swift.merge([a,contribution('/other',pkg('2.0.0'))],'/app'),e=>e.code==='invalid_input');
 assert.throws(()=>swift.merge([app,contribution('/app',{...pkg('3.0.0'),name:'Alias'})],'/app'),e=>e.code==='invalid_input');
 assert.throws(()=>swift.merge([a,contribution('/other',{...pkg(),repositoryURL:'https://github.com/other/pulsar-ios'})],'/app'),e=>e.code==='invalid_input');
});
