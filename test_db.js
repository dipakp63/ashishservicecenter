const { Pool } = require('pg');

const connectionString = 'postgresql://postgres:Jivesh%402751@db.jsrqqafwhxcfigpqhumy.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString,
});

async function testConnection() {
  try {
    console.log('Connecting to Supabase PostgreSQL...');
    const client = await pool.connect();
    console.log('Executing test query...');
    const result = await client.query('SELECT 1 as test');
    console.log('Connection successful:', result.rows);
    client.release();
  } catch (error) {
    console.error('Connection failed:', error);
  } finally {
    await pool.end();
  }
}

testConnection();
