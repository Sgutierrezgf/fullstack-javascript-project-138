import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';


const makeFileName = (url) => {
    const { hostname, pathname } = new URL(url);
    const fullPath = `${hostname}${pathname}`.replace(/[^a-zA-Z0-9]/g, '-');
    const normalized = fullPath.replace(/^-+|-+$/g, '');
    return `${normalized}.html`;
};


export default function pageLoader(url, outputDir = process.cwd()) {
    const fileName = makeFileName(url);
    const filePath = path.join(outputDir, fileName);


    return axios.get(url)
        .then((response) => fs.writeFile(filePath, response.data))
        .then(() => filePath);
}