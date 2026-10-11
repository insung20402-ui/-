'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Z = require('../shared/zip.js');

test('crc32 matches the standard check value', () => {
  assert.equal(Z.crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('zip output is readable by a real unzip, with Korean names and binary data intact', () => {
  const bin = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) & 255);
  const out = Z.zip([{ name: 'tours.json', data: Buffer.from('{"a":1}') }, { name: 'frames/복도/000.jpg', data: bin }]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), f = path.join(dir, 't.zip');
  fs.writeFileSync(f, out);
  const py = 'import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print("|".join(z.namelist()));sys.stdout.write(str(len(z.read("frames/복도/000.jpg"))))';
  const r = execFileSync('python3', ['-I', '-c', py, f]).toString().split('\n');
  assert.equal(r[0], 'tours.json|frames/복도/000.jpg');
  assert.equal(r[1], '5000');
  fs.rmSync(dir, { recursive: true, force: true });
});
