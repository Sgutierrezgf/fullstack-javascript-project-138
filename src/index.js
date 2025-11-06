import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import { Listr } from 'listr2';
import debugLib from 'debug';

const debug = debugLib('page-loader');

const formatFilename = (url) => {
    const { hostname, pathname } = new URL(url);
    return `${hostname}${pathname}`
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-$/, '');
};

const isLocalResource = (resourceUrl, baseUrl) => {
    const base = new URL(baseUrl);
    const full = new URL(resourceUrl, baseUrl);
    return full.hostname === base.hostname;
};

const downloadResource = async (resourceUrl, filePath, responseType = 'arraybuffer') => {
    const response = await axios.get(resourceUrl, { responseType });
    await fs.writeFile(filePath, response.data);
    return filePath;
};

const pageLoader = async (url, outputDir = process.cwd()) => {
    const pageName = formatFilename(url);
    const htmlFilename = `${pageName}.html`;
    const resourcesDirName = `${pageName}_files`;

    const htmlPath = path.join(outputDir, htmlFilename);
    const resourcesDir = path.join(outputDir, resourcesDirName);

    debug(`Descargando página principal: ${url}`);

    let response;
    try {
        response = await axios.get(url);
    } catch (err) {
        console.error(`❌ Error al descargar la página principal: ${err.message}`);
        process.exit(1);
    }

    const $ = cheerio.load(response.data);
    await fs.mkdir(resourcesDir, { recursive: true });

    const elements = [
        ...$('img').toArray(),
        ...$('link[href]').toArray(),
        ...$('script[src]').toArray(),
    ];

    const tasks = elements
        .map((el) => {
            const tag = el.name;
            const attr = tag === 'link' ? 'href' : 'src';
            const value = $(el).attr(attr);
            if (!value) return null;

            const fullUrl = new URL(value, url).href;

            // Ignorar recursos externos
            if (!isLocalResource(fullUrl, url)) {
                debug(`Recurso externo ignorado: ${fullUrl}`);
                return null;
            }

            const { hostname, pathname } = new URL(fullUrl);
            const ext = path.extname(pathname) || '.html';
            const base = pathname.slice(0, -ext.length);
            const fileName = `${hostname}${base}`.replace(/[^a-zA-Z0-9]/g, '-');
            const filePath = path.join(resourcesDir, `${fileName}${ext}`);

            const responseType = /\.(png|jpg|jpeg|gif|ico)$/i.test(ext)
                ? 'arraybuffer'
                : 'utf8';

            return {
                title: `Descargando ${fullUrl}`,
                task: async () => {
                    try {
                        await downloadResource(fullUrl, filePath, responseType);
                        const newPath = `${resourcesDirName}/${fileName}${ext}`;
                        $(el).attr(attr, newPath);
                    } catch (error) {
                        debug(`Error al descargar ${fullUrl}: ${error.message}`);
                    }
                },
            };
        })
        .filter(Boolean);

    const listr = new Listr(tasks, { concurrent: true });
    await listr.run();

    await fs.writeFile(htmlPath, $.html());
    console.log(`✅ Página descargada correctamente en: ${htmlPath}`);
    return htmlPath;
};

export default pageLoader;
