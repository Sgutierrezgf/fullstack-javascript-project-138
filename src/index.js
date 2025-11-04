import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { load } from 'cheerio';

/**
 * Convierte URL en nombre seguro para archivo/directorio
 */
const sanitizeName = (url) => {
    const { hostname, pathname } = new URL(url);
    const full = `${hostname}${pathname}`;
    const extMatch = full.match(/(\.[a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const base = ext ? full.slice(0, -ext.length) : full;

    const sanitizedBase = base.replace(/[^a-zA-Z0-9]/g, '-');
    const sanitized = sanitizedBase.replace(/-+/g, '-').replace(/-$/, '');

    return ext ? `${sanitized}${ext}` : sanitized;
};

/**
 * Genera un nombre de archivo limpio para un recurso (CSS, JS, imagen, etc.)
 * usando el nombre base de la página principal como prefijo.
 */
const buildResourceName = (resourceUrl, baseUrl) => {
    const { pathname } = new URL(resourceUrl);
    const ext = path.extname(pathname) || '.html';
    const baseName = sanitizeName(baseUrl);

    // Limpia el path del recurso (por ejemplo "assets/styles.css" → "assets-styles.css")
    const cleanPath = pathname.replace(/^\/|\/$/g, '').replace(/[^a-zA-Z0-9]/g, '-');

    // Combina el nombre base de la página con el path del recurso
    return `${baseName}-${cleanPath}${ext}`;
};

/**
 * Descarga recurso si pertenece al mismo host EXACTO y lo guarda en outputDir.
 * Devuelve el nombre de archivo o null si se ignora.
 */
const downloadResource = async (resourceUrl, outputDir, baseHost, baseUrl) => {
    try {
        const abs = new URL(resourceUrl);
        if (abs.hostname !== baseHost) return null;

        const { data } = await axios.get(abs.href, { responseType: 'arraybuffer' });
        const filename = buildResourceName(abs.href, baseUrl);
        const filePath = path.join(outputDir, filename);
        await fs.writeFile(filePath, data);
        return filename;
    } catch {
        return null;
    }
};

const pageLoader = async (pageUrl, outputDir = process.cwd()) => {
    // validar directorio de salida
    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    // descargar HTML principal
    let html;
    try {
        const res = await axios.get(pageUrl);
        html = res.data;
    } catch (err) {
        throw new Error(`Fallo al descargar la página principal ${pageUrl}: ${err.message}`);
    }

    const $ = load(html, { decodeEntities: false });

    // preparar carpeta de assets
    const baseName = sanitizeName(pageUrl);
    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);
    await fs.mkdir(assetsDirPath, { recursive: true });

    // recolectar recursos internos
    const resources = [];

    $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src) resources.push({ el, attr: 'src', url: new URL(src, pageUrl).href });
    });

    $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) resources.push({ el, attr: 'href', url: new URL(href, pageUrl).href });
    });

    $('script[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) resources.push({ el, attr: 'src', url: new URL(src, pageUrl).href });
    });

    const baseHost = new URL(pageUrl).hostname;

    // descargar recursos (serialmente para predecibilidad en tests)
    for (const { el, attr, url } of resources) {
        const filename = await downloadResource(url, assetsDirPath, baseHost, pageUrl);
        if (filename) {
            $(el).attr(attr, path.join(assetsDirName, filename));
        }
    }

    // escribir HTML final
    const htmlFilename = `${baseName}.html`;
    const htmlPath = path.join(outputDir, htmlFilename);
    await fs.writeFile(htmlPath, $.html({ decodeEntities: false }));

    return htmlPath;
};

export default pageLoader;
