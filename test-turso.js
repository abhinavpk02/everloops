require('dotenv').config();
const { createClient } = require('@libsql/client');

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

client.execute("SELECT 1")
    .then(() => console.log("Connection successful!"))
    .catch(err => console.error("Connection failed:", err.message));
