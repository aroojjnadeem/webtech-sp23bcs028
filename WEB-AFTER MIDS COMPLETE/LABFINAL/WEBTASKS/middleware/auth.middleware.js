const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

exports.protect = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        
        if (!token) {
            return res.status(401).redirect('/login');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
        req.user = await User.findById(decoded.id);

        if (!req.user) {
            return res.status(401).redirect('/login');
        }

        next();
    } catch (error) {
        res.clearCookie('token');
        res.status(401).redirect('/login');
    }
};

/**
 * Middleware: adminOnly
 * Ensures only the admin user can access protected admin routes.
 * Per requirements, we allow exactly the email "admin@shop.com".
 */
exports.adminOnly = async (req, res, next) => {
    try {
        const token = req.cookies.token;

        if (!token) {
            req.flash('error', 'Admin access required.');
            return res.status(401).redirect('/login');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
        const user = await User.findById(decoded.id);

        if (!user || user.email !== 'admin@shop.com') {
            req.flash('error', 'Admin access required.');
            return res.status(403).redirect('/');
        }

        req.user = user;
        res.locals.user = user;
        next();
    } catch (error) {
        res.clearCookie('token');
        req.flash('error', 'Please log in as admin.');
        res.status(401).redirect('/login');
    }
};

/**
 * Middleware: checkCartNotEmpty
 * Prevents accessing checkout endpoints when the session cart is empty.
 * This avoids invalid orders and improves UX with a clear message.
 */
exports.checkCartNotEmpty = (req, res, next) => {
    const cart = req.session.cart || [];
    if (!cart.length) {
        req.flash('error', 'Your cart is empty.');
        return res.redirect('/cart');
    }
    next();
};

exports.getUser = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
            req.user = await User.findById(decoded.id);
        } else {
            req.user = null;
        }
        // Expose to all views and set defaults
        res.locals.user = req.user;
        next();
    } catch (error) {
        req.user = null;
        res.locals.user = null;
        next();
    }
};
