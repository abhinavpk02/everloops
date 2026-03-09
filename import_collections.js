const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

const COLLECTIONS_DIR = path.join(__dirname, 'collections');
const MAPPING_FILE = path.join(COLLECTIONS_DIR, 'rebrand_mapping.csv');

async function importCollections() {
    console.log('--- Starting Collections Import ---');

    try {
        // 1. Read and parse mapping file
        const csvData = fs.readFileSync(MAPPING_FILE, 'utf8');
        const lines = csvData.split('\n').filter(line => line.trim() !== '');
        // Skip header
        const mapping = lines.slice(1).map(line => {
            // Very simple CSV parser handling quotes
            const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return {
                original: parts[0].replace(/^"|"$/g, ''),
                rebranded: parts[1].replace(/^"|"$/g, '')
            };
        });

        console.log(`Found ${mapping.length} items to import.`);

        // 2. Clear existing inventory and related data
        console.log('Clearing existing inventory and related data...');
        // Order matters due to foreign keys
        await client.execute('DELETE FROM invoice_items');
        await client.execute('DELETE FROM invoices');
        await client.execute('DELETE FROM inventory');

        // 3. Import new items
        let count = 0;
        for (const item of mapping) {
            const rebrandedName = item.rebranded;
            const collectionPath = path.join(COLLECTIONS_DIR, rebrandedName);

            let imagePath = '';
            if (fs.existsSync(collectionPath)) {
                const files = fs.readdirSync(collectionPath);
                // Find first non-thumb JPG/PNG
                const mainImage = files.find(f =>
                    (f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.png')) &&
                    !f.toLowerCase().includes('thumb')
                );

                if (mainImage) {
                    imagePath = `/collections/${rebrandedName}/${mainImage}`;
                }
            }

            const sku = `EVR-${rebrandedName.toUpperCase().replace(/\s+/g, '-')}-001`;
            const price = 0;
            const stock = 10;
            const dimensions = 'Standard';
            const material = 'Premium';
            const description = `Collection: ${rebrandedName} (Original: ${item.original})`;

            await client.execute({
                sql: "INSERT INTO inventory (name, sku, type, material, dimensions, stock, price, description, image_pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                args: [rebrandedName, sku, 'Collection', material, dimensions, stock, price, description, imagePath]
            });

            count++;
            if (count % 10 === 0) console.log(`Imported ${count} items...`);
        }

        console.log(`--- Import Complete! Total: ${count} items. ---`);
    } catch (error) {
        console.error('Import failed:', error);
    } finally {
        process.exit();
    }
}

importCollections();
