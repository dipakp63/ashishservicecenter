// Vercel Serverless Function Entry Point
// This file re-exports the Express app as a Vercel serverless handler.
const app = require('../server');

module.exports = app;
