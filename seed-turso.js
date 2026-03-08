require('dotenv').config();
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

async function seed() {
    console.log('Initializing schema on Turso...');

    await client.execute(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'staff',
        name TEXT,
        display_picture TEXT
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        total_spent REAL DEFAULT 0
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        type TEXT,
        material TEXT,
        dimensions TEXT,
        stock INTEGER DEFAULT 0,
        price REAL NOT NULL,
        description TEXT,
        image_pattern TEXT
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        invoice_number TEXT UNIQUE NOT NULL,
        total_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        payment_method TEXT DEFAULT 'Cash',
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES customers(id)
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        product_id INTEGER,
        quantity INTEGER,
        price REAL,
        FOREIGN KEY(invoice_id) REFERENCES invoices(id),
        FOREIGN KEY(product_id) REFERENCES inventory(id)
    )`);

    await client.execute(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        company_name TEXT,
        address TEXT,
        phone TEXT,
        currency TEXT,
        tax_rate REAL,
        invoice_prefix TEXT,
        company_logo TEXT
    )`);

    // Seed users
    const userCount = await client.execute("SELECT COUNT(*) as count FROM users");
    if (Number(userCount.rows[0].count) === 0) {
        await client.execute({ sql: "INSERT INTO users (username, password, role) VALUES (?, ?, ?)", args: ["everloops", "1234", "admin"] });
        await client.execute({ sql: "INSERT INTO users (username, password, role) VALUES (?, ?, ?)", args: ["staff", "1234", "staff"] });
        console.log('Default users created.');
    } else {
        console.log('Users already exist, skipping seed.');
    }

    // Seed settings
    const settingsCount = await client.execute("SELECT COUNT(*) as count FROM settings");
    if (Number(settingsCount.rows[0].count) === 0) {
        await client.execute({
            sql: `INSERT INTO settings (id, company_name, address, phone, currency, tax_rate, invoice_prefix, company_logo)
                  VALUES (1, 'Ever Loops Carpets W.L.L.', 'Building 45, Street 250\nD-Ring Road, Doha, Qatar', '+974 4411 2233', 'QAR', 5.0, 'INV-2024-', '/uploads/logo.jpeg')`,
            args: []
        });
        console.log('Default settings created.');
    }

    console.log('✅ Schema and seed complete!');
}

seed().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
