import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { load } from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Convierte una URL en un nombre de archivo seguro
const sanitizeName = (url) => url
    .replace(/^https?:\/\//, '')
    .replace(/[\/:]/g, '-');

// Descarga un recurso y lo guarda en el directorio indicado
const downloadResource = async (resourceUrl, outputDir) => {
    const { data } = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
    const filename = sanitizeName(resourceUrl);
    const filePath = path.join(outputDir, filename);
    await fs.writeFile(filePath, data);
    return filename;
};

// Función principal
const pageLoader = async (pageUrl, outputDir) => {
    // Descargar el HTML principal
    const { data: html } = await axios.get(pageUrl);
    const $ = load(html, { decodeEntities: false });

    // Crear carpeta de recursos
    const assetsDirName = `${sanitizeName(pageUrl)}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);
    await fs.mkdir(assetsDirPath, { recursive: true });

    // Recolectar recursos
    const resources = [];

    // Imágenes
    $('img').each((_, el) => {
        const src = $(el).attr('src');
        if (src) resources.push({ el, attr: 'src', url: new URL(src, pageUrl).href });
    });

    // Hojas de estilo
    $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) resources.push({ el, attr: 'href', url: new URL(href, pageUrl).href });
    });

    // Scripts
    $('script[src]').each((_, el) => {
        const src = $(el).attr('src');
        if (src) resources.push({ el, attr: 'src', url: new URL(src, pageUrl).href });
    });

    // Descargar y reemplazar rutas en el HTML
    for (const { el, attr, url } of resources) {
        const filename = await downloadResource(url, assetsDirPath);
        $(el).attr(attr, path.join(assetsDirName, filename));
    }

    // Guardar HTML modificado
    const htmlFilename = `${sanitizeName(pageUrl)}.html`;
    const htmlPath = path.join(outputDir, htmlFilename);
    await fs.writeFile(htmlPath, $.html()); // No modificar saltos de línea

    return htmlPath;
};

// Exportación por defecto (para pasar los tests)
export default pageLoader;
