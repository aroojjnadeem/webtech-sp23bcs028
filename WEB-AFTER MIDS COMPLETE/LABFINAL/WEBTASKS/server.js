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
const authRoutes = require("./routes/auth.routes");
const ProductModel = require("./models/product.model");
const Order = require("./models/order.model");
const { adminOnly, getUser, checkCartNotEmpty } = require("./middleware/auth.middleware");
const PORT = 5001;

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

// View Cart (also cleans deleted products if present)
app.get("/cart", async (req, res) => {
  let cart = req.session.cart || [];
  if (cart.length) {
    try {
      const ids = cart.map((i) => i._id);
      const existing = await ProductModel.find({ _id: { $in: ids } }, { _id: 1 });
      const existingSet = new Set(existing.map((d) => String(d._id)));
      const filtered = cart.filter((i) => existingSet.has(String(i._id)));
      if (filtered.length !== cart.length) {
        req.session.cart = filtered;
        req.flash("error", "Some products were removed because they are no longer available.");
        cart = filtered;
      }
    } catch (e) {
      // If something goes wrong, keep the current cart and proceed
    }
  }
  res.render("cart", { layout: "layout", title: "Cart", cart });
});

// Add to Cart (Handles Duplicates)
app.post("/cart/add/:id", async (req, res) => {
  const product = await ProductModel.findById(req.params.id);
  if (!product) {
    req.flash("error", "Product no longer available.");
    return res.redirect("/shop");
  }
  if (!req.session.cart) req.session.cart = [];
  const existingItem = req.session.cart.find((item) => item._id == req.params.id);
  if (existingItem) {
    existingItem.qty++;
  } else {
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
app.get("/checkout", checkCartNotEmpty, (req, res) => {
  const cart = req.session.cart || [];
  res.render("checkout", { layout: "layout", title: "Checkout", cart });
});

// Route: Convert current session cart into a persisted Order document
// - Validates basic customer input (name/email)
// - Rebuilds totals from live Product prices (server-authoritative)
// - Skips deleted products and rebuilds cart if needed
// - Creates an Order, clears session cart, then redirects to confirmation
app.post("/checkout", checkCartNotEmpty, async (req, res) => {
  const { name, email, phone, address, city, state, zip, country, cardNumber, cardExpiry, cardCvv, cardholderName } = req.body;
  
  // Validation
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  const phoneRegex = /^[0-9+\s\-\(\)]{10,20}$/;
  const cardRegex = /^[0-9\s]{13,19}$/;
  const cvvRegex = /^[0-9]{3,4}$/;
  const expiryRegex = /^(0[1-9]|1[0-2])\/([0-9]{2})$/;
  
  if (!name || name.length < 2) {
    req.flash("error", "Please provide a valid name.");
    return res.redirect("/checkout");
  }
  
  if (!email || !emailRegex.test(email)) {
    req.flash("error", "Please provide a valid email address.");
    return res.redirect("/checkout");
  }
  
  if (!phone || !phoneRegex.test(phone)) {
    req.flash("error", "Please provide a valid phone number.");
    return res.redirect("/checkout");
  }
  
  if (!address || address.length < 5) {
    req.flash("error", "Please provide a valid street address.");
    return res.redirect("/checkout");
  }
  
  if (!city || !state || !zip || !country) {
    req.flash("error", "Please complete all address fields.");
    return res.redirect("/checkout");
  }
  
  if (!cardNumber || !cardRegex.test(cardNumber)) {
    req.flash("error", "Please provide a valid card number.");
    return res.redirect("/checkout");
  }
  
  if (!cardExpiry || !expiryRegex.test(cardExpiry)) {
    req.flash("error", "Please provide a valid expiry date (MM/YY).");
    return res.redirect("/checkout");
  }
  
  if (!cardCvv || !cvvRegex.test(cardCvv)) {
    req.flash("error", "Please provide a valid CVV.");
    return res.redirect("/checkout");
  }
  
  if (!cardholderName || cardholderName.length < 2) {
    req.flash("error", "Please provide the cardholder name.");
    return res.redirect("/checkout");
  }

  const cart = req.session.cart || [];
  let total = 0;
  const items = [];
  let removed = false;

  for (const item of cart) {
    const product = await ProductModel.findById(item._id);
    if (!product) {
      removed = true;
      continue;
    }
    const quantity = Math.max(1, Number(item.qty) || 1);
    const price = Number(product.price) || 0;
    total += price * quantity;
    items.push({
      product: product._id,
      name: product.name,
      price,
      quantity,
    });
  }

  if (!items.length) {
    req.session.cart = [];
    req.flash("error", "No valid products in cart.");
    return res.redirect("/shop");
  }

  if (removed) {
    req.session.cart = items.map((i) => ({
      _id: i.product,
      name: i.name,
      price: i.price,
      qty: i.quantity,
    }));
    req.flash("error", "Some products were removed because they are no longer available.");
    return res.redirect("/cart");
  }

  const order = await Order.create({
    customerName: name.trim(),
    email: email.toLowerCase(),
    items,
    totalAmount: total,
    status: "Pending",
  });

  req.session.cart = [];
  res.redirect(`/order/confirmation/${order._id}`);
});

app.get("/order/confirmation/:id", async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.redirect("/");
  res.render("success", {
    layout: "layout",
    title: "Order Confirmed",
    orderId: order._id,
  });
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

// Edit Product Form - ADD THIS ROUTE
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

app.get("/admin/orders", async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  res.render("admin/orders", {
    layout: "admin-layout",
    title: "Orders",
    orders,
  });
});

app.post("/admin/orders/:id/status", async (req, res) => {
  const { status } = req.body;
  const allowed = ["Confirmed", "Cancelled"];
  if (!allowed.includes(status)) {
    req.flash("error", "Invalid status.");
    return res.redirect("/admin/orders");
  }
  await Order.findByIdAndUpdate(req.params.id, { status });
  res.redirect("/admin/orders");
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
// Resilient server start: prefer PORT/env, fall back to next port if in use
const basePort = Number(process.env.PORT) || PORT;
function startServer(p) {
  const server = app
    .listen(p, () => {
      console.log(`Server is running on http://localhost:${p}`);
    })
    .on("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        const next = p + 1;
        console.warn(`Port ${p} in use, trying ${next}...`);
        startServer(next);
      } else {
        console.error("Server failed to start:", err);
        process.exit(1);
      }
    });
}
startServer(basePort);
