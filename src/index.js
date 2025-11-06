import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { makeFileNameFromUrl, makeDirNameFromUrl } from './utils.js';
import processHtml from './htmlProcessor.js';
import downloadResources from './resources.js';

const pageLoader = (url, outputDir = process.cwd()) => {
    const fileName = makeFileNameFromUrl(url);
    const dirName = makeDirNameFromUrl(url);
    const filePath = path.join(outputDir, fileName);
    const resourcesDirPath = path.join(outputDir, dirName);

    return axios
        .get(url)
        .then(({ data }) => {
            const { html, resources } = processHtml(data, url, dirName);
            return fs
                .mkdir(resourcesDirPath, { recursive: true })
                .then(() => downloadResources(resources, resourcesDirPath))
                .then(() => fs.writeFile(filePath, html))
                .then(() => filePath);
        });
};

export default pageLoader;
