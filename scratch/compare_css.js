const fs = require('fs');

const webCss = fs.readFileSync('web/style.css', 'utf8');
const desktopCss = fs.readFileSync('desktop-app/src/style.css', 'utf8');

console.log("Web CSS length:", webCss.length);
console.log("Desktop CSS length:", desktopCss.length);

// Let's find if there are any desktop-specific keywords or rules
const keywords = ['tauri', 'titlebar', 'drag', 'win-', 'os-', 'platform'];
keywords.forEach(kw => {
    const regex = new RegExp(`.*${kw}.*`, 'gi');
    const matches = desktopCss.match(regex) || [];
    console.log(`Desktop matches for '${kw}':`, matches.length);
    matches.slice(0, 5).forEach(m => console.log("  ->", m.trim()));
});
