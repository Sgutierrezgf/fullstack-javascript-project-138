#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import pageLoader from '../lib/pageLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

program
    .version('1.0.0')
    .option('-o, --output [dir]', 'output dir', process.cwd())
    .arguments('<url>')
    .action((url, options) => {
        pageLoader(url, options.output)
            .then(filePath => console.log(filePath))
            .catch(err => console.error(err.message));
    });

program.parse(process.argv);
