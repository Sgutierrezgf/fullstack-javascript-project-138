import nock from 'nock';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import pageLoader from '../src/index.js';

const tmpDir = path.join(os.tmpdir(), 'page-loader-tests');

beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
});

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

test('maneja error HTTP 404', async () => {
    const url = 'https://example.com/page';
    nock('https://example.com')
        .get('/page')
        .reply(404);

    await expect(pageLoader(url, tmpDir))
        .rejects
        .toThrow('Error HTTP 404');
});

test('maneja error de directorio inexistente', async () => {
    const invalidDir = '/invalid-dir';
    const url = 'https://example.com';
    nock('https://example.com')
        .get('/')
        .reply(200, '<html></html>');

    await expect(pageLoader(url, invalidDir))
        .rejects
        .toThrow('no existe');
});
