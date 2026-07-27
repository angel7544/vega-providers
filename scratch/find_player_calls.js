const fs = require('fs');
const webApp = fs.readFileSync('web/app.js', 'utf8');

const calls = ['initPlayer', 'closePlayer', 'playStream', 'resolveDownload', 'showSourceSelectionModal'];
calls.forEach(c => {
    const lines = webApp.split('\n');
    console.log(`--- Calls to ${c} ---`);
    lines.forEach((line, idx) => {
        if (line.includes(c) && !line.includes(`function ${c}`)) {
            console.log(`Line ${idx + 1}: ${line.trim()}`);
        }
    });
});
