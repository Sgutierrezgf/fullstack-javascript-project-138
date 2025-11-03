import nock from 'nock';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import pageLoader from '../src/index.js';

const url = 'https://example.com/test';
const htmlWithImage = `
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Example</title></head>
  <body>
    <img src="/assets/image.png" alt="example image">
  </body>
</html>
`;

nock.disableNetConnect();

describe('Page Loader', () => {
    let tempDir;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
    });

    afterEach(async () => {
        try {
            const files = await fs.readdir(tempDir);
            for (const file of files) {
                const fullPath = path.join(tempDir, file);
                const stat = await fs.lstat(fullPath);
                if (stat.isDirectory()) {
                    const inner = await fs.readdir(fullPath);
                    await Promise.all(inner.map(f => fs.unlink(path.join(fullPath, f))));
                    await fs.rmdir(fullPath);
                } else {
                    await fs.unlink(fullPath);
                }
            }
            await fs.rmdir(tempDir);
        } catch (e) {
            // ignore cleanup errors
        }
    });

    it('should download and save page', async () => {
        nock('https://example.com').get('/test').reply(200, '<html><body>Hello</body></html>');

        const filePath = await pageLoader(url, tempDir);
        const data = await fs.readFile(filePath, 'utf-8');

        expect(data).toContain('<body>Hello</body>');
        expect(path.basename(filePath)).toBe('example-com-test.html');
    });

    it('should download images and update HTML src', async () => {
        // Simular respuesta HTML con una imagen
        nock('https://example.com')
            .get('/test')
            .reply(200, htmlWithImage)
            .get('/assets/image.png')
            .reply(200, 'fakebinarydata', { 'Content-Type': 'image/png' });

        // Ejecutar pageLoader
        const filePath = await pageLoader(url, tempDir);

        // Leer HTML resultante
        const resultHtml = await fs.readFile(filePath, 'utf-8');

        // Verificar que el HTML tenga la ruta modificada
        expect(resultHtml).toContain('example-com-test_files/example-com-assets-image-png.png');

        // Verificar que el archivo de imagen exista
        const imgDir = path.join(tempDir, 'example-com-test_files');
        const imgFiles = await fs.readdir(imgDir);
        expect(imgFiles).toContain('example-com-assets-image-png.png');

        // Leer imagen descargada (contenido simulado)
        const imgContent = await fs.readFile(
            path.join(imgDir, 'example-com-assets-image-png.png'),
            'utf-8'
        );
        expect(imgContent).toBe('fakebinarydata');
    });
});
