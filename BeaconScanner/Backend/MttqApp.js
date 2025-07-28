// MttqApp.js - MQTT client with web dashboard
const mqtt = require('mqtt');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_TOPIC = 'beacon/events';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve dashboard HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'mttq_dashboard.html'));
});

// Store recent events in memory
let recentEvents = [];
const MAX_EVENTS = 100;

const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('MttqApp connected to MQTT broker at', MQTT_BROKER);
  mqttClient.subscribe(MQTT_TOPIC, err => {
    if (err) {
      console.error('Subscription error:', err);
    } else {
      console.log('Subscribed to topic', MQTT_TOPIC);
    }
  });
});

mqttClient.on('message', (topic, message) => {
  const msgStr = message.toString();
  let eventObj;
  try {
    eventObj = JSON.parse(msgStr);
  } catch {
    eventObj = { raw: msgStr };
  }
  eventObj.timestamp = new Date().toISOString();
  recentEvents.push(eventObj);
  if (recentEvents.length > MAX_EVENTS) recentEvents = recentEvents.slice(-MAX_EVENTS);
  io.emit('mqtt_event', eventObj);
  // Save to file
  const logPath = path.join(__dirname, 'mttq_events.log');
  const logEntry = `[${eventObj.timestamp}] ${topic}: ${msgStr}\n`;
  fs.appendFile(logPath, logEntry, err => {
    if (err) console.error('Error writing to mttq_events.log:', err);
  });
});

io.on('connection', socket => {
  socket.emit('init', recentEvents);
});

const PORT = process.env.DASHBOARD_PORT || 4001;
server.listen(PORT, () => {
  console.log(`Web dashboard available at http://localhost:${PORT}`);
});
