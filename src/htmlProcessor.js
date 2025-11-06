import * as cheerio from 'cheerio';
import debug from 'debug';
import { buildResourceName } from './utils.js';

const log = debug('page-loader:html');

export default (html, baseUrl, dirName) => {
    log(`Procesando HTML para: ${baseUrl}`);
    const $ = cheerio.load(html);
    const resources = [];

    const tags = [
        { tag: 'img', attr: 'src' },
        { tag: 'link', attr: 'href' },
        { tag: 'script', attr: 'src' },
    ];

    tags.forEach(({ tag, attr }) => {
        $(tag).each((_, el) => {
            const oldLink = $(el).attr(attr);
            if (!oldLink) return;

            const localName = buildResourceName(baseUrl, oldLink);
            if (!localName) return;

            const absUrl = new URL(oldLink, baseUrl).href;
            log(`Reemplazando ${tag} → ${absUrl} con ${dirName}/${localName}`);

            resources.push({ url: absUrl, name: localName });
            $(el).attr(attr, `${dirName}/${localName}`);
        });
    });

    log(`Procesamiento de HTML completo. Recursos locales: ${resources.length}`);
    return { html: $.html(), resources };
};
