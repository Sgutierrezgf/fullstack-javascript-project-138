import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import * as cheerio from 'cheerio';

const formatFilename = (url) => {
    const { hostname, pathname } = new URL(url);
    const cleanPath = `${hostname}${pathname}`
        .replace(/[^a-zA-Z0-9]/g, '-')
        .replace(/-$/, '');
    return cleanPath;
};

const downloadFile = (url, outputPath, responseType = 'arraybuffer') =>
    axios.get(url, { responseType }).then((res) => fs.writeFile(outputPath, res.data));

const pageLoader = (url, outputDir = process.cwd()) => {
    const pageName = formatFilename(url);
    const htmlFilename = `${pageName}.html`;
    const resourcesDirName = `${pageName}_files`;

    const htmlPath = path.join(outputDir, htmlFilename);
    const resourcesDir = path.join(outputDir, resourcesDirName);

    return axios.get(url)
        .then(async (response) => {
            const html = response.data;
            const $ = cheerio.load(html);
            await fs.mkdir(resourcesDir, { recursive: true });

            const imagePromises = $('img').map(async (_, img) => {
                const src = $(img).attr('src');
                if (!src) return;

                const imageUrl = new URL(src, url).href;
                const { hostname, pathname } = new URL(imageUrl);
                const ext = path.extname(pathname) || '.png';
                const base = pathname.slice(0, -ext.length);
                const imageFilename = `${hostname}${base}`.replace(/[^a-zA-Z0-9]/g, '-');
                const fullImageName = `${imageFilename}${ext}`;
                const imagePath = path.join(resourcesDir, fullImageName);

                await downloadFile(imageUrl, imagePath, 'arraybuffer');

                const newSrc = `${resourcesDirName}/${fullImageName}`;
                $(img).attr('src', newSrc);
            }).get();
            await Promise.all(imagePromises);

            // Guardar HTML modificado
            await fs.writeFile(htmlPath, $.html());

            return htmlPath;
        });
};

export default pageLoader;
