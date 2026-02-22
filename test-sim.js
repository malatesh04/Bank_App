require('dotenv').config();
const { getDb, dbGet, dbRun } = require('./src/database/db');
const bcrypt = require('bcryptjs');

async function testLoginSim() {
    console.log('--- Simulating Login ---');
    try {
        const phone = '9876543210'; // Arjun's phone from test-api
        const password = 'SecurePass123';

        const db = await getDb();
        console.log('1. Database connected');

        const user = await dbGet(db, 'SELECT * FROM users WHERE phone = ?', [phone]);
        console.log('2. User lookup complete. Found?', !!user);

        if (!user) {
            console.log('User not found');
            return;
        }

        console.log('3. Comparing passwords...');
        const isValid = await bcrypt.compare(password, user.password);
        console.log('isValid:', isValid);

        if (isValid) {
            console.log('4. Generating token...');
            const jwt = require('jsonwebtoken');
            const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
            console.log('Token generated');

            console.log('5. Updating jwt_token in DB...');
            const updateRes = await dbRun(db, 'UPDATE users SET jwt_token = ? WHERE id = ?', [token, user.id]);
            console.log('Update complete. RowCount:', updateRes.rowCount);
        }

        console.log('--- Simulation Success ---');
    } catch (err) {
        console.error('!!! Simulation Failed !!!');
        console.error('Error Name:', err.name);
        console.error('Error Message:', err.message);
        console.error('Stack:', err.stack);
    } finally {
        // Pool won't close automatically, we'd have to call pool.end() but it's okay for a script
        process.exit(0);
    }
}

testLoginSim();
