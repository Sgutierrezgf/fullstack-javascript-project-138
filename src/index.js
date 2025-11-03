import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import Listr from 'listr';

const makeFileName = (url) => {
    const { hostname, pathname } = new URL(url);
    const fullPath = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    return fullPath.replace(/^-+|-+$/g, '');
};

const downloadResource = async (resourceUrl, baseUrl, outputDir) => {
    try {
        const absoluteUrl = new URL(resourceUrl, baseUrl);
        if (!['http:', 'https:'].includes(absoluteUrl.protocol)) return null;

        const baseHost = new URL(baseUrl).hostname;
        if (!absoluteUrl.hostname.endsWith(baseHost)) return null;

        const parsedPath = path.parse(absoluteUrl.pathname);
        const ext = parsedPath.ext || '.html';
        const withoutExt = parsedPath.dir + '/' + parsedPath.name;

        const cleanName = `${absoluteUrl.hostname}${withoutExt}`.replace(/[^a-zA-Z0-9]/g, '-');
        const fileName = `${cleanName}${ext}`;
        const filePath = path.join(outputDir, fileName);

        const { data } = await axios.get(absoluteUrl.href, { responseType: 'arraybuffer' });
        await fs.writeFile(filePath, data);

        return fileName;
    } catch (error) {
        throw new Error(`No se pudo descargar ${resourceUrl}: ${error.message}`);
    }
};

export default async function pageLoader(url, outputDir = process.cwd()) {
    const baseName = makeFileName(url);
    const htmlFileName = `${baseName}.html`;
    const htmlFilePath = path.join(outputDir, htmlFileName);

    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);

    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    await fs.mkdir(assetsDirPath, { recursive: true });

    const resources = [];

    $('img').each((_, el) => resources.push({ attr: 'src', el }));
    $('link').each((_, el) => {
        if ($(el).attr('rel') !== 'canonical') {
            resources.push({ attr: 'href', el });
        }
    });
    $('script').each((_, el) => {
        if ($(el).attr('src')) resources.push({ attr: 'src', el });
    });

    const tasks = new Listr(
        resources.map(({ attr, el }) => {
            const src = $(el).attr(attr);
            if (!src) return null;

            return {
                title: `Descargando ${src}`,
                task: async () => {
                    const fileName = await downloadResource(src, url, assetsDirPath);
                    if (fileName) $(el).attr(attr, `${assetsDirName}/${fileName}`);
                },
            };
        }).filter(Boolean),
        { concurrent: true } // 🔥 descargas en paralelo
    );

    await tasks.run();

    await fs.writeFile(htmlFilePath, $.html());
    return htmlFilePath;
}
