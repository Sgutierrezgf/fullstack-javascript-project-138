import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import debugLib from 'debug';
import Listr from 'listr';

const debug = debugLib('page-loader');

// Convierte URL en nombre seguro
const makeFileName = (url) => {
    const { hostname, pathname } = new URL(url);
    const fullPath = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    return fullPath.replace(/^-+|-+$/g, '');
};

// Descarga recursos (CSS, JS, imágenes)
const downloadResource = async (resourceUrl, baseUrl, outputDir) => {
    try {
        const absUrl = new URL(resourceUrl, baseUrl);
        if (!['http:', 'https:'].includes(absUrl.protocol)) return null;

        const baseHost = new URL(baseUrl).hostname;
        if (!absUrl.hostname.endsWith(baseHost)) return null;

        const parsed = path.parse(absUrl.pathname);
        const ext = parsed.ext || '.html';
        const cleanName = `${absUrl.hostname}${parsed.dir}/${parsed.name}`.replace(/[^a-zA-Z0-9]/g, '-');
        const fileName = `${cleanName}${ext}`;
        const filePath = path.join(outputDir, fileName);

        try {
            const res = await axios.get(absUrl.href, { responseType: 'arraybuffer' });
            await fs.writeFile(filePath, res.data);
            return fileName;
        } catch {
            await fs.writeFile(filePath, '');
            return fileName;
        }
    } catch {
        return null;
    }
};

export default async function pageLoader(url, outputDir = process.cwd()) {
    debug(`Iniciando descarga de la página: ${url}`);

    const baseName = makeFileName(url);
    const htmlFileName = `${baseName}.html`;
    const htmlFilePath = path.join(outputDir, htmlFileName);
    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);

    // Verificar directorio de salida
    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    // Descargar HTML principal
    let html;
    try {
        const res = await axios.get(url);
        html = res.data;
    } catch (err) {
        throw new Error(`Fallo al descargar la página principal ${url}: ${err.message}`);
    }

    // Crear carpeta de assets
    await fs.mkdir(assetsDirPath, { recursive: true });

    const $ = cheerio.load(html);

    const resources = [];

    // Recursos estáticos
    $('img').each((_, el) => resources.push({ attr: 'src', el }));
    $('link').each((_, el) => {
        const rel = $(el).attr('rel');
        if (rel !== 'canonical') resources.push({ attr: 'href', el });
    });
    $('script').each((_, el) => {
        if ($(el).attr('src')) resources.push({ attr: 'src', el });
    });

    // Enlaces internos HTML
    $('a').each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href.startsWith('#')) return;
        try {
            const abs = new URL(href, url);
            const baseHost = new URL(url).hostname;
            if (abs.hostname.endsWith(baseHost)) resources.push({ attr: 'href', el, isHtml: true });
        } catch { }
    });

    const isJest = typeof process.env.JEST_WORKER_ID !== 'undefined';
    const renderer = isJest ? 'silent' : undefined;

    // Descargar recursos y reescribir paths
    const tasks = new Listr(
        resources
            .map(({ attr, el, isHtml }) => {
                const src = $(el).attr(attr);
                if (!src) return null;

                return {
                    title: `Procesando ${src}`,
                    task: async (ctx, task) => {
                        let fileName;

                        if (isHtml) {
                            const absUrl = new URL(src, url).href;
                            if (absUrl === url || absUrl === url + '/') {
                                fileName = htmlFileName; // HTML principal
                            } else {
                                fileName = `${makeFileName(absUrl)}.html`;
                                const filePath = path.join(assetsDirPath, fileName);
                                try {
                                    const res = await axios.get(absUrl);
                                    await fs.writeFile(filePath, res.data);
                                } catch {
                                    await fs.writeFile(filePath, '');
                                }
                            }
                        } else {
                            fileName = await downloadResource(src, url, assetsDirPath);
                        }

                        if (fileName) $(el).attr(attr, `${assetsDirName}/${fileName}`);
                        task.title = fileName ? `Procesado ${src}` : `Omitido ${src}`;
                    },
                };
            })
            .filter(Boolean),
        { concurrent: true, renderer, exitOnError: false }
    );

    await tasks.run();

    // Guardar HTML principal con saltos de línea
    const finalHtml = $.html({ decodeEntities: false }).replace(/></g, '>\n<');
    await fs.writeFile(htmlFilePath, finalHtml);

    // Copiar HTML principal dentro de _files
    const mainFileInAssets = path.join(assetsDirPath, htmlFileName);
    await fs.copyFile(htmlFilePath, mainFileInAssets);

    debug(`Archivo HTML principal guardado en: ${htmlFilePath}`);
    debug(`Archivo HTML principal copiado en carpeta de assets: ${mainFileInAssets}`);

    return htmlFilePath;
}
