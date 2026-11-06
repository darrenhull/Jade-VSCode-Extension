'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const manifest=require('../../extension/package.json');

test('installs inline diagnostic companion without making native Jade activation depend on it',()=>{
  assert.ok(manifest.extensionPack?.includes('usernamehw.errorlens'), 'Error Lens must accompany a Jade installation');
  assert.ok(!manifest.extensionDependencies?.includes('usernamehw.errorlens'), 'Users must be able to disable presentation extras without disabling Jade');
});
