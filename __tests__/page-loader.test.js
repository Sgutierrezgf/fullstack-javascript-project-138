import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import nock from 'nock';
import pageLoader from '../src/index.js';

const url = 'https://codica.la/cursos';
const htmlBefore = `
<!DOCTYPE html>
<html lang="es">
  <head><meta charset="utf-8"><title>Test</title></head>
  <body>
    <img src="/assets/professions/nodejs.png" alt="Node.js" />
  </body>
</html>
`;

const htmlAfter = `
<!DOCTYPE html>
<html lang="es">
  <head><meta charset="utf-8"><title>Test</title></head>
  <body>
    <img src="codica-la-cursos_files/codica-la-assets-professions-nodejs.png" alt="Node.js">
  </body>
</html>
`;

nock.disableNetConnect();

describe('page-loader - descarga de imágenes', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
  });

  test('descarga imágenes y modifica el HTML', async () => {
    nock('https://codica.la')
      .get('/cursos')
      .reply(200, htmlBefore)
      .get('/assets/professions/nodejs.png')
      .reply(200, 'image-binary-data');

    const resultPath = await pageLoader(url, tempDir);
    const data = await fs.readFile(resultPath, 'utf-8');
    const imgFile = path.join(tempDir, 'codica-la-cursos_files', 'codica-la-assets-professions-nodejs.png');
    const exists = await fs.access(imgFile).then(() => true).catch(() => false);

    expect(data).toContain('codica-la-cursos_files/codica-la-assets-professions-nodejs.png');
    expect(exists).toBe(true);
  });
});
