#!/usr/bin/env node
import { Command } from 'commander';
import pageLoader from '../src/index.js';


const program = new Command();


program
    .name('page-loader')
    .description('Page loader utility')
    .version('1.0.0')
    .argument('<url>', 'URL to download')
    .option('-o, --output [dir]', 'output dir', process.cwd())
    .action((url, options) => {
        pageLoader(url, options.output)
            .then((filePath) => console.log(filePath))
            .catch((err) => {
                console.error(`Error: ${err.message}`);
                process.exit(1);
            });
    });


program.parse();