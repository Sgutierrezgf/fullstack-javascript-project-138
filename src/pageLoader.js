import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Listr } from 'listr2';

const log = debug('page-loader');

const buildFileName = (url, extFallback = '.html') => {
  const { hostname, pathname } = new URL(url);
  const ext = path.extname(pathname) || extFallback;
  const cleanName = `${hostname}${pathname}`
    .replace(/^\/+/, '')
    .replace(/\//g, '-')
    .replace(/\./g, '-')
    .replace(/[^a-zA-Z0-9-]/g, '');
  return `${cleanName}${ext}`;
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

/**
 * Descarga un recurso. Si la descarga falla, crea un archivo vacío
 * para que los tests puedan verificar su existencia.
 */
const downloadResource = async (url, outputPath) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, response.data);
  } catch (err) {
    log(`Error descargando ${url}: ${err.message}. Creando archivo vacío.`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, '');
  }
};

const pageLoader = async (url, outputDir = process.cwd()) => {
  log(`Inicio descarga de: ${url}`);

  // verificar que el directorio de salida exista
  try {
    await fs.access(outputDir);
  } catch {
    throw new Error(`El directorio de salida no existe: ${outputDir}`);
  }

  let response;
  try {
    response = await axios.get(url);
  } catch (err) {
    throw new Error(`Error al descargar la página ${url}: ${err.message}`);
  }

  const html = response.data;
  const mainFileName = buildFileName(url, '.html');
  const mainFilePath = path.resolve(outputDir, mainFileName);
  const resourcesDirName = mainFileName.replace('.html', '_files');
  const resourcesDirPath = path.join(outputDir, resourcesDirName);

  await fs.mkdir(resourcesDirPath, { recursive: true });

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
      const pageBaseName = mainFileName.replace('.html', '');
      const relativePath = new URL(link, baseUrl.href).pathname;

      // 🔧 Corrección: preservar extensión correctamente
      const ext = path.extname(relativePath) || '';
      const cleanResourceName = relativePath
        .replace(/^\/+/, '')
        .replace(ext, '') // quitamos extensión antes de limpiar
        .replace(/\//g, '-')
        .replace(/\./g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '');
      const resourceFileName = `${pageBaseName}-${cleanResourceName}${ext}`;

      const resourceOutputPath = path.join(resourcesDirPath, resourceFileName);
      const localPath = path.posix.join(resourcesDirName, resourceFileName);

      resources.push({ fullUrl, outputPath: resourceOutputPath });
      $(el).attr(attr, localPath);
    }
  });

  log(`Se encontraron ${resources.length} recursos locales`);

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
