import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { Listr } from 'listr2';
import debug from 'debug';

const log = debug('page-loader:resources');

const downloadResource = async (resourceUrl, filePath) => {
    const response = await axios.get(resourceUrl, { responseType: 'arraybuffer' });
    await fs.writeFile(filePath, response.data);
    return filePath;
};

const downloadResources = async (resources, outputDir) => {
    const tasks = new Listr(
        resources.map((res) => ({
            title: `Descargando ${res.url}`,
            task: async () => {
                const filePath = path.join(outputDir, res.fileName);
                log(`Iniciando descarga de ${res.url}`);
                await downloadResource(res.url, filePath);
                log(`Completada: ${res.url}`);
            },
        })),
        {
            concurrent: true, // descargas en paralelo
            exitOnError: false, // continúa aunque falle una
        },
    );

    await tasks.run();
};

export default downloadResources;
