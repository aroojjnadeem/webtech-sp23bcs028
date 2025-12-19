/**
 * Admin seeding script
 * Usage:
 *   node scripts/seed-admin.js --email admin@example.com --password Admin@123 --name Admin User
 *
 * Reads args from CLI or environment:
 *   EMAIL, PASSWORD, NAME
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load User model
const User = require(path.join(__dirname, '..', 'models', 'user.model.js'));

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '').toUpperCase();
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      options[key] = val;
      if (val !== 'true') i++;
    }
  }
  return {
    email: options.EMAIL || process.env.EMAIL || 'admin@example.com',
    password: options.PASSWORD || process.env.PASSWORD || 'Admin@123',
    name: options.NAME || process.env.NAME || 'Admin',
    mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/shop'
  };
}

async function main() {
  const { email, password, name, mongoUri } = parseArgs();
  console.log(`Connecting to MongoDB: ${mongoUri}`);
  await mongoose.connect(mongoUri);

  try {
    let user = await User.findOne({ email });
    if (user) {
      console.log(`User with email ${email} exists. Promoting to admin and resetting password.`);
      user.role = 'admin';
      user.password = password; // Let pre-save hook hash it
      user.name = name || user.name;
      await user.save();
    } else {
      console.log(`Creating new admin user: ${email}`);
      user = new User({ name, email, password, role: 'admin' }); // Model will hash it
      await user.save();
    }
    console.log('Admin user ready.');
    console.log(`\n✅ Admin credentials:\n   Email: ${email}\n   Password: ${password}\n`);
  } catch (err) {
    console.error('Failed to seed admin:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

main();
