const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

let chromeProcess;

function findChromePath() {
  const fs = require('fs');
  for (const path of CHROME_PATHS) {
    if (fs.existsSync(path)) {
      return path;
    }
  }
  return null;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const chromePath = findChromePath();
  if (!chromePath) {
    console.error('Chrome executable not found!');
    process.exit(1);
  }

  console.log('Spawning Chrome:', chromePath);
  chromeProcess = spawn(chromePath, [
    '--remote-debugging-port=9222',
    '--headless',
    '--disable-gpu',
    '--no-sandbox'
  ]);

  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    const targets = await getJson('http://localhost:9222/json/list');
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      throw new Error('No page target found');
    }

    const wsUrl = pageTarget.webSocketDebuggerUrl;
    console.log('Connecting to Chrome DevTools at:', wsUrl);
    const ws = new WebSocket(wsUrl);

    let nextMessageId = 1;
    const send = (method, params = {}) => {
      const id = nextMessageId++;
      return new Promise((resolve) => {
        const handler = (data) => {
          const msg = JSON.parse(data.toString());
          if (msg.id === id) {
            ws.off('message', handler);
            resolve(msg.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    ws.on('open', async () => {
      await send('Page.enable');
      await send('Runtime.enable');
      
      // Inject script to track errors and console.errors
      const injectScript = `
        window.__errors = [];
        window.onerror = function(message, source, lineno, colno, error) {
          window.__errors.push({
            type: 'Uncaught Exception',
            message: message,
            source: source,
            lineno: lineno,
            colno: colno,
            stack: error ? error.stack : ''
          });
          return false;
        };
        const origError = console.error;
        console.error = function(...args) {
          window.__errors.push({
            type: 'Console.error',
            message: args.join(' '),
            source: 'console.error',
            lineno: 0,
            colno: 0
          });
          origError.apply(console, args);
        };
      `;
      
      await send('Page.addScriptToEvaluateOnNewDocument', { source: injectScript });
      
      console.log('Navigating to http://localhost:3000 ...');
      await send('Page.navigate', { url: 'http://localhost:3000' });
      
      // Wait 4 seconds for page load
      await new Promise(resolve => setTimeout(resolve, 4000));
      
      console.log('Clicking Employee Management sidebar button...');
      await send('Runtime.evaluate', {
        expression: `
          const btn = document.getElementById('nav-employee-management');
          if (btn) {
            btn.click();
          } else {
            console.error('nav-employee-management element not found');
          }
        `
      });

      // Wait 2 seconds for any async error or click behavior
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Retrieve errors
      const evalResult = await send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__errors || [])',
        returnByValue: true
      });
      
      console.log('\n--- Captured Errors (Load + Click) ---');
      const errors = JSON.parse(evalResult.result.value);
      if (errors.length === 0) {
        console.log('No errors captured.');
      } else {
        errors.forEach((e, idx) => {
          console.log(`[Error #${idx + 1}] (${e.type})`);
          console.log(`Message: ${e.message}`);
          console.log(`File: ${e.source}`);
          console.log(`Line: ${e.lineno}, Column: ${e.colno}`);
          if (e.stack) {
            console.log(`Stack trace:\n${e.stack}`);
          }
          console.log('------------------------------------');
        });
      }
      
      ws.close();
    });

    await new Promise(resolve => ws.on('close', resolve));
  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    if (chromeProcess) {
      chromeProcess.kill();
      console.log('Chrome process terminated.');
    }
  }
}

run();
