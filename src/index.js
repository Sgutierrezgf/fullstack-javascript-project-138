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

const isLocalResource = (resourceUrl, baseUrl) => {
    const base = new URL(baseUrl);
    const full = new URL(resourceUrl, baseUrl);
    return full.hostname === base.hostname;
};

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

            // Selecciona todos los elementos relevantes
            const resourceElements = [
                ...$('img').toArray(),
                ...$('link[href]').toArray(),
                ...$('script[src]').toArray(),
            ];

            const downloadPromises = resourceElements.map(async (el) => {
                const tag = el.name;
                const attr = tag === 'link' ? 'href' : 'src';
                const value = $(el).attr(attr);
                if (!value) return;

                // Solo recursos locales
                if (!isLocalResource(value, url)) return;

                const resourceUrl = new URL(value, url).href;
                const { hostname, pathname } = new URL(resourceUrl);
                const ext = path.extname(pathname) || '.html';
                const base = pathname.slice(0, -ext.length);
                const resourceFilename = `${hostname}${base}`.replace(/[^a-zA-Z0-9]/g, '-');
                const fullResourceName = `${resourceFilename}${ext}`;
                const resourcePath = path.join(resourcesDir, fullResourceName);

                // Descargar (binario o texto según tipo)
                const responseType = ext.match(/\.(png|jpg|jpeg|gif)$/i) ? 'arraybuffer' : 'utf-8';
                const res = await axios.get(resourceUrl, { responseType });
                await fs.writeFile(resourcePath, res.data);

                // Reemplazar en el HTML
                const newPath = `${resourcesDirName}/${fullResourceName}`;
                $(el).attr(attr, newPath);
            });

            await Promise.all(downloadPromises);

            await fs.writeFile(htmlPath, $.html());
            return htmlPath;
        });
};

export default pageLoader;
