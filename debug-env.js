require('dotenv').config();
console.log('JWT_SECRET present:', !!process.env.JWT_SECRET);
if (process.env.JWT_SECRET) {
    console.log('JWT_SECRET length:', process.env.JWT_SECRET.length);
}
console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);
console.log('NODE_ENV:', process.env.NODE_ENV);
