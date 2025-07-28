#include <WiFi.h>
#include <WebServer.h>
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <BLEBeacon.h>
#include <map>
#include <string>
#include "SendEvents.h"

// LED Configuration
#define LED_PIN 18
WebServer webServer(80);

// LED Control Functions
void handleLedOn() {
  Serial.println("LED ON request received");
  digitalWrite(LED_PIN, HIGH);
  
  // Add CORS headers
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  webServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  
  webServer.send(200, "application/json", "{\"success\":true,\"state\":\"on\",\"message\":\"LED turned on\"}");
  Serial.println("LED turned ON - Response sent");
}

void handleLedOff() {
  Serial.println("LED OFF request received");
  digitalWrite(LED_PIN, LOW);
  
  // Add CORS headers
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  webServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  
  webServer.send(200, "application/json", "{\"success\":true,\"state\":\"off\",\"message\":\"LED turned off\"}");
  Serial.println("LED turned OFF - Response sent");
}

// Handle OPTIONS requests for CORS
void handleOptions() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.sendHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  webServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
  webServer.send(200);
}

// Test endpoint to check if server is working
void handleRoot() {
  webServer.sendHeader("Access-Control-Allow-Origin", "*");
  webServer.send(200, "application/json", "{\"status\":\"ESP32 server running\",\"led_pin\":" + String(LED_PIN) + "}");
}

// Handle 404 errors
void handleNotFound() {
  String message = "File Not Found\n\n";
  message += "URI: ";
  message += webServer.uri();
  message += "\nMethod: ";
  message += (webServer.method() == HTTP_GET) ? "GET" : "POST";
  message += "\nArguments: ";
  message += webServer.args();
  message += "\n";
  for (uint8_t i = 0; i < webServer.args(); i++) {
    message += " " + webServer.argName(i) + ": " + webServer.arg(i) + "\n";
  }
  webServer.send(404, "text/plain", message);
}

// Macro pour conversion endian si pas définie
#ifndef ENDIAN_CHANGE_U16
#define ENDIAN_CHANGE_U16(x) ((((x)&0xFF00)>>8) + (((x)&0xFF)<<8))
#endif

// Map pour stocker les beacons détectés
std::map<String, BeaconInfo> knownBeacons;

// Timeout pour considérer qu'un beacon est parti (en millisecondes)
const unsigned long BEACON_TIMEOUT = 10000; // 10 secondes

// Instance de la classe pour l'envoi d'événements
SendEvents eventSender;

// Fonction pour obtenir l'horodatage formaté
String getTimestamp() {
  unsigned long currentTime = millis();
  unsigned long seconds = currentTime / 1000;
  unsigned long minutes = seconds / 60;
  unsigned long hours = minutes / 60;
  
  seconds = seconds % 60;
  minutes = minutes % 60;
  hours = hours % 24;
  
  char timestamp[20];
  sprintf(timestamp, "%02lu:%02lu:%02lu.%03lu", hours, minutes, seconds, currentTime % 1000);
  return String(timestamp);
}

// Fonction pour générer un ID unique pour chaque beacon
String generateBeaconId(BLEAdvertisedDevice advertisedDevice) {
  String id = advertisedDevice.getAddress().toString().c_str();
  
  // Si c'est un iBeacon, ajouter l'UUID pour plus de précision
  if (advertisedDevice.haveManufacturerData()) {
    std::string strManufacturerData = advertisedDevice.getManufacturerData();
    uint8_t cManufacturerData[100];
    memcpy(cManufacturerData, strManufacturerData.c_str(), strManufacturerData.length());
    
    if (strManufacturerData.length() == 25 && cManufacturerData[0] == 0x4C && cManufacturerData[1] == 0x00) {
      BLEBeacon oBeacon = BLEBeacon();
      oBeacon.setData(strManufacturerData);
      id += "_" + String(oBeacon.getProximityUUID().toString().c_str());
    }
  }
  
  return id;
}

