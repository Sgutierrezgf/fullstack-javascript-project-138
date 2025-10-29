export const makeFileName = (url) => {
    const withoutProtocol = url.replace(/^https?:\/\//, '');
    const safeName = withoutProtocol.replace(/[^a-zA-Z0-9]/g, '-');
    return `${safeName}.html`;
};