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
    // 1. fileBaseName: Genera 'site-com-blog-about'
    const fileBaseName = path.join(hostname, pathname).replace(/[^a-z0-9]/gi, '-');
    const htmlFileName = `${fileBaseName}.html`;
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

        if (resourceUrl.hostname === hostname) {

            // --- CÓDIGO CORREGIDO PARA GENERAR resourceFileName ---

            // 1. Separar la extensión (ej: .css)
            const extension = path.extname(resourceUrl.pathname);
            // 2. Obtener la base del nombre (ej: /assets/styles)
            const baseName = resourceUrl.pathname.slice(0, -extension.length);

            // 3. Sanitizar la base: reemplazamos todo lo que no es alfanumérico por un guion.
            //    Esto convierte: /assets/styles -> -assets-styles
            const sanitizedBaseName = baseName.replace(/[^a-z0-9]/gi, '-');

            // 4. Eliminar guiones al inicio o final (ej: -assets-styles -> assets-styles)
            const trimmedSanitizedBaseName = sanitizedBaseName.replace(/^-+|-+$/g, '');

            // 5. Construir el nombre de archivo final (ej: site-com-blog-about-assets-styles.css)
            const resourceFileName = `${fileBaseName}-${trimmedSanitizedBaseName}${extension}`;

            // --- FIN CÓDIGO CORREGIDO ---

            const resourcePath = path.join(resourceDirPath, resourceFileName);

            // Modificamos el atributo en el HTML para que apunte a la ruta relativa (directorio_recursos/nombre_archivo)
            tag.attr(attrName, path.join(resourceDirName, resourceFileName));

            resources.push({ resourceUrl: resourceUrl.href, filePath: resourcePath });
        }
    });

    await fs.writeFile(htmlFilePath, $.html(), 'utf-8');

    await Promise.all(resources.map(async ({ resourceUrl, filePath }) => {
        try {
            const res = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, res.data);
        } catch (err) {
            console.error(`[page-loader] no se pudo descargar ${resourceUrl}: ${err.message}`);
        }
    }));

    console.log(`[page-loader] finished: ${htmlFilePath}`);
    return htmlFilePath;
};

export default pageLoader;