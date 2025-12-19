const mongoose = require("mongoose");

const productSchema = mongoose.Schema({
  name: String,
  price: Number,
  category: String, // e.g., 'serif', 'sans-serif', 'display'
  description: String,
  image: String, // URL or filename
});

const Product = mongoose.model("Product", productSchema);
module.exports = Product;