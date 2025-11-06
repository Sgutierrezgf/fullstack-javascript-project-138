import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import nock from 'nock';
import pageLoader from '../src/index.js';

const url = 'https://codica.la/cursos';
const htmlBefore = `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <title>Cursos</title>
    <link rel="stylesheet" href="https://cdn2.codica.la/assets/menu.css">
    <link rel="stylesheet" href="/assets/application.css">
  </head>
  <body>
    <img src="/assets/professions/nodejs.png" />
    <script src="/packs/js/runtime.js"></script>
    <script src="https://js.stripe.com/v3/"></script>
  </body>
</html>
`;

nock.disableNetConnect();

describe('page-loader - descarga de recursos locales (img, css, js)', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
  });

  test('descarga recursos locales y modifica el HTML', async () => {
    nock('https://codica.la')
      .get('/cursos').reply(200, htmlBefore)
      .get('/assets/application.css').reply(200, 'body { color: red; }')
      .get('/assets/professions/nodejs.png').reply(200, 'binary-data')
      .get('/packs/js/runtime.js').reply(200, 'console.log("ok");');

    const resultPath = await pageLoader(url, tempDir);
    const html = await fs.readFile(resultPath, 'utf-8');

    expect(html).toContain('codica-la-cursos_files/codica-la-assets-application.css');
    expect(html).toContain('codica-la-cursos_files/codica-la-assets-professions-nodejs.png');
    expect(html).toContain('codica-la-cursos_files/codica-la-packs-js-runtime.js');

    // Verifica que los archivos fueron creados
    const cssFile = path.join(tempDir, 'codica-la-cursos_files', 'codica-la-assets-application.css');
    const jsFile = path.join(tempDir, 'codica-la-cursos_files', 'codica-la-packs-js-runtime.js');
    const imgFile = path.join(tempDir, 'codica-la-cursos_files', 'codica-la-assets-professions-nodejs.png');

    await expect(fs.access(cssFile)).resolves.toBeUndefined();
    await expect(fs.access(jsFile)).resolves.toBeUndefined();
    await expect(fs.access(imgFile)).resolves.toBeUndefined();
  });

  test('falla si la URL no existe', async () => {
    await expect(pageLoader('https://dominio-invalido.xyz123/'))
      .rejects.toThrow(/No se pudo resolver la dirección/);
  });
});
