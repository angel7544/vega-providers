const fs = require('fs');
const webApp = fs.readFileSync('web/app.js', 'utf8');

const lines = webApp.split('\n');
lines.forEach((line, idx) => {
    if (line.includes('localStorage')) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
});
