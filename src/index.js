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
 * usando solo el hostname del sitio base como prefijo.
 */
const buildResourceName = (resourceUrl, baseUrl) => {
    const { pathname } = new URL(resourceUrl);
    const ext = path.extname(pathname) || '.html';

    // ✅ Solo el hostname como prefijo, no toda la ruta
    const baseHost = new URL(baseUrl).hostname;
    const baseName = baseHost.replace(/[^a-zA-Z0-9]/g, '-');

    const pathWithoutExt = ext ? pathname.slice(0, -ext.length) : pathname;
    let cleanPath = pathWithoutExt.replace(/^\/|\/$/g, '');
    if (cleanPath === '') cleanPath = 'index';
    cleanPath = cleanPath.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/-$/, '');

    return `${baseName}-${cleanPath}${ext}`;
};

/**
 * Descarga recurso si pertenece al mismo host EXACTO y lo guarda en outputDir.
 * Devuelve el nombre de archivo o null si se ignora.
 */
const downloadResource = async (resourceUrl, outputDir, baseHost, baseUrl) => {
    try {
        const abs = new URL(resourceUrl);
        console.log(`[page-loader] trying resource: ${resourceUrl} -> hostname: ${abs.hostname}`);

        if (abs.hostname !== baseHost) {
            console.log(`[page-loader] skipped (different host): ${abs.hostname} !== ${baseHost}`);
            return null;
        }

        const res = await axios.get(abs.href, { responseType: 'arraybuffer', maxRedirects: 5 });
        const data = res.data;

        const filename = buildResourceName(abs.href, baseUrl);
        const filePath = path.join(outputDir, filename);
        await fs.writeFile(filePath, Buffer.from(data));

        console.log(`[page-loader] saved: ${filePath}`);
        return filename;
    } catch (err) {
        console.error(`[page-loader] error downloading ${resourceUrl}:`, err?.message || err);
        return null;
    }
};

/**
 * Función principal: descarga una página y sus recursos locales
 */
const pageLoader = async (pageUrl, outputDir = process.cwd()) => {
    console.log(`[page-loader] start: ${pageUrl} -> output: ${outputDir}`);

    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    // Descargar HTML principal
    let html;
    try {
        const res = await axios.get(pageUrl);
        html = res.data;
    } catch (err) {
        throw new Error(`Fallo al descargar la página principal ${pageUrl}: ${err.message}`);
    }

    const $ = load(html, { decodeEntities: false });

    // Crear carpeta de assets
    const baseName = sanitizeName(pageUrl);
    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);
    await fs.mkdir(assetsDirPath, { recursive: true });

    // Recolectar recursos locales
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

    console.log('[page-loader] resources found:', resources.map(r => r.url));

    const baseHost = new URL(pageUrl).hostname;

    // Descargar recursos secuencialmente (determinista para los tests)
    for (const { el, attr, url } of resources) {
        const filename = await downloadResource(url, assetsDirPath, baseHost, pageUrl);
        if (filename) {
            $(el).attr(attr, path.posix.join(assetsDirName, filename));
        } else {
            console.log(`[page-loader] resource not saved (null): ${url}`);
        }
    }

    // Guardar HTML final
    const htmlFilename = `${baseName}.html`;
    const htmlPath = path.join(outputDir, htmlFilename);
    await fs.writeFile(htmlPath, $.html({ decodeEntities: false }));

    console.log(`[page-loader] finished: wrote ${htmlPath}`);
    return htmlPath;
};

export default pageLoader;
