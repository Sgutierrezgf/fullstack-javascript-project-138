#!/usr/bin/env node
import { Command } from 'commander';
import pageLoader from '../src/index.js';

const program = new Command();

program
    .version('1.0.0')
    .description('Descarga páginas web junto con sus recursos.')
    .argument('<url>', 'URL de la página a descargar')
    .option('-o, --output [dir]', 'Directorio de salida', process.cwd())
    .action(async (url, options) => {
        try {
            const filePath = await pageLoader(url, options.output);
            console.log(`\n✅ Página descargada correctamente en: ${filePath}\n`);
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            process.exit(1);
        }
    });

program.parse();
