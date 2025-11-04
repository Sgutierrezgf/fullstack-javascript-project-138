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
            const resourceFileName = `${fileBaseName}${resourceUrl.pathname}`.replace(/[^a-z0-9]/gi, '-');
            const resourcePath = path.join(resourceDirPath, resourceFileName);

            tag.attr(attrName, path.relative(outputDir, resourcePath));
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
