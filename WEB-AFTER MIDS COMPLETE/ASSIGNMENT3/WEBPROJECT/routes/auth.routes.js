const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/logout', authController.logout);
router.get('/login', (req, res) => res.render('login', { layout: 'layout', title: 'Login' }));
router.get('/register', (req, res) => res.render('register', { layout: 'layout', title: 'Register' }));

module.exports = router;
