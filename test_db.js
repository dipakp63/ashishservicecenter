const { createClient } = require('@libsql/client');

async function testConnection() {
  try {
    console.log('Connecting to Turso...');
    const client = createClient({
      url: 'libsql://petrol-pump-db-jivrajjp2751-code.aws-ap-south-1.turso.io',
      authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODEzNzYyNjAsImlkIjoiMDEwNWVjMjRiLWY3MDEtN2Y2Yi1iNzM5LTUxOTNhODVhYjY0MiIsInJpZCI6ImY1MTQ2MTJlLTI0MmItNDNkYy1iZjUyLWRkODQ5MGYzMTZlZiJ9.awp4Co91w6f4GpEK6ude4Cv-HOzq7zY1uIqe5vU04WuMFMXQVWNpRzlT-QaM_BHWphV9Y7a_BbCPbMuT3Rk6AQ'
    });
    
    console.log('Executing test query...');
    const result = await client.execute('SELECT 1 as test');
    console.log('Connection successful:', result.rows);
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

testConnection();
