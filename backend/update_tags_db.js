const pool = require('./src/config/db');

async function updateTagsDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tags (
                id SERIAL PRIMARY KEY,
                channel_id INT NOT NULL,
                name VARCHAR(100) NOT NULL,
                color VARCHAR(50) DEFAULT 'blue'
            );

            CREATE TABLE IF NOT EXISTS subscriber_tags (
                subscriber_id INT REFERENCES subscribers(id) ON DELETE CASCADE,
                tag_id INT REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (subscriber_id, tag_id)
            );

            CREATE TABLE IF NOT EXISTS custom_fields (
                id SERIAL PRIMARY KEY,
                channel_id INT NOT NULL,
                field_name VARCHAR(100) NOT NULL,
                field_type VARCHAR(50) DEFAULT 'text'
            );

            CREATE TABLE IF NOT EXISTS subscriber_field_values (
                subscriber_id INT REFERENCES subscribers(id) ON DELETE CASCADE,
                field_id INT REFERENCES custom_fields(id) ON DELETE CASCADE,
                value TEXT,
                PRIMARY KEY (subscriber_id, field_id)
            );
        `);
        console.log('Tags & Custom Fields tables created successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Error creating tags tables:', err);
        process.exit(1);
    }
}

updateTagsDB();
