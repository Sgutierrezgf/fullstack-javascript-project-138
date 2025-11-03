import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { load } from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sanitizeName = (url) => url
    .replace(/https?:\/\//, '')
    .replace(/[\/:]/g, '-');

const downloadResource = async (resourceUrl, outputDir) => {
    const { data } = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
    const filename = sanitizeName(resourceUrl);
    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, data);
    return filename;
};

export const pageLoader = async (pageUrl, outputDir) => {
    const { data: html } = await axios.get(pageUrl);
    const $ = load(html, { decodeEntities: false });

    const assetsDirName = `${sanitizeName(pageUrl)}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);

    await fs.mkdir(assetsDirPath, { recursive: true });

    // Cambiar <img>, <link> y <script>
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

    for (const { el, attr, url } of resources) {
        const filename = await downloadResource(url, assetsDirPath);
        $(el).attr(attr, path.join(assetsDirName, filename));
    }

    // Guardar HTML principal
    const htmlFilename = `${sanitizeName(pageUrl)}.html`;
    const htmlPath = path.join(outputDir, htmlFilename);
    await fs.writeFile(htmlPath, $.html()); // <-- NO modificar saltos de línea ni aplastar

    return htmlPath;
};
