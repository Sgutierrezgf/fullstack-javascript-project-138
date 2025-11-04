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
    const filename = base.replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'index';
    debug('urlToFilename:', urlString, '->', filename);
    return filename;
}

function urlToResourceName(resourceUrl, pageUrl) {
    const absoluteUrl = new URL(resourceUrl, pageUrl);
    const ext = path.extname(absoluteUrl.pathname);
    const safeName = absoluteUrl.pathname.replace(/^\/+/, '').replace(ext, '')
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
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

// 1. MODIFICACIÓN: Eliminada la creación recursiva de directorios
async function downloadResource(url, outputDir, filename) {
    const filePath = path.join(outputDir, filename);
    const response = await axios.get(url, { responseType: 'arraybuffer' });

    // Ya no se crea recursivamente aquí.

    await fs.writeFile(filePath, response.data);
    debug(`Saved resource: ${filePath}`);
    return filename;
}

export default async function pageLoader(pageUrl, outputDir = process.cwd()) {
    debug('Starting pageLoader:', pageUrl, outputDir);

    const outputIsFile = path.extname(outputDir) !== '';
    const htmlFilePath = outputIsFile
        ? outputDir
        : path.join(outputDir, `${urlToFilename(pageUrl)}.html`);

    // Carpeta de recursos
    const resourcesDir = htmlFilePath.replace(/\.html$/, '_files');

    // Descargar HTML
    let html;
    try {
        const response = await axios.get(pageUrl);
        html = response.data;
        debug('Fetched HTML:', pageUrl);
    } catch (err) {
        throw new Error(`No se pudo obtener la página: ${err.message}`);
    }

    const $ = cheerio.load(html);
    const resources = [];

    $('img').toArray().forEach(img => {
        const src = $(img).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            const filename = urlToResourceName(src, pageUrl);
            resources.push({ el: img, attr: 'src', url: new URL(src, pageUrl).toString(), filename });
        }
    });

    $('link[rel="stylesheet"]').toArray().forEach(link => {
        const href = $(link).attr('href');
        if (href && isLocalResource(href, pageUrl)) {
            const filename = urlToResourceName(href, pageUrl);
            resources.push({ el: link, attr: 'href', url: new URL(href, pageUrl).toString(), filename });
        }
    });

    $('script[src]').toArray().forEach(script => {
        const src = $(script).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            const filename = urlToResourceName(src, pageUrl);
            resources.push({ el: script, attr: 'src', url: new URL(src, pageUrl).toString(), filename });
        }
    });

    // 2. MODIFICACIÓN: Solo crear carpeta de recursos si outputDir NO es un archivo.
    if (!outputIsFile) {
        await fs.mkdir(resourcesDir, { recursive: true });
    }

    const tasks = new Listr(
        resources.map(res => ({
            title: `Downloading: ${res.filename}`,
            task: async () => {
                const localName = await downloadResource(res.url, resourcesDir, res.filename);
                $(res.el).attr(res.attr, path.posix.join(path.basename(resourcesDir), localName));
            }
        })),
        { concurrent: true, exitOnError: false } // Mantenemos false para recoger todos los errores.
    );

    await tasks.run();

    // 3. 🔑 NUEVA MODIFICACIÓN CLAVE: Lanzar error si hubo fallos en las tareas.
    // En el caso negativo, el error ENOENT que no pudo escribir los recursos está aquí.
    if (tasks.errors && tasks.errors.length > 0) {
        // Lanzamos el error de I/O capturado por Listr.
        throw tasks.errors[0];
    }

    // Esto solo se ejecuta si NO hubo errores en las tareas.
    await fs.writeFile(htmlFilePath, $.html());
    debug('Saved HTML:', htmlFilePath);

    return htmlFilePath;
}