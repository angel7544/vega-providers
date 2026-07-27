const fs = require('fs');

const webApp = fs.readFileSync('web/app.js', 'utf8');
const lines = webApp.split('\n');

const funcNames = {};

lines.forEach((line, idx) => {
    const match = line.match(/^(async\s+)?function\s+(\w+)\s*\(/);
    if (match) {
        const name = match[2];
        if (!funcNames[name]) {
            funcNames[name] = [];
        }
        funcNames[name].push({ lineNum: idx + 1, content: line.trim() });
    }
});

console.log("--- Duplicate functions ---");
for (const name in funcNames) {
    if (funcNames[name].length > 1) {
        console.log(`Function '${name}' is declared ${funcNames[name].length} times:`);
        funcNames[name].forEach(f => {
            console.log(`  Line ${f.lineNum}: ${f.content}`);
        });
    }
}
