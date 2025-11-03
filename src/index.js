import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const makeFileName = (url) => {
    const { hostname, pathname } = new URL(url);
    const fullPath = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    return fullPath.replace(/^-+|-+$/g, '');
};

const downloadImage = async (src, baseUrl, outputDir) => {
    const imageUrl = new URL(src, baseUrl).href;
    const cleanName = `${new URL(imageUrl).hostname}${new URL(imageUrl).pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    const fileName = `${cleanName}${path.extname(imageUrl)}`;
    const filePath = path.join(outputDir, fileName);

    const { data } = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(filePath, data);

    return fileName;
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

    const imgTags = $('img').toArray();

    const downloads = imgTags.map(async (img) => {
        const src = $(img).attr('src');
        if (!src) return;

        const fileName = await downloadImage(src, url, assetsDirPath);
        $(img).attr('src', `${assetsDirName}/${fileName}`);
    });

    await Promise.all(downloads);

    await fs.writeFile(htmlFilePath, $.html());

    return htmlFilePath;
}
