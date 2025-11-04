import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import cheerio from 'cheerio';

const pageLoader = async (url, outputDir = process.cwd()) => {
    const { hostname, pathname } = new URL(url);
    const normalizedPath = path.join(hostname, pathname);
    const fileBaseName = normalizedPath.replace(/[^a-z0-9]/gi, '-');
    const htmlFileName = `${fileBaseName}.html`;
    const resourceDirName = `${fileBaseName}_files`;
    const resourceDirPath = path.join(outputDir, resourceDirName);
    const htmlFilePath = path.join(outputDir, htmlFileName);
    const htmlFilePathInside = path.join(resourceDirPath, htmlFileName);

    // crear carpeta de recursos
    await fs.mkdir(resourceDirPath, { recursive: true });

    // descargar página
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // descargar recursos locales (img, link, script)
    const resources = [];
    $('img, link[href], script[src]').each((_, element) => {
        const tag = $(element);
        const attr = tag.attr('src') || tag.attr('href');
        if (attr && (attr.startsWith('/') || attr.startsWith('./'))) {
            const resourceUrl = new URL(attr, url);
            const resourcePath = path.join(resourceDirPath, `${hostname}${resourceUrl.pathname}`.replace(/[^a-z0-9]/gi, '-'));
            tag.attr(tag.is('link') ? 'href' : 'src', path.relative(outputDir, resourcePath));
            resources.push({ resourceUrl: resourceUrl.href, filePath: resourcePath });
        }
    });

    // guardar HTML modificado
    const updatedHtml = $.html();
    await fs.writeFile(htmlFilePath, updatedHtml, 'utf-8');
    await fs.writeFile(htmlFilePathInside, updatedHtml, 'utf-8'); // 💡 duplicado en _files

    // descargar recursos
    await Promise.all(resources.map(async ({ resourceUrl, filePath }) => {
        const res = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
        await fs.writeFile(filePath, res.data);
    }));

    return htmlFilePath;
};

export default pageLoader;
