const { createClient } = require('@libsql/client');
require('dotenv').config();

const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

async function test() {
    try {
        const res = await client.execute("SELECT 1");
        console.log("Connection successful:", res);
    } catch (e) {
        console.error("Connection failed:", e);
    } finally {
        process.exit();
    }
}
test();
