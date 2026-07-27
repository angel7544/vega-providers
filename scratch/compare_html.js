const fs = require('fs');

const webHtml = fs.readFileSync('web/index.html', 'utf8');
const desktopHtml = fs.readFileSync('desktop-app/index.html', 'utf8');

console.log("webHtml index has 'infoModal':", webHtml.includes('infoModal'));
console.log("desktopHtml index has 'infoModal':", desktopHtml.includes('infoModal'));

console.log("webHtml index has 'pageDownloads':", webHtml.includes('pageDownloads'));
console.log("desktopHtml index has 'pageDownloads':", desktopHtml.includes('pageDownloads'));
