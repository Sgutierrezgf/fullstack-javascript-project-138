import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { load } from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Convierte una URL en un nombre de archivo seguro
 * Ejemplo: https://example.com/assets/style.css → example.com-assets-style.css
 */
const sanitizeName = (url) =>
    url.replace(/^https?:\/\//, '').replace(/[\/:]/g, '-');

/**
 * Descarga un recurso remoto (imagen, CSS, JS, etc.)
 * y lo guarda en el directorio indicado
 */
const downloadResource = async (resourceUrl, outputDir) => {
    try {
        const { data } = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
        const filename = sanitizeName(resourceUrl);
        const filePath = path.join(outputDir, filename);
        await fs.writeFile(filePath, data);
        return filename;
    } catch (error) {
        console.error(`❌ Error descargando ${resourceUrl}: ${error.message}`);
        return null;
    }
};

/**
 * Función principal: descarga la página y sus recursos locales
 */
const pageLoader = async (pageUrl, outputDir) => {
    try {
        // Descargar el HTML principal
        const { data: html } = await axios.get(pageUrl);
        const $ = load(html, { decodeEntities: false });

        // Crear carpeta para recursos
        const assetsDirName = `${sanitizeName(pageUrl)}_files`;
        const assetsDirPath = path.join(outputDir, assetsDirName);
        await fs.mkdir(assetsDirPath, { recursive: true });

        // Recolectar recursos (img, link, script)
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

        // Descargar y reemplazar las rutas en el HTML
        for (const { el, attr, url } of resources) {
            const filename = await downloadResource(url, assetsDirPath);
            if (filename) $(el).attr(attr, path.join(assetsDirName, filename));
        }

        // Guardar HTML modificado
        const htmlFilename = `${sanitizeName(pageUrl)}.html`;
        const htmlPath = path.join(outputDir, htmlFilename);
        await fs.writeFile(htmlPath, $.html());

        return htmlPath;
    } catch (error) {
        console.error(`❌ Error al procesar ${pageUrl}: ${error.message}`);
        throw error;
    }
};

// Exportar la función para uso en CLI o tests
export default pageLoader;
