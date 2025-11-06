import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

const downloadResource = (url, filePath) =>
    axios
        .get(url, { responseType: 'arraybuffer' })
        .then((response) => fs.writeFile(filePath, response.data));

export default async (resources, dirPath) => {
    const promises = resources.map(({ url, name }) => {
        const filePath = path.join(dirPath, name);
        return downloadResource(url, filePath);
    });
    return Promise.all(promises);
};
