// CoapApp.js: CoAP client that subscribes to events and provides web dashboard
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const coap = require('coap');
const fs = require('fs');

// Express app for dashboard
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuration
const DASHBOARD_PORT = process.env.COAP_DASHBOARD_PORT || 4002;
const DASHBOARD_PATH = path.join(__dirname, 'coap_dashboard.html');
const COAP_SERVER_HOST = process.env.COAP_SERVER || 'localhost';
const COAP_SERVER_PORT = 5683;
const COAP_RESOURCE = '/beacon/events';
const LOG_PATH = path.join(__dirname, 'coap_events.log');

// Event storage
let recentCoapEvents = [];
const MAX_EVENTS = 100;

// Serve dashboard
app.get('/coapdashboard', (req, res) => {
  res.sendFile(DASHBOARD_PATH);
});

// WebSocket connection handling
io.on('connection', socket => {
  console.log('Dashboard client connected');
  socket.emit('init', recentCoapEvents);
  
  socket.on('disconnect', () => {
    console.log('Dashboard client disconnected');
  });
});

// Function to log events to file
function logEvent(event) {
  const entry = `[${new Date().toISOString()}] ${JSON.stringify(event)}\n`;
  fs.appendFile(LOG_PATH, entry, err => {
    if (err) console.error('Error writing to coap_events.log:', err);
  });
  
  // Store in memory for dashboard
  recentCoapEvents.push(event);
  if (recentCoapEvents.length > MAX_EVENTS) {
    recentCoapEvents = recentCoapEvents.slice(-MAX_EVENTS);
  }
  
  // Broadcast to dashboard clients
  io.emit('coap_event', event);
  console.log('Event logged and broadcasted:', event.eventType);
}

// CoAP subscription function
function subscribeToCoapServer() {
  console.log(`Subscribing to CoAP server at ${COAP_SERVER_HOST}:${COAP_SERVER_PORT}${COAP_RESOURCE}`);
  
  const req = coap.request({
    observe: true,
    method: 'GET',
    pathname: COAP_RESOURCE,
    hostname: COAP_SERVER_HOST,
    port: COAP_SERVER_PORT,
    confirmable: true
  });

  req.on('response', res => {
    console.log('CoAP observation established');
    
    res.on('data', chunk => {
      const raw = chunk.toString().trim();
      if (!raw) return;
      
      console.log('Raw CoAP chunk:', raw);
      
      try {
        const event = JSON.parse(raw);
        
        // Skip initial connection messages
        if (event.info && event.info === 'Observation started') {
          console.log('CoAP observation started, waiting for events...');
          return;
        }
        
        // Process actual events
        if (event.eventType) {
          logEvent(event);
          console.log('Received CoAP event:', event);
        }
      } catch (e) {
        console.error('Invalid CoAP event JSON:', raw);
        console.error('Parse error:', e.message);
      }
    });
    
    res.on('error', err => {
      console.error('CoAP response error:', err);
    });
  });

  req.on('error', err => {
    console.error('CoAP subscription error:', err);
    console.log('Retrying in 5 seconds...');
    setTimeout(subscribeToCoapServer, 5000);
  });

  req.on('timeout', () => {
    console.log('CoAP request timeout, retrying...');
    setTimeout(subscribeToCoapServer, 5000);
  });

  req.end();
  
  return req;
}

// Start the dashboard server
server.listen(DASHBOARD_PORT, () => {
  console.log(`CoAP Dashboard available at http://localhost:${DASHBOARD_PORT}/coapdashboard`);
});

// Start CoAP subscription with retry logic
let retryCount = 0;
const maxRetries = 5;

function startSubscriptionWithRetry() {
  if (retryCount < maxRetries) {
    console.log(`Starting CoAP subscription (attempt ${retryCount + 1}/${maxRetries})`);
    try {
      subscribeToCoapServer();
      retryCount = 0; // Reset on successful connection
    } catch (err) {
      console.error('Failed to start CoAP subscription:', err);
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(`Retrying in 10 seconds...`);
        setTimeout(startSubscriptionWithRetry, 10000);
      } else {
        console.error('Max retries reached. CoAP subscription failed.');
      }
    }
  }
}

// Wait a moment for CoAP server to be ready, then start subscription
setTimeout(() => {
  startSubscriptionWithRetry();
}, 2000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down CoAP App...');
  server.close(() => {
    console.log('Dashboard server closed');
    process.exit(0);
  });
});