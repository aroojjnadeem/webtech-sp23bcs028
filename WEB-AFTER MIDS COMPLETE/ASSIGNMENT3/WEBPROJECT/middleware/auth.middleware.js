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

exports.adminOnly = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        
        if (!token) {
            return res.status(401).redirect('/login');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
        const user = await User.findById(decoded.id);

        if (!user || user.role !== 'admin') {
            return res.status(403).redirect('/');
        }

        req.user = user;
        next();
    } catch (error) {
        res.clearCookie('token');
        res.status(401).redirect('/login');
    }
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
