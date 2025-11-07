import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Listr } from 'listr2';

const log = debug('page-loader');

// ✅ Asegura que todos los archivos tengan una extensión válida (.html por defecto)
const buildResourceFileName = (url) => {
  const { hostname, pathname } = new URL(url);
  const ext = path.extname(pathname) || '.html';
  const name = `${hostname}${pathname}`
    .replace(/^\/+/, '')
    .replace(/\//g, '-')
    .replace(/\./g, '-')
    .replace(/[^a-zA-Z0-9-]/g, ''); // limpiar caracteres raros
  return `${name}${ext}`;
};

// Verifica si un recurso pertenece al mismo dominio
const isLocalResource = (url, base) => {
  try {
    const resourceUrl = new URL(url, base);
    const baseUrl = new URL(base);
    return resourceUrl.hostname === baseUrl.hostname;
  } catch {
    return false;
  }
};

// Descarga un recurso y lo guarda en disco
const downloadResource = async (url, outputPath) => {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  if (response.status !== 200) {
    throw new Error(`Error HTTP ${response.status}`);
  }
  // ✅ Crear subdirectorios si no existen
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, response.data);
};

// Función principal
const pageLoader = async (url, outputDir = process.cwd()) => {
  log(`Inicio descarga de: ${url}`);

  // Descargar HTML principal
  let response;
  try {
    response = await axios.get(url);
  } catch (err) {
    throw new Error(`Error al descargar la página ${url}: ${err.message}`);
  }

  const html = response.data;

  // Construcción de nombres
  const mainFileName = buildResourceFileName(url);
  const mainFilePath = path.resolve(outputDir, mainFileName);
  const resourcesDirName = mainFileName.replace('.html', '_files');
  const resourcesDirPath = path.join(outputDir, resourcesDirName);

  // Comprobar que el directorio de salida existe
  try {
    const stats = await fs.stat(outputDir);
    if (!stats.isDirectory()) {
      throw new Error(`El destino ${outputDir} no es un directorio.`);
    }
  } catch (err) {
    throw new Error(
      `El directorio de salida "${outputDir}" no existe o no es accesible: ${err.message}`,
    );
  }

  // Crear el directorio para los recursos
  try {
    await fs.mkdir(resourcesDirPath, { recursive: true });
  } catch (err) {
    throw new Error(
      `No se pudo crear el directorio de recursos ${resourcesDirPath}: ${err.message}`,
    );
  }

  // Parsear HTML con cheerio
  const $ = cheerio.load(html);
  const baseUrl = new URL(url);
  const resources = [];

  // Buscar imágenes, CSS y JS locales
  $('img[src], link[href], script[src]').each((_, el) => {
    const tag = $(el).get(0).tagName;
    const attr = tag === 'link' ? 'href' : 'src';
    const link = $(el).attr(attr);
    if (!link) return;

    if (isLocalResource(link, baseUrl.href)) {
      const fullUrl = new URL(link, baseUrl.href).href;

      // Obtener la ruta relativa limpia (sin el dominio)
      const resourcePathname = new URL(fullUrl).pathname.replace(/^\/+/, '');
      const resourceOutputPath = path.join(resourcesDirPath, resourcePathname);
      const localPath = path.posix.join(resourcesDirName, resourcePathname);

      resources.push({ fullUrl, outputPath: resourceOutputPath });

      // Actualizar el atributo dentro del HTML
      $(el).attr(attr, localPath);
    }
  });

  log(`Se encontraron ${resources.length} recursos locales`);

  // Descarga concurrente de recursos
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

  // Guardar HTML principal actualizado
  await fs.writeFile(mainFilePath, $.html());
  log(`Archivo principal guardado en ${mainFilePath}`);

  return mainFilePath;
};

export default pageLoader;
