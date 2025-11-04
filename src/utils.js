#!/usr/bin/env node

import { program } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import pageLoader from '../src/index.js';

program
    .name('page-loader')
    .description('Page loader utility')
    .version('1.0.0')
    .option('-o, --output [dir]', 'output dir', process.cwd())
    .argument('<url>')
    .action((url, options) => {
        const outputDir = options.output;
        pageLoader(url, outputDir)
            .then((filePath) => console.log(filePath))
            .catch((err) => {
                console.error(err.message);
                process.exit(1);
            });
    });

program.parse();
