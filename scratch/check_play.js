const fs = require('fs');
const webApp = fs.readFileSync('web/app.js', 'utf8');

const lines = webApp.split('\n');
const func = [];
let capture = false;
let braceCount = 0;

for (let line of lines) {
    if (line.includes('function init(') || line.includes('function init()')) {
        capture = true;
    }
    if (capture) {
        func.push(line);
        braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
        if (braceCount <= 0 && func.length > 1) {
            capture = false;
        }
    }
}

console.log("--- init in Web ---");
console.log(func.join('\n'));
