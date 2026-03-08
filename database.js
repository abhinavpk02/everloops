require('dotenv').config();
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

const db = {
    get: (query, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        client.execute({ sql: query, args: params })
            .then(res => callback(null, res.rows[0]))
            .catch(callback);
    },
    all: (query, params, callback) => {
        if (typeof params === 'function') { callback = params; params = []; }
        client.execute({ sql: query, args: params })
            .then(res => callback(null, res.rows))
            .catch(callback);
    },
    run: function (query, params, callback) {
        if (typeof params === 'function') { callback = params; params = []; }
        client.execute({ sql: query, args: params })
            .then(res => {
                const context = {
                    lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
                    changes: res.rowsAffected
                };
                if (callback) callback.call(context, null);
            })
            .catch(err => { if (callback) callback(err); });
    },
    serialize: (cb) => { if (cb) cb(); },
    prepare: (query) => {
        return {
            run: function (...args) {
                let callback = args.length > 0 && typeof args[args.length - 1] === 'function' ? args.pop() : null;
                client.execute({ sql: query, args })
                    .then(res => {
                        const context = {
                            lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
                            changes: res.rowsAffected
                        };
                        if (callback) callback.call(context, null);
                    })
                    .catch(err => { if (callback) callback(err); });
            },
            finalize: () => { }
        };
    }
};

module.exports = db;
