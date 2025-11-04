import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import createDebug from 'debug';
import { Listr } from 'listr2';

const debug = createDebug('page-loader');

/**
 * Convierte URL en nombre seguro para archivo HTML
 */
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

/**
 * Convierte URL de recurso en nombre seguro para guardarlo
 */
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

/**
 * Verifica si un recurso es local (misma origin)
 */
function isLocalResource(resourceUrl, pageUrl) {
    try {
        return new URL(resourceUrl, pageUrl).origin === new URL(pageUrl).origin;
    } catch {
        return false;
    }
}

/**
 * Descarga un recurso y lo guarda en outputDir con nombre filename
 */
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

/**
 * Función principal de pageLoader
 */
export default async function pageLoader(pageUrl, outputDir = process.cwd()) {
    debug('Starting pageLoader for:', pageUrl, 'outputDir:', outputDir);

    // Determinar si outputDir es archivo o carpeta
    const outputIsFile = path.extname(outputDir) !== '';
    const htmlFilePath = outputIsFile
        ? outputDir
        : path.join(outputDir, `${urlToFilename(pageUrl)}.html`);

    // Carpeta donde se guardarán los recursos
    const resourcesDir = htmlFilePath.replace(/\.html$/, '_files');

    // ⚠️ Verificar que el directorio base exista (para pasar test negativo)
    const baseDir = path.dirname(htmlFilePath);
    try {
        await fs.access(baseDir);
    } catch {
        throw new Error(`El directorio de salida no existe: ${baseDir}`);
    }

    // Crear carpeta de recursos si no existe
    await fs.mkdir(resourcesDir, { recursive: true });

    // Descargar HTML
    let html;
    try {
        const response = await axios.get(pageUrl);
        html = response.data;
        debug('Fetched HTML for:', pageUrl);
    } catch (err) {
        throw new Error(`No se pudo obtener la página: ${err.message}`);
    }

    // Analizar recursos locales con Cheerio
    const $ = cheerio.load(html);
    const resources = [];

    $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            resources.push({
                el,
                attr: 'src',
                url: new URL(src, pageUrl).toString(),
                filename: urlToResourceName(src, pageUrl),
            });
        }
    });

    $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href && isLocalResource(href, pageUrl)) {
            resources.push({
                el,
                attr: 'href',
                url: new URL(href, pageUrl).toString(),
                filename: urlToResourceName(href, pageUrl),
            });
        }
    });

    $('script[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            resources.push({
                el,
                attr: 'src',
                url: new URL(src, pageUrl).toString(),
                filename: urlToResourceName(src, pageUrl),
            });
        }
    });

    // Descargar recursos con Listr de manera concurrente
    const tasks = new Listr(
        resources.map(res => ({
            title: `Downloading: ${res.filename}`,
            task: async () => {
                const localName = await downloadResource(res.url, resourcesDir, res.filename);
                $(res.el).attr(res.attr, path.posix.join(path.basename(resourcesDir), localName));
            },
        })),
        { concurrent: true, exitOnError: false }
    );

    await tasks.run();

    // Guardar HTML modificado
    try {
        await fs.writeFile(htmlFilePath, $.html());
        debug('Saved HTML:', htmlFilePath);
    } catch (err) {
        throw new Error(`No se pudo guardar el HTML: ${err.message}`);
    }

    return htmlFilePath;
}
