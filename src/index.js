import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import downloadResources from './resources.js';

const pageLoader = async (url, outputDir = process.cwd()) => {
    const parsedUrl = new URL(url);
    const pageBaseName = `${parsedUrl.hostname.replace(/\W/g, '-')}`;
    const htmlFilePath = path.join(outputDir, `${pageBaseName}.html`);
    const resourcesDir = path.join(outputDir, `${pageBaseName}_files`);

    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const resources = [];

    $('img').each((i, elem) => {
        const src = $(elem).attr('src');
        if (src) {
            const resourceUrl = new URL(src, url).href;
            const fileName = path.basename(resourceUrl).replace(/\W/g, '-');
            $(elem).attr('src', path.join(`${pageBaseName}_files`, fileName));
            resources.push({ url: resourceUrl, fileName });
        }
    });

    await fs.writeFile(htmlFilePath, $.html());
    await fs.mkdir(resourcesDir, { recursive: true });

    // Mostrar progreso de descargas
    await downloadResources(resources, resourcesDir);

    return htmlFilePath;
};

export default pageLoader;
