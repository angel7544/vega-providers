const http = require('http');

const targetPort = 3001; // The hardcoded dev-server.js port
const proxyPort = parseInt(process.env.PORT) || 3000; // The custom port passed by desktop-app

console.log(`Starting proxy server on port ${proxyPort} -> forwarding to ${targetPort}`);

const server = http.createServer((req, res) => {
    // Add CORS headers so mobile app works through proxy
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const options = {
        hostname: '127.0.0.1',
        port: targetPort,
        path: req.url,
        method: req.method,
        headers: req.headers
    };

    // Override host header so the backend processes it correctly
    options.headers['host'] = `127.0.0.1:${targetPort}`;

    const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
            res.writeHead(502);
            res.end(`Bad Gateway: ${err.message}`);
        }
    });

    req.pipe(proxyReq, { end: true });
});

server.listen(proxyPort, '0.0.0.0', () => {
    console.log(`Proxy listening on 0.0.0.0:${proxyPort}`);
});
