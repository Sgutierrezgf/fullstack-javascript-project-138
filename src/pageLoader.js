import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Listr } from 'listr2';

const log = debug('page-loader');

// 🔹 Genera nombres válidos y planos para todos los recursos
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

// 🔹 Verifica si un recurso pertenece al mismo dominio
const isLocalResource = (url, base) => {
  try {
    const resourceUrl = new URL(url, base);
    const baseUrl = new URL(base);
    return resourceUrl.hostname === baseUrl.hostname;
  } catch {
    return false;
  }
};

// 🔹 Descarga un recurso y lo guarda
const downloadResource = async (url, outputPath) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  if (response.status !== 200) {
    throw new Error(`Error HTTP ${response.status}`);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, response.data);
};

// 🔹 Función principal
const pageLoader = async (url, outputDir = process.cwd()) => {
  log(`Inicio descarga de: ${url}`);

  // ✅ Verificar que el directorio de salida existe realmente
  let stats;
  try {
    stats = await fs.stat(outputDir);
  } catch {
    throw new Error(`El directorio de salida "${outputDir}" no existe`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`El destino "${outputDir}" no es un directorio válido`);
  }

  // 🔹 Descargar HTML principal
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

  // 🔹 Crear directorio de recursos (solo si el de salida existe)
  await fs.mkdir(resourcesDirPath, { recursive: true });

  const $ = cheerio.load(html);
  const baseUrl = new URL(url);
  const resources = [];

  // 🔹 Buscar recursos locales (imágenes, CSS, JS)
  $('img[src], link[href], script[src]').each((_, el) => {
    const tag = el.tagName;
    const attr = tag === 'link' ? 'href' : 'src';
    const link = $(el).attr(attr);
    if (!link) return;

    if (isLocalResource(link, baseUrl.href)) {
      const fullUrl = new URL(link, baseUrl.href).href;
      const resourceFileName = buildFileName(fullUrl, path.extname(link) || '.bin');
      const resourceOutputPath = path.join(resourcesDirPath, resourceFileName);
      const localPath = path.posix.join(resourcesDirName, resourceFileName);

      resources.push({ fullUrl, outputPath: resourceOutputPath });
      $(el).attr(attr, localPath);
    }
  });

  log(`Se encontraron ${resources.length} recursos locales`);

  // 🔹 Descarga concurrente de recursos
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

  // 🔹 Guardar el HTML modificado
  await fs.writeFile(mainFilePath, $.html());
  log(`Archivo principal guardado en ${mainFilePath}`);

  return mainFilePath;
};

export default pageLoader;
