import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { load } from 'cheerio';

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

const downloadResource = async (resourceUrl, outputDir, baseHost) => {
    try {
        const abs = new URL(resourceUrl);
        if (!abs.hostname.endsWith(baseHost)) {
            return null;
        }

        const { data } = await axios.get(abs.href, { responseType: 'arraybuffer' });
        const filename = sanitizeName(abs.href);
        const filePath = path.join(outputDir, filename);
        await fs.writeFile(filePath, data);
        return filename;
    } catch {
        return null;
    }
};

// 🔹 Ajuste del formato del HTML
const normalizeHtml = (html) => {
    return html
        // elimina saltos innecesarios dentro de etiquetas
        .replace(/>\s+</g, '><')
        // restaura espacios de indentación estándar
        .replace(/<head>/, '    <head>')
        .replace(/<\/head>/, '    </head>')
        .replace(/<body>/, '    <body>')
        .replace(/<\/body>/, '    </body>')
        // fuerza autocierre donde corresponda
        .replace(/<img([^>]*?)(?<!\/)>/g, '<img$1 />')
        .replace(/<link([^>]*?)(?<!\/)>/g, '<link$1 />')
        // pone <p> y </p> en una sola línea
        .replace(/<p>(.*?)\s*<\/p>/g, '<p>$1</p>')
        // fuerza los <script> en una sola línea
        .replace(/<script([^>]*)>\s*<\/script>/g, '<script$1></script>')
        // limpia saltos finales
        .trim() + '\n';
};

const pageLoader = async (pageUrl, outputDir = process.cwd()) => {
    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    let html;
    try {
        const res = await axios.get(pageUrl);
        html = res.data;
    } catch (err) {
        throw new Error(`Fallo al descargar la página principal ${pageUrl}: ${err.message}`);
    }

    const $ = load(html, { decodeEntities: false });

    const baseName = sanitizeName(pageUrl);
    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);
    await fs.mkdir(assetsDirPath, { recursive: true });

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

    for (const { el, attr, url } of resources) {
        const filename = await downloadResource(url, assetsDirPath, baseHost);
        if (filename) {
            $(el).attr(attr, path.join(assetsDirName, filename));
        }
    }

    const htmlFilename = `${baseName}.html`;
    const htmlPath = path.join(outputDir, htmlFilename);
    const formattedHtml = normalizeHtml($.html());
    await fs.writeFile(htmlPath, formattedHtml);

    const copyInAssetsPath = path.join(assetsDirPath, htmlFilename);
    try {
        await fs.copyFile(htmlPath, copyInAssetsPath);
    } catch { }

    return htmlPath;
};

export default pageLoader;
