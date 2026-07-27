const fs = require('fs');
const webHtml = fs.readFileSync('web/index.html', 'utf8');

const idx = webHtml.indexOf('id="settingsModal"');
if (idx !== -1) {
    console.log(webHtml.slice(idx - 50, idx + 2500));
} else {
    console.log("settingsModal not found in web");
}
