import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Listr } from 'listr2';

const log = debug('page-loader');

const buildResourceFileName = (url) => {
    const { pathname } = new URL(url);
    return pathname
        .replace(/^\/+/, '')      // quitar la barra inicial
        .replace(/\//g, '-')      // reemplazar subdirectorios por -
        .replace(/\./g, '-')      // reemplazar puntos por -
        .replace(/[^a-zA-Z0-9-]/g, '') // limpiar caracteres extraños
        + path.extname(pathname); // conservar extensión
};

const isLocalResource = (url, base) => {
    try {
        const resourceUrl = new URL(url, base);
        const baseUrl = new URL(base);
        return resourceUrl.hostname === baseUrl.hostname;
    } catch {
        return false;
    }
};

const downloadResource = async (url, outputPath) => {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    if (response.status !== 200) {
        throw new Error(`Error HTTP ${response.status}`);
    }
    await fs.writeFile(outputPath, response.data);
};

const pageLoader = async (url, outputDir = process.cwd()) => {
    log(`Inicio descarga de: ${url}`);

    // Descarga HTML principal
    let response;
    try {
        response = await axios.get(url);
    } catch (err) {
        throw new Error(`Error al descargar la página ${url}: ${err.message}`);
    }

    const html = response.data;
    const mainFileName = buildFileName(url);
    const mainFilePath = path.resolve(outputDir, mainFileName);
    const resourcesDirName = mainFileName.replace('.html', '_files');
    const resourcesDirPath = path.join(outputDir, resourcesDirName);

    // Comprobar que outputDir existe y es un directorio accesible
    try {
        const stats = await fs.stat(outputDir);
        if (!stats.isDirectory()) {
            throw new Error(`El destino ${outputDir} no es un directorio.`);
        }
    } catch (err) {
        // Lanzar error si no existe o no es accesible (esto hace que los tests que esperan un reject pasen)
        throw new Error(`El directorio de salida "${outputDir}" no existe o no es accesible: ${err.message}`);
    }

    // Ahora sí podemos crear el directorio de recursos dentro del outputDir
    try {
        await fs.mkdir(resourcesDirPath, { recursive: true });
    } catch (err) {
        throw new Error(`No se pudo crear el directorio de recursos ${resourcesDirPath}: ${err.message}`);
    }
    const $ = cheerio.load(html);
    const baseUrl = new URL(url);
    const resources = [];

    $('img[src], link[href], script[src]').each((_, el) => {
        const tag = $(el).get(0).tagName;
        const attr = tag === 'link' ? 'href' : 'src';
        const link = $(el).attr(attr);
        if (!link) return;

        if (isLocalResource(link, baseUrl.href)) {
            const fullUrl = new URL(link, baseUrl.href).href;
            const ext = path.extname(link) || '.html';
            const resourceFileName = buildResourceFileName(fullUrl);

            const localPath = path.posix.join(resourcesDirName, resourceFileName);
            const outputPath = path.join(resourcesDirPath, resourceFileName);

            resources.push({ fullUrl, outputPath });
            $(el).attr(attr, localPath);
        }
    });

    log(`Se encontraron ${resources.length} recursos locales`);

    // 👇 Aquí añadimos Listr para mostrar progreso concurrente
    const tasks = new Listr(
        resources.map(({ fullUrl, outputPath }) => ({
            title: `Descargando ${fullUrl}`,
            task: async () => {
                await downloadResource(fullUrl, outputPath);
            },
        })),
        { concurrent: true, exitOnError: false },
    );

    await tasks.run();

    await fs.writeFile(mainFilePath, $.html());
    log(`Archivo principal guardado en ${mainFilePath}`);

    return mainFilePath;
};

export default pageLoader;
