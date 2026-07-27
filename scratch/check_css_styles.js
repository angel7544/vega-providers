const fs = require('fs');

const webCss = fs.readFileSync('web/style.css', 'utf8');
const desktopCss = fs.readFileSync('desktop-app/src/style.css', 'utf8');

// Find all CSS rules in desktopCss that mention downloads, vlc, serverDown, notice-toast, etc.
const selectors = [
    'downloads', 'downloadsList', 'vlcNotFound', 'serverDown', 'dl-', 'notice-toast', 
    'statusIndicator', 'statusDot', 'statusText', 'apiUrlInput', 'dlDirInput'
];

selectors.forEach(sel => {
    const inWeb = webCss.toLowerCase().includes(sel.toLowerCase());
    const inDesktop = desktopCss.toLowerCase().includes(sel.toLowerCase());
    console.log(`Selector keyword '${sel}': inWeb = ${inWeb}, inDesktop = ${inDesktop}`);
});
