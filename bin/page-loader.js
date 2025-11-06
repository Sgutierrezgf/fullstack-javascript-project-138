#!/usr/bin/env node
import { Command } from 'commander';
import process from 'process';
import pageLoader from '../src/pageLoader.js';

const program = new Command();

program
  .name('page-loader')
  .description('Page loader utility')
  .version('1.0.0')
  .argument('<url>', 'URL to download')
  .option('-o, --output [dir]', 'output dir', process.cwd())
  .action((url, options) => {
    pageLoader(url, options.output)
      .then((filePath) => {
        console.log(`Página descargada en: ${filePath}`);
      })
      .catch((err) => {
        console.error(`Error: ${err.message}`);
        process.exit(1);
      });
  });

program.parse();
