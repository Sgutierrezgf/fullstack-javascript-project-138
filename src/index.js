import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { URL } from 'url';

const log = debug('page-loader');

// Convierte URL en nombre de archivo válido
const urlToFilename = (url) => {
    const { host, pathname } = new URL(url);
    const fullPath = path.join(host, pathname);
    const clean = fullPath
        .replace(/(^\W+|\/$)/g, '')
        .replace(/[^a-zA-Z0-9]/g, '-');
    return clean;
};

// Descarga archivo desde una URL y lo guarda localmente
const downloadResource = async (resourceUrl, filepath) => {
    const response = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(filepath, response.data);
    log(`Saved resource: ${filepath}`);
};

// Función principal
const pageLoader = async (url, outputDir = process.cwd()) => {
    log(`Starting pageLoader for: ${url} outputDir: ${outputDir}`);
    const pageName = urlToFilename(url);
    const htmlFilename = `${pageName}.html`;
    const resourcesDir = `${pageName}_files`;
    const htmlFilepath = path.join(outputDir, htmlFilename);
    const resourcesDirPath = path.join(outputDir, resourcesDir);

    try {
        // Verificar que el directorio existe y sea accesible
        const stats = await fs.stat(outputDir);
        if (!stats.isDirectory()) {
            throw new Error(`Output path is not a directory: ${outputDir}`);
        }
    } catch (err) {
        // Lanzar error si el directorio no existe o no es válido
        throw new Error(`Cannot access output directory: ${outputDir}`);
    }

    let response;
    try {
        response = await axios.get(url);
    } catch (err) {
        if (err.response) {
            throw new Error(`Request failed with status ${err.response.status}`);
        }
        throw new Error(`Network error: ${err.message}`);
    }

    const $ = cheerio.load(response.data);
    const resources = [];

    const tags = [
        { selector: 'img', attr: 'src' },
        { selector: 'link', attr: 'href' },
        { selector: 'script', attr: 'src' },
    ];

    tags.forEach(({ selector, attr }) => {
        $(selector).each((_, element) => {
            const value = $(element).attr(attr);
            if (value && !value.startsWith('http') && !value.startsWith('//')) {
                const absoluteUrl = new URL(value, url).toString();
                const resourceName = urlToFilename(absoluteUrl) + path.extname(value);
                const resourcePath = path.join(resourcesDir, resourceName);
                $(element).attr(attr, resourcePath);
                resources.push({ absoluteUrl, resourcePath });
            }
        });
    });

    await fs.mkdir(resourcesDirPath, { recursive: true });
    log(`Created resources directory: ${resourcesDirPath}`);

    // Guardar recursos (CSS, imágenes, scripts, etc.)
    const downloads = resources.map(({ absoluteUrl, resourcePath }) => {
        const fullPath = path.join(outputDir, resourcePath);
        return downloadResource(absoluteUrl, fullPath);
    });
    await Promise.all(downloads);

    // Guardar HTML modificado
    await fs.writeFile(htmlFilepath, $.html());
    log(`Saved HTML: ${htmlFilepath}`);

    return htmlFilepath;
};

export default pageLoader;
export { urlToFilename };
