import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import nock from 'nock';
import pageLoader from '../src/pageLoader.js';

const testUrl = 'https://codica.la/cursos';
const htmlFixture = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Cursos</title>
  <link rel="stylesheet" href="/assets/application.css">
</head>
<body>
  <img src="/assets/professions/nodejs.png" alt="Node.js" />
  <script src="/packs/js/runtime.js"></script>
</body>
</html>
`;

const cssFixture = 'body { background: red; }';
const imgFixture = Buffer.from('fake image');
const jsFixture = 'console.log("runtime loaded");';

beforeAll(() => {
  nock.disableNetConnect();
});

test('descarga página y recursos locales', async () => {
  // Mock HTML principal
  nock('https://codica.la').get('/cursos').reply(200, htmlFixture);

  // Mock recursos
  nock('https://codica.la').get('/assets/application.css').reply(200, cssFixture);
  nock('https://codica.la').get('/assets/professions/nodejs.png').reply(200, imgFixture);
  nock('https://codica.la').get('/packs/js/runtime.js').reply(200, jsFixture);

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
  const filePath = await pageLoader(testUrl, tmpDir);

  const savedHtml = await fs.readFile(filePath, 'utf-8');
  expect(savedHtml).toContain('codica-la-cursos_files/');

  const resourcesDir = path.join(tmpDir, 'codica-la-cursos_files');
  const files = await fs.readdir(resourcesDir);
  expect(files.length).toBe(3);
});

process.env.DEBUG = 'page-loader,axios,nock*';
