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

const isLocalResource = (resource, base) => {
  try {
    const resourceUrl = new URL(resource, base);
    const baseUrl = new URL(base);
    return resourceUrl.hostname === baseUrl.hostname;
  } catch {
    return false;
  }
};

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

const pageLoader = async (url, outputDir = process.cwd()) => {
  log(`Inicio descarga de: ${url}`);

  // 1) Verificar que outputDir exista (test espera rejection si no existe)
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
  const mainFileName = buildFileName(url, '.html'); // site-com-blog-about.html
  const mainFilePath = path.resolve(outputDir, mainFileName);
  const resourcesDirName = mainFileName.replace('.html', '_files'); // site-com-blog-about_files
  const resourcesDirPath = path.join(outputDir, resourcesDirName);

  // 3) Crear carpeta de recursos (outputDir ya existe)
  await fs.mkdir(resourcesDirPath, { recursive: true });

  const $ = cheerio.load(html);
  const baseUrl = new URL(url);
  const pagePathname = baseUrl.pathname.replace(/\/$/, ''); // e.g. '/blog/about' (sin slash final)
  const resources = [];

  $('img[src], link[href], script[src]').each((_, el) => {
    const tag = $(el).get(0).tagName;
    const attr = tag === 'link' ? 'href' : 'src';
    const rawLink = $(el).attr(attr);
    if (!rawLink) return;

    if (!isLocalResource(rawLink, baseUrl.href)) return;

    const resourceAbsoluteUrl = new URL(rawLink, baseUrl.href).href;
    const resourcePathnameFull = new URL(resourceAbsoluteUrl).pathname; // e.g. '/blog/about/assets/styles.css' or '/assets/styles.css'

    // Si resourcePathnameFull incluye el pagePathname como prefijo, lo removemos
    let resourcePathname = resourcePathnameFull;
    if (pagePathname && pagePathname !== '/' && resourcePathnameFull.startsWith(`${pagePathname}/`)) {
      resourcePathname = resourcePathnameFull.slice(pagePathname.length); // '/assets/styles.css'
      // Asegurar que empiece por '/'
      if (!resourcePathname.startsWith('/')) {
        resourcePathname = `/${resourcePathname}`;
      }
    }

    // Construir nombre: <pageBaseName>-<ruta-limpia><.ext>
    const pageBaseName = mainFileName.replace('.html', ''); // site-com-blog-about
    const ext = path.extname(resourcePathname) || '';
    const nameWithoutExt = resourcePathname
      .replace(/^\/+/, '')     // quitar slash inicial
      .replace(ext, '')        // quitar extensión
      .replace(/\//g, '-')     // / -> -
      .replace(/\./g, '-')     // . -> -
      .replace(/[^a-zA-Z0-9-]/g, ''); // quitar caracteres no permitidos

    const resourceFileName = `${pageBaseName}-${nameWithoutExt}${ext}`; // ej: site-com-blog-about-assets-styles.css
    const resourceOutputPath = path.join(resourcesDirPath, resourceFileName);
    const localPath = path.posix.join(resourcesDirName, resourceFileName);

    resources.push({ url: resourceAbsoluteUrl, outputPath: resourceOutputPath });
    $(el).attr(attr, localPath);
  });

  log(`Se encontraron ${resources.length} recursos locales`);

  // 4) Descargar recursos concurrentemente
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

  // 5) Guardar HTML modificado
  await fs.writeFile(mainFilePath, $.html());
  log(`Archivo principal guardado en ${mainFilePath}`);

  return mainFilePath;
};

export default pageLoader;
