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
    // 1. fileBaseName: Mantenemos la lógica para el nombre base del archivo HTML y el directorio de recursos
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
            // --- CAMBIO CLAVE AQUÍ ---
            // 2. Generamos el nombre del recurso a partir del pathname.
            //    La expresión regular ahora incluye el punto `.` como un carácter permitido.
            //    Esto preserva la extensión del archivo (ej: .css, .jpg).
            const resourcePathnameProcessed = resourceUrl.pathname
                .split('/') // Dividimos por las barras
                .filter((p) => p) // Eliminamos elementos vacíos
                .join('-'); // Unimos con guiones

            // Reemplazamos caracteres no alfanuméricos ni puntos con guiones
            const sanitizedResourceName = resourcePathnameProcessed.replace(/[^a-z0-9.]/gi, '-');

            const resourceFileName = `${fileBaseName}-${sanitizedResourceName}`;

            const resourcePath = path.join(resourceDirPath, resourceFileName);

            // 3. Modificamos el atributo en el HTML para que apunte a la ruta relativa del recurso.
            //    El uso de `path.relative` es correcto si `tag.attr` espera una ruta relativa al HTML (o al directorio de salida).
            //    Asegúrate de que la ruta relativa sea correcta para el navegador, típicamente relativa al archivo HTML.
            //    Una forma común es usar el nombre del directorio de recursos + el nombre del archivo.
            tag.attr(attrName, path.join(resourceDirName, resourceFileName));

            // Si la prueba espera la ruta relativa al directorio de salida, tu código original era:
            // tag.attr(attrName, path.relative(outputDir, resourcePath)); 
            // Pero esto es una ruta que empieza con el nombre del directorio de recursos, 
            // que es lo que se espera dentro del HTML.

            // Para la prueba que falló (ENOENT), el problema estaba en el nombre.

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