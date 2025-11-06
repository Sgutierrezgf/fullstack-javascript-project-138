import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import createDebug from 'debug';
import { Listr } from 'listr2';

const debug = createDebug('page-loader');

// Convierte una URL en un nombre de archivo seguro
function urlToFilename(urlString) {
    const url = new URL(urlString, 'http://dummy.base');
    const host = url.host.replace(/^www\./, '');
    const pathname = url.pathname.replace(/\/+$/, '');
    const base = host + pathname;
    const filename = base
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'index';
    debug('urlToFilename:', urlString, '->', filename);
    return filename;
}

// Crea un nombre de recurso local
function urlToResourceName(resourceUrl, pageUrl) {
    const absoluteUrl = new URL(resourceUrl, pageUrl);
    const ext = path.extname(absoluteUrl.pathname);
    const safeName = absoluteUrl.pathname
        .replace(/^\/+/, '')
        .replace(ext, '')
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    const prefix = new URL(pageUrl).host.replace(/^www\./, '').replace(/\./g, '-');
    return `${prefix}-${safeName}${ext}`;
}

// Determina si un recurso es local
function isLocalResource(resourceUrl, pageUrl) {
    try {
        return new URL(resourceUrl, pageUrl).origin === new URL(pageUrl).origin;
    } catch {
        return false;
    }
}

// Descarga un recurso y lo guarda en disco
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

// Función principal del cargador de páginas
export default async function pageLoader(pageUrl, outputDir = process.cwd()) {
    debug('Starting pageLoader for:', pageUrl, 'outputDir:', outputDir);

    const outputIsFile = path.extname(outputDir) !== '';
    const htmlFilePath = outputIsFile
        ? outputDir
        : path.join(outputDir, `${urlToFilename(pageUrl)}.html`);
    const resourcesDir = htmlFilePath.replace(/\.html$/, '_files');

    // ⚠️ Verificar que la carpeta base exista
    const baseDir = path.dirname(htmlFilePath);
    try {
        await fs.access(baseDir);
    } catch {
        throw new Error(`El directorio de salida no existe: ${baseDir}`);
    }

    // Crear carpeta para recursos
    await fs.mkdir(resourcesDir, { recursive: true });

    // Descargar el HTML principal
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

    // Buscar imágenes locales
    $('img').toArray().forEach(img => {
        const src = $(img).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            resources.push({
                el: img,
                attr: 'src',
                url: new URL(src, pageUrl).toString(),
                filename: urlToResourceName(src, pageUrl),
            });
        }
    });

    // Buscar estilos locales
    $('link[rel="stylesheet"]').toArray().forEach(link => {
        const href = $(link).attr('href');
        if (href && isLocalResource(href, pageUrl)) {
            resources.push({
                el: link,
                attr: 'href',
                url: new URL(href, pageUrl).toString(),
                filename: urlToResourceName(href, pageUrl),
            });
        }
    });

    // Buscar scripts locales
    $('script[src]').toArray().forEach(script => {
        const src = $(script).attr('src');
        if (src && isLocalResource(src, pageUrl)) {
            resources.push({
                el: script,
                attr: 'src',
                url: new URL(src, pageUrl).toString(),
                filename: urlToResourceName(src, pageUrl),
            });
        }
    });

    // Descarga concurrente de recursos
    const tasks = new Listr(
        resources.map(res => ({
            title: `Downloading: ${res.filename}`,
            task: async () => {
                const localName = await downloadResource(res.url, resourcesDir, res.filename);
                $(res.el).attr(res.attr, path.posix.join(path.basename(resourcesDir), localName));
            },
        })),
        { concurrent: true, exitOnError: false },
    );

    await tasks.run();

    // ⚠️ Verificar que no exista un archivo con el mismo nombre
    try {
        await fs.access(htmlFilePath);
        throw new Error(`El archivo de salida ya existe: ${htmlFilePath}`);
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw new Error(`No se puede acceder al archivo de salida: ${err.message}`);
        }
    }

    // Guardar el HTML final
    try {
        await fs.writeFile(htmlFilePath, $.html());
        debug('Saved HTML:', htmlFilePath);
    } catch (err) {
        throw new Error(`No se pudo guardar el HTML: ${err.message}`);
    }

    return htmlFilePath;
}
