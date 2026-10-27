const pool = require('../config/db');

exports.createTag = async (req, res) => {
    try {
        const { channel_id, name, color } = req.body;
        const newTag = await pool.query(
            'INSERT INTO tags (channel_id, name, color) VALUES ($1, $2, $3) RETURNING *',
            [channel_id || 1, name, color || 'blue']
        );
        res.status(201).json(newTag.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.getTags = async (req, res) => {
    try {
        const { channelId } = req.params;
        const tags = await pool.query('SELECT * FROM tags WHERE channel_id = $1', [channelId]);
        res.json(tags.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};

exports.assignTagToSubscriber = async (req, res) => {
    try {
        const { subscriber_id, tag_id } = req.body;
        await pool.query(
            'INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [subscriber_id, tag_id]
        );
        res.json({ message: 'Tag assigned successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
