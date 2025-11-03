import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import debugLib from 'debug';

const debug = debugLib('page-loader');

const makeFileName = (url) => {
    const { hostname, pathname } = new URL(url);
    const fullPath = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    const clean = fullPath.replace(/^-+|-+$/g, '');
    debug(`Generated base filename for ${url}: ${clean}`);
    return clean;
};

const downloadResource = async (resourceUrl, baseUrl, outputDir) => {
    try {
        const absoluteUrl = new URL(resourceUrl, baseUrl);
        if (!['http:', 'https:'].includes(absoluteUrl.protocol)) {
            debug(`Skipping unsupported protocol: ${absoluteUrl.href}`);
            return null;
        }

        const baseHost = new URL(baseUrl).hostname;
        if (!absoluteUrl.hostname.endsWith(baseHost)) {
            debug(`Skipping external resource: ${absoluteUrl.href}`);
            return null;
        }

        const parsedPath = path.parse(absoluteUrl.pathname);
        const ext = parsedPath.ext || '.html';
        const withoutExt = parsedPath.dir + '/' + parsedPath.name;
        const cleanName = `${absoluteUrl.hostname}${withoutExt}`.replace(/[^a-zA-Z0-9]/g, '-');
        const fileName = `${cleanName}${ext}`;
        const filePath = path.join(outputDir, fileName);

        debug(`Downloading resource: ${absoluteUrl.href}`);
        const { data } = await axios.get(absoluteUrl.href, { responseType: 'arraybuffer' });
        await fs.writeFile(filePath, data);
        debug(`Saved resource to ${filePath}`);

        return fileName;
    } catch (error) {
        debug(`⚠️  Error downloading ${resourceUrl}: ${error.message}`);
        return null;
    }
};

export default async function pageLoader(url, outputDir = process.cwd()) {
    debug(`Starting download for ${url} to directory ${outputDir}`);
    const baseName = makeFileName(url);
    const htmlFileName = `${baseName}.html`;
    const htmlFilePath = path.join(outputDir, htmlFileName);
    const assetsDirName = `${baseName}_files`;
    const assetsDirPath = path.join(outputDir, assetsDirName);

    debug(`Downloading HTML page...`);
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    await fs.mkdir(assetsDirPath, { recursive: true });
    debug(`Assets directory created at ${assetsDirPath}`);

    const resources = [];
    $('img').each((_, el) => resources.push({ attr: 'src', el }));
    $('link').each((_, el) => {
        if ($(el).attr('rel') !== 'canonical') resources.push({ attr: 'href', el });
    });
    $('script').each((_, el) => {
        if ($(el).attr('src')) resources.push({ attr: 'src', el });
    });

    debug(`Found ${resources.length} resources to download`);

    const downloads = resources.map(async ({ attr, el }) => {
        const src = $(el).attr(attr);
        if (!src) return;
        const fileName = await downloadResource(src, url, assetsDirPath);
        if (fileName) {
            $(el).attr(attr, `${assetsDirName}/${fileName}`);
        }
    });

    await Promise.all(downloads);
    debug(`All resources processed. Writing final HTML...`);

    await fs.writeFile(htmlFilePath, $.html());
    debug(`Page saved successfully at ${htmlFilePath}`);

    return htmlFilePath;
}
