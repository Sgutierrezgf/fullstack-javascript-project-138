import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import debugLib from 'debug';

const debug = debugLib('page-loader');

const makeFileName = (url) => {
    const { hostname, pathname } = new URL(url);
    const fullPath = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    return fullPath.replace(/^-+|-+$/g, '');
};

const downloadResource = async (resourceUrl, baseUrl, outputDir) => {
    const absoluteUrl = new URL(resourceUrl, baseUrl);
    debug(`Descargando recurso: ${absoluteUrl.href}`);

    if (!['http:', 'https:'].includes(absoluteUrl.protocol)) {
        debug(`Protocolo no soportado: ${absoluteUrl.protocol}`);
        return null;
    }

    const baseHost = new URL(baseUrl).hostname;
    if (!absoluteUrl.hostname.endsWith(baseHost)) {
        debug(`Recurso externo omitido: ${absoluteUrl.hostname}`);
        return null;
    }

    const parsedPath = path.parse(absoluteUrl.pathname);
    const ext = parsedPath.ext || '.html';
    const cleanName = `${absoluteUrl.hostname}${parsedPath.dir}/${parsedPath.name}`
        .replace(/[^a-zA-Z0-9]/g, '-');
    const fileName = `${cleanName}${ext}`;
    const filePath = path.join(outputDir, fileName);

    try {
        const { data, status } = await axios.get(absoluteUrl.href, { responseType: 'arraybuffer' });
        if (status !== 200) {
            throw new Error(`HTTP ${status}`);
        }
        await fs.writeFile(filePath, data);
        debug(`Recurso guardado: ${filePath}`);
        return fileName;
    } catch (err) {
        throw new Error(`Fallo al descargar recurso ${absoluteUrl.href}: ${err.message}`);
    }
};

export default async function pageLoader(url, outputDir = process.cwd()) {
    debug(`Iniciando descarga de página: ${url}`);

    const baseName = makeFileName(url);
    const htmlFileName = `${baseName}.html`;
    const htmlFilePath = path.join(outputDir, htmlFileName);
    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);

    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    let html;
    try {
        const { data, status } = await axios.get(url);
        if (status !== 200) throw new Error(`HTTP ${status}`);
        html = data;
    } catch (err) {
        throw new Error(`Fallo al descargar la página principal ${url}: ${err.message}`);
    }

    await fs.mkdir(assetsDirPath, { recursive: true });

    const $ = cheerio.load(html);
    const resources = [];

    $('img').each((_, el) => resources.push({ attr: 'src', el }));
    $('link').each((_, el) => {
        if ($(el).attr('rel') !== 'canonical') resources.push({ attr: 'href', el });
    });
    $('script').each((_, el) => {
        if ($(el).attr('src')) resources.push({ attr: 'src', el });
    });

    debug(`Recursos detectados: ${resources.length}`);

    const downloads = resources.map(async ({ attr, el }) => {
        const src = $(el).attr(attr);
        if (!src) return;
        try {
            const fileName = await downloadResource(src, url, assetsDirPath);
            if (fileName) $(el).attr(attr, `${assetsDirName}/${fileName}`);
        } catch (err) {
            debug(`Error en recurso ${src}: ${err.message}`);
        }
    });

    await Promise.all(downloads);

    await fs.writeFile(htmlFilePath, $.html());
    debug(`Archivo final guardado: ${htmlFilePath}`);
    return htmlFilePath;
}
