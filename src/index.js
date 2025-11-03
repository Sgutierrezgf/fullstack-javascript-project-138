import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import debugLib from 'debug';
import Listr from 'listr';

const debug = debugLib('page-loader');

const makeFileName = (url) => {
    const { hostname, pathname } = new URL(url);
    const fullPath = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    return fullPath.replace(/^-+|-+$/g, '');
};

// Descarga un recurso (imagen, CSS, JS o HTML interno)
const downloadResource = async (resourceUrl, baseUrl, outputDir) => {
    try {
        const absoluteUrl = new URL(resourceUrl, baseUrl);
        debug(`Procesando recurso: ${absoluteUrl.href}`);

        // Solo HTTP/S
        if (!['http:', 'https:'].includes(absoluteUrl.protocol)) {
            debug(`Protocolo no soportado: ${absoluteUrl.protocol}`);
            return null;
        }

        // Solo recursos del mismo dominio
        const baseHost = new URL(baseUrl).hostname;
        if (!absoluteUrl.hostname.endsWith(baseHost)) {
            debug(`Recurso externo omitido: ${absoluteUrl.hostname}`);
            return null;
        }

        const parsedPath = path.parse(absoluteUrl.pathname);
        let ext = parsedPath.ext;
        if (!ext) ext = '.html';
        const withoutExt = parsedPath.dir + '/' + parsedPath.name;

        const cleanName = `${absoluteUrl.hostname}${withoutExt}`.replace(/[^a-zA-Z0-9]/g, '-');
        const fileName = `${cleanName}${ext}`;
        const filePath = path.join(outputDir, fileName);

        debug(`Descargando recurso desde ${absoluteUrl.href}`);

        try {
            const response = await axios.get(absoluteUrl.href, { responseType: 'arraybuffer' });
            if (response.status !== 200) {
                debug(`Respuesta no 200 para ${absoluteUrl.href}: ${response.status}`);
                return null;
            }

            await fs.writeFile(filePath, response.data);
            debug(`Recurso guardado en ${filePath}`);
            return fileName;
        } catch (err) {
            debug(`No se pudo descargar ${absoluteUrl.href}: ${err.message}`);
            return null;
        }
    } catch (err) {
        debug(`URL inválida o error: ${resourceUrl} -> ${err.message}`);
        return null;
    }
};

export default async function pageLoader(url, outputDir = process.cwd()) {
    debug(`Iniciando descarga de la página: ${url}`);

    const baseName = makeFileName(url);
    const htmlFileName = `${baseName}.html`;
    const htmlFilePath = path.join(outputDir, htmlFileName); // <-- HTML principal fuera de _files
    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);

    // Validar que el directorio exista
    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    // Descargar HTML principal
    let html;
    try {
        const res = await axios.get(url);
        if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
        html = res.data;
    } catch (err) {
        throw new Error(`Fallo al descargar la página principal ${url}: ${err.message}`);
    }

    await fs.mkdir(assetsDirPath, { recursive: true });
    const $ = cheerio.load(html);

    const resources = [];

    // Recursos estáticos
    $('img').each((_, el) => resources.push({ attr: 'src', el }));
    $('link').each((_, el) => {
        if ($(el).attr('rel') !== 'canonical') resources.push({ attr: 'href', el });
    });
    $('script').each((_, el) => {
        if ($(el).attr('src')) resources.push({ attr: 'src', el });
    });

    const isJest = typeof process.env.JEST_WORKER_ID !== 'undefined';
    const renderer = isJest ? 'silent' : undefined;

    const tasks = new Listr(
        resources
            .map(({ attr, el }) => {
                const src = $(el).attr(attr);
                if (!src) return null;

                return {
                    title: `Descargando ${src}`,
                    task: async (ctx, task) => {
                        const fileName = await downloadResource(src, url, assetsDirPath);
                        if (fileName) {
                            $(el).attr(attr, `${assetsDirName}/${fileName}`);
                            task.title = `Descargado ${src}`;
                        } else {
                            task.title = `Omitido ${src}`;
                        }
                        return Promise.resolve();
                    },
                };
            })
            .filter(Boolean),
        {
            concurrent: true,
            renderer,
            exitOnError: false,
        }
    );

    await tasks.run();

    // Guardar HTML final fuera de _files
    await fs.writeFile(htmlFilePath, $.html());
    debug(`Archivo HTML final guardado en ${htmlFilePath}`);

    return htmlFilePath;
}
