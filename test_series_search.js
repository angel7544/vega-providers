const fs = require('fs');

async function testSearch() {
    const providersDir = './dist';
    if (!fs.existsSync(providersDir)) {
        console.log('No dist directory, skipping test');
        return;
    }
    
    const providers = fs.readdirSync(providersDir).filter(f => fs.statSync(`./dist/${f}`).isDirectory());
    const results = {};
    
    const context = {
        axios: require('axios'),
        cheerio: require('cheerio'),
        getBaseUrl: require('./dist/getBaseUrl.js').getBaseUrl,
        commonHeaders: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        }
    };
    
    for (const provider of providers) {
        if (['extractors', 'moviesApi'].includes(provider)) continue;
        try {
            const postsModule = require(`./dist/${provider}/posts.js`);
            if (postsModule.getSearchPosts) {
                console.log(`Testing ${provider}...`);
                const posts = await postsModule.getSearchPosts({
                    searchQuery: 'breaking bad',
                    page: 1,
                    providerValue: provider,
                    providerContext: context
                });
                
                results[provider] = posts.length > 0 ? 'Works' : '0 results';
            }
        } catch (e) {
            results[provider] = 'Error: ' + e.message;
        }
    }
    
    console.log(JSON.stringify(results, null, 2));
}

testSearch();
