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
    db.all("SELECT * FROM inventory", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/inventory', requireAdmin, upload.single('image'), (req, res) => {
    const { name, sku, type, material, dimensions, stock, price, description, image_pattern } = req.body;
    let finalPattern = image_pattern || '';

    if (req.file) {
        finalPattern = '/uploads/' + req.file.filename;
    }

    db.run("INSERT INTO inventory (name, sku, type, material, dimensions, stock, price, description, image_pattern) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [name, sku, type, material, dimensions, stock, price, description, finalPattern], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, name, sku });
        });
});

app.put('/api/inventory/:id', requireAdmin, upload.single('image'), (req, res) => {
    const { name, sku, type, material, dimensions, stock, price, description, image_pattern } = req.body;

    let query = "UPDATE inventory SET name=?, sku=?, type=?, material=?, dimensions=?, stock=?, price=?, description=? WHERE id=?";
    let params = [name, sku, type, material, dimensions, stock, price, description, req.params.id];

    if (req.file) {
        query = "UPDATE inventory SET name=?, sku=?, type=?, material=?, dimensions=?, stock=?, price=?, description=?, image_pattern=? WHERE id=?";
        params = [name, sku, type, material, dimensions, stock, price, description, '/uploads/' + req.file.filename, req.params.id];
    } else if (image_pattern && image_pattern !== 'undefined') {
        // If image_pattern string was sent (e.g. they changed the pattern dropdown)
        query = "UPDATE inventory SET name=?, sku=?, type=?, material=?, dimensions=?, stock=?, price=?, description=?, image_pattern=? WHERE id=?";
        params = [name, sku, type, material, dimensions, stock, price, description, image_pattern, req.params.id];
    }

    db.run(query, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ updated: this.changes });
    });
});

