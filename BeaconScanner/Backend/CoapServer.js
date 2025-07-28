// CoapServer.js - Pure CoAP server for beacon events
const coap = require('coap');

const events = [];
const server = coap.createServer();

server.on('request', (req, res) => {
  console.log(`CoAP Request: ${req.method} ${req.url}`);
  
  if (req.url === '/beacon/events') {
    if (req.method === 'POST') {
      // Receive and store event from controller
      try {
        const event = JSON.parse(req.payload.toString());
        events.push(event);
        console.log('CoAP Server received event:', event);
        
        // Notify all observers
        server.emit('newEvent', event);
        
        res.end('Event received');
      } catch (e) {
        console.error('Error parsing CoAP event:', e);
        res.code = '4.00';
        res.end('Invalid event');
      }
    } else if (req.method === 'GET' && req.headers['Observe'] !== undefined) {
      // Handle observation requests from CoapApp
      console.log('New observer connected');
      res.setOption('Content-Format', 'application/json');
      
      // Send initial response
      res.write(JSON.stringify({ info: 'Observation started', count: events.length }));
      
      // Send new events as they arrive
      const onNewEvent = (event) => {
        console.log('Sending event to observer:', event);
        res.write(JSON.stringify(event));
      };
      
      server.on('newEvent', onNewEvent);
      
      // Clean up when client disconnects
      req.on('close', () => {
        console.log('Observer disconnected');
        server.removeListener('newEvent', onNewEvent);
      });
      
      res.on('finish', () => {
        server.removeListener('newEvent', onNewEvent);
      });
      
    } else if (req.method === 'GET') {
      // Simple status check
      res.setOption('Content-Format', 'application/json');
      res.end(JSON.stringify({ 
        status: 'CoAP server ready', 
        eventsCount: events.length,
        resource: '/beacon/events'
      }));
    } else {
      res.code = '4.05';
      res.end('Method not allowed');
    }
  } else {
    res.code = '4.04';
    res.end('Resource not found');
  }
});

server.on('error', (err) => {
  console.error('CoAP Server error:', err);
});

// Start the CoAP server
const PORT = 5683;
server.listen(PORT, () => {
  console.log(`CoAP server listening on port ${PORT}`);
  console.log('Available resource: /beacon/events');
  console.log('- POST: Submit new events');
  console.log('- GET with Observe: Subscribe to events');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down CoAP server...');
  server.close(() => {
    console.log('CoAP server closed');
    process.exit(0);
  });
});

module.exports = server;