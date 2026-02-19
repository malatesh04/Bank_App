const { getDb, dbGet, dbAll, dbRun, persistDb, generateAccountNumber } = require('./src/database/db');

async function fixData() {
    console.log('🔧 Fixing user data...');
    const db = await getDb();

    const users = await dbAll(db, 'SELECT id, username, phone, account_number FROM users');

    for (const user of users) {
        if (!user.account_number) {
            const acctNum = await generateAccountNumber(db);
            console.log(`   Assigning ${acctNum} to ${user.username} (${user.phone})`);
            await dbRun(db, 'UPDATE users SET account_number = ? WHERE id = ?', [acctNum, user.id]);
        } else {
            console.log(`   User ${user.username} already has account number ${user.account_number}`);
        }
    }

    persistDb(db);
    console.log('✅ Done!');
    process.exit(0);
}

fixData().catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
});
