require('dotenv').config();
const express = require('express');
const path = require('path');
const PDFDocument = require('pdfkit');
const db = require('./database');
const multer = require('multer');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ever-loops-super-secret-key-2026';
// Project root - always points to the repo root regardless of serverless function __dirname
const PROJECT_ROOT = path.resolve(__dirname);

const app = express();
const PORT = process.env.PORT || 3002;

const isServerless = process.env.VERCEL || process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT || process.env.NODE_ENV === 'production';
const UPLOADS_DIR = isServerless ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const INVOICES_DIR = isServerless ? '/tmp/generated_invoices' : path.join(__dirname, 'generated_invoices');

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Ensure generated_invoices dir exists
if (!fs.existsSync(INVOICES_DIR)) {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

// Multer Config
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR + '/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

// Middleware to parse JSON bodies and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/collections', express.static(path.join(__dirname, 'public/collections')));

// Activity Logger Helper
const logActivity = (type, productId, name, sku, details = '') => {
    db.run("INSERT INTO activity_log (type, product_id, product_name, product_sku, details) VALUES (?, ?, ?, ?, ?)",
        [type, productId, name, sku, typeof details === 'object' ? JSON.stringify(details) : details],
        (err) => { if (err) console.error('Activity Log Error:', err.message); }
    );
};

// API Routes

// ---- AUTH MIDDLEWARE ----
const authenticateToken = (req, res, next) => {
    // Exclude login route from token check (req.path is relative to /api mount)
    if (req.path === '/auth/login') return next();

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token.' });
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Requires admin privileges.' });
    }
    next();
};

app.use('/api', authenticateToken);

// ---- AUTHENTICATION ----
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || user.password !== password) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Generate Token
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '12h' }
        );
        res.json({
            token,
            username: user.username,
            role: user.role,
            name: user.name,
            display_picture: user.display_picture
        });
    });
});

// ---- PROFILE UPDATE ----
app.put('/api/profile', authenticateToken, upload.single('display_picture'), (req, res) => {
    const userId = req.user.id;
    const { name, currentPassword, newPassword } = req.body;

    // First fetch the user to verify password if they want to change it
    db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found.' });

        let finalPassword = user.password;

        // If user wants to change password
        if (newPassword) {
            if (user.password !== currentPassword) {
                return res.status(401).json({ error: 'Incorrect current password.' });
            }
            finalPassword = newPassword;
        }

        let displayPicture = user.display_picture;
        if (req.file) {
            displayPicture = '/uploads/' + req.file.filename;
        }

        // We also update the name if provided, else keep existing (or username as fallback)
        const finalName = name || user.name || user.username;

        db.run(
            'UPDATE users SET name = ?, password = ?, display_picture = ? WHERE id = ?',
            [finalName, finalPassword, displayPicture, userId],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });

                res.json({
                    success: true,
                    message: 'Profile updated successfully',
                    name: finalName,
                    display_picture: displayPicture
                });
            }
        );
    });
});

