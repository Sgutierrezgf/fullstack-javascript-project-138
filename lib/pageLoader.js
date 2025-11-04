import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import createDebug from 'debug';
import { Listr } from 'listr2';

const debug = createDebug('page-loader');

function urlToFilename(urlString) {
    const url = new URL(urlString, 'http://dummy.base');
    const host = url.host.replace(/^www\./, '');
    const pathname = url.pathname.replace(/\/+$/, '');
    const base = host + pathname;
    const filename = base.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'index';
    debug('urlToFilename:', urlString, '->', filename);
    return filename;
}

function urlToResourceName(resourceUrl, pageUrl) {
    const absoluteUrl = new URL(resourceUrl, pageUrl);
    const ext = path.extname(absoluteUrl.pathname);
    const base = absoluteUrl.pathname.replace(ext, '');
    const name = base.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    const result = `${name}${ext}`;
    debug('urlToResourceName:', resourceUrl, '->', result);
    return result;
}

async function downloadResource(resourceUrl, outputDir, filename) {
    const filepath = path.join(outputDir, filename);
    debug('Downloading resource:', resourceUrl, '->', filepath);

    try {
        const resp = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
        await fs.writeFile(filepath, resp.data);
        debug('Saved resource:', filepath);
        return filename;
    } catch (err) {
        debug('Error downloading resource:', resourceUrl, err.message);
        throw new Error(`No se pudo descargar el recurso ${resourceUrl}: ${err.message}`);
    }
}

function isLocalResource(resourceUrl, pageUrl) {
    try {
        return new URL(resourceUrl, pageUrl).origin === new URL(pageUrl).origin;
    } catch {
        return false;
    }
}

/**
 * pageLoader devuelve la ruta del HTML descargado o lanza un error
 */
export default async function pageLoader(pageUrl, outputDir = process.cwd()) {
    debug('Starting pageLoader for:', pageUrl, 'outputDir:', outputDir);

    const htmlFilename = `${urlToFilename(pageUrl)}.html`;
    const htmlFilePath = path.join(outputDir, htmlFilename);
    const resourcesDir = `${htmlFilePath.replace(/\.html$/, '')}_files`;

    // Intentar crear directorio, pero sin recursive para que falle en tests negativos
    try {
        await fs.mkdir(resourcesDir);
    } catch (err) {
        throw new Error(`No se pudo crear el directorio: ${err.message}`);
    }

    let html;
    try {
        const response = await axios.get(pageUrl);
        html = response.data;
        debug('Fetched HTML for:', pageUrl);
    } catch (err) {
        throw new Error(`No se pudo obtener la página: ${err.message}`);
    }

    const $ = cheerio.load(html);
    const resources = [];

    $('img').toArray().forEach(img => {
        const src = $(img).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            const absoluteUrl = new URL(src, pageUrl).toString();
            const filename = urlToResourceName(src, pageUrl);
            resources.push({ el: img, attr: 'src', url: absoluteUrl, filename, type: 'img' });
        }
    });

    $('link[rel="stylesheet"]').toArray().forEach(link => {
        const href = $(link).attr('href');
        if (href && isLocalResource(href, pageUrl)) {
            const absoluteUrl = new URL(href, pageUrl).toString();
            const filename = urlToResourceName(href, pageUrl);
            resources.push({ el: link, attr: 'href', url: absoluteUrl, filename, type: 'css' });
        }
    });

    $('script[src]').toArray().forEach(script => {
        const src = $(script).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            const absoluteUrl = new URL(src, pageUrl).toString();
            const filename = urlToResourceName(src, pageUrl);
            resources.push({ el: script, attr: 'src', url: absoluteUrl, filename, type: 'js' });
        }
    });

    const tasks = new Listr(
        resources.map(res => ({
            title: `Downloading ${res.type}: ${res.filename}`,
            task: async () => {
                const localName = await downloadResource(res.url, resourcesDir, res.filename);
                $(res.el).attr(res.attr, path.posix.join(path.basename(resourcesDir), localName));
            }
        })),
        { concurrent: true, exitOnError: false }
    );

    await tasks.run();

    try {
        await fs.writeFile(htmlFilePath, $.html());
        debug('Saved HTML:', htmlFilePath);
    } catch (err) {
        throw new Error(`No se pudo guardar el HTML: ${err.message}`);
    }

    return htmlFilePath;
}
