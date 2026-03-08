const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'everloops.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database.');
        
        // Initialize Schema — CREATE IF NOT EXISTS only, never drop
        db.serialize(() => {
            // Users Table
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT DEFAULT 'staff'
            )`);

            // Customers Table
            db.run(`CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                address TEXT,
                total_spent REAL DEFAULT 0
            )`);

            // Inventory Table
            db.run(`CREATE TABLE IF NOT EXISTS inventory (
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

            // Invoices Table
            db.run(`CREATE TABLE IF NOT EXISTS invoices (
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

            // Invoice Items Table
            db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_id INTEGER,
                product_id INTEGER,
                quantity INTEGER,
                price REAL,
                FOREIGN KEY(invoice_id) REFERENCES invoices(id),
                FOREIGN KEY(product_id) REFERENCES inventory(id)
            )`);
            
            // Settings Table
            db.run(`CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                company_name TEXT,
                address TEXT,
                phone TEXT,
                currency TEXT,
                tax_rate REAL,
                invoice_prefix TEXT,
                company_logo TEXT
            )`);
            
            // Seed users if no users exist yet
            db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
                if (row && row.count === 0) {
                    const insertUser = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
                    insertUser.run("everloops", "1234", "admin");
                    insertUser.run("staff", "1234", "staff");
                    insertUser.finalize();
                    console.log('Default users created (everloops / staff).');
                }
            });

            // Seed default settings if not set
            db.get("SELECT COUNT(*) as count FROM settings", (err, row) => {
                if (row && row.count === 0) {
                    db.run(`INSERT INTO settings (id, company_name, address, phone, currency, tax_rate, invoice_prefix, company_logo)
                            VALUES (1, 'Ever Loops Carpets W.L.L.', 'Building 45, Street 250\nD-Ring Road, Doha, Qatar', '+974 4411 2233', 'QAR', 5.0, 'INV-2024-', '/uploads/logo.jpeg')`);
                    console.log('Default settings created.');
                }
            });
        });
    }
});

module.exports = db;
