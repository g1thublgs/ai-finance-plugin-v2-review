const assert = require('assert');

const sqliteService = require('../src/services/database/sqliteService');

(async () => {
    const status = await sqliteService.getStatus();
    assert.strictEqual(status.exists, true);
    assert.match(status.path, /plugin_finance\.sqlite$/);

    await sqliteService.exec('CREATE TABLE IF NOT EXISTS codex_sqlite_smoke (id INTEGER PRIMARY KEY, name TEXT)');
    await sqliteService.exec('DELETE FROM codex_sqlite_smoke');
    await sqliteService.exec('INSERT INTO codex_sqlite_smoke(name) VALUES (?)', ['交通补贴']);
    const rows = await sqliteService.query('SELECT name FROM codex_sqlite_smoke');
    assert.deepStrictEqual(rows, [{ name: '交通补贴' }]);

    const largeText = 'large-payload-'.repeat(30000);
    await sqliteService.exec('INSERT INTO codex_sqlite_smoke(name) VALUES (?)', [largeText]);
    const largeRows = await sqliteService.query('SELECT length(name) AS len FROM codex_sqlite_smoke WHERE name LIKE ?', ['large-payload-%']);
    assert.deepStrictEqual(largeRows, [{ len: largeText.length }]);

    await sqliteService.exec('DROP TABLE IF EXISTS codex_sqlite_smoke');

    console.log('SQLite service test passed');
})().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
