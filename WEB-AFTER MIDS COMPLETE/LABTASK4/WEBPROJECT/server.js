const express = require("express");
const mongoose = require("mongoose");
const app = express();
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const flash = require("connect-flash");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ProductModel = require("./models/product.model");

const jwt = require("jsonwebtoken");
const User = require("./models/user.model");
const authRoutes = require("./routes/auth.routes");
const { adminOnly, getUser } = require("./middleware/auth.middleware");
const PORT = 3001;

// =======================
// MULTER CONFIGURATION FOR FILE UPLOADS
// =======================
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "product-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: fileFilter,
});

// =======================
// MIDDLEWARE SETUP
// =======================
app.use(express.static("public")); // Serves images and CSS
app.use(express.urlencoded({ extended: true })); // Parses form data
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: "my secret key",
    saveUninitialized: true,
    resave: false,
    cookie: { maxAge: 600000 }, // Session expires in 10 minutes
  })
);
app.use(flash());

// Middleware to get current user
app.use(getUser);
// View Engine Setup
app.set("view engine", "ejs");
app.use(expressLayouts);

// Defaults for views
app.use((req, res, next) => {
  if (!res.locals.title) res.locals.title = "Typography Gallery";
  // user already set by getUser middleware
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
});

// =======================
// DATABASE CONNECTION
// =======================
mongoose.connect("mongodb://localhost:27017/shop");

mongoose.connection.on("connected", () => console.log("Connected to MongoDB"));
mongoose.connection.on("error", (err) => console.log("Connection error:", err));

// =======================
// AUTHENTICATION ROUTES
// =======================
app.use("/auth", authRoutes);
// Friendly routes for sidebar links
app.get("/login", (req, res) => res.render("login", { layout: "layout", title: "Login" }));
app.get("/register", (req, res) => res.render("register", { layout: "layout", title: "Register" }));
// =======================
// CUSTOMER ROUTES
// =======================

// 1. Homepage
app.get("/", (req, res) => {
  res.render("homepage", { layout: "layout", title: "Home" });
});

// 2. Shop Page (With Pagination & Filters)
app.get("/shop", async (req, res) => {
  let page = parseInt(req.query.page) || 1;
  let limit = 5; // Products per page
  let skip = (page - 1) * limit;

  // Filter Logic
  let query = {};
  if (req.query.category) query.category = req.query.category;
  if (req.query.min && req.query.max) {
    query.price = { $gte: req.query.min, $lte: req.query.max };
  }

  let totalProducts = await ProductModel.countDocuments(query);
  let products = await ProductModel.find(query).skip(skip).limit(limit);

  res.render("shop", {
    layout: "layout",
    title: "Shop",
    products,
    currentPage: page,
    totalPages: Math.ceil(totalProducts / limit),
    filter: req.query,
  });
});

// =======================
// CART FUNCTIONALITY
// =======================

// View Cart
app.get("/cart", (req, res) => {
  let cart = req.session.cart || [];
  res.render("cart", { layout: "layout", title: "Cart", cart });
});

// Add to Cart (Handles Duplicates)
app.post("/cart/add/:id", async (req, res) => {
  let product = await ProductModel.findById(req.params.id);
  if (!req.session.cart) req.session.cart = [];

  // Check if product already exists in cart
  let existingItem = req.session.cart.find((item) => item._id == req.params.id);

  if (existingItem) {
    existingItem.qty++; // Increase quantity
  } else {
    // Add new item
    req.session.cart.push({
      _id: product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      category: product.category,
      qty: 1,
    });
  }
  res.redirect("/shop");
});

// Update Quantity (Plus / Minus)
app.get("/cart/update/:id/:action", (req, res) => {
  let cart = req.session.cart || [];
  let item = cart.find((i) => i._id == req.params.id);

  if (item) {
    if (req.params.action === "add") {
      item.qty++;
    } else if (req.params.action === "sub") {
      item.qty--;
    }

    // Remove item if quantity hits 0
    if (item.qty <= 0) {
      req.session.cart = cart.filter((i) => i._id != req.params.id);
    }
  }
  res.redirect("/cart");
});

