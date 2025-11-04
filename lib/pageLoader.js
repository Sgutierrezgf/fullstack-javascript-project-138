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

    let relPath = absoluteUrl.pathname.replace(/^\/+/, '');
    const safeName = relPath.replace(ext, '').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');

    // Prefijo solo con el host
    const prefix = new URL(pageUrl).host.replace(/^www\./, '').replace(/\./g, '-');
    return `${prefix}-${safeName}${ext}`;
}

function isLocalResource(resourceUrl, pageUrl) {
    try {
        return new URL(resourceUrl, pageUrl).origin === new URL(pageUrl).origin;
    } catch {
        return false;
    }
}

// ===================== downloadResource =====================
async function downloadResource(url, outputDir, filename) {
    const filePath = path.join(outputDir, filename);
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, response.data);
        debug(`Saved resource: ${filePath}`);
        return filename;
    } catch (err) {
        debug(`Failed to download resource: ${url}`, err.message);
        throw err;
    }
}
// =============================================================

export default async function pageLoader(pageUrl, outputDir = process.cwd()) {
    debug('Starting pageLoader for:', pageUrl, 'outputDir:', outputDir);

    const htmlFilename = `${urlToFilename(pageUrl)}.html`;
    const htmlFilePath = path.join(outputDir, htmlFilename);
    const resourcesDir = `${htmlFilePath.replace(/\.html$/, '')}_files`;

    try {
        await fs.mkdir(resourcesDir, { recursive: true });
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
            resources.push({ el: img, attr: 'src', url: absoluteUrl, filename });
        }
    });

    $('link[rel="stylesheet"]').toArray().forEach(link => {
        const href = $(link).attr('href');
        if (href && isLocalResource(href, pageUrl)) {
            const absoluteUrl = new URL(href, pageUrl).toString();
            const filename = urlToResourceName(href, pageUrl);
            resources.push({ el: link, attr: 'href', url: absoluteUrl, filename });
        }
    });

    $('script[src]').toArray().forEach(script => {
        const src = $(script).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            const absoluteUrl = new URL(src, pageUrl).toString();
            const filename = urlToResourceName(src, pageUrl);
            resources.push({ el: script, attr: 'src', url: absoluteUrl, filename });
        }
    });

    const tasks = new Listr(
        resources.map(res => ({
            title: `Downloading: ${res.filename}`,
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
