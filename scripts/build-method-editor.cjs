'use strict';
const path = require('node:path');
function buildMethodEditor() {
  return require('esbuild').buildSync({
    entryPoints: [path.resolve(__dirname, '../extension/media/method-editor-entry.js')],
    outfile: path.resolve(__dirname, '../extension/media/method-editor.js'),
    bundle: true, minify: true, platform: 'browser', target: ['chrome120'],
    legalComments: 'eof', sourcemap: false,
  });
}
if (require.main === module) buildMethodEditor();
module.exports = { buildMethodEditor };
