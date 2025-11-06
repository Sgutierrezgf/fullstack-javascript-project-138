import path from 'path';
import { URL } from 'url';

export const makeFileNameFromUrl = (url, ext = '.html') => {
    const { hostname, pathname } = new URL(url);
    const name = `${hostname}${pathname}`
        .replace(/(^\W+|\/$)/g, '')
        .replace(/[^a-zA-Z0-9]/g, '-');
    return `${name}${ext}`;
};

export const makeDirNameFromUrl = (url) => {
    const fileName = makeFileNameFromUrl(url, '');
    return `${fileName}_files`;
};

export const buildResourceName = (baseUrl, resourcePath) => {
    const { hostname } = new URL(baseUrl);
    const url = new URL(resourcePath, baseUrl);
    if (url.hostname !== hostname) return null;
    const name = `${url.hostname}${url.pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    const ext = path.extname(url.pathname) || '.html';
    return `${name}${ext}`;
};
