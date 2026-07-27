const fs = require('fs');

const webHtml = fs.readFileSync('web/index.html', 'utf8');
const desktopHtml = fs.readFileSync('desktop-app/index.html', 'utf8');

function getIds(html) {
    const regex = /id=["']([^"']+)["']/g;
    const ids = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
        ids.push(match[1]);
    }
    return ids;
}

const webIds = getIds(webHtml);
const desktopIds = getIds(desktopHtml);

console.log("=== IDs ONLY in Desktop index.html ===");
desktopIds.forEach(id => {
    if (!webIds.includes(id)) {
        console.log(`- ${id}`);
    }
});

console.log("\n=== IDs ONLY in Web index.html ===");
webIds.forEach(id => {
    if (!desktopIds.includes(id)) {
        console.log(`- ${id}`);
    }
});
