const fs = require('fs');

const webApp = fs.readFileSync('web/app.js', 'utf8');
const indexHtml = fs.readFileSync('desktop-app/index.html', 'utf8');

// Find occurrences of switchPage
const lines = webApp.split('\n');
console.log("--- switchPage in web/app.js ---");
lines.forEach((line, idx) => {
    if (line.includes('function switchPage')) {
        console.log(`Line ${idx+1}: ${line.trim()}`);
    }
});

// Find occurrences of app.js in indexHtml
console.log("\n--- app.js references in desktop-app/index.html ---");
const htmlLines = indexHtml.split('\n');
htmlLines.forEach((line, idx) => {
    if (line.includes('app.js')) {
        console.log(`Line ${idx+1}: ${line.trim()}`);
    }
});
