#include "SendEvents.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Configuration WiFi - À modifier selon votre réseau
const char* ssid = "newton";     // Vérifier que le nom est exact
const char* password = "wesh1234"; // Vérifier que le mot de passe est correct

// Configuration du contrôleur intermédiaire - À modifier selon votre contrôleur
const char* serverURL = "http://172.20.10.5:4000"; // Remplacez par l'IP de votre contrôleur
const char* endpointArrival = "/beacon/arrival";
const char* endpointDeparture = "/beacon/departure";

// Variables pour la gestion de la connexion
bool wifiConnected = false;
unsigned long lastWifiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000; // Vérifier la connexion WiFi toutes les 30 secondes

// File d'attente pour les événements (en cas de perte de connexion)
std::vector<PendingEvent> eventQueue;
const int MAX_QUEUE_SIZE = 50;

SendEvents::SendEvents() {
    // Constructeur
}

void SendEvents::init() {
    Serial.println("╔══════════════════════════════════════════════════════╗");
    Serial.println("║              INITIALISATION WIFI                     ║");
    Serial.println("╚══════════════════════════════════════════════════════╝");
    
    connectToWiFi();
}

void SendEvents::connectToWiFi() {
    WiFi.begin(ssid, password);
    Serial.print("Connexion au WiFi");
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        Serial.println();
        Serial.printf("WiFi connecté! IP: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("Serveur backend: %s\n", serverURL);
        Serial.println();
        
        // Traiter les événements en attente
        processQueuedEvents();
    } else {
        wifiConnected = false;
        Serial.println();
        Serial.println("Échec de la connexion WiFi!");
        Serial.println();
    }
}

void SendEvents::checkWiFiConnection() {
    unsigned long currentTime = millis();
    
    if (currentTime - lastWifiCheck > WIFI_CHECK_INTERVAL) {
        lastWifiCheck = currentTime;
        
        if (WiFi.status() != WL_CONNECTED) {
            if (wifiConnected) {
                Serial.println("Connexion WiFi perdue, tentative de reconnexion...");
                wifiConnected = false;
            }
            connectToWiFi();
        } else if (!wifiConnected) {
            wifiConnected = true;
            Serial.println("Connexion WiFi rétablie!");
            processQueuedEvents();
        }
    }
}

bool SendEvents::sendBeaconEvent(const String& eventType, const BeaconInfo& beacon, const String& beaconId) {
    if (!wifiConnected) {
        // Ajouter à la file d'attente si pas de connexion
        queueEvent(eventType, beacon, beaconId);
        return false;
    }
    
    HTTPClient http;
    http.begin(String(serverURL) + (eventType == "arrival" ? endpointArrival : endpointDeparture));
    http.addHeader("Content-Type", "application/json");
    
    // Créer le payload JSON
    StaticJsonDocument<512> doc;
    doc["timestamp"] = getTimestamp();
    doc["beaconId"] = beaconId;
    doc["name"] = beacon.name;
    doc["uuid"] = beacon.uuid;
    doc["rssi"] = beacon.rssi;
    doc["eventType"] = eventType;
    doc["deviceId"] = getDeviceId();
    
    String payload;
    serializeJson(doc, payload);
    
    int httpResponseCode = http.POST(payload);
    
    if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.printf("Événement envoyé (%s): %d - %s\n", eventType.c_str(), httpResponseCode, response.c_str());
        http.end();
        return true;
    } else {
        Serial.printf("Erreur envoi événement: %s\n", http.errorToString(httpResponseCode).c_str());
        http.end();
        
        // Ajouter à la file d'attente en cas d'erreur
        queueEvent(eventType, beacon, beaconId);
        return false;
    }
}

void SendEvents::sendBeaconArrival(const BeaconInfo& beacon, const String& beaconId) {
    sendBeaconEvent("arrival", beacon, beaconId);
}

void SendEvents::sendBeaconDeparture(const BeaconInfo& beacon, const String& beaconId) {
    sendBeaconEvent("departure", beacon, beaconId);
}

void SendEvents::queueEvent(const String& eventType, const BeaconInfo& beacon, const String& beaconId) {
    // Éviter que la file d'attente devienne trop grande
    if (eventQueue.size() >= MAX_QUEUE_SIZE) {
        eventQueue.erase(eventQueue.begin()); // Supprimer l'événement le plus ancien
    }
    
    PendingEvent event;
    event.eventType = eventType;
    event.beaconId = beaconId;
    event.beacon = beacon;
    event.timestamp = millis();
    
    eventQueue.push_back(event);
    
    Serial.printf("Événement mis en file d'attente: %s (Total: %d)\n", eventType.c_str(), eventQueue.size());
}

void SendEvents::processQueuedEvents() {
    if (eventQueue.empty()) {
        return;
    }
    
    Serial.printf("Traitement de %d événements en attente...\n", eventQueue.size());
    
    auto it = eventQueue.begin();
    while (it != eventQueue.end()) {
        if (sendBeaconEvent(it->eventType, it->beacon, it->beaconId)) {
            it = eventQueue.erase(it);
        } else {
            break; // Arrêter si l'envoi échoue
        }
    }
    
    Serial.printf("Événements restants en file d'attente: %d\n", eventQueue.size());
}

void SendEvents::update() {
    checkWiFiConnection();
}

String SendEvents::getDeviceId() {
    // Générer un ID unique basé sur l'adresse MAC
    String mac = WiFi.macAddress();
    mac.replace(":", "");
    return "ESP32_" + mac;
}

String SendEvents::getTimestamp() {
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

bool SendEvents::isConnected() {
    return wifiConnected;
}

int SendEvents::getQueueSize() {
    return eventQueue.size();
}

void SendEvents::clearQueue() {
    eventQueue.clear();
    Serial.println("File d'attente des événements vidée.");
}

// Fonction pour envoyer un ping au serveur (optionnel)
bool SendEvents::pingServer() {
    if (!wifiConnected) {
        return false;
    }
    
    HTTPClient http;
    http.begin(String(serverURL) + "/ping");
    http.setTimeout(5000);
    
    int httpResponseCode = http.GET();
    http.end();
    
    return httpResponseCode == 200;
}