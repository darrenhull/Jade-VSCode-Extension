'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { explicitlyConfigured } = require('../../extension/src/config');
test('only actual VS Code overrides are forwarded; built-in values never replace native project settings', () => {
  const values = { installPath: 'C:/BuiltIn', characterSet: '', server: 'multiUser', disableJadeGitForWorking: false };
  const settings = { get: key => values[key], inspect: key => key === 'installPath' ? { defaultValue: values[key] }
    : key === 'characterSet' ? { workspaceFolderValue: '' } : { globalValue: values[key] } };
  assert.deepEqual(explicitlyConfigured(settings, Object.keys(values)), { characterSet: '', server: 'multiUser', disableJadeGitForWorking: false });
});
