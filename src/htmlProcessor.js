import * as cheerio from 'cheerio';
import { buildResourceName } from './utils.js';

export default (html, baseUrl, dirName) => {
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

            resources.push({ url: new URL(oldLink, baseUrl).href, name: localName });
            $(el).attr(attr, `${dirName}/${localName}`);
        });
    });

    return { html: $.html(), resources };
};
