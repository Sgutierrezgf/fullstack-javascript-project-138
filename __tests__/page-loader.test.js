import nock from 'nock';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import pageLoader from '../src/index.js';


const url = 'https://example.com/test';
const html = '<html><body>Hello</body></html>';


nock.disableNetConnect();


describe('Page Loader', () => {
    let tempDir;


    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'page-loader-'));
    });


    afterEach(async () => {
        // cleanup temp dir
        try {
            const files = await fs.readdir(tempDir);
            await Promise.all(files.map((f) => fs.unlink(path.join(tempDir, f))));
            await fs.rmdir(tempDir);
        } catch (e) {
            // ignore
        }
    });


    it('should download and save page', async () => {
        nock('https://example.com').get('/test').reply(200, html);


        const filePath = await pageLoader(url, tempDir);
        const data = await fs.readFile(filePath, 'utf-8');


        expect(data).toBe(html);
        expect(path.basename(filePath)).toBe('example-com-test.html');
    });
});