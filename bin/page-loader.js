#!/usr/bin/env node
import { Command } from 'commander';
import pageLoader from '../src/index.js';

const program = new Command();

program
    .name('page-loader')
    .description('Page loader utility')
    .version('1.0.0')
    .option('-o, --output [dir]', 'output dir', process.cwd())
    .arguments('<url>')
    .action((url, options) => {
        pageLoader(url, options.output)
            .then((filepath) => console.log(filepath))
            .catch((err) => {
                console.error(`Error: ${err.message}`);
                process.exit(1);
            });
    });

program.parse();
