import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';

const pageLoader = async (url, outputDir = process.cwd()) => {
    console.log(`[page-loader] start: ${url} -> ${outputDir}`);

    // Verificar que el directorio de salida exista
    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    const { hostname, pathname } = new URL(url);
    const normalizedPath = path.join(hostname, pathname);
    const fileBaseName = normalizedPath.replace(/[^a-z0-9]/gi, '-');
    const htmlFileName = `${fileBaseName}.html`;
    const resourceDirName = `${fileBaseName}_files`;
    const resourceDirPath = path.join(outputDir, resourceDirName);
    const htmlFilePath = path.join(outputDir, htmlFileName);
    const htmlFilePathInside = path.join(resourceDirPath, htmlFileName);

    // Crear carpeta para recursos
    await fs.mkdir(resourceDirPath, { recursive: true });

    // Descargar HTML principal
    let response;
    try {
        response = await axios.get(url);
    } catch (err) {
        throw new Error(`Error al descargar la página principal: ${err.message}`);
    }

    const $ = cheerio.load(response.data);
    const resources = [];

    // Extraer recursos y aplanar nombres dentro de la carpeta _files
    $('img[src], link[href], script[src]').each((_, element) => {
        const tag = $(element);
        const attr = tag.attr('src') || tag.attr('href');

        if (!attr) return;

        const resourceUrl = new URL(attr, url);

        // Solo recursos del mismo host
        if (resourceUrl.hostname === hostname) {
            const resourceFileName = `${fileBaseName}${resourceUrl.pathname}`.replace(/[^a-z0-9]/gi, '-');
            const resourcePath = path.join(resourceDirPath, resourceFileName);

            // Actualizar HTML para apuntar a la ruta relativa
            tag.attr(tag.is('link') ? 'href' : 'src', path.relative(outputDir, resourcePath));

            resources.push({ resourceUrl: resourceUrl.href, filePath: resourcePath });
        }
    });

    // Guardar HTML principal
    const updatedHtml = $.html();
    await fs.writeFile(htmlFilePath, updatedHtml, 'utf-8');
    await fs.writeFile(htmlFilePathInside, updatedHtml, 'utf-8');

    // Descargar recursos
    for (const { resourceUrl, filePath } of resources) {
        try {
            const res = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, res.data);
        } catch (err) {
            console.error(`[page-loader] No se pudo descargar ${resourceUrl}: ${err.message}`);
        }
    }

    console.log(`[page-loader] finished: ${htmlFilePath}`);
    return htmlFilePath;
};

export default pageLoader;
