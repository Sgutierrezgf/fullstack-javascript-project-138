import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import nock from 'nock';
import pageLoader from '../src/index.js';

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
});

test('downloads page', async () => {
    const url = 'https://example.com/test';
    nock('https://example.com').get('/test').reply(200, '<html>Test</html>');

    const filePath = await pageLoader(url, tempDir);
    const content = await fs.readFile(filePath, 'utf-8');

    expect(content).toContain('Test');
});

test('downloads HTML with images', async () => {
    const htmlFixture = `
    <html><body>
      <img src="/assets/test.png" />
    </body></html>
  `;

    nock('https://example.com').get('/test').reply(200, htmlFixture);
    nock('https://example.com').get('/assets/test.png').reply(200, Buffer.from([1, 2, 3]));

    const filePath = await pageLoader('https://example.com/test', tempDir);
    const savedHtml = await fs.readFile(filePath, 'utf-8');

    // La ruta generada ahora incluye el prefijo "assets-"
    expect(savedHtml).toMatch(/_files\/assets-test\.png/);
});

test('downloads page with images, CSS and JS', async () => {
    const htmlFixture = `
    <html>
      <head>
        <link rel="stylesheet" href="/assets/application.css">
        <link rel="stylesheet" href="https://cdn.example.com/style.css">
      </head>
      <body>
        <img src="/images/logo.png">
        <script src="/js/app.js"></script>
        <script src="https://cdn.example.com/script.js"></script>
      </body>
    </html>`;

    nock('https://example.com').get('/test').reply(200, htmlFixture);

    nock('https://example.com').get('/assets/application.css').reply(200, 'body { background: #fff; }');
    nock('https://example.com').get('/images/logo.png').reply(200, Buffer.from([1, 2, 3]));
    nock('https://example.com').get('/js/app.js').reply(200, 'console.log("test");');

    const filePath = await pageLoader('https://example.com/test', tempDir);
    const savedHtml = await fs.readFile(filePath, 'utf-8');

    // Recursos locales con nombres generados por page-loader
    expect(savedHtml).toMatch(/_files\/assets-application\.css/);
    expect(savedHtml).toMatch(/_files\/images-logo\.png/);
    expect(savedHtml).toMatch(/_files\/js-app\.js/);

    // Recursos externos no se modifican
    expect(savedHtml).toMatch(/https:\/\/cdn\.example\.com\/style\.css/);
    expect(savedHtml).toMatch(/https:\/\/cdn\.example\.com\/script\.js/);
});
