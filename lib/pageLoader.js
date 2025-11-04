import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import createDebug from 'debug';
import { Listr } from 'listr2';

const debug = createDebug('page-loader');

// Convierte URL en un nombre de archivo seguro
function urlToFilename(urlString) {
    const url = new URL(urlString, 'http://dummy.base');
    const host = url.host.replace(/^www\./, '');
    const pathname = url.pathname.replace(/\/+$/, '');
    const base = host + pathname;
    return (base.replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'index');
}

// Convierte URL de recurso en nombre seguro
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

// Verifica si recurso es local a la página
function isLocalResource(resourceUrl, pageUrl) {
    try {
        return new URL(resourceUrl, pageUrl).origin === new URL(pageUrl).origin;
    } catch {
        return false;
    }
}

// Descarga recurso a carpeta
async function downloadResource(url, outputDir, filename) {
    const filePath = path.join(outputDir, filename);
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, response.data);
    debug(`Saved resource: ${filePath}`);
    return filename;
}

// Función principal
export default async function pageLoader(pageUrl, outputDir = process.cwd()) {
    debug('Starting pageLoader:', pageUrl, outputDir);

    const outputIsFile = path.extname(outputDir) !== '';
    const htmlFilePath = outputIsFile
        ? outputDir
        : path.join(outputDir, `${urlToFilename(pageUrl)}.html`);

    const baseDir = path.dirname(htmlFilePath);
    const resourcesDir = htmlFilePath.replace(/\.html$/, '_files');

    // Validar que el directorio padre exista
    try {
        await fs.access(baseDir);
    } catch {
        throw new Error(`El directorio de salida no existe: ${baseDir}`);
    }

    // Crear carpeta de recursos
    await fs.mkdir(resourcesDir, { recursive: true });

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

    // Buscar recursos locales
    $('img[src], link[rel="stylesheet"][href], script[src]').each((_, el) => {
        const tag = el.tagName.toLowerCase();
        const attr = tag === 'link' ? 'href' : 'src';
        const urlAttr = $(el).attr(attr);
        if (urlAttr && isLocalResource(urlAttr, pageUrl)) {
            resources.push({
                el,
                attr,
                url: new URL(urlAttr, pageUrl).toString(),
                filename: urlToResourceName(urlAttr, pageUrl),
            });
        }
    });

    // Descargar recursos concurrentemente y actualizar HTML
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
