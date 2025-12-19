const express = require('express');
const { adminOnly } = require('../middleware/auth.middleware');

const router = express.Router();

// Protect all admin routes
router.use(adminOnly);

// Empty router - will be combined with existing admin routes in server.js
module.exports = router;
