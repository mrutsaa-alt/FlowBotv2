const pool = require('./src/config/db');

async function updateDB() {
    try {
        await pool.query(`
            ALTER TABLE flows ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(50) DEFAULT 'message';
            ALTER TABLE flows ADD COLUMN IF NOT EXISTS post_id VARCHAR(255);
        `);
        console.log('Database updated successfully for Comment Automation!');
        process.exit(0);
    } catch (err) {
        console.error('Error updating database:', err);
        process.exit(1);
    }
}

updateDB();
