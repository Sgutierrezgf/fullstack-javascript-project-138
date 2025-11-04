import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { URL } from 'url';
import cheerio from 'cheerio';

// Convierte URL a un nombre de archivo seguro
function urlToFilename(urlStr) {
    const { hostname, pathname } = new URL(urlStr);
    let fileName = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    if (fileName.endsWith('-')) fileName = fileName.slice(0, -1);
    return fileName + '.html';
}

// Convierte URL de recurso a nombre de archivo
function resourceToFilename(pageUrl, resourceUrl) {
    const pageHost = new URL(pageUrl).hostname;
    const urlObj = new URL(resourceUrl, pageUrl);
    let name = `${urlObj.hostname}${urlObj.pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    if (urlObj.pathname.endsWith('/')) name += '-index';
    const ext = path.extname(urlObj.pathname) || '.html';
    return name + ext;
}

async function downloadResource(url, filepath) {
    const { data } = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, data);
}

export default async function pageLoader(pageUrl, outputDir) {
    // 1. Descargar HTML
    const { data: html } = await axios.get(pageUrl);
    const $ = cheerio.load(html);

    // 2. Crear carpeta de recursos
    const htmlFilename = urlToFilename(pageUrl);
    const resourcesDir = path.join(outputDir, htmlFilename.replace('.html', '_files'));
    await fs.mkdir(resourcesDir, { recursive: true });

    // 3. Seleccionar recursos: img, script, link[rel=stylesheet]
    const resources = [];

    $('img[src]').each((i, el) => resources.push({ el, attr: 'src' }));
    $('script[src]').each((i, el) => resources.push({ el, attr: 'src' }));
    $('link[rel="stylesheet"][href]').each((i, el) => resources.push({ el, attr: 'href' }));

    for (const { el, attr } of resources) {
        const resUrl = $(el).attr(attr);
        if (!resUrl) continue;

        const filename = resourceToFilename(pageUrl, resUrl);
        const localPath = path.join(resourcesDir, filename);

        try {
            await downloadResource(resUrl, localPath);
            // Reescribir HTML para apuntar al archivo local
            $(el).attr(attr, path.join(path.basename(resourcesDir), filename));
        } catch (err) {
            console.error(`Failed to download ${resUrl}:`, err.message);
        }
    }

    // 4. Guardar HTML modificado
    const finalHtmlPath = path.join(outputDir, htmlFilename);
    await fs.writeFile(finalHtmlPath, $.html());

    return finalHtmlPath;
}
