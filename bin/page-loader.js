#!/usr/bin/env node
import { Command } from 'commander';
import pageLoader from '../src/index.js';

const program = new Command();

program
    .name('page-loader')
    .description('Page loader utility')
    .version('1.0.0')
    .argument('<url>', 'URL a descargar')
    .option('-o, --output [dir]', 'Directorio de salida', process.cwd())
    .action(async (url, options) => {
        try {
            const filePath = await pageLoader(url, options.output);
            console.log(`Página guardada en: ${filePath}`);
        } catch (err) {
            console.error(`❌ Error: ${err.message}`);
            process.exit(1); // Código 1 indica fallo
        }
    });

program.parse();
