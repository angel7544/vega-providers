const fs = require('fs');

const webApp = fs.readFileSync('web/app.js', 'utf8');
const desktopApp = fs.readFileSync('desktop-app/src/app.js', 'utf8');

// A simple regex to find function declarations
// function name(args) { ... }
// or async function name(args) { ... }
function getFunctions(content) {
    const lines = content.split('\n');
    const functions = [];
    let currentFunc = null;
    let braceCount = 0;
    let inside = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const match = line.match(/^(async\s+)?function\s+(\w+)\s*\(/);
        if (match) {
            if (currentFunc) {
                functions.push(currentFunc);
            }
            currentFunc = {
                name: match[2],
                start: i,
                lines: [line]
            };
            braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            inside = true;
            continue;
        }
        
        if (inside && currentFunc) {
            currentFunc.lines.push(line);
            braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            if (braceCount <= 0) {
                functions.push(currentFunc);
                currentFunc = null;
                inside = false;
            }
        }
    }
    if (currentFunc) functions.push(currentFunc);
    return functions;
}

const webFuncs = getFunctions(webApp);
const desktopFuncs = getFunctions(desktopApp);

console.log(`Web has ${webFuncs.length} functions.`);
console.log(`Desktop has ${desktopFuncs.length} functions.`);

const webFuncMap = new Map(webFuncs.map(f => [f.name, f]));
const desktopFuncMap = new Map(desktopFuncs.map(f => [f.name, f]));

console.log("\n--- Functions ONLY in Desktop ---");
for (const name of desktopFuncMap.keys()) {
    if (!webFuncMap.has(name)) {
        console.log(`- ${name} (Lines: ${desktopFuncMap.get(name).lines.length})`);
    }
}

console.log("\n--- Functions ONLY in Web ---");
for (const name of webFuncMap.keys()) {
    if (!desktopFuncMap.has(name)) {
        console.log(`- ${name} (Lines: ${webFuncMap.get(name).lines.length})`);
    }
}

console.log("\n--- Functions in both but different lengths/contents ---");
for (const name of webFuncMap.keys()) {
    if (desktopFuncMap.has(name)) {
        const w = webFuncMap.get(name).lines.join('\n');
        const d = desktopFuncMap.get(name).lines.join('\n');
        if (w !== d) {
            console.log(`- ${name} (Web: ${webFuncMap.get(name).lines.length} lines, Desktop: ${desktopFuncMap.get(name).lines.length} lines)`);
        }
    }
}
