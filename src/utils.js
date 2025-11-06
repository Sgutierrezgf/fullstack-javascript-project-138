// src/utils.js
import { URL } from 'url';

export const makeFileNameFromUrl = (rawUrl, ext = '.html') => {
    const url = new URL(rawUrl);
    // hostname + pathname (si pathname = '/', convertimos a empty)
    const pathname = url.pathname === '/' ? '' : url.pathname;
    const full = `${url.hostname}${pathname}`;
    // reemplaza cualquier caracter que no sea letra o número por '-'
    const cleaned = full
        .replace(/^\/+|\/+$/g, '') // quitar slashes al inicio/fin
        .replace(/[^a-zA-Z0-9]/g, '-') // todo lo demás -> -
        .replace(/-+/g, '-'); // colapsar guiones duplicados
    return `${cleaned}${ext}`;
};

export const makeDirNameFromUrl = (rawUrl) => {
    const base = makeFileNameFromUrl(rawUrl, '');
    return `${base}_files`;
};
