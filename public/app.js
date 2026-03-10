document.addEventListener('DOMContentLoaded', () => {
    // Check Auth Status
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username');

    if (!token && window.location.pathname !== '/login.html') {
        window.location.href = '/login.html';
        return;
    }

    // Custom fetch wrapper to inject token and handle 401s
    window.apiFetch = function (url, options = {}) {
        const headers = options.headers || {};
        // If body is FormData, do not set Content-Type header so browser sets multipart/form-data with boundary
        if (!(options.body instanceof FormData) && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        options.headers = headers;

        return fetch(url, options).then(res => {
            if (res.status === 401 || res.status === 403) {
                // If token expired or access denied, clear and redirect to login
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                localStorage.removeItem('username');
                window.location.href = '/login.html';
                throw new Error('Unauthorized');
            }
            return res;
        });
    };

    // Update UI based on auth info
    function updateHeaderUI(profileData) {
        const name = profileData.name || localStorage.getItem('name');
        const username = profileData.username || localStorage.getItem('username');
        const dp = profileData.display_picture || localStorage.getItem('display_picture');

        // Update localStorage to keep in sync
        if (profileData.name) localStorage.setItem('name', profileData.name);
        if (profileData.display_picture) localStorage.setItem('display_picture', profileData.display_picture);

        const displayName = name && name !== 'undefined' && name !== 'null' ? name : (username || 'Admin');

        const userRoleElem = document.querySelector('.user-role');
        const userNameElem = document.querySelector('.user-name');
        const avatarElem = document.querySelector('.avatar');

        if (userRoleElem && role) userRoleElem.textContent = role === 'admin' ? 'Administrator' : 'Staff Member';
        if (userNameElem) userNameElem.textContent = displayName;
        if (avatarElem) {
            if (dp && dp !== 'undefined' && dp !== 'null') {
                avatarElem.style.backgroundImage = `url(${dp})`;
                avatarElem.style.backgroundSize = 'cover';
                avatarElem.style.backgroundPosition = 'center';
                avatarElem.textContent = '';
            } else {
                avatarElem.textContent = displayName.charAt(0).toUpperCase();
                avatarElem.style.backgroundImage = 'none';
                avatarElem.style.color = 'white';
            }
        }

        // Also update Admin Header Dropdown
        const adminBtn = document.getElementById('admin-profile-btn');
        const adminDropdownNameEl = document.querySelector('#admin-dropdown p:first-of-type');

        if (adminDropdownNameEl) adminDropdownNameEl.textContent = displayName;

        if (adminBtn) {
            if (dp && dp !== 'undefined' && dp !== 'null') {
                adminBtn.style.backgroundImage = `url(${dp})`;
                adminBtn.style.backgroundSize = 'cover';
                adminBtn.style.backgroundPosition = 'center';
                adminBtn.textContent = '';
            } else {
                adminBtn.textContent = displayName.charAt(0).toUpperCase();
                adminBtn.style.backgroundImage = 'none';
                adminBtn.style.color = 'white';
            }
        }

        // Also update Dropdown Avatar
        const dropdownAvatar = document.getElementById('dropdown-avatar');
        if (dropdownAvatar) {
            if (dp && dp !== 'undefined' && dp !== 'null') {
                dropdownAvatar.style.backgroundImage = `url(${dp})`;
                dropdownAvatar.style.backgroundSize = 'cover';
                dropdownAvatar.style.backgroundPosition = 'center';
                dropdownAvatar.textContent = '';
            } else {
                dropdownAvatar.textContent = displayName.charAt(0).toUpperCase();
                dropdownAvatar.style.backgroundImage = 'none';
                dropdownAvatar.style.color = 'white';
            }
        }
    }

    // Initial UI update from localStorage
    updateHeaderUI({});

    // Fetch latest profile from server
    apiFetch('/api/profile')
        .then(res => res.json())
        .then(user => {
            updateHeaderUI(user);
        })
        .catch(err => console.error('Error fetching profile:', err));

    // Profile Dropdown Toggle Logic
    const profileBtn = document.getElementById('admin-profile-btn');
    const profileDropdown = document.getElementById('admin-dropdown');

    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });

        // Close dropdown when clicking outside both the button and the dropdown
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.remove('active');
            }
        });
    }

    // Modal Registry
    const modals = {
        customer: document.getElementById('modal-customer'),
        editCustomer: document.getElementById('modal-edit-customer'),
        inventory: document.getElementById('modal-inventory'),
        editInventory: document.getElementById('modal-edit-inventory'),
        history: document.getElementById('modal-customer-history'),
        changePassword: document.getElementById('modal-change-password'),
        editProfile: document.getElementById('modal-edit-profile')
    };

    // Global Close Modal Logic
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            Object.values(modals).forEach(m => {
                if (m) m.classList.remove('active');
            });
        });
    });

    // Logout Handler
    const btnLogout = document.getElementById('btn-logout-main');
    if (btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            localStorage.clear();
            window.location.href = '/login.html';
        });
    }

    // Change Password Trigger Handler
    const btnChangePwd = document.getElementById('btn-change-password');
    if (btnChangePwd) {
        btnChangePwd.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Close dropdown
            if (profileDropdown) profileDropdown.classList.remove('active');

            // Reset and show modal
            const formChangePassword = document.getElementById('form-change-password');
            if (modals.changePassword && formChangePassword) {
                modals.changePassword.classList.add('active');
                formChangePassword.reset();
                const pwdError = document.getElementById('pwd-error');
                const pwdSuccess = document.getElementById('pwd-success');
                if (pwdError) pwdError.style.display = 'none';
                if (pwdSuccess) pwdSuccess.style.display = 'none';
            }
        });
    }

    // Hide settings / admin specific menus for staff
    if (role !== 'admin') {
        const settingsNavBtn = document.querySelector('.nav-btn[data-view="settings"]');
        if (settingsNavBtn) settingsNavBtn.style.display = 'none';

        // Also hide Change Password for non-admin for now (or let them use it if you want)
    }

    // Theme Toggle Logic
    const themeCheckbox = document.getElementById('theme-checkbox');

    // Check saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);

    // Set initial checkbox state
    if (themeCheckbox) {
        themeCheckbox.checked = (savedTheme === 'dark');
    }

    if (themeCheckbox) {
        themeCheckbox.addEventListener('change', () => {
            const newTheme = themeCheckbox.checked ? 'dark' : 'light';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });
    }

    // Initialize Lucide icons
    setTimeout(() => {
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }, 100);

    // View Navigation Logic
    const navButtons = document.querySelectorAll('.nav-btn');
    const navCards = document.querySelectorAll('.nav-card');
    const views = document.querySelectorAll('.view');
    const pageTitle = document.getElementById('page-title');

    navCards.forEach(card => {
        card.addEventListener('click', () => {
            const targetView = card.getAttribute('data-view');
            const navBtn = document.querySelector(`.nav-btn[data-view="${targetView}"]`);
            if (navBtn) navBtn.click();
        });
    });

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active class from all buttons and views
            navButtons.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));

            // Add active class to clicked button
            const clickedBtn = e.currentTarget;
            clickedBtn.classList.add('active');

            // Find target view and activate it
            const targetViewId = 'view-' + clickedBtn.getAttribute('data-view');
            const targetView = document.getElementById(targetViewId);

            if (targetView) {
                targetView.classList.add('active');

                // Update header title based on button text
                pageTitle.textContent = clickedBtn.textContent.trim();

                // Fetch dynamic data based on view
                const viewName = clickedBtn.getAttribute('data-view');
                if (viewName === 'dashboard') {
                    fetchDashboard();
                } else if (viewName === 'customers') {
                    fetchCustomers();
                } else if (viewName === 'inventory') {
                    fetchInventory();
                } else if (viewName === 'invoices') {
                    fetchInvoices();
                    loadInvoiceDropdowns();
                } else if (viewName === 'reports') {
                    fetchReports();
                } else if (viewName === 'settings') {
                    fetchSettings();
                }

                // Standardized Icon Refresh
                setTimeout(() => lucide.createIcons(), 50);
            }
        });
    });

    // --- Dynamic Fetch Functions ---
    window.appSettings = {
        company_name: "Ever Loops",
        address: "Doha, Qatar",
        phone: "",
        currency: "QAR",
        tax_rate: 5.0,
        invoice_prefix: "INV-"
    };

    function fetchSettings() {
        apiFetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data) {
                    window.appSettings = data;
                    // Populate UI
                    document.getElementById('set-company').value = data.company_name;
                    document.getElementById('set-address').value = data.address;
                    document.getElementById('set-phone').value = data.phone;
                    document.getElementById('set-currency').value = data.currency;
                    document.getElementById('set-tax').value = data.tax_rate;
                    document.getElementById('set-prefix').value = data.invoice_prefix;

                    // Populate Invoice Preview
                    const previewName = document.getElementById('preview-company-name');
                    if (previewName) {
                        previewName.textContent = data.company_name;
                        document.getElementById('preview-company-address').textContent = data.address.replace(/\\n/g, ', ');
                        document.getElementById('preview-company-phone').textContent = data.phone;

                        const previewLogo = document.getElementById('preview-logo');
                        if (data.company_logo && previewLogo) {
                            previewLogo.src = data.company_logo;
                            previewLogo.style.display = 'inline-block';
                        }
                    }

                    // Populate Sidebar Logo
                    const sidebarLogo = document.getElementById('sidebar-logo');
                    const sidebarIcon = document.getElementById('sidebar-logo-icon');
                    if (data.company_logo && sidebarLogo) {
                        sidebarLogo.src = data.company_logo;
                        sidebarLogo.style.display = 'block';
                        if (sidebarIcon) sidebarIcon.style.display = 'none';
                    }
                }
            })
            .catch(console.error);
    }

    function fetchDashboard() {
        // Set today's date
        const dateDash = document.getElementById('current-date-dash');
        if (dateDash) dateDash.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        apiFetch('/api/stats')
            .then(res => res.json())
            .then(data => {
                const currency = window.appSettings?.currency || 'QAR';

                // Stat cards
                document.getElementById('stat-daily-revenue').textContent = currency + ' ' + (data.dailyRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
                document.getElementById('stat-total-revenue').textContent = currency + ' ' + (data.totalRevenue || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
                document.getElementById('stat-invoices-sent').textContent = data.invoicesSent || 0;
                document.getElementById('stat-pending-payments').textContent = currency + ' ' + (data.pendingPayments || 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
                const custEl = document.getElementById('stat-active-customers');
                if (custEl) custEl.textContent = data.activeCustomers || 0;
                const invCountEl = document.getElementById('stat-inventory-count');
                if (invCountEl) invCountEl.textContent = data.inventoryCount || 0;

                // Recent invoices
                const recentTbody = document.getElementById('dash-recent-invoices');
                if (recentTbody) {
                    if (!data.recentInvoices || data.recentInvoices.length === 0) {
                        recentTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No invoices yet — create your first one!</td></tr>';
                    } else {
                        recentTbody.innerHTML = '';
                        data.recentInvoices.forEach(inv => {
                            const statusClass = (inv.status || 'pending').toLowerCase();
                            recentTbody.innerHTML += `
                                <tr>
                                    <td style="font-weight:500;">#${inv.invoice_number}</td>
                                    <td>${inv.customer_name || 'Unknown'}</td>
                                    <td style="font-weight:600;">${currency} ${parseFloat(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                    <td><span class="status-badge ${statusClass}">${inv.status}</span></td>
                                    <td><button class="btn-text" style="font-size:0.8rem;padding:0.2rem 0.4rem;" onclick="viewInvoice(${inv.id})"><i data-lucide="eye"></i></button></td>
                                </tr>
                            `;
                        });
                        lucide.createIcons();
                    }
                }

                // Top selling
                const topBody = document.querySelector('#dash-top-selling tbody');
                if (topBody) {
                    if (!data.topProducts || data.topProducts.length === 0) {
                        topBody.innerHTML = '<tr><td colspan="2" style="text-align:center;color:var(--text-muted);">No sales data yet</td></tr>';
                    } else {
                        topBody.innerHTML = '';
                        data.topProducts.forEach(p => {
                            topBody.innerHTML += `<tr><td>${p.name}</td><td style="font-weight:600;">${p.sold_count} units</td></tr>`;
                        });
                    }
                }

                // Low stock alerts
                const lowStockEl = document.getElementById('dash-low-stock');
                if (lowStockEl) {
                    if (!data.lowStock || data.lowStock.length === 0) {
                        lowStockEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.85rem;padding:1rem 0;">All stock levels OK ✓</p>';
                    } else {
                        lowStockEl.innerHTML = data.lowStock.map(item => `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border-color);">
                                <span style="font-size:0.85rem;">${item.name}</span>
                                <span class="status-badge ${item.stock === 0 ? 'overdue' : 'pending'}" style="font-size:0.75rem;">${item.stock === 0 ? 'Out of Stock' : 'Stock left: ' + item.stock}</span>
                            </div>
                        `).join('');
                    }
                }
            })
            .catch(console.error);
    }

    // Customer Search Listener
    const custSearch = document.getElementById('cust-search');
    if (custSearch) {
        custSearch.addEventListener('input', (e) => {
            fetchCustomers(e.target.value);
        });
    }

    // Reports Period Listener
    const reportPeriodSelect = document.getElementById('report-period');
    if (reportPeriodSelect) {
        reportPeriodSelect.addEventListener('change', (e) => {
            fetchReports(e.target.value);
        });
    }

    let salesChartInstance = null;
    let productsChartInstance = null;

    function fetchReports(period = 'monthly') {
        const salesChartEl = document.getElementById('salesChart');
        if (!salesChartEl) return;

        apiFetch(`/api/reports?period=${period}`)
            .then(res => res.json())
            .then(data => {
                const salesCtx = salesChartEl.getContext('2d');
                const productsCtx = document.getElementById('productsChart').getContext('2d');

                if (salesChartInstance) salesChartInstance.destroy();
                if (productsChartInstance) productsChartInstance.destroy();

                // Gradient for Sales Chart
                const salesGradient = salesCtx.createLinearGradient(0, 0, 0, 400);
                salesGradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
                salesGradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');

                const periodCapitalized = period.charAt(0).toUpperCase() + period.slice(1);

                salesChartInstance = new Chart(salesCtx, {
                    type: 'line',
                    data: {
                        labels: data.sales.map(s => {
                            // Format labels like "2023-10" to something nicer if possible
                            if (period === 'monthly') {
                                const [year, month] = s.label.split('-');
                                const date = new Date(year, month - 1);
                                return date.toLocaleString('default', { month: 'short', year: '2-digit' });
                            }
                            return s.label;
                        }),
                        datasets: [{
                            label: `${periodCapitalized} Revenue`,
                            data: data.sales.map(s => s.revenue),
                            borderColor: '#d4af37',
                            borderWidth: 3,
                            backgroundColor: salesGradient,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#d4af37',
                            pointBorderColor: '#fff',
                            pointHoverRadius: 6,
                            pointRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(30, 41, 59, 0.9)',
                                titleFont: { size: 14, weight: 'bold' },
                                padding: 12,
                                cornerRadius: 8,
                                displayColors: false,
                                callbacks: {
                                    label: function (context) {
                                        return 'QAR ' + context.parsed.y.toLocaleString();
                                    }
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(148, 163, 184, 0.1)' },
                                ticks: {
                                    callback: value => 'QAR ' + value.toLocaleString(),
                                    color: '#94a3b8'
                                }
                            },
                            x: {
                                grid: { display: false },
                                ticks: { color: '#94a3b8' }
                            }
                        }
                    }
                });

                // Gradient for Products Chart
                const productGradient = productsCtx.createLinearGradient(0, 0, 400, 0);
                productGradient.addColorStop(0, '#6366f1');
                productGradient.addColorStop(1, '#a855f7');

                productsChartInstance = new Chart(productsCtx, {
                    type: 'bar',
                    data: {
                        labels: data.products.map(p => p.name),
                        datasets: [{
                            label: 'Units Sold',
                            data: data.products.map(p => p.sold_count),
                            backgroundColor: productGradient,
                            borderRadius: 6,
                            barThickness: 20
                        }]
                    },
                    options: {
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(30, 41, 59, 0.9)',
                                padding: 12,
                                cornerRadius: 8
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: 'rgba(148, 163, 184, 0.1)' },
                                ticks: { color: '#94a3b8' }
                            },
                            y: {
                                grid: { display: false },
                                ticks: { color: '#94a3b8' }
                            }
                        }
                    }
                });

                // Populate Top Selling Table
                const tableBody = document.querySelector('#top-selling-table tbody');
                if (tableBody && data.products) {
                    tableBody.innerHTML = '';
                    if (data.products.length === 0) {
                        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No sales data for this period yet</td></tr>';
                    } else {
                        data.products.forEach(p => {
                            // Use units sold, and if we had price we'd use it, for now units is the key stat
                            tableBody.innerHTML += `
                                <tr>
                                    <td style="font-weight:600;">${p.name}</td>
                                    <td>${p.sold_count} Units</td>
                                    <td>-</td>
                                    <td><span class="status-badge paid" style="background:rgba(16, 185, 129, 0.1); color:#10b981;">Active</span></td>
                                </tr>
                            `;
                        });
                    }
                    lucide.createIcons(); // Refresh icons for the table
                }
            })
            .catch(console.error);
    }

    function fetchCustomers(searchTerm = '') {
        const tbody = document.querySelector('#view-customers tbody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading customers...</td></tr>';
        const url = searchTerm ? `/api/customers?search=${encodeURIComponent(searchTerm)}` : '/api/customers';
        apiFetch(url)
            .then(res => res.json())
            .then(data => {
                tbody.innerHTML = '';
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No customers found.</td></tr>';
                    return;
                }
                data.forEach(customer => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${customer.name}</td>
                        <td>${customer.email || '-'}</td>
                        <td>${customer.phone || '-'}</td>
                        <td>${customer.address || '-'}</td>
                        <td style="font-weight:600; color:var(--primary);">QAR ${(customer.total_spent || 0).toLocaleString()}</td>
                        <td style="display:flex; gap:0.5rem;">
                            <button class="btn-text" onclick='editCustomer(${JSON.stringify(customer).replace(/"/g, "&quot;").replace(/'/g, "&#39;")})'>Edit</button>
                            <button class="btn-text" style="color:var(--secondary);" onclick="viewCustomerHistory(${customer.id}, '${customer.name.replace(/'/g, "\\'")}')">History</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            })
            .catch(err => {
                console.error('Error fetching customers:', err);
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--danger);">Error loading data. Is the backend running?</td></tr>';
            });
    }

    // Expose editCustomer to window so onClick works
    window.editCustomer = function (customer) {
        document.getElementById('edit-cust-id').value = customer.id;
        document.getElementById('edit-cust-name').value = customer.name;
        document.getElementById('edit-cust-email').value = customer.email || '';
        document.getElementById('edit-cust-phone').value = customer.phone || '';
        document.getElementById('edit-cust-address').value = customer.address || '';
        modals.editCustomer.classList.add('active');
    };

    window.viewCustomerHistory = function (id, name) {
        document.getElementById('hist-cust-name-title').textContent = `Purchase History: ${name}`;
        document.getElementById('hist-cust-info').textContent = `Customer ID: #${id}`;

        const tbody = document.getElementById('customer-history-tbody');
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading history...</td></tr>';

        modals.history.classList.add('active');

        apiFetch(`/api/customers/${id}/history`)
            .then(res => res.json())
            .then(data => {
                tbody.innerHTML = '';
                if (data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No purchase history found.</td></tr>';
                    return;
                }
                data.forEach(inv => {
                    const date = new Date(inv.created_at).toLocaleDateString();
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>#${inv.invoice_number}</td>
                        <td>${date}</td>
                        <td>${inv.payment_method}</td>
                        <td><span class="status-badge ${inv.status.toLowerCase()}">${inv.status}</span></td>
                        <td style="font-weight:600;">QAR ${inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td style="text-align:center;">
                            <button class="btn-text" onclick="viewInvoice(${inv.id})" title="View Invoice" style="gap:0.3rem; margin:auto;">
                                <i data-lucide="eye"></i> View
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            })
            .catch(err => {
                console.error(err);
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--danger);">Error loading history.</td></tr>';
            });
    };

    function fetchInventory() {
        const grid = document.querySelector('.inventory-grid');
        if (!grid) return;

        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2rem;">Loading inventory...</div>';

        apiFetch('/api/inventory')
            .then(res => res.json())
            .then(data => {
                grid.innerHTML = '';
                if (data.length === 0) {
                    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2rem;">No inventory found.</div>';
                    return;
                }
                data.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'inventory-card';
                    card.style.border = '1px solid var(--border-color)';
                    card.style.borderRadius = '4px';
                    card.style.background = 'var(--bg-main)';

                    const stockClass = item.stock < 5 ? 'low' : 'good';
                    const safeItemStr = JSON.stringify(item).replace(/"/g, "&quot;").replace(/'/g, "&#39;");

                    let bgStyle = '';
                    let patternClass = item.image_pattern;
                    if (item.image_pattern && (item.image_pattern.startsWith('/uploads') || item.image_pattern.startsWith('/collections'))) {
                        patternClass = '';
                        bgStyle = `style="background-image: url('${item.image_pattern}'); background-size: cover; background-position: center;"`;
                    }

                    card.innerHTML = `
                        <div class="inv-img ${patternClass}" ${bgStyle}></div>
                        <div class="inv-details" style="padding: 1rem 1.25rem;">
                            <div class="inv-head" style="margin-bottom: 0.75rem;">
                                <h4 style="font-size: 1.15rem; margin:0; line-height: 1.3;">${item.name}</h4>
                                <span class="stock ${stockClass}" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; display: inline-block; margin-top:0.4rem;">
                                    ${item.stock > 0 ? `Stock: ${item.stock}` : 'Out of Stock'}
                                </span>
                            </div>
                            
                            <div class="inv-specs" style="display:flex; flex-direction:column; gap:0.35rem; margin-bottom: 1rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                                <p style="margin:0; font-size: 0.8rem; color: var(--text-main); font-weight: 500;">
                                    SKU: <span style="font-weight: 400; color: var(--text-muted);">${item.sku}</span>
                                </p>
                                <p style="margin:0; font-size: 0.8rem; color: var(--text-main); font-weight: 500;">
                                    Type: <span style="font-weight: 400; color: var(--text-muted);">${item.type || '-'}</span>
                                </p>
                                <p style="margin:0; font-size: 0.8rem; color: var(--text-main); font-weight: 500;">
                                    Dim: <span style="font-weight: 400; color: var(--text-muted);">${item.dimensions || '-'}</span>
                                </p>
                            </div>

                            <p style="margin:0 0 1rem 0; font-size: 0.75rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 2.1rem;">
                                ${item.description || 'No description available.'}
                            </p>

                            <div class="inv-price-footer" style="display:flex; justify-content: space-between; align-items: center; margin-top: auto; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                                <h3 style="font-size: 1.35rem; color: var(--primary); margin:0;">${item.price > 0 ? `QAR ${item.price.toLocaleString()}` : 'Custom'}</h3>
                                <div style="display:flex; gap: 0.5rem;">
                                    <button type="button" class="btn-icon" title="Edit" onclick='editInventoryItem(${safeItemStr})'>
                                        <i data-lucide="edit"></i>
                                    </button>
                                    <button type="button" class="btn-icon danger" title="Delete" onclick="deleteInventoryItem(${item.id})">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                    grid.appendChild(card);
                });
                lucide.createIcons();
            })
            .catch(err => {
                console.error('Error fetching inventory:', err);
                grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:2rem; color:var(--danger);">Error loading data. Is the backend running?</div>';
            });
    }

    // Expose delete to window so onClick works
    window.deleteInventoryItem = function (id) {
        if (!confirm('Are you sure you want to delete this carpet from inventory?')) return;

        apiFetch(`/api/inventory/${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                fetchInventory(); // Refresh the grid
            })
            .catch(err => alert('Failed to delete item'));
    };

    window.editInventoryItem = function (item) {
        document.getElementById('edit-inv-id').value = item.id;
        document.getElementById('edit-inv-name').value = item.name;
        document.getElementById('edit-inv-sku').value = item.sku;
        document.getElementById('edit-inv-type').value = item.type || '';
        document.getElementById('edit-inv-material').value = item.material || '';
        document.getElementById('edit-inv-desc').value = item.description || '';
        document.getElementById('edit-inv-dim').value = item.dimensions || '';
        document.getElementById('edit-inv-price').value = item.price;
        document.getElementById('edit-inv-stock').value = item.stock;

        // If it's a built-in pattern, pre-select it
        if (item.image_pattern && item.image_pattern.startsWith('bg-pattern-')) {
            document.getElementById('edit-inv-pattern').value = item.image_pattern;
        }

        modals.editInventory.classList.add('active');
    };

    // Open Modal buttons in views
    const customerAddBtn = document.querySelector('#view-customers .btn-primary');
    if (customerAddBtn) {
        customerAddBtn.addEventListener('click', () => {
            if (modals.customer) modals.customer.classList.add('active');
        });
    }
    const btnAddInv = document.getElementById('btn-add-inventory');
    if (btnAddInv) {
        btnAddInv.addEventListener('click', () => {
            if (modals.inventory) modals.inventory.classList.add('active');
        });
    }

    // Top Header Action Button
    const headerActionBtn = document.getElementById('header-action-btn');
    if (headerActionBtn) {
        headerActionBtn.addEventListener('click', () => {
            const invoiceNavBtn = document.querySelector('.nav-btn[data-view="invoices"]');
            if (invoiceNavBtn) invoiceNavBtn.click();
        });
    }

    // Form Submissions
    document.getElementById('btn-generate-invoice').addEventListener('click', (e) => {
        const customerId = document.getElementById('inv-customer-id').value;
        if (!customerId || invoiceItems.length === 0) {
            alert('Please select a customer and add at least one item.');
            return;
        }

        const btn = e.currentTarget;
        const origText = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Generating...';
        btn.disabled = true;

        const totalAmount = parseFloat(btn.dataset.total || 0);
        const subtotal = parseFloat(btn.dataset.subtotal || 0);
        const tax = parseFloat(btn.dataset.tax || 0);
        const discount = parseFloat(document.getElementById('inv-discount').value || 0);
        const paymentMethod = document.getElementById('inv-payment-method').value;
        const status = document.getElementById('inv-status').value;

        const invoiceData = {
            customer_id: customerId,
            total_amount: totalAmount,
            discount: discount,
            payment_method: paymentMethod,
            status: status,
            items: invoiceItems.map(item => ({
                id: item.id,
                qty: item.qty,
                price: item.price
            }))
        };

        apiFetch('/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invoiceData)
        })
            .then(res => res.json())
            .then(data => {
                const customerName = document.getElementById('inv-customer-search').value;

                const pdfData = {
                    customerName: customerName,
                    invoiceNumber: data.invoice_number,
                    items: invoiceItems,
                    subtotal: subtotal,
                    tax: tax,
                    grandTotal: totalAmount,
                    discount: discount,
                    paymentMethod: paymentMethod,
                    status: status
                };

                return apiFetch('/api/invoices/pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pdfData)
                })
                    .then(res => {
                        if (!res.ok) throw new Error('Invoice saved but PDF generation failed.');
                        return res.blob();
                    })
                    .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.style.display = 'none';
                        a.href = url;
                        a.download = `${data.invoice_number}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);

                        // Reset invoice builder
                        invoiceItems = [];
                        renderInvoiceItems();
                        document.getElementById('inv-customer-search').value = '';
                        document.getElementById('inv-customer-id').value = '';
                        document.getElementById('inv-item-search').value = '';
                        document.getElementById('inv-discount').value = 0;

                        // Refresh stats if on dashboard
                        if (typeof fetchDashboard === 'function') fetchDashboard();
                    });
            })
            .catch(err => {
                console.error(err);
                alert('Error generating invoice or PDF');
            })
            .finally(() => {
                btn.innerHTML = origText;
                btn.disabled = false;
            });
    });

    document.getElementById('form-add-customer').addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const customerData = {
            name: document.getElementById('cust-name').value,
            email: document.getElementById('cust-email').value,
            phone: document.getElementById('cust-phone').value,
            address: document.getElementById('cust-address').value
        };

        apiFetch('/api/customers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customerData)
        })
            .then(res => res.json())
            .then(data => {
                modals.customer.classList.remove('active');
                e.target.reset();
                fetchCustomers(); // Refresh list
            })
            .catch(err => console.error(err))
            .finally(() => {
                btn.textContent = origText;
                btn.disabled = false;
            });
    });

    document.getElementById('form-edit-customer')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const customerId = document.getElementById('edit-cust-id').value;
        const customerData = {
            name: document.getElementById('edit-cust-name').value,
            email: document.getElementById('edit-cust-email').value,
            phone: document.getElementById('edit-cust-phone').value,
            address: document.getElementById('edit-cust-address').value
        };

        apiFetch(`/api/customers/${customerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(customerData)
        })
            .then(res => res.json())
            .then(data => {
                modals.editCustomer.classList.remove('active');
                e.target.reset();
                fetchCustomers(); // Refresh list
            })
            .catch(err => console.error(err))
            .finally(() => {
                btn.textContent = origText;
                btn.disabled = false;
            });
    });

    document.getElementById('form-add-inventory').addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('name', document.getElementById('inv-name').value);
        formData.append('sku', document.getElementById('inv-sku').value);
        formData.append('type', document.getElementById('inv-type').value);
        formData.append('material', document.getElementById('inv-material').value);
        formData.append('description', document.getElementById('inv-desc').value);
        formData.append('dimensions', document.getElementById('inv-dim').value);
        formData.append('price', document.getElementById('inv-price').value);
        formData.append('stock', document.getElementById('inv-stock').value);
        formData.append('image_pattern', document.getElementById('inv-pattern').value);

        const imageFile = document.getElementById('inv-image').files[0];
        if (imageFile) {
            formData.append('image', imageFile);
        }

        apiFetch('/api/inventory', {
            method: 'POST',
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                modals.inventory.classList.remove('active');
                e.target.reset();
                fetchInventory(); // Refresh list
            })
            .catch(err => alert('Error saving inventory'))
            .finally(() => {
                btn.textContent = origText;
                btn.disabled = false;
            });
    });

    document.getElementById('form-edit-inventory')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const origText = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;

        const inventoryId = document.getElementById('edit-inv-id').value;
        const formData = new FormData();
        formData.append('name', document.getElementById('edit-inv-name').value);
        formData.append('sku', document.getElementById('edit-inv-sku').value);
        formData.append('type', document.getElementById('edit-inv-type').value);
        formData.append('material', document.getElementById('edit-inv-material').value);
        formData.append('description', document.getElementById('edit-inv-desc').value);
        formData.append('dimensions', document.getElementById('edit-inv-dim').value);
        formData.append('price', document.getElementById('edit-inv-price').value);
        formData.append('stock', document.getElementById('edit-inv-stock').value);
        formData.append('image_pattern', document.getElementById('edit-inv-pattern').value);

        const imageFile = document.getElementById('edit-inv-image').files[0];
        if (imageFile) {
            formData.append('image', imageFile);
        }

        apiFetch(`/api/inventory/${inventoryId}`, {
            method: 'PUT',
            body: formData
        })
            .then(res => res.json())
            .then(data => {
                modals.editInventory.classList.remove('active');
                e.target.reset();
                fetchInventory(); // Refresh list
            })
            .catch(err => alert('Error updating inventory'))
            .finally(() => {
                btn.textContent = origText;
                btn.disabled = false;
            });
    });

    // --- Invoice Builder Logic ---
    let invoiceItems = [];

    // Preview button handler
    const btnPreviewInvoice = document.getElementById('btn-preview-invoice');
    if (btnPreviewInvoice) {
        btnPreviewInvoice.addEventListener('click', () => {
            const currency = window.appSettings?.currency || 'QAR';
            const taxRate = window.appSettings?.tax_rate || 5;
            const customerName = document.getElementById('inv-customer-search')?.value || 'No customer selected';
            const discount = parseFloat(document.getElementById('inv-discount')?.value || 0);
            const paymentMethod = document.getElementById('inv-payment-method')?.value || 'Cash';
            const status = document.getElementById('inv-status')?.value || 'Pending';

            // Populate company info from settings
            document.getElementById('prv-company-name').textContent = window.appSettings?.company_name || 'Ever Loops Carpets';
            document.getElementById('prv-company-address').textContent = (window.appSettings?.address || 'Doha, Qatar').replace(/\\n/g, ', ');
            document.getElementById('prv-company-phone').textContent = window.appSettings?.phone || '';
            document.getElementById('prv-date').textContent = new Date().toLocaleDateString('en-GB');
            document.getElementById('prv-status').textContent = status;
            document.getElementById('prv-payment').textContent = paymentMethod;
            document.getElementById('prv-customer').textContent = customerName;

            // Items table
            const itemsTbody = document.getElementById('prv-items');
            itemsTbody.innerHTML = '';
            let subtotal = 0;

            if (invoiceItems.length === 0) {
                itemsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:1rem; color:#94a3b8; font-style:italic;">No items added yet</td></tr>';
            } else {
                invoiceItems.forEach((item, idx) => {
                    const lineTotal = item.price * item.qty;
                    subtotal += lineTotal;
                    const bg = idx % 2 === 0 ? '#fff' : '#f8fafc';
                    itemsTbody.innerHTML += `
                        <tr style="background:${bg};">
                            <td style="padding:0.6rem 1rem; font-size:0.9rem; color:#1e293b; border-bottom:1px solid #f1f5f9;">${item.name}</td>
                            <td style="padding:0.6rem; text-align:center; font-size:0.9rem; color:#64748b; border-bottom:1px solid #f1f5f9;">${item.qty}</td>
                            <td style="padding:0.6rem; text-align:right; font-size:0.9rem; color:#64748b; border-bottom:1px solid #f1f5f9;">${currency} ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td style="padding:0.6rem 1rem; text-align:right; font-size:0.9rem; font-weight:600; color:#1e293b; border-bottom:1px solid #f1f5f9;">${currency} ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                });
            }

            // Totals
            const tax = (subtotal - discount) * (taxRate / 100);
            const grandTotal = subtotal - discount + tax;

            document.getElementById('prv-subtotal').textContent = `${currency} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            document.getElementById('prv-discount').textContent = `- ${currency} ${discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            document.getElementById('prv-discount-row').style.display = discount > 0 ? 'flex' : 'none';
            document.getElementById('prv-tax-label').textContent = `Tax (${taxRate}%)`;
            document.getElementById('prv-tax').textContent = `${currency} ${tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            document.getElementById('prv-total').textContent = `${currency} ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

            // Status color
            const statusColors = { Paid: '#10b981', Pending: '#f59e0b', Overdue: '#ef4444' };
            document.getElementById('prv-status').style.color = statusColors[status] || '#64748b';

            document.getElementById('modal-invoice-preview').classList.add('active');
            lucide.createIcons();
        });
    }

    function renderInvoiceItems() {
        const container = document.getElementById('invoice-items-container');
        // Clear previous content
        container.innerHTML = '';

        if (invoiceItems.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2.5rem; color: var(--text-muted); background: var(--bg-main); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
                    <i data-lucide="shopping-cart" style="font-size: 1.5rem; margin-bottom: 0.75rem; opacity: 0.5;"></i>
                    <p style="font-size: 0.85rem;">No items added yet. Search above to get started.</p>
                </div>
            `;
            updateInvoiceTotals(0);
            lucide.createIcons();
            return;
        }

        let subtotal = 0;

        invoiceItems.forEach((item, index) => {
            const lineTotal = item.price * item.qty;
            subtotal += lineTotal;
            const div = document.createElement('div');
            div.className = 'inv-line-item';
            div.innerHTML = `
                <div>
                    <div style="font-weight: 600; color: var(--text-main); font-size: 0.95rem;">${item.name}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${item.sku || 'No SKU'}</div>
                </div>
                <div style="text-align: center; font-weight: 500; font-size: 0.9rem;">x${item.qty}</div>
                <div style="text-align: right; font-weight: 600; font-size: 0.95rem;">QAR ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <button type="button" class="icon-btn" onclick="window.removeInvoiceItem(${index})" style="color: var(--danger); background: transparent; border: none; padding: 0;">
                    <i data-lucide="trash-2" style="font-size: 1rem;"></i>
                </button>
            `;
            container.appendChild(div);
        });

        updateInvoiceTotals(subtotal);
        lucide.createIcons();
    }

    function updateInvoiceTotals(subtotal) {
        const discount = parseFloat(document.getElementById('inv-discount').value || 0);
        const currentTaxRate = parseFloat(window.appSettings.tax_rate || 0) / 100;
        const discountedSubtotal = Math.max(0, subtotal - discount);
        const tax = discountedSubtotal * currentTaxRate;
        const grandTotal = discountedSubtotal + tax;
        const currency = window.appSettings.currency || 'QAR';

        document.getElementById('inv-tax-label').textContent = `Tax (${window.appSettings.tax_rate}%)`;
        document.getElementById('inv-subtotal').textContent = `${currency} ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('inv-discount-display').textContent = `- ${currency} ${discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('inv-tax').textContent = `${currency} ${tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('inv-grand-total').textContent = `${currency} ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Save raw totals for submission
        const submitBtn = document.getElementById('btn-generate-invoice');
        if (submitBtn) {
            submitBtn.dataset.total = grandTotal;
            submitBtn.dataset.subtotal = subtotal;
            submitBtn.dataset.tax = tax;
        }
    }


    document.getElementById('inv-discount')?.addEventListener('input', renderInvoiceItems);

    window.removeInvoiceItem = function (index) {
        invoiceItems.splice(index, 1);
        renderInvoiceItems();
    };

    let allCustomers = [];
    let allInventory = [];
    let allInvoicesList = [];

    function loadInvoiceDropdowns() {
        apiFetch('/api/customers')
            .then(res => res.json())
            .then(data => {
                allCustomers = data;
            });

        apiFetch('/api/inventory')
            .then(res => res.json())
            .then(data => {
                allInventory = data;
            });
    }

    function fetchInvoices() {
        const tbody = document.querySelector('#invoices-list-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading invoices...</td></tr>';

        apiFetch('/api/invoices')
            .then(res => res.json())
            .then(data => {
                allInvoicesList = data;
                renderInvoicesList(data);
            })
            .catch(err => {
                console.error('Error fetching invoices:', err);
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--danger);">Error loading data.</td></tr>';
            });
    }

    function renderInvoicesList(invoices) {
        const tbody = document.querySelector('#invoices-list-table tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No invoices found.</td></tr>';
            return;
        }

        invoices.forEach(inv => {
            const date = new Date(inv.created_at).toLocaleDateString();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 500;">#${inv.invoice_number}</td>
                <td class="text-muted">${date}</td>
                <td>${inv.customer_name || 'Unknown'}</td>
                <td style="font-weight:600;">${window.appSettings?.currency || 'QAR'} ${inv.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td><span class="status-badge ${inv.status.toLowerCase()}">${inv.status}</span></td>
                <td style="text-align:center;">
                    <button class="btn-text" onclick="viewInvoice(${inv.id})" title="View Invoice" style="gap:0.3rem; margin:auto;">
                        <i data-lucide="file-text"></i> PDF
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        lucide.createIcons();
    }

    // View invoice details in modal
    window.viewInvoice = function (id) {
        const modal = document.getElementById('modal-view-invoice');
        const itemsTbody = document.getElementById('view-inv-items');
        itemsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>';
        modal.classList.add('active');

        apiFetch(`/api/invoices/${id}`)
            .then(res => res.json())
            .then(inv => {
                const currency = window.appSettings?.currency || 'QAR';
                document.getElementById('view-inv-number').textContent = `#${inv.invoice_number}`;
                document.getElementById('view-inv-meta').textContent = `${new Date(inv.created_at).toLocaleDateString()} • ${inv.payment_method}`;
                document.getElementById('view-inv-customer').textContent = inv.customer_name || 'Unknown';
                document.getElementById('view-inv-status').innerHTML = `<span class="status-badge ${inv.status.toLowerCase()}">${inv.status}</span>`;
                document.getElementById('view-inv-discount').textContent = `${currency} ${parseFloat(inv.discount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                document.getElementById('view-inv-total').textContent = `${currency} ${parseFloat(inv.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

                // Render items
                itemsTbody.innerHTML = '';
                if (inv.items && inv.items.length > 0) {
                    inv.items.forEach(item => {
                        const lineTotal = item.price * item.quantity;
                        const tr = document.createElement('tr');
                        tr.innerHTML = `
                            <td>${item.product_name}</td>
                            <td style="text-align:center;">${item.quantity}</td>
                            <td style="text-align:right;">${currency} ${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td style="text-align:right; font-weight:600;">${currency} ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        `;
                        itemsTbody.appendChild(tr);
                    });
                } else {
                    itemsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No items found.</td></tr>';
                }
                lucide.createIcons();

                // Wire download button
                const dlBtn = document.getElementById('view-inv-download-btn');
                dlBtn.onclick = () => {
                    dlBtn.disabled = true;
                    const origContent = dlBtn.innerHTML;
                    dlBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Downloading...';

                    apiFetch(`/api/invoices/${id}/pdf`)
                        .then(res => {
                            if (!res.ok) throw new Error('Failed to download PDF');
                            return res.blob();
                        })
                        .then(blob => {
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.style.display = 'none';
                            a.href = url;
                            a.download = `${inv.invoice_number}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            window.URL.revokeObjectURL(url);
                            dlBtn.disabled = false;
                            dlBtn.innerHTML = origContent;
                        })
                        .catch(err => {
                            console.error(err);
                            alert('Could not download PDF. Please try again.');
                            dlBtn.disabled = false;
                            dlBtn.innerHTML = origContent;
                        });
                };
            })
            .catch(err => {
                itemsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--danger);">Error loading invoice.</td></tr>';
            });
    };

    // Toggle Invoice Builder
    const btnToggleBuilder = document.getElementById('btn-toggle-invoice-builder');
    const invoiceListContainer = document.getElementById('invoice-list-container');
    const invoiceBuilderContainer = document.getElementById('invoice-builder-container');

    if (btnToggleBuilder) {
        btnToggleBuilder.addEventListener('click', () => {
            if (invoiceBuilderContainer.style.display === 'none' || invoiceBuilderContainer.style.display === '') {
                invoiceBuilderContainer.style.display = 'block';
                invoiceListContainer.style.display = 'none';
                btnToggleBuilder.innerHTML = '<i data-lucide="arrow-left"></i> Back to Invoices';
            } else {
                invoiceBuilderContainer.style.display = 'none';
                invoiceListContainer.style.display = 'block';
                btnToggleBuilder.innerHTML = '<i data-lucide="plus"></i> Create New Invoice';
                fetchInvoices(); // Refresh the list when going back
            }
        });
    }

    // Search Invoices
    const invoiceSearchInput = document.getElementById('invoice-search');
    if (invoiceSearchInput) {
        invoiceSearchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) {
                renderInvoicesList(allInvoicesList);
                return;
            }
            const filtered = allInvoicesList.filter(inv =>
                (inv.invoice_number && inv.invoice_number.toLowerCase().includes(val)) ||
                (inv.customer_name && inv.customer_name.toLowerCase().includes(val))
            );
            renderInvoicesList(filtered);
        });
    }

    // Searchable Customer Selection
    const invCustSearch = document.getElementById('inv-customer-search');
    const custDropdown = document.getElementById('inv-customer-dropdown');
    const custIdInput = document.getElementById('inv-customer-id');

    if (invCustSearch) {
        invCustSearch.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) {
                custDropdown.classList.remove('active');
                return;
            }

            const filtered = allCustomers.filter(c => c.name.toLowerCase().includes(val));
            if (filtered.length > 0) {
                custDropdown.innerHTML = filtered.map(c => `
                    <div class="search-item" onclick="selectSearchCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}')">
                        <span class="item-main">${c.name}</span>
                        <span class="item-sub">${c.email || ''}</span>
                    </div>
                `).join('');
                custDropdown.classList.add('active');
            } else {
                custDropdown.classList.remove('active');
            }
        });

        document.addEventListener('click', (e) => {
            if (!invCustSearch.contains(e.target) && !custDropdown.contains(e.target)) {
                custDropdown.classList.remove('active');
            }
        });
    }

    window.selectSearchCustomer = function (id, name) {
        invCustSearch.value = name;
        custIdInput.value = id;
        custDropdown.classList.remove('active');

        const billedToName = document.getElementById('billed-to-name');
        if (billedToName) {
            billedToName.textContent = name;
        }
    };

    // Searchable Item Selection
    const invItemSearch = document.getElementById('inv-item-search');
    const itemDropdown = document.getElementById('inv-item-dropdown');
    const itemQty = document.getElementById('inv-item-qty');

    if (invItemSearch) {
        invItemSearch.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) {
                itemDropdown.classList.remove('active');
                return;
            }

            const filtered = allInventory.filter(i =>
                i.name.toLowerCase().includes(val) ||
                (i.sku && i.sku.toLowerCase().includes(val))
            );

            if (filtered.length > 0) {
                itemDropdown.innerHTML = filtered.map(i => {
                    const currency = window.appSettings?.currency || 'QAR';
                    return `
                        <div class="search-item" onclick="selectSearchItem(${i.id}, '${i.name.replace(/'/g, "\\'")}', ${i.price})">
                            <div class="item-info">
                                <span class="item-main">${i.name}</span><br>
                                <span class="item-sub">SKU: ${i.sku || 'N/A'} • Stock left: ${i.stock}</span>
                            </div>
                            <span class="item-price">${currency} ${i.price.toLocaleString()}</span>
                        </div>
                    `;
                }).join('');
                itemDropdown.classList.add('active');
            } else {
                itemDropdown.classList.remove('active');
            }
        });

        document.addEventListener('click', (e) => {
            if (!invItemSearch.contains(e.target) && !itemDropdown.contains(e.target)) {
                itemDropdown.classList.remove('active');
            }
        });
    }

    window.selectSearchItem = function (id, name, price) {
        const qty = parseInt(itemQty.value) || 1;
        const existing = invoiceItems.find(item => item.id == id);

        if (existing) {
            existing.qty += qty;
        } else {
            invoiceItems.push({ id, name, price, qty });
        }

        renderInvoiceItems();
        invItemSearch.value = '';
        itemQty.value = 1;
        itemDropdown.classList.remove('active');
    };


    // Notifications Logic
    const bellBtn = document.getElementById('bell-btn');
    const notifDropdown = document.getElementById('notification-dropdown');
    const notifClose = document.getElementById('notif-close');
    const notifBody = document.getElementById('notif-body');
    const notifBadge = document.getElementById('notification-badge');

    function fetchNotifications() {
        apiFetch('/api/notifications')
            .then(res => res.json())
            .then(data => {
                let notifsHTML = '';
                let count = 0;

                if (data.lowStock && data.lowStock.length > 0) {
                    data.lowStock.forEach(item => {
                        notifsHTML += `
                            <div class="notif-item">
                                <div class="notif-icon warning"><i data-lucide="alert-triangle"></i></div>
                                <div class="notif-content">
                                    <div class="notif-title">Low Stock Alert</div>
                                    <div class="notif-desc">${item.name} (${item.sku}) - Stock left: ${item.stock}</div>
                                </div>
                            </div>
                        `;
                        count++;
                    });
                }

                if (data.pendingInvoices && data.pendingInvoices.length > 0) {
                    data.pendingInvoices.forEach(inv => {
                        const isOverdue = inv.status.toLowerCase() === 'overdue';
                        const iconClass = isOverdue ? 'danger' : 'warning';
                        const iconName = isOverdue ? 'alert-octagon' : 'clock';
                        const title = isOverdue ? 'Overdue Invoice' : 'Pending Payment';
                        notifsHTML += `
                            <div class="notif-item">
                                <div class="notif-icon ${iconClass}"><i class="icon-lucide-${iconName}"></i></div>
                                <div class="notif-content">
                                    <div class="notif-title">${title}</div>
                                    <div class="notif-desc">${inv.invoice_number} - ${window.appSettings?.currency || 'QAR'} ${inv.total_amount.toLocaleString()}</div>
                                </div>
                            </div>
                        `;
                        count++;
                    });
                }

                if (count > 0) {
                    notifBody.innerHTML = notifsHTML;
                    notifBadge.textContent = count;
                    notifBadge.style.display = 'flex';
                } else {
                    notifBody.innerHTML = '<div class="notif-empty text-muted">You have no new notifications.</div>';
                    notifBadge.style.display = 'none';
                }

                lucide.createIcons();
            })
            .catch(err => {
                console.error('Error fetching notifications:', err);
                notifBody.innerHTML = '<div class="notif-empty text-muted" style="color:var(--danger);">Error loading notifications.</div>';
            });
    }

    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('active');
        if (notifDropdown.classList.contains('active')) {
            fetchNotifications(); // Refresh on open
        }
    });

    notifClose.addEventListener('click', () => {
        notifDropdown.classList.remove('active');
    });

    document.addEventListener('click', (e) => {
        if (!bellBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
            notifDropdown.classList.remove('active');
        }
    });

    // Settings Save Handlers
    function saveSettings() {
        const payload = {
            company_name: document.getElementById('set-company').value,
            address: document.getElementById('set-address').value,
            phone: document.getElementById('set-phone').value,
            currency: document.getElementById('set-currency').value,
            tax_rate: parseFloat(document.getElementById('set-tax').value) || 0,
            invoice_prefix: document.getElementById('set-prefix').value
        };

        apiFetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                alert('Settings updated successfully!');
                fetchSettings(); // refresh global state
                renderInvoiceItems(); // update invoice UI just in case
            })
            .catch(err => alert('Failed to update settings.'));
    }

    // Settings Save Handlers
    const btnSaveCompany = document.getElementById('btn-save-company');
    const btnSaveFinance = document.getElementById('btn-save-finance');

    if (btnSaveFinance) btnSaveFinance.addEventListener('click', saveSettings);

    // Edit Profile logic restoration
    window.initEditProfileModal = function () {
        const adminDropdown = document.getElementById('admin-dropdown');
        const modal = document.getElementById('modal-edit-profile');
        const form = document.getElementById('form-edit-profile');
        const nameInput = document.getElementById('prof-name');
        const errorMsg = document.getElementById('prof-error');
        const successMsg = document.getElementById('prof-success');
        const dpPreview = document.getElementById('prof-dp-preview');
        const currentName = localStorage.getItem('name') || localStorage.getItem('username') || 'Admin';
        const currentDp = localStorage.getItem('display_picture');

        // Close dropdown and show modal
        if (adminDropdown) adminDropdown.classList.remove('active');
        if (modal) modal.classList.add('active');

        // Reset form and UI
        if (form) form.reset();
        if (errorMsg) errorMsg.style.display = 'none';
        if (successMsg) successMsg.style.display = 'none';
        if (nameInput) nameInput.value = currentName === 'undefined' ? '' : currentName;

        if (dpPreview) {
            if (currentDp && currentDp !== 'undefined' && currentDp !== 'null') {
                dpPreview.style.backgroundImage = `url(${currentDp})`;
                dpPreview.textContent = '';
            } else {
                dpPreview.style.backgroundImage = '';
                dpPreview.textContent = currentName.charAt(0).toUpperCase();
                dpPreview.style.color = 'white';
            }
        }
    };

    // Edit Profile Form Submission & Image Preview logic
    const formEditProfile = document.getElementById('form-edit-profile');
    const profDpInput = document.getElementById('prof-dp-input');
    const profDpPreview = document.getElementById('prof-dp-preview');
    const profName = document.getElementById('prof-name');
    const profPwdCurrent = document.getElementById('prof-pwd-current');
    const profPwdNew = document.getElementById('prof-pwd-new');
    const profPwdConfirm = document.getElementById('prof-pwd-confirm');
    const profError = document.getElementById('prof-error');
    const profSuccess = document.getElementById('prof-success');

    // Handle Image Preview
    if (profDpInput && profDpPreview) {
        profDpInput.addEventListener('change', function () {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    profDpPreview.style.backgroundImage = `url(${e.target.result})`;
                    profDpPreview.textContent = '';
                }
                reader.readAsDataURL(file);
            }
        });
    }

    if (formEditProfile) {
        formEditProfile.addEventListener('submit', (e) => {
            e.preventDefault();

            profError.style.display = 'none';
            profSuccess.style.display = 'none';

            // Validate new passwords match if provided
            if (profPwdNew.value || profPwdConfirm.value) {
                if (!profPwdCurrent.value) {
                    profError.textContent = 'Current password is required to change your password.';
                    profError.style.display = 'block';
                    return;
                }
                if (profPwdNew.value !== profPwdConfirm.value) {
                    profError.textContent = 'New passwords do not match.';
                    profError.style.display = 'block';
                    return;
                }
                if (profPwdNew.value.length < 4) {
                    profError.textContent = 'New password must be at least 4 characters.';
                    profError.style.display = 'block';
                    return;
                }
            }

            const formData = new FormData();
            formData.append('name', profName.value);

            if (profPwdCurrent.value) {
                formData.append('currentPassword', profPwdCurrent.value);
                if (profPwdNew.value) {
                    formData.append('newPassword', profPwdNew.value);
                }
            }

            if (profDpInput.files[0]) {
                formData.append('display_picture', profDpInput.files[0]);
            }

            apiFetch('/api/profile', {
                method: 'PUT',
                body: formData
            })
                .then(async res => {
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || 'Failed to update profile');

                    profSuccess.textContent = 'Profile updated successfully!';
                    profSuccess.style.display = 'block';

                    // Update localStorage
                    if (data.name) localStorage.setItem('name', data.name);
                    if (data.display_picture) localStorage.setItem('display_picture', data.display_picture);

                    // Update UI Header & Dropdown
                    const displayName = data.name || localStorage.getItem('username');
                    const userNameEl = document.querySelector('.user-info .user-name');
                    if (userNameEl) userNameEl.textContent = displayName;

                    const adminDropdownNameEl = document.querySelector('#admin-dropdown p:first-of-type');
                    if (adminDropdownNameEl) adminDropdownNameEl.textContent = displayName;

                    const adminBtn = document.getElementById('admin-profile-btn');
                    if (data.display_picture) {
                        if (adminBtn) {
                            adminBtn.style.backgroundImage = `url(${data.display_picture})`;
                            adminBtn.style.backgroundSize = 'cover';
                            adminBtn.style.backgroundPosition = 'center';
                            adminBtn.textContent = '';
                        }
                    } else if (data.name) {
                        if (adminBtn && !adminBtn.style.backgroundImage) adminBtn.textContent = data.name.charAt(0).toUpperCase();
                    }

                    setTimeout(() => {
                        document.getElementById('modal-edit-profile').classList.remove('active');
                    }, 1000);
                })
                .catch(err => {
                    profError.textContent = err.message;
                    profError.style.display = 'block';
                });
        });
    }

    // Initial load
    fetchSettings();
    fetchDashboard();
    fetchNotifications();
});