// Get Current User Profile
app.get('/api/profile', authenticateToken, (req, res) => {
    const userId = req.user.id;
    db.get('SELECT username, name, role, display_picture FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    });
});

// ---- DASHBOARD STATS ----
app.get('/api/stats', (req, res) => {
    const todayQuery = "SELECT SUM(total_amount) as daily_revenue FROM invoices WHERE date(created_at) = date('now')";
    const totalQuery = "SELECT SUM(total_amount) as total_revenue FROM invoices";
    const pendingQuery = "SELECT SUM(total_amount) as pending_amount FROM invoices WHERE status = 'Pending'";

    db.get(todayQuery, (err, dailyRow) => {
        db.get(totalQuery, (err, totalRow) => {
            db.get(pendingQuery, (err, pendingRow) => {
                db.get('SELECT COUNT(*) as count FROM invoices', (err, invRow) => {
                    db.get('SELECT COUNT(*) as count FROM customers', (err, custRow) => {
                        db.get('SELECT COUNT(*) as count FROM inventory', (err, invCountRow) => {
                            db.all('SELECT inventory.name, inventory.stock FROM inventory WHERE stock <= 5 ORDER BY stock ASC LIMIT 5', (err, lowStock) => {
                                db.all('SELECT invoices.*, customers.name as customer_name FROM invoices LEFT JOIN customers ON invoices.customer_id = customers.id ORDER BY invoices.id DESC LIMIT 6', (err, recentInvoices) => {
                                    db.all(`
                                        SELECT inventory.name, SUM(invoice_items.quantity) as sold_count 
                                        FROM invoice_items 
                                        JOIN inventory ON invoice_items.product_id = inventory.id 
                                        GROUP BY inventory.id 
                                        ORDER BY sold_count DESC LIMIT 5`, (err, topProducts) => {
                                        res.json({
                                            dailyRevenue: dailyRow?.daily_revenue || 0,
                                            totalRevenue: totalRow?.total_revenue || 0,
                                            invoicesSent: invRow?.count || 0,
                                            pendingPayments: pendingRow?.pending_amount || 0,
                                            activeCustomers: custRow?.count || 0,
                                            inventoryCount: invCountRow?.count || 0,
                                            lowStock: lowStock || [],
                                            recentInvoices: recentInvoices || [],
                                            topProducts: topProducts || []
                                        });
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// ---- CUSTOMERS ----
app.get('/api/customers', (req, res) => {
    let query = "SELECT * FROM customers";
    let params = [];

    if (req.query.search) {
        query += " WHERE name LIKE ? OR email LIKE ? OR phone LIKE ?";
        const searchTerm = `%${req.query.search}%`;
        params = [searchTerm, searchTerm, searchTerm];
    }

    query += " ORDER BY total_spent DESC";

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/customers', (req, res) => {
    const { name, email, phone, address } = req.body;
    db.run("INSERT INTO customers (name, email, phone, address) VALUES (?, ?, ?, ?)", [name, email, phone, address], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, email, phone, address, total_spent: 0 });
    });
});

app.put('/api/customers/:id', (req, res) => {
    const { name, email, phone, address } = req.body;
    db.run("UPDATE customers SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?", [name, email, phone, address, req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes, id: req.params.id, name, email, phone, address });
    });
});


app.get('/api/customers/:id/history', (req, res) => {
    db.all("SELECT * FROM invoices WHERE customer_id = ? ORDER BY created_at DESC", [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ---- INVENTORY ----
app.get('/api/inventory', (req, res) => {
    let query = "SELECT * FROM inventory";
    let params = [];

    if (req.query.search) {
        query += " WHERE name LIKE ? OR sku LIKE ? OR type LIKE ? OR material LIKE ?";
        const searchTerm = `%${req.query.search}%`;
        params = [searchTerm, searchTerm, searchTerm, searchTerm];
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.get('/api/inventory/:id', (req, res) => {
    db.get("SELECT * FROM inventory WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Item not found' });
        res.json(row);
    });
});

app.post('/api/inventory', requireAdmin, upload.single('image'), (req, res) => {
    const { name, sku, type, material, dimensions, stock, cost, price, description, image_pattern } = req.body;
    let finalPattern = image_pattern || '';

    if (req.file) {
        finalPattern = '/uploads/' + req.file.filename;
    }

    db.run("INSERT INTO inventory (name, sku, type, material, dimensions, stock, cost, price, description, image_pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [name, sku, type, material, dimensions, stock, cost, price, description, finalPattern], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            logActivity('Added', this.lastID, name, sku, { stock, price });
            res.json({ id: this.lastID, name, sku });
        });
});

app.put('/api/inventory/:id', requireAdmin, upload.single('image'), (req, res) => {
    const { name, sku, type, material, dimensions, stock, cost, price, description, image_pattern } = req.body;

    let query = "UPDATE inventory SET name=?, sku=?, type=?, material=?, dimensions=?, stock=?, cost=?, price=?, description=? WHERE id=?";
    let params = [name, sku, type, material, dimensions, stock, cost, price, description, req.params.id];

    if (req.file) {
        query = "UPDATE inventory SET name=?, sku=?, type=?, material=?, dimensions=?, stock=?, cost=?, price=?, description=?, image_pattern=? WHERE id=?";
        params = [name, sku, type, material, dimensions, stock, cost, price, description, '/uploads/' + req.file.filename, req.params.id];
    } else if (image_pattern && image_pattern !== 'undefined') {
        // If image_pattern string was sent (e.g. they changed the pattern dropdown)
        query = "UPDATE inventory SET name=?, sku=?, type=?, material=?, dimensions=?, stock=?, cost=?, price=?, description=?, image_pattern=? WHERE id=?";
        params = [name, sku, type, material, dimensions, stock, cost, price, description, image_pattern, req.params.id];
    }

    db.run(query, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        logActivity('Edited', req.params.id, name, sku, { stock, price });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/inventory/:id', requireAdmin, (req, res) => {
    // Fetch all item details before deleting for restoration backup
    db.get("SELECT * FROM inventory WHERE id = ?", [req.params.id], (err, item) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!item) return res.status(404).json({ error: 'Item not found' });

        db.run("DELETE FROM inventory WHERE id = ?", [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            // Log with the full item object as details
            logActivity('Deleted', req.params.id, item.name, item.sku, item);
            res.json({ deleted: this.changes });
        });
    });
});

app.post('/api/activity-log/:id/restore', requireAdmin, (req, res) => {
    db.get("SELECT details FROM activity_log WHERE id = ? AND type = 'Deleted'", [req.params.id], (err, log) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!log || !log.details) return res.status(404).json({ error: 'Deletion log not found' });

        try {
            const item = JSON.parse(log.details);
            const { name, sku, type, material, dimensions, stock, cost, price, description, image_pattern } = item;

            db.run(
                "INSERT INTO inventory (name, sku, type, material, dimensions, stock, cost, price, description, image_pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [name, sku, type, material, dimensions, stock, cost, price, description, image_pattern],
                function (err) {
                    if (err) {
                        if (err.message.includes('UNIQUE constraint failed: inventory.sku')) {
                            return res.status(400).json({ error: 'A product with this SKU already exists.' });
                        }
                        return res.status(500).json({ error: err.message });
                    }

                    const newId = this.lastID;
                    logActivity('Added', newId, name, sku, { restored_from_log: req.params.id });

                    // Mark the old "Deleted" log so it's not restored again (optional but good)
                    db.run("UPDATE activity_log SET details = ? WHERE id = ?", [JSON.stringify({ ...item, restored: true }), req.params.id]);

                    res.json({ restored: true, id: newId, name, sku });
                }
            );
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse item details for restoration' });
        }
    });
});

app.get('/api/activity-log', (req, res) => {
    db.all("SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 50", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ---- SETTINGS ----
app.get('/api/settings', (req, res) => {
    db.get('SELECT * FROM settings WHERE id = 1', (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

app.post('/api/settings', requireAdmin, (req, res) => {
    const { admin_password, company_name, address, phone, currency, tax_rate, invoice_prefix } = req.body;
    const userId = req.user.id;

    // Verify password first
    db.get('SELECT password FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user || user.password !== admin_password) {
            return res.status(401).json({ error: 'Incorrect administrator password.' });
        }

        db.run(
            `UPDATE settings SET company_name = ?, address = ?, phone = ?, currency = ?, tax_rate = ?, invoice_prefix = ? WHERE id = 1`,
            [company_name, address, phone, currency, tax_rate, invoice_prefix],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ updated: this.changes });
            }
        );
    });
});

// ---- INVOICES ----
app.get('/api/invoices', (req, res) => {
    const query = `
        SELECT invoices.*, customers.name as customer_name 
        FROM invoices 
        LEFT JOIN customers ON invoices.customer_id = customers.id 
        ORDER BY invoices.created_at DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get single invoice with items
app.get('/api/invoices/:id', (req, res) => {
    const invoiceId = req.params.id;
    db.get(`SELECT invoices.*, customers.name as customer_name 
            FROM invoices LEFT JOIN customers ON invoices.customer_id = customers.id
            WHERE invoices.id = ?`, [invoiceId], (err, invoice) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

        db.all(`SELECT invoice_items.*, inventory.name as product_name 
                FROM invoice_items 
                JOIN inventory ON invoice_items.product_id = inventory.id
                WHERE invoice_items.invoice_id = ?`, [invoiceId], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            invoice.items = items || [];
            res.json(invoice);
        });
    });
});


// ---- PDF HELPER: buffer-based (required for Netlify serverless) ----
function generateInvoicePDFBuffer(invoiceData, settings) {
    return new Promise((resolve, reject) => {
        const { PassThrough } = require('stream');
        const doc = new PDFDocument({ margin: 0, size: 'A4' }); // Use 0 margin for full bleed accent bars
        const chunks = [];
        const pt = new PassThrough();
        pt.on('data', c => chunks.push(c));
        pt.on('end', () => resolve(Buffer.concat(chunks)));
        pt.on('error', reject);
        doc.pipe(pt);

        const companyName = settings ? settings.company_name : 'EVER LOOPS';
        const rawAddr = settings ? (settings.address || '') : 'Doha, Qatar';
        const companyAddress = rawAddr.replace(/\\n/g, ', ').replace(/\n/g, ', ');
        const companyPhone = settings ? settings.phone : '';
        const currency = settings ? settings.currency : 'QAR';
        const currentTaxRate = settings ? Number(settings.tax_rate) : 5;

        const leftMargin = 50, rightMargin = 545, width = 595;
        const col1 = 50, col2 = 320, col3 = 380, col4 = 470, col5 = 545;

        // 1. Accent Bars
        doc.rect(0, 0, width, 12).fill('#d4af37');
        doc.rect(0, 830, width, 12).fill('#1e293b');

        // 2. Header
        let y = 60;
        // Logo
        try {
            const rawLogo = settings && settings.company_logo ? settings.company_logo : null;
            if (rawLogo) {
                const lp = rawLogo.startsWith('/') ? rawLogo.substring(1) : rawLogo;
                const localPath = path.join(UPLOADS_DIR, path.basename(lp));
                const repoPath = path.join(PROJECT_ROOT, lp);
                const fullLogoPath = fs.existsSync(localPath) ? localPath : (fs.existsSync(repoPath) ? repoPath : null);
                if (fullLogoPath) doc.image(fs.readFileSync(fullLogoPath), leftMargin, y, { height: 50 });
            }
        } catch (e) { console.error('Logo error in PDF:', e.message); }

        // Background-like INVOICE text
        doc.fillColor('#f1f5f9').fontSize(60).font('Helvetica-Bold')
            .text('INVOICE', 300, y - 10, { width: 245, align: 'right' });

        y += 65;
        // Company details
        doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold').text(companyName, leftMargin, y);
        doc.fillColor('#64748b').fontSize(9).font('Helvetica').text(companyAddress, leftMargin, y + 18, { width: 220 });
        doc.text(companyPhone, leftMargin, y + 30);

        // Invoice Meta Info (Issue Date, etc)
        const metaX = 400;
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('INVOICE NUMBER', metaX, y);
        doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('#' + (invoiceData.invoiceNumber || 'NEW'), metaX, y + 12);

        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('ISSUE DATE', metaX, y + 35);
        doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text(new Date(invoiceData.createdAt || Date.now()).toLocaleDateString('en-GB'), metaX, y + 47);

        y += 85;

        // 3. Bill To Section
        doc.rect(leftMargin, y, 6, 60).fill('#d4af37');
        doc.rect(leftMargin + 6, y, 280, 60).fill('#f8fafc');

        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('BILLED TO', leftMargin + 20, y + 12);
        doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold').text(invoiceData.customerName || 'Quick Customer', leftMargin + 20, y + 24);

        // Payment & Status Info
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('PAYMENT METHOD', metaX, y + 5);
        doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(invoiceData.paymentMethod || 'Cash', metaX, y + 17);

        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica-Bold').text('STATUS', metaX, y + 35);
        const sColor = invoiceData.status === 'Paid' ? '#10b981' : '#f59e0b';
        doc.fillColor(sColor).fontSize(10).font('Helvetica-Bold').text((invoiceData.status || 'PENDING').toUpperCase(), metaX, y + 47);

        y += 90;

        // 4. Items Table
        doc.rect(leftMargin, y, rightMargin - leftMargin, 35).fill('#1e293b');
        doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
        doc.text('DESCRIPTION', col1 + 15, y + 13);
        doc.text('QTY', col2, y + 13, { width: 40, align: 'center' });
        doc.text('UNIT PRICE', col3, y + 13, { width: 80, align: 'right' });
        doc.text('TOTAL', col4, y + 13, { width: 75, align: 'right' });

        y += 35;
        let subtotalCalc = 0;
        (invoiceData.items || []).forEach((item, index) => {
            const qty = parseFloat(item.qty || 0);
            const price = parseFloat(item.price || 0);
            const lineTotal = price * qty;
            subtotalCalc += lineTotal;

            if (index % 2 === 1) doc.rect(leftMargin, y, rightMargin - leftMargin, 25).fill('#fcfdff');

            doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(item.name || '', col1 + 15, y + 8, { width: 240 });
            doc.fillColor('#475569').fontSize(9).font('Helvetica').text(qty.toString(), col2, y + 8, { width: 40, align: 'center' });
            doc.text(price.toLocaleString(undefined, { minimumFractionDigits: 2 }), col3, y + 8, { width: 80, align: 'right' });
            doc.fillColor('#1e293b').font('Helvetica-Bold').text(lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }), col4, y + 8, { width: 75, align: 'right' });

            y += 25;
            if (y > 700) { doc.addPage(); y = 50; }
        });

        // 5. Totals
        y += 30;
        const totalX = 350;
        const numSubtotal = parseFloat(invoiceData.subtotal) || subtotalCalc;
        const numDiscount = parseFloat(invoiceData.discount) || 0;
        const numTax = parseFloat(invoiceData.tax) || (numSubtotal - numDiscount) * (currentTaxRate / 100);
        const numGrandTotal = parseFloat(invoiceData.grandTotal || invoiceData.total_amount) || (numSubtotal - numDiscount + numTax);

        doc.fillColor('#64748b').fontSize(10).font('Helvetica').text('Sub Total', totalX, y, { width: 100, align: 'right' });
        doc.fillColor('#1e293b').font('Helvetica-Bold').text(currency + ' ' + numSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalX + 110, y, { width: 85, align: 'right' });
        y += 20;

        if (numDiscount > 0) {
            doc.fillColor('#64748b').font('Helvetica').text('Discount', totalX, y, { width: 100, align: 'right' });
            doc.fillColor('#ef4444').font('Helvetica-Bold').text('- ' + currency + ' ' + numDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalX + 110, y, { width: 85, align: 'right' });
            y += 20;
        }

        doc.fillColor('#64748b').font('Helvetica').text('VAT (' + currentTaxRate + '%)', totalX, y, { width: 100, align: 'right' });
        doc.fillColor('#1e293b').font('Helvetica-Bold').text(currency + ' ' + numTax.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalX + 110, y, { width: 85, align: 'right' });

        y += 35;
        doc.fillColor('#1e293b').fontSize(12).font('Helvetica-Bold').text('AMOUNT DUE', totalX, y, { width: 100, align: 'right' });
        doc.fillColor('#d4af37').fontSize(20).text(currency + ' ' + numGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalX + 110, y - 5, { width: 85, align: 'right' });

        // Notes box
        doc.fillColor('#1e293b').fontSize(9).font('Helvetica-Bold').text('NOTES & TERMS', leftMargin, y - 100);
        doc.rect(leftMargin, y - 85, 220, 50).fill('#fdfcf6').stroke('#fef3c7');
        doc.fillColor('#64748b').fontSize(8).font('Helvetica').text('Thank you for your business. Please ensure payment is made within valid terms. This is a computer-generated document.', leftMargin + 10, y - 75, { width: 200, lineGap: 2 });

        // 6. Signature & Footer
        y = 720;
        doc.moveTo(350, y).lineTo(545, y).lineWidth(1).strokeColor('#e2e8f0').stroke();
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica-Bold').text('AUTHORIZED SIGNATURE', 350, y + 10, { width: 195, align: 'center' });

        doc.fillColor('#1e293b').fontSize(11).font('Helvetica-Bold').text('Ever Loops Carpets W.L.L.', leftMargin, y + 30);
        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text('Doha, Qatar • www.everloops.qa', leftMargin, y + 45);

        doc.end();
    });
}

// GET existing invoice as PDF
app.get('/api/invoices/:id/pdf', (req, res) => {
    const invoiceId = req.params.id;
    db.get('SELECT invoices.*, customers.name as customer_name FROM invoices LEFT JOIN customers ON invoices.customer_id = customers.id WHERE invoices.id = ?', [invoiceId], (err, invoice) => {
        if (err || !invoice) return res.status(404).json({ error: 'Invoice not found' });
        db.all('SELECT invoice_items.*, inventory.name as product_name FROM invoice_items JOIN inventory ON invoice_items.product_id = inventory.id WHERE invoice_items.invoice_id = ?', [invoiceId], (err, items) => {
            if (err) return res.status(500).json({ error: err.message });
            db.get('SELECT * FROM settings WHERE id = 1', (err, settings) => {
                const invoiceData = {
                    customerName: invoice.customer_name, invoiceNumber: invoice.invoice_number,
                    createdAt: invoice.created_at, status: invoice.status, paymentMethod: invoice.payment_method,
                    subtotal: null, discount: invoice.discount, tax: null, grandTotal: invoice.total_amount,
                    items: (items || []).map(function (i) { return { name: i.product_name, qty: i.quantity, price: i.price }; })
                };
                generateInvoicePDFBuffer(invoiceData, settings)
                    .then(function (pdfBuffer) {
                        res.setHeader('Content-Disposition', 'attachment; filename="' + invoice.invoice_number + '.pdf"');
                        res.setHeader('Content-Type', 'application/pdf');
                        res.setHeader('Content-Length', pdfBuffer.length);
                        res.end(pdfBuffer);
                        try { fs.writeFileSync(path.join(INVOICES_DIR, invoice.invoice_number + '.pdf'), pdfBuffer); } catch (e) { }
                    })
                    .catch(function (e) { res.status(500).json({ error: 'PDF failed: ' + e.message }); });
            });
        });
    });
});

// POST - generate PDF inline (for invoice preview/download button)
app.post('/api/invoices/pdf', (req, res) => {
    const { customerName, invoiceNumber, items, subtotal, tax, grandTotal, discount, paymentMethod, status } = req.body;
    db.get('SELECT * FROM settings WHERE id = 1', (err, settings) => {
        const invoiceData = { customerName, invoiceNumber, items, subtotal, tax, grandTotal, discount, paymentMethod, status };
        generateInvoicePDFBuffer(invoiceData, settings)
            .then(function (pdfBuffer) {
                res.setHeader('Content-Disposition', 'attachment; filename="' + invoiceNumber + '.pdf"');
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Length', pdfBuffer.length);
                res.end(pdfBuffer);
                try { fs.writeFileSync(path.join(INVOICES_DIR, invoiceNumber + '.pdf'), pdfBuffer); } catch (e) { }
            })
            .catch(function (e) { res.status(500).json({ error: 'PDF failed: ' + e.message }); });
    });
});

// ---- NOTIFICATIONS ----
app.get('/api/notifications', (req, res) => {
    const lowStockQuery = `SELECT id, name, sku, stock FROM inventory WHERE stock < 5`;
    const pendingInvoicesQuery = `SELECT id, invoice_number, total_amount, status FROM invoices WHERE status != 'Paid'`;

    db.all(lowStockQuery, [], (err, lowStockRows) => {
        if (err) return res.status(500).json({ error: err.message });

        db.all(pendingInvoicesQuery, [], (err, invoiceRows) => {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
                lowStock: lowStockRows || [],
                pendingInvoices: invoiceRows || []
            });
        });
    });
});

// ---- REPORTS & ANALYTICS ----
app.get('/api/reports', (req, res) => {
    const period = req.query.period || 'monthly';
    let salesQuery = "";
    let dateFormat = "";

    // SQLite/LibSQL date grouping
    if (period === 'daily') {
        dateFormat = "%Y-%m-%d";
        salesQuery = `SELECT strftime('${dateFormat}', created_at) as label, SUM(total_amount) as revenue 
                      FROM invoices WHERE created_at >= date('now', '-7 days')
                      GROUP BY label ORDER BY label ASC`;
    } else if (period === 'weekly') {
        dateFormat = "%Y-%W";
        salesQuery = `SELECT strftime('${dateFormat}', created_at) as label, SUM(total_amount) as revenue 
                      FROM invoices WHERE created_at >= date('now', '-8 weeks')
                      GROUP BY label ORDER BY label ASC`;
    } else if (period === 'yearly') {
        dateFormat = "%Y";
        salesQuery = `SELECT strftime('${dateFormat}', created_at) as label, SUM(total_amount) as revenue 
                      FROM invoices GROUP BY label ORDER BY label ASC`;
    } else {
        // default monthly
        dateFormat = "%Y-%m";
        salesQuery = `SELECT strftime('${dateFormat}', created_at) as label, SUM(total_amount) as revenue 
                      FROM invoices WHERE created_at >= date('now', '-12 months')
                      GROUP BY label ORDER BY label ASC`;
    }

    const inventoryByMaterialQuery = `
        SELECT material as label, COUNT(*) as count 
        FROM inventory 
        WHERE material IS NOT NULL AND material != ''
        GROUP BY material 
        ORDER BY count DESC
    `;

    const stockByTypeQuery = `
        SELECT type as label, SUM(stock) as total_stock 
        FROM inventory 
        WHERE type IS NOT NULL AND type != ''
        GROUP BY type 
        ORDER BY total_stock DESC
    `;

    const priceCostCorrelationQuery = `
        SELECT name as x_label, cost as x, price as y 
        FROM inventory 
        WHERE cost > 0 AND price > 0
    `;

    const productsQuery = `SELECT name, sold_count FROM inventory ORDER BY sold_count DESC LIMIT 10`;

    const topCustomersQuery = `
        SELECT customers.name as label, SUM(invoices.total_amount) as value 
        FROM invoices 
        JOIN customers ON invoices.customer_id = customers.id 
        GROUP BY customers.id 
        ORDER BY value DESC 
        LIMIT 5
    `;

    const summaryQuery = `
        SELECT 
            COUNT(*) as total_invoices, 
            SUM(total_amount) as total_revenue,
            AVG(total_amount) as avg_value
        FROM invoices
    `;

    db.all(salesQuery, [], (err, salesData) => {
        if (err) return res.status(500).json({ error: 'Sales report failed: ' + err.message });

        db.all(productsQuery, [], (err, productsData) => {
            if (err) return res.status(500).json({ error: 'Products report failed: ' + err.message });

            db.all(inventoryByMaterialQuery, [], (err, materialData) => {
                db.all(stockByTypeQuery, [], (err, typeData) => {
                    db.all(priceCostCorrelationQuery, [], (err, correlationData) => {
                        db.all(topCustomersQuery, [], (err, customersData) => {
                            db.get(summaryQuery, [], (err, summaryData) => {
                                res.json({
                                    sales: salesData || [],
                                    products: productsData || [],
                                    materials: materialData || [],
                                    stockByType: typeData || [],
                                    correlation: correlationData || [],
                                    topCustomers: customersData || [],
                                    summary: summaryData || { total_invoices: 0, total_revenue: 0, avg_value: 0 }
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// --- PAGE ROUTING ---
// Global Fallback (Catch-all) for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// --- SERVER START ---
if (!isServerless) {
    app.listen(PORT, () => {
        console.log(`Ever Loops Server running at http://localhost:${PORT}`);
    });
}

module.exports = app;

