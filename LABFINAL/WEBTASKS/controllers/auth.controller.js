const User = require('../models/user.model');
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET || 'your_secret_key', { expiresIn: '7d' });
};

exports.register = async (req, res) => {
    try {
        const { name, email, password, confirmPassword } = req.body;

        if (!name || !email || !password || !confirmPassword) {
            return res.status(400).render('register', { 
                layout: 'layout',
                title: 'Register',
                error: 'All fields are required' 
            });
        }

        if (password !== confirmPassword) {
            return res.status(400).render('register', { 
                layout: 'layout',
                title: 'Register',
                error: 'Passwords do not match' 
            });
        }

        if (password.length < 6) {
            return res.status(400).render('register', { 
                layout: 'layout',
                title: 'Register',
                error: 'Password must be at least 6 characters' 
            });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).render('register', { 
                layout: 'layout',
                title: 'Register',
                error: 'Email already registered' 
            });
        }

        const user = await User.create({ name, email, password });
        const token = generateToken(user._id);

        res.cookie('token', token, { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true });
        req.flash('success', `Welcome ${name}! Your account has been created successfully.`);
        res.status(201).redirect('/');
    } catch (error) {
        res.status(500).render('register', { 
            layout: 'layout',
            title: 'Register',
            error: error.message || 'Registration failed' 
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).render('login', { 
                layout: 'layout',
                title: 'Login',
                error: 'Email and password are required' 
            });
        }

        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).render('login', { 
                layout: 'layout',
                title: 'Login',
                error: 'Invalid email or password' 
            });
        }

        const token = generateToken(user._id);
        res.cookie('token', token, { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true });
        
        req.flash('success', `Welcome back, ${user.name}!`);
        if (user.role === 'admin') {
            return res.redirect('/admin');
        }
        res.redirect('/');
    } catch (error) {
        res.status(500).render('login', { 
            layout: 'layout',
            title: 'Login',
            error: error.message || 'Login failed' 
        });
    }
};

exports.logout = (req, res) => {
    res.clearCookie('token');
    req.flash('success', 'You have been logged out successfully.');
    res.redirect('/');
};
