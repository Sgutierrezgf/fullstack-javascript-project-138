import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';
import debug from 'debug';
import { Listr } from 'listr2';

const log = debug('page-loader');

/**
 * Genera nombre de archivo para la página principal.
 * Ej: https://site.com/blog/about  -> site-com-blog-about.html
 */
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

/**
 * Comprueba si el recurso pertenece al mismo host/base
 */
const isLocalResource = (resource, base) => {
  try {
    const resourceUrl = new URL(resource, base);
    const baseUrl = new URL(base);
    return resourceUrl.hostname === baseUrl.hostname;
  } catch {
    return false;
  }
};

/**
 * Descarga recurso y escribe en disk. Si falla, crea archivo vacío.
 */
const downloadResource = async (url, outputPath) => {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    if (response.status === 200) {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, response.data);
      log(`Guardado recurso: ${outputPath}`);
      return;
    }
    log(`Respuesta ${response.status} para ${url} — creando archivo vacío en ${outputPath}`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, '');
  } catch (err) {
    log(`Error descargando ${url}: ${err.message} — creando archivo vacío en ${outputPath}`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, '');
  }
};

/**
 * pageLoader principal
 */
const pageLoader = async (url, outputDir = process.cwd()) => {
  log(`Inicio descarga de: ${url}`);

  // 1) Verificar que el directorio de salida exista (test espera error si no existe)
  try {
    await fs.access(outputDir);
  } catch {
    throw new Error(`El directorio de salida no existe: ${outputDir}`);
  }

  // 2) Descargar HTML principal
  let response;
  try {
    response = await axios.get(url);
  } catch (err) {
    throw new Error(`Error al descargar la página ${url}: ${err.message}`);
  }

  const html = response.data;

  // 3) Construir nombres y paths
  const mainFileName = buildFileName(url, '.html'); // ej: site-com-blog-about.html
  const mainFilePath = path.resolve(outputDir, mainFileName);
  const resourcesDirName = mainFileName.replace('.html', '_files'); // ej: site-com-blog-about_files
  const resourcesDirPath = path.join(outputDir, resourcesDirName);

  // Crear carpeta de recursos (solo si outputDir existe)
  await fs.mkdir(resourcesDirPath, { recursive: true });

  // 4) Parsear HTML y recopilar recursos locales
  const $ = cheerio.load(html);
  const baseUrl = new URL(url);
  const resources = [];

  $('img[src], link[href], script[src]').each((_, el) => {
    // usar .get(0).tagName para compatibilidad
    const tag = $(el).get(0).tagName;
    const attr = tag === 'link' ? 'href' : 'src';
    const rawLink = $(el).attr(attr);
    if (!rawLink) return;

    // Solo recursos del mismo host (locales)
    if (!isLocalResource(rawLink, baseUrl.href)) return;

    // Resolver URL absoluta del recurso
    const resourceAbsoluteUrl = new URL(rawLink, baseUrl.href).href;

    // Construir nombre del recurso con el prefijo del archivo principal:
    // formato esperado: <pageBaseName>-<ruta-limpia><.ext>
    const pageBaseName = mainFileName.replace('.html', ''); // site-com-blog-about

    // extraer pathname sin query ni hash
    const resourcePathname = new URL(resourceAbsoluteUrl).pathname; // ej: /assets/styles.css

    // ext (incluye el punto) — si no hay ext, ext = ''
    const ext = path.extname(resourcePathname) || '';

    // limpiar la parte sin extensión: quitar leading slash, quitar la extensión
    // luego reemplazar "/" por "-" y "." por "-" y eliminar caracteres no permitidos
    const nameWithoutExt = resourcePathname
      .replace(/^\/+/, '')       // quitar /
      .replace(ext, '')         // quitar ext del final
      .replace(/\//g, '-')      // / -> -
      .replace(/\./g, '-')      // . -> -
      .replace(/[^a-zA-Z0-9-]/g, ''); // quitar otros caracteres

    const resourceFileName = `${pageBaseName}-${nameWithoutExt}${ext}`; // ej: site-com-blog-about-assets-styles.css

    const resourceOutputPath = path.join(resourcesDirPath, resourceFileName);
    const localPath = path.posix.join(resourcesDirName, resourceFileName);

    // Push a lista y actualizar el atributo en HTML
    resources.push({ url: resourceAbsoluteUrl, outputPath: resourceOutputPath });
    $(el).attr(attr, localPath);
  });

  log(`Se encontraron ${resources.length} recursos locales`);

  // 5) Descargar recursos (concurrency), si falla se crea archivo vacío
  const tasks = new Listr(
    resources.map((r) => ({
      title: `Descargando ${r.url}`,
      task: async () => {
        await downloadResource(r.url, r.outputPath);
      },
    })),
    { concurrent: true, exitOnError: false },
  );

  await tasks.run();

  // 6) Guardar HTML modificado
  await fs.writeFile(mainFilePath, $.html());
  log(`Archivo principal guardado en ${mainFilePath}`);

  return mainFilePath;
};

export default pageLoader;
