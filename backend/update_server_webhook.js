const fs = require('fs');
let serverCode = fs.readFileSync('server.js', 'utf8');

if (!serverCode.includes('webhookController')) {
    const webhookRoutes = `
const webhookController = require('./src/controllers/webhookController');
app.get('/webhook', webhookController.verifyWebhook);
app.post('/webhook', webhookController.handleWebhookEvent);
`;
    serverCode = serverCode.replace('app.listen', webhookRoutes + '\napp.listen');
    fs.writeFileSync('server.js', serverCode);
    console.log('Server.js updated with Webhook routes successfully!');
}
