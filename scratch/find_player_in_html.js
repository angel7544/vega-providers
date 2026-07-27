const fs = require('fs');
const webHtml = fs.readFileSync('web/index.html', 'utf8');

const idx = webHtml.indexOf('id="pagePlayer"');
if (idx !== -1) {
    console.log(webHtml.slice(idx - 100, idx + 1000));
} else {
    console.log("pagePlayer not found");
}
