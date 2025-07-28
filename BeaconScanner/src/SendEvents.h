// Mise à jour de SendEvents.h
#ifndef SEND_EVENTS_H
#define SEND_EVENTS_H

#include <Arduino.h>
#include <vector>

// Structure étendue pour les informations d'un beacon
struct BeaconInfo {
    String name;
    String uuid;
    int rssi;
    unsigned long lastSeen;
    bool isPresent;
    
    // Nouvelles informations pour iBeacon
    bool isIBeacon;
    String proximityUUID;
    uint16_t major;
    uint16_t minor;
    int8_t txPower;
};

// Structure pour les événements en attente
struct PendingEvent {
    String eventType;
    String beaconId;
    BeaconInfo beacon;
    unsigned long timestamp;
};

class SendEvents {
private:
    // Variables pour la gestion WiFi
    bool wifiConnected;
    unsigned long lastWifiCheck;
    
    // File d'attente pour les événements
    std::vector<PendingEvent> eventQueue;
    
    // Méthodes privées
    void connectToWiFi();
    void checkWiFiConnection();
    bool sendBeaconEvent(const String& eventType, const BeaconInfo& beacon, const String& beaconId);
    void queueEvent(const String& eventType, const BeaconInfo& beacon, const String& beaconId);
    void processQueuedEvents();
    String getDeviceId();
    String getTimestamp();
    
public:
    // Constructeur
    SendEvents();
    
    // Méthodes publiques
    void init();
    void update();
    void sendBeaconArrival(const BeaconInfo& beacon, const String& beaconId);
    void sendBeaconDeparture(const BeaconInfo& beacon, const String& beaconId);
    bool isConnected();
    int getQueueSize();
    void clearQueue();
    bool pingServer();
};

// Instance globale (optionnel)
extern SendEvents eventSender;

#endif