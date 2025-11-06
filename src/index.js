// src/loader.js (ejemplo completo y robusto)
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import debug from 'debug';
import { makeFileNameFromUrl, makeDirNameFromUrl } from './utils.js';
import processHtml from './htmlProcessor.js';
import downloadResources from './resources.js';

const log = debug('page-loader');

const pageLoader = async (url, outputDir = process.cwd()) => {
    log(`Start downloading: ${url} -> ${outputDir}`);
    const fileName = makeFileNameFromUrl(url);
    const resourcesDirName = makeDirNameFromUrl(url);
    const filePath = path.join(outputDir, fileName);
    const resourcesDirPath = path.join(outputDir, resourcesDirName);

    // Verificar y crear directorio destino si es necesario
    try {
        await fs.access(outputDir);
    } catch (err) {
        // Si no existe, propagar error para que los tests lo capturen
        throw new Error(`El directorio de destino no existe: ${outputDir}`);
    }

    // Descargar HTML
    const response = await axios.get(url).catch((err) => {
        if (err.response) {
            throw new Error(`Error HTTP ${err.response.status} al descargar ${url}`);
        }
        throw new Error(`Error de red al descargar ${url}: ${err.message}`);
    });

    if (response.status !== 200) {
        throw new Error(`Error HTTP ${response.status} al descargar ${url}`);
    }

    const { html: processedHtml, resources } = processHtml(response.data, url, resourcesDirName);

    // Asegurar que el directorio de recursos exista antes de descargar
    await fs.mkdir(resourcesDirPath, { recursive: true });

    // Descargar recursos (downloadResources debe devolver una promesa)
    await downloadResources(resources, resourcesDirPath);

    // Finalmente escribir el archivo HTML (espera esto)
    await fs.writeFile(filePath, processedHtml, 'utf8');

    log(`Saved page: ${filePath}`);
    return filePath;
};

export default pageLoader;