// Fonction pour afficher les détails d'un beacon (utilisée pour arrivée ET départ)
void displayBeaconDetails(const String& eventType, const BeaconInfo& beacon, const String& beaconId) {
  Serial.println("╔══════════════════════════════════════════════════════╗");
  if (eventType == "arrival") {
    Serial.println("║                    BEACON ARRIVÉE                    ║");
  } else {
    Serial.println("║                    BEACON DÉPART                     ║");
  }
  Serial.println("╠══════════════════════════════════════════════════════╣");
  Serial.printf("║ Horodatage: %s                             ║\n", getTimestamp().c_str());
  Serial.printf("║ Nom: %-43s     ║\n", beacon.name.c_str());
  Serial.printf("║ UUID: %-42s    ║\n", beacon.uuid.c_str());
  Serial.printf("║ RSSI: %-6d                                       ║\n", beacon.rssi);
  Serial.printf("║ ID: %-44s  ║\n", beaconId.c_str());
  
  // Afficher les informations spécifiques pour iBeacon
  if (beacon.isIBeacon) {
    Serial.println("║ Type: iBeacon                                        ║");
    Serial.printf("║ Major: %-5d | Minor: %-5d                    ║\n", beacon.major, beacon.minor);
    Serial.printf("║ Proximity UUID: %-32s ║\n", beacon.proximityUUID.c_str());
    Serial.printf("║ TX Power: %-6d                            ║\n", beacon.txPower);
  }
  
  Serial.println("╚══════════════════════════════════════════════════════╝");
  Serial.println();
}

// Fonction pour vérifier les beacons qui ont disparu
void checkForDepartedBeacons() {
  unsigned long currentTime = millis();
  
  for (auto& pair : knownBeacons) {
    String beaconId = pair.first.c_str();
    BeaconInfo& beacon = pair.second;
    
    if (beacon.isPresent && (currentTime - beacon.lastSeen) > BEACON_TIMEOUT) {
      beacon.isPresent = false;
      
      // Affichage console avec toutes les informations
      displayBeaconDetails("departure", beacon, beaconId);
      
      // Envoyer l'événement de départ au backend
      eventSender.sendBeaconDeparture(beacon, beaconId);
    }
  }
}

int scanTime = 5;  //In seconds
BLEScan *pBLEScan;

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    String beaconId = generateBeaconId(advertisedDevice);
    String deviceName = advertisedDevice.haveName() ? advertisedDevice.getName().c_str() : "Inconnu";
    String deviceUUID = advertisedDevice.haveServiceUUID() ? advertisedDevice.getServiceUUID().toString().c_str() : "N/A";
    int rssi = advertisedDevice.getRSSI();
    unsigned long currentTime = millis();
    
    // Vérifier si c'est un nouveau beacon ou un beacon connu
    bool isNewBeacon = knownBeacons.find(beaconId.c_str()) == knownBeacons.end();
    bool wasAbsent = false;
    
    if (!isNewBeacon) {
      wasAbsent = !knownBeacons[beaconId.c_str()].isPresent;
    }
    
    // Créer ou récupérer les informations du beacon
    BeaconInfo& beacon = knownBeacons[beaconId.c_str()];
    beacon.name = deviceName;
    beacon.uuid = deviceUUID;
    beacon.rssi = rssi;
    beacon.lastSeen = currentTime;
    beacon.isPresent = true;
    
    // Initialiser les informations iBeacon
    beacon.isIBeacon = false;
    beacon.major = 0;
    beacon.minor = 0;
    beacon.txPower = 0;
    beacon.proximityUUID = "";
    
    // Traitement des données iBeacon si disponibles
    if (advertisedDevice.haveManufacturerData()) {
      std::string strManufacturerData = advertisedDevice.getManufacturerData();
      uint8_t cManufacturerData[100];
      memcpy(cManufacturerData, strManufacturerData.c_str(), strManufacturerData.length());

      if (strManufacturerData.length() == 25 && cManufacturerData[0] == 0x4C && cManufacturerData[1] == 0x00) {
        BLEBeacon oBeacon = BLEBeacon();
        oBeacon.setData(strManufacturerData);
        
        // Stocker les informations iBeacon
        beacon.isIBeacon = true;
        beacon.major = ENDIAN_CHANGE_U16(oBeacon.getMajor());
        beacon.minor = ENDIAN_CHANGE_U16(oBeacon.getMinor());
        beacon.proximityUUID = String(oBeacon.getProximityUUID().toString().c_str());
        beacon.txPower = oBeacon.getSignalPower();
      }
    }
    
    // Afficher événement d'arrivée pour nouveau beacon ou beacon qui revient
    if (isNewBeacon || wasAbsent) {
      displayBeaconDetails("arrival", beacon, beaconId);
      
      // Envoyer l'événement d'arrivée au backend
      eventSender.sendBeaconArrival(beacon, beaconId);
    }
  }
};