app.delete('/api/inventory/:id', requireAdmin, (req, res) => {
    db.run("DELETE FROM inventory WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
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
    const { company_name, address, phone, currency, tax_rate, invoice_prefix } = req.body;
    db.run(
        `UPDATE settings SET company_name = ?, address = ?, phone = ?, currency = ?, tax_rate = ?, invoice_prefix = ? WHERE id = 1`,
        [company_name, address, phone, currency, tax_rate, invoice_prefix],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        }
    );
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
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const chunks = [];
        const pt = new PassThrough();
        pt.on('data', c => chunks.push(c));
        pt.on('end', () => resolve(Buffer.concat(chunks)));
        pt.on('error', reject);
        doc.pipe(pt);

        const companyName = settings ? settings.company_name : 'EVER LOOPS';
        const rawAddr = settings ? (settings.address || '') : '';
        const companyAddress = rawAddr.replace(/\\n/g, '\\n').replace(/\n/g, ', ');
        const companyPhone = settings ? settings.phone : '';
        const currency = settings ? settings.currency : 'QAR';
        const currentTaxRate = settings ? Number(settings.tax_rate) : 5;
        const leftMargin = 40, rightMargin = 555;
        const col1 = 40, col2 = 280, col3 = 340, col4 = 430, col5 = 480;

        // LOGO
        let headerY = 40;
        try {
            const rawLogo = settings && settings.company_logo ? settings.company_logo : null;
            if (rawLogo) {
                const lp = rawLogo.startsWith('/') ? rawLogo.substring(1) : rawLogo;
                const localPath = path.join(UPLOADS_DIR, path.basename(lp));
                const repoPath = path.join(PROJECT_ROOT, lp);
                const fullLogoPath = fs.existsSync(localPath) ? localPath : (fs.existsSync(repoPath) ? repoPath : null);
                if (fullLogoPath) doc.image(fs.readFileSync(fullLogoPath), leftMargin, headerY, { width: 170 });
            }
        } catch (e) { console.error('Logo error in PDF:', e.message); }

        doc.fillColor('#1e293b').fontSize(32).font('Helvetica-Bold')
            .text('INVOICE', leftMargin, headerY + 10, { align: 'right', width: rightMargin - leftMargin });

        headerY += 80;
        doc.moveTo(leftMargin, headerY).lineTo(rightMargin, headerY).lineWidth(3).strokeColor('#bdf53d').stroke();
        headerY += 25;

        doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('INVOICE TO:', leftMargin, headerY);
        doc.text('INVOICE DETAILS:', 350, headerY);
        headerY += 14;
        doc.fillColor('#1e293b').fontSize(14).font('Helvetica-Bold').text(invoiceData.customerName || 'Quick Customer', leftMargin, headerY);
        doc.fontSize(9).font('Helvetica').text('Invoice #:', 350, headerY);
        doc.font('Helvetica-Bold').text(invoiceData.invoiceNumber, 420, headerY);
        headerY += 16;
        doc.font('Helvetica').text('Date:', 350, headerY);
        doc.font('Helvetica-Bold').text(new Date(invoiceData.createdAt || Date.now()).toLocaleDateString(), 420, headerY);
        headerY += 16;
        doc.font('Helvetica').text('Status:', 350, headerY);
        const sColor = invoiceData.status === 'Paid' ? '#10b981' : '#f59e0b';
        doc.fillColor(sColor).font('Helvetica-Bold').text((invoiceData.status || 'PENDING').toUpperCase(), 420, headerY);

        headerY = 165;
        doc.fillColor('#64748b').fontSize(8).font('Helvetica-Bold').text('FROM:', leftMargin, headerY);
        doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(companyName, leftMargin, headerY + 12);
        doc.fontSize(8).font('Helvetica').fillColor('#475569')
            .text(companyAddress + '\nPhone: ' + companyPhone, leftMargin, headerY + 24, { width: 250 });

        let tableTop = 250;
        doc.rect(leftMargin, tableTop, 515, 25).fill('#1e293b');
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
        doc.text('DESCRIPTION', col1 + 10, tableTop + 8);
        doc.text('QTY', col2, tableTop + 8, { width: 40, align: 'center' });
        doc.text('UNIT PRICE', col3, tableTop + 8, { width: 80, align: 'right' });
        doc.text('VAT', col4, tableTop + 8, { width: 40, align: 'right' });
        doc.text('TOTAL', col5, tableTop + 8, { width: 75, align: 'right' });

        let y = tableTop + 30;
        let subtotalCalc = 0;
        (invoiceData.items || []).forEach(function (item, index) {
            const qty = parseFloat(item.qty || item.quantity || 0);
            const price = parseFloat(item.price || 0);
            const lineSub = price * qty;
            subtotalCalc += lineSub;
            const lineTotal = lineSub + lineSub * (currentTaxRate / 100);
            if (index % 2 === 1) doc.rect(leftMargin, y - 5, 515, 20).fill('#f8fafc');
            doc.font('Helvetica').fontSize(9).fillColor('#1e293b');
            doc.text(item.name || item.product_name || '', col1 + 10, y, { width: 220 });
            doc.text(qty.toString(), col2, y, { width: 40, align: 'center' });
            doc.text(price.toLocaleString(undefined, { minimumFractionDigits: 2 }), col3, y, { width: 80, align: 'right' });
            doc.text(currentTaxRate + '%', col4, y, { width: 40, align: 'right' });
            doc.text(lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }), col5, y, { width: 75, align: 'right' });
            y += 20;
            if (y > 650) { doc.addPage(); y = 50; }
        });

        y += 20;
        const totalBoxWidth = 200;
        const totalBoxX = rightMargin - totalBoxWidth;
        const numSubtotal = parseFloat(invoiceData.subtotal) || subtotalCalc;
        const numDiscount = parseFloat(invoiceData.discount) || 0;
        const numTax = parseFloat(invoiceData.tax) || (numSubtotal - numDiscount) * (currentTaxRate / 100);
        const numGrandTotal = parseFloat(invoiceData.grandTotal || invoiceData.total_amount) || 0;

        doc.fontSize(10).font('Helvetica').fillColor('#64748b').text('Subtotal:', totalBoxX, y, { width: 100, align: 'right' });
        doc.font('Helvetica-Bold').fillColor('#1e293b').text(currency + ' ' + numSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalBoxX + 105, y, { width: 95, align: 'right' });
        y += 18;
        if (numDiscount > 0) {
            doc.font('Helvetica').fillColor('#64748b').text('Discount:', totalBoxX, y, { width: 100, align: 'right' });
            doc.font('Helvetica-Bold').fillColor('#ef4444').text('- ' + currency + ' ' + numDiscount.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalBoxX + 105, y, { width: 95, align: 'right' });
            y += 18;
        }
        doc.font('Helvetica').fillColor('#64748b').text('VAT (' + currentTaxRate + '%):', totalBoxX, y, { width: 100, align: 'right' });
        doc.font('Helvetica-Bold').fillColor('#1e293b').text(currency + ' ' + numTax.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalBoxX + 105, y, { width: 95, align: 'right' });
        y += 25;
        doc.rect(totalBoxX, y - 8, totalBoxWidth + 5, 35).fill('#1e293b');
        doc.fillColor('#bdf53d').fontSize(12).font('Helvetica-Bold').text('TOTAL PAYABLE', totalBoxX + 10, y + 2);
        doc.text(currency + ' ' + numGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }), totalBoxX + 110, y + 2, { width: 85, align: 'right' });

        y += 60;
        if (y > 700) { doc.addPage(); y = 50; }
        const infoColW = 240;
        const pm = invoiceData.paymentMethod || invoiceData.payment_method || 'Bank Transfer';
        doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text('PAYMENT INFORMATION', leftMargin, y);
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica')
            .text('Method: ' + pm + '\nBank Name: Qatar National Bank (QNB)\nAccount Name: EVER LOOPS CARPETS W.L.L.\nIBAN: QA45 QNBA 0000 0000 1234 5678 9012', leftMargin, y + 15, { width: infoColW, lineGap: 3 });
        doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text('TERMS & CONDITIONS', 315, y);
        doc.fillColor('#1e293b').fontSize(8).font('Helvetica')
            .text('1. Goods once sold will not be exchanged or returned.\n2. Warranty covers manufacturing defects only.\n3. Installation is not included unless specified.\n4. Possession is effective after full payment.', 315, y + 15, { width: infoColW, lineGap: 3 });

        doc.fontSize(8).fillColor('#94a3b8').font('Helvetica-Oblique')
            .text('Thank you for choosing Ever Loops Carpets. This is a computer-generated invoice.', leftMargin, 790, { align: 'center', width: 515 });
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

    const productsQuery = `
        SELECT inventory.name, SUM(invoice_items.quantity) as sold_count 
        FROM invoice_items 
        JOIN inventory ON invoice_items.product_id = inventory.id 
        GROUP BY inventory.id 
        ORDER BY sold_count DESC LIMIT 10
    `;

    db.all(salesQuery, [], (err, salesData) => {
        if (err) return res.status(500).json({ error: 'Sales report failed: ' + err.message });

        db.all(productsQuery, [], (err, productsData) => {
            if (err) return res.status(500).json({ error: 'Products report failed: ' + err.message });

            res.json({
                sales: salesData || [],
                products: productsData || []
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
app.listen(PORT, () => {
    console.log(`Ever Loops Server running at http://localhost:${PORT}`);
});

module.exports = app;

