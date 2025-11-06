import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import nock from 'nock';
import pageLoader from '../src/index.js';

nock.disableNetConnect();

const baseUrl = 'https://codica.la';
const html = `
<!DOCTYPE html>
<html><body>
<img src="/assets/professions/nodejs.png">
<link rel="stylesheet" href="/assets/style.css">
<script src="/packs/js/runtime.js"></script>
</body></html>`;

const imgData = Buffer.from('imagecontent');
const cssData = 'body{color:red}';
const jsData = 'console.log("runtime")';

describe('page-loader', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
  });

  test('descarga página y recursos', async () => {
    nock(baseUrl).get('/cursos').reply(200, html);
    nock(baseUrl).get('/assets/professions/nodejs.png').reply(200, imgData);
    nock(baseUrl).get('/assets/style.css').reply(200, cssData);
    nock(baseUrl).get('/packs/js/runtime.js').reply(200, jsData);

    const filePath = await pageLoader(`${baseUrl}/cursos`, tmpDir);
    const htmlSaved = await fs.readFile(filePath, 'utf-8');

    expect(htmlSaved).toContain('codica-la-cursos_files/');
    const resourcesDir = path.join(tmpDir, 'codica-la-cursos_files');
    const files = await fs.readdir(resourcesDir);
    expect(files.length).toBe(3);
  });
});
