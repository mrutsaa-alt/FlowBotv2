const pool = require('./src/config/db');

async function updateUsersDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                provider VARCHAR(50) NOT NULL, -- 'google' বা 'facebook'
                provider_id VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Users table created successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error creating users table:', err);
        process.exit(1);
    }
}

updateUsersDB();
