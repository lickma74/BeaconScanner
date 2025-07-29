# Beacon Scanner

ESP32-based BLE beacon scanner with MQTT and CoAP support for real-time monitoring and event distribution.

## Features

- **BLE Beacon Detection** - Automatic scanning and tracking of Bluetooth Low Energy beacons
- **MQTT Publishing** - Real-time event publishing to MQTT broker
- **CoAP Support** - Event forwarding via CoAP protocol
- **LED Control** - Remote LED control via HTTP API
- **Web Dashboard** - Live monitoring interface

## Prerequisites

- Node.js (≥14.0.0)
- ESP32 development board
- Mosquitto MQTT broker
- Arduino IDE or PlatformIO

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configuration

**ESP32 Configuration (`src/SendEvents.cpp`):**
- Set your WiFi credentials
- Configure your server IP address

**Backend Configuration (`Backend/controller.js`):**
- Set your IP address
- Configure ESP32 IP address

### 3. Start Services

Start each service in a separate terminal:

```bash
# MQTT Broker
mosquitto -v

# Backend Server
nodemon server.js

# Controller
nodemon controller.js

# MQTT Application
nodemon MttqApp.js

# CoAP Server
nodemon CoapServer.js

# CoAP Application
nodemon CoapApp.js
```

### 4. ESP32 Setup

Upload `main.cpp` to your ESP32 using Arduino IDE or PlatformIO.

## Architecture

```
ESP32 (BLE Scanner) → Controller → MQTT/CoAP Services → Web Dashboard
```

- **ESP32**: Scans for BLE beacons and sends events
- **Controller**: Central routing hub for events between ESP32 and services  
- **MQTT/CoAP**: Distributed event handling and communication
- **Web Dashboard**: Real-time monitoring and visualization

## Usage

Once all services are running and the ESP32 is connected, the system will automatically:
1. Detect nearby BLE beacons
2. Publish events to MQTT and CoAP endpoints
3. Display real-time data on the web dashboard
4. Allow remote LED control via HTTP

## Troubleshooting

- Ensure all IP addresses are correctly configured
- Check that Mosquitto is properly installed and running
- Verify ESP32 WiFi connection
- Use separate terminals for each service if VS Code terminal fails
