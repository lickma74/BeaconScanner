
// controller.js - Forward events from ESP32 to backend server and CoAP server
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const coap = require('coap');

const app = express();
const PORT = process.env.CONTROLLER_PORT || 4000;
const BACKEND_URL = process.env.SERVER_URL || 'http://172.20.10.5:3000';

// --- LED control endpoints ---
const ESP32_IP = process.env.ESP32_IP || '172.20.10.6'; // Set your ESP32 IP here
const ESP32_PORT = process.env.ESP32_PORT || 80;
app.post('/led/:state', async (req, res) => {
  const state = req.params.state;
  if (state !== 'on' && state !== 'off') {
    return res.status(400).json({ success: false, error: 'Invalid state' });
  }
  try {
    // Forward the command to the ESP32 via HTTP
    const url = `http://${ESP32_IP}:${ESP32_PORT}/led/${state}`;
    const response = await axios.post(url);
    res.json({ success: true, state, esp32: response.data });
  } catch (err) {
    console.error('Error forwarding LED command to ESP32:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// MQTT client setup (activé par défaut)
const MQTT_ENABLED = process.env.MQTT_ENABLED !== 'false'; // activé sauf si explicitement désactivé
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_TOPIC = 'beacon/events';
let mqttClient = null;

if (MQTT_ENABLED) {
  mqttClient = mqtt.connect(MQTT_BROKER);
  
  mqttClient.on('connect', () => {
    console.log('Connected to MQTT broker at', MQTT_BROKER);
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT connection error:', err);
  });
} else {
  console.log('MQTT disabled. Set MQTT_ENABLED=true to enable MQTT support.');
}

// CoAP client setup
const COAP_SERVER_HOST = process.env.COAP_SERVER || 'localhost';
const COAP_SERVER_PORT = 5683;
const COAP_RESOURCE = '/beacon/events';

app.use(cors());
app.use(express.json());

// Function to send event to CoAP server
function sendCoapEvent(eventType, body) {
  const payload = JSON.stringify({ 
    eventType, 
    ...body, 
    timestamp: new Date().toISOString() 
  });
  
  console.log('Sending to CoAP server:', payload);
  
  const req = coap.request({
    method: 'POST',
    pathname: COAP_RESOURCE,
    hostname: COAP_SERVER_HOST,
    port: COAP_SERVER_PORT,
    confirmable: true
  });
  
  req.write(payload);
  
  req.on('response', res => {
    console.log('CoAP server response:', res.payload.toString());
  });
  
  req.on('error', err => {
    console.error('Error sending CoAP event:', err);
  });
  
  req.on('timeout', () => {
    console.error('CoAP request timeout');
  });
  
  req.end();
}

// Helper to log events to a file
function logEvent(eventType, body) {
  const logPath = path.join(__dirname, 'events.log');
  const logEntry = `[${new Date().toISOString()}] ${eventType}: ${JSON.stringify(body)}\n`;
  
  fs.appendFile(logPath, logEntry, err => {
    if (err) console.error('Error writing to log file:', err);
  });
  
  // Publish to MQTT if enabled
  if (MQTT_ENABLED && mqttClient) {
    const mqttPayload = JSON.stringify({ 
      eventType, 
      ...body, 
      timestamp: new Date().toISOString() 
    });
    
    mqttClient.publish(MQTT_TOPIC, mqttPayload, err => {
      if (err) console.error('Error publishing to MQTT:', err);
      else console.log('Published to MQTT:', eventType);
    });
  }
  
  // Send to CoAP server
  sendCoapEvent(eventType, body);
}

// Forward arrival event
app.post('/beacon/arrival', async (req, res) => {
  console.log('Received arrival event:', req.body);
  logEvent('arrival', req.body);
  
  try {
    const response = await axios.post(`${BACKEND_URL}/beacon/arrival`, req.body, {
      timeout: 5000
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error('Error forwarding to backend:', err.message);
    const status = err.response?.status || 500;
    const errorMsg = err.response?.data || { error: err.message };
    res.status(status).json(errorMsg);
  }
});

// Forward departure event
app.post('/beacon/departure', async (req, res) => {
  console.log('Received departure event:', req.body);
  logEvent('departure', req.body);
  
  try {
    const response = await axios.post(`${BACKEND_URL}/beacon/departure`, req.body, {
      timeout: 5000
    });
    res.status(response.status).json(response.data);
  } catch (err) {
    console.error('Error forwarding to backend:', err.message);
    const status = err.response?.status || 500;
    const errorMsg = err.response?.data || { error: err.message };
    res.status(status).json(errorMsg);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      backend: BACKEND_URL,
      mqtt: MQTT_BROKER,
      coap: `coap://${COAP_SERVER_HOST}:${COAP_SERVER_PORT}`
    }
  });
});

// Test endpoint to simulate events
app.post('/test/event', (req, res) => {
  const { eventType = 'test', ...body } = req.body;
  logEvent(eventType, { ...body, test: true });
  res.json({ message: 'Test event sent', eventType, body });
});

app.listen(PORT, () => {
  console.log(`Controller listening on port ${PORT}`);
  console.log(`Forwarding events to backend at ${BACKEND_URL}`);
  console.log(`CoAP server at coap://${COAP_SERVER_HOST}:${COAP_SERVER_PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down controller...');
  if (MQTT_ENABLED && mqttClient) {
    mqttClient.end();
  }
  process.exit(0);
});