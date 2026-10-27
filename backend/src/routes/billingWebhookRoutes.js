
const router=require('express').Router();
const controller=require('../controllers/billingWebhookController');
router.post('/',controller.handleStripe);
module.exports=router;
