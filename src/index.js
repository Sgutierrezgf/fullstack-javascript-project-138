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

export default async function pageLoader(url, outputDir = process.cwd()) {
    debug(`Iniciando descarga de la página: ${url}`);

    const baseName = makeFileName(url);
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

                            // Si es el mismo URL que la página principal, usa baseName
                            const baseNameLink = (absUrl === url || absUrl === url + '/') ? baseName : makeFileName(absUrl);
                            fileName = `${baseNameLink}.html`;
                            const filePath = path.join(assetsDirPath, fileName);

                            try {
                                const res = await axios.get(absUrl);
                                if (res.status === 200) await fs.writeFile(filePath, res.data);
                                debug(`HTML interno guardado en ${filePath}`);
                            } catch {
                                await fs.writeFile(filePath, '');
                                debug(`Archivo HTML interno vacío creado en ${filePath}`);
                            }
                        } else {
                            const absUrl = new URL(src, url);
                            const parsedPath = path.parse(absUrl.pathname);
                            const ext = parsedPath.ext || '.html';
                            const cleanName = `${absUrl.hostname}${parsedPath.dir}/${parsedPath.name}`.replace(/[^a-zA-Z0-9]/g, '-');
                            fileName = `${cleanName}${ext}`;
                            const filePath = path.join(assetsDirPath, fileName);

                            try {
                                const response = await axios.get(absUrl.href, { responseType: 'arraybuffer' });
                                if (response.status === 200) await fs.writeFile(filePath, response.data);
                                debug(`${ext} descargado: ${filePath}`);
                            } catch {
                                await fs.writeFile(filePath, '');
                                debug(`Archivo vacío creado: ${filePath}`);
                            }
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
