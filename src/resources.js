// src/resources.js
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import debug from 'debug';

const log = debug('page-loader:resources');

const downloadOne = async (url, targetPath) => {
    log(`Downloading ${url}`);
    const resp = await axios.get(url, { responseType: 'arraybuffer' }).catch((err) => {
        if (err.response) {
            throw new Error(`Error HTTP ${err.response.status} al descargar recurso ${url}`);
        }
        throw new Error(`Error de red al descargar recurso ${url}: ${err.message}`);
    });
    if (resp.status !== 200) {
        throw new Error(`Error HTTP ${resp.status} al descargar recurso ${url}`);
    }
    await fs.writeFile(targetPath, resp.data);
    log(`Saved resource ${targetPath}`);
};

const downloadResources = async (resources, outputDir) => {
    // resources: [{ url, name }] (asegúrate de la forma que uses en processHtml)
    const promises = resources.map((r) => {
        const target = path.join(outputDir, r.name);
        return downloadOne(r.url, target);
    });
    // parallel downloads
    return Promise.all(promises);
};

export default downloadResources;