void setup() {
  // Initialize LED pin first
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Serial.begin(115200);
  delay(1000); // Give serial time to initialize
  
  Serial.println("╔══════════════════════════════════════════════════════╗");
  Serial.println("║              BEACON SCANNER DÉMARRÉ                  ║");
  Serial.println("╠══════════════════════════════════════════════════════╣");
  Serial.printf("║ Horodatage: %s                           ║\n", getTimestamp().c_str());
  Serial.println("║ Timeout de départ: 10 secondes                      ║");
  Serial.println("║ Intervalle de scan: 5 secondes                      ║");
  Serial.printf("║ LED Pin: %d                                           ║\n", LED_PIN);
  Serial.println("╚══════════════════════════════════════════════════════╝");
  Serial.println();

  // Test LED at startup
  Serial.println("Testing LED at startup...");
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(500);
  Serial.println("LED test completed");

  // Initialize WiFi and events
  eventSender.init();
  
  // Wait for WiFi connection before starting web server
  Serial.println("Waiting for WiFi connection...");
  while (!eventSender.isConnected()) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");

  // Setup web server routes
  webServer.on("/", HTTP_GET, handleRoot);
  webServer.on("/led/on", HTTP_POST, handleLedOn);
  webServer.on("/led/off", HTTP_POST, handleLedOff);
  webServer.on("/led/on", HTTP_OPTIONS, handleOptions);
  webServer.on("/led/off", HTTP_OPTIONS, handleOptions);
  webServer.onNotFound(handleNotFound);
  
  // Start web server
  webServer.begin();
  Serial.println("Serveur HTTP pour LED démarré sur le port 80");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.println("LED control endpoints:");
  Serial.println("  POST /led/on");
  Serial.println("  POST /led/off");
  Serial.println("  GET / (status)");

  // Initialize BLE
  Serial.println("Initializing BLE...");
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
  
  Serial.println("Setup completed successfully!");
}

void loop() {
  // Handle web server requests (this is critical!)
  webServer.handleClient();
  
  // Update WiFi and event sender
  eventSender.update();
  
  // Check for departed beacons
  checkForDepartedBeacons();
  
  // BLE scan
  BLEScanResults foundDevices = pBLEScan->start(scanTime, false);
  
  // Display scan summary
  Serial.println("┌──────────────────────────────────────────────────────┐");
  Serial.printf("│ Scan terminé - %s                     │\n", getTimestamp().c_str());
  Serial.printf("│ Appareils trouvés: %-2d                              │\n", foundDevices.getCount());
  Serial.printf("│ Beacons connus: %-2d                                 │\n", knownBeacons.size());
  Serial.printf("│ WiFi: %-9s | File d'attente: %-2d              │\n", 
                eventSender.isConnected() ? "Connecté" : "Déconnecté", 
                eventSender.getQueueSize());
  Serial.println("└──────────────────────────────────────────────────────┘");
  Serial.println();
  
  pBLEScan->clearResults();
  delay(1000); // Reduced delay to handle web requests more frequently
}