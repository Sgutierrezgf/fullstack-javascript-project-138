#!/usr/bin/env node

import { Command } from 'commander';
import pageLoader from '../src/index.js';

const program = new Command();

program
    .name('page-loader')
    .description('Descarga una página web y sus recursos')
    .version('1.0.0')
    .option('-o, --output [dir]', 'directorio de salida', process.cwd())
    .argument('<url>')
    .action(async (url, options) => {
        try {
            const filePath = await pageLoader(url, options.output);
            console.log(`\n✅ Página descargada con éxito: ${filePath}`);
            process.exit(0);
        } catch (error) {
            console.error(`\n❌ Error: ${error.message}`);
            process.exit(1);
        }
    });

program.parse(process.argv);