// Remove Item Directly
app.get("/cart/remove/:id", (req, res) => {
  let cart = req.session.cart || [];
  req.session.cart = cart.filter((item) => item._id != req.params.id);
  res.redirect("/cart");
});

// =======================
// CHECKOUT ROUTES
// =======================
app.get("/checkout", (req, res) => {
  let cart = req.session.cart || [];
  if (cart.length === 0) return res.redirect("/shop");
  res.render("checkout", { layout: "layout", title: "Checkout", cart });
});

app.post("/checkout", (req, res) => {
  // Logic to save order to DB would go here
  req.session.cart = []; // Clear Cart
  res.render("success", { layout: "layout", title: "Success" });
});

// =======================
// ADMIN ROUTES
// =======================

// Protect all admin routes
app.use("/admin", adminOnly);
// Dashboard
app.get("/admin", async (req, res) => {
  const products = await ProductModel.find();
  // Using main layout to keep the Sidebar visible
  res.render("admin/dashboard", { layout: "admin-layout", title: "Admin Panel", products });
});

// Create Product Form
app.get("/admin/product/create", (req, res) => {
  res.render("admin/form", { layout: "layout", title: "Add Product", product: null });
});

// Edit Product Form 
app.get("/admin/product/edit/:id", async (req, res) => {
  try {
    const product = await ProductModel.findById(req.params.id);
    if (!product) {
      return res.status(404).send("Product not found");
    }
    res.render("admin/form", { layout: "layout", title: "Edit Product", product });
  } catch (err) {
    console.error("Error loading product:", err);
    res.status(500).send("Error loading product");
  }
});

// Create Product Logic
app.post("/admin/product/create", upload.single("image"), async (req, res) => {
  try {
    const imagePath = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl || "/images/placeholder.jpg";
    
    let record = new ProductModel({
      name: req.body.name,
      price: req.body.price,
      category: req.body.category,
      description: req.body.description,
      image: imagePath,
      featured: req.body.featured ? true : false,
      bestseller: req.body.bestseller ? true : false,
    });
    
    await record.save();
    res.redirect("/admin");
  } catch (err) {
    console.error("Error creating product:", err);
    res.status(500).send("Error creating product");
  }
});

// Edit Product Logic
app.post("/admin/product/edit/:id", upload.single("image"), async (req, res) => {
  try {
    let product = await ProductModel.findById(req.params.id);
    
    product.name = req.body.name;
    product.price = req.body.price;
    product.category = req.body.category;
    product.description = req.body.description;
    product.featured = req.body.featured ? true : false;
    product.bestseller = req.body.bestseller ? true : false;
    
    // Handle image upload
    if (req.file) {
      // Delete old image if it's an upload (not URL)
      if (product.image && product.image.startsWith("/uploads/")) {
        const oldImagePath = path.join(__dirname, "public", product.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      product.image = `/uploads/${req.file.filename}`;
    } else if (req.body.removeImage) {
      // Delete image if checkbox is checked
      if (product.image && product.image.startsWith("/uploads/")) {
        const oldImagePath = path.join(__dirname, "public", product.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      product.image = "/images/placeholder.jpg";
    } else if (req.body.imageUrl) {
      // Use URL if provided and no file uploaded
      if (!req.file) {
        product.image = req.body.imageUrl;
      }
    }
    
    await product.save();
    res.redirect("/admin");
  } catch (err) {
    console.error("Error editing product:", err);
    res.status(500).send("Error editing product");
  }
});

// Delete Product
app.get("/admin/product/delete/:id", async (req, res) => {
  await ProductModel.findByIdAndDelete(req.params.id);
  res.redirect("/admin");
});

// =======================
// STATIC PAGES
// =======================
app.get("/contact", (req, res) => {
  res.render("contact", { layout: "layout", title: "Contact Us" });
});

app.get("/about", (req, res) => {
  res.render("contact", { layout: "layout", title: "About Us" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});