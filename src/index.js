import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import debugLib from 'debug';
import Listr from 'listr';
import { makeFileName } from './utils.js'; // <-- tu util

const debug = debugLib('page-loader');

// Descarga cualquier recurso y devuelve su nombre de archivo
const downloadResource = async (resourceUrl, baseUrl, outputDir) => {
    try {
        const absoluteUrl = new URL(resourceUrl, baseUrl);

        if (!['http:', 'https:'].includes(absoluteUrl.protocol)) return null;

        const baseHost = new URL(baseUrl).hostname;
        if (!absoluteUrl.hostname.endsWith(baseHost)) return null;

        const parsedPath = path.parse(absoluteUrl.pathname);
        const ext = parsedPath.ext || '.html';
        const cleanName = `${absoluteUrl.hostname}${parsedPath.dir}/${parsedPath.name}`.replace(/[^a-zA-Z0-9]/g, '-');
        const fileName = `${cleanName}${ext}`;
        const filePath = path.join(outputDir, fileName);

        try {
            const res = await axios.get(absoluteUrl.href, { responseType: 'arraybuffer' });
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

    const baseName = makeFileName(url).replace('.html', '');
    const htmlFileName = `${baseName}.html`;
    const htmlFilePath = path.join(outputDir, htmlFileName);

    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);

    try {
        await fs.access(outputDir);
    } catch {
        throw new Error(`Directorio de salida no encontrado: ${outputDir}`);
    }

    let html;
    try {
        const res = await axios.get(url);
        html = res.data;
    } catch (err) {
        throw new Error(`Fallo al descargar la página principal ${url}: ${err.message}`);
    }

    await fs.mkdir(assetsDirPath, { recursive: true });
    const $ = cheerio.load(html);

    const resources = [];

    $('img').each((_, el) => resources.push({ attr: 'src', el }));
    $('link').each((_, el) => {
        if ($(el).attr('rel') !== 'canonical') resources.push({ attr: 'href', el });
    });
    $('script').each((_, el) => {
        if ($(el).attr('src')) resources.push({ attr: 'src', el });
    });

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

                            // HTML interno igual a la página principal
                            fileName = absUrl === url || absUrl === url + '/'
                                ? `${baseName}.html`
                                : makeFileName(absUrl);

                            const filePath = path.join(assetsDirPath, fileName);

                            try {
                                const res = await axios.get(absUrl);
                                await fs.writeFile(filePath, res.data);
                                debug(`HTML descargado: ${filePath}`);
                            } catch {
                                await fs.writeFile(filePath, '');
                                debug(`Archivo HTML interno vacío creado: ${filePath}`);
                            }
                        } else {
                            const downloaded = await downloadResource(src, url, assetsDirPath);
                            fileName = downloaded;
                            if (fileName) debug(`${path.extname(fileName)} descargado: ${path.join(assetsDirPath, fileName)}`);
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

    await fs.writeFile(htmlFilePath, $.html());
    debug(`Archivo HTML final guardado en ${htmlFilePath}`);

    return htmlFilePath;
}
