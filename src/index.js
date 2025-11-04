#!/usr/bin/env node

import pageLoader from '../lib/pageLoader.js';
import process from 'process';
import createDebug from 'debug';

const debug = createDebug('page-loader');

const [, , pageUrl, outputDir] = process.argv;

if (!pageUrl) {
    console.error('Uso: page-loader <URL> [outputDir]');
    process.exit(1);
}

(async () => {
    try {
        const result = await pageLoader(pageUrl, outputDir);
        console.log(`Archivo guardado en: ${result}`);
    } catch (err) {
        console.error(`Error: ${err.message}`);
        debug('Error in CLI:', err);
        process.exit(1);
    }
})();
