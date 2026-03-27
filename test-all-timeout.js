const ProviderTester = require('./test-providers.js');
const fs = require('fs');

async function main() {
    const tester = new ProviderTester({ postsToTest: 1, linksToTest: 1 });
    const providers = tester.getAvailableProviders();
    console.log(`Found ${providers.length} providers`);

    const results = {};
    for (const provider of providers) {
        console.log(`\nTesting ${provider}...`);
        
        try {
            const result = await Promise.race([
                tester.testProvider(provider),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_15S')), 15000))
            ]);
            results[provider] = result;
        } catch (err) {
            console.log(`Error on ${provider}: ${err.message}`);
            results[provider] = { error: err.message, summary: { failed: 1, passed: 0, skipped: 0 } };
        }
    }
    
    fs.writeFileSync('broken-providers.json', JSON.stringify(results, null, 2));
    console.log('\nWrote broken-providers.json');
    process.exit(0);
}

main().catch(console.error);
