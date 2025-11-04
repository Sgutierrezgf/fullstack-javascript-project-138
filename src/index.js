import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const pageLoader = async (url, outputDir = process.cwd()) => {
    console.log(`[page-loader] start: ${url} -> ${outputDir}`);

    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    const { hostname, pathname } = new URL(url);
    // Genera el nombre base (ej: site-com-blog-about)
    const fileBaseName = path.join(hostname, pathname).replace(/[^a-z0-9]/gi, '-');
    const htmlFileName = `${fileBaseName}.html`;
    // Genera el nombre del directorio de recursos (ej: site-com-blog-about_files)
    const resourceDirName = `${fileBaseName}_files`;
    const resourceDirPath = path.join(outputDir, resourceDirName);
    const htmlFilePath = path.join(outputDir, htmlFileName);

    await fs.mkdir(resourceDirPath, { recursive: true });

    let response;
    try {
        response = await axios.get(url);
    } catch (err) {
        throw new Error(`Error al descargar la página principal: ${err.message}`);
    }

    const $ = cheerio.load(response.data);
    const resources = [];

    $('img[src], link[href], script[src]').each((_, element) => {
        const tag = $(element);
        const attrName = tag.attr('src') ? 'src' : 'href';
        const attrValue = tag.attr(attrName);
        if (!attrValue) return;

        const resourceUrl = new URL(attrValue, url);

        // Solo procesar recursos en el mismo dominio
        if (resourceUrl.hostname === hostname) {

            // --- CÓDIGO CORREGIDO PARA GENERAR resourceFileName ---

            // 1. Obtener la ruta del recurso, eliminando el '/' inicial si existe.
            const resourcePath = resourceUrl.pathname.startsWith('/')
                ? resourceUrl.pathname.substring(1)
                : resourceUrl.pathname;

            // 2. Separar la extensión (ej: .css)
            const extension = path.extname(resourcePath);

            // 3. Obtener la base del nombre (ej: assets/styles)
            //    Si no hay extensión, esto es todo el resourcePath
            const baseResourceName = resourcePath.slice(0, -extension.length);

            // 4. Sanitizar la base: reemplazamos todo lo que NO es alfanumérico por un guion.
            //    Esto convierte: assets/styles -> assets-styles
            //    También maneja casos sin extensión (ej: /users/1 -> users-1)
            const sanitizedBaseResourceName = baseResourceName.replace(/[^a-z0-9]/gi, '-').replace(/-{2,}/g, '-');

            // 5. Construir el nombre de archivo final (ej: site-com-blog-about-assets-styles.css)
            const resourceFileName = `${fileBaseName}-${sanitizedBaseResourceName}${extension}`;

            // --- FIN CÓDIGO CORREGIDO ---

            const resourcePathFull = path.join(resourceDirPath, resourceFileName);

            // Modificamos el atributo en el HTML para que apunte a la ruta relativa
            // Ej: src="site-com-blog-about_files/site-com-blog-about-assets-styles.css"
            tag.attr(attrName, path.join(resourceDirName, resourceFileName));

            resources.push({ resourceUrl: resourceUrl.href, filePath: resourcePathFull });
        }
    });

    await fs.writeFile(htmlFilePath, $.html(), 'utf-8');

    await Promise.all(resources.map(async ({ resourceUrl, filePath }) => {
        try {
            const res = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, res.data);
        } catch (err) {
            // Error amigable en consola si no se puede descargar el recurso
            console.error(`[page-loader] no se pudo descargar ${resourceUrl}: ${err.message}`);
        }
    }));

    console.log(`[page-loader] finished: ${htmlFilePath}`);
    return htmlFilePath;
};

export default pageLoader;