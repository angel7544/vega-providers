const fs = require('fs');
const webHtml = fs.readFileSync('web/index.html', 'utf8');

const regex = /<div id="infoModal"[\s\S]+?<\/div>[\s\S]+?<\/div>[\s\S]+?<\/div>/;
const match = webHtml.match(regex);
if (match) {
    console.log(match[0].slice(0, 1000));
} else {
    // Try wider match
    const idx = webHtml.indexOf('id="infoModal"');
    if (idx !== -1) {
        console.log(webHtml.slice(idx - 50, idx + 1500));
    }
}
