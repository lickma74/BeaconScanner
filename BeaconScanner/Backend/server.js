
const express = require('express');
const cors = require('cors');
const path = require('path'); // 🆕 Chemins de fichiers sûrs
const axios = require('axios');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- LED control endpoints ---
const CONTROLLER_URL = process.env.CONTROLLER_URL || 'http://localhost:4000';
app.post('/led/:state', async (req, res) => {
    const state = req.params.state;
    if (state !== 'on' && state !== 'off') {
        return res.status(400).json({ success: false, error: 'Invalid state' });
    }
    try {
        const response = await axios.post(`${CONTROLLER_URL}/led/${state}`);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// ✅ Servir les fichiers statiques depuis le dossier "Frontend"
app.use(express.static(path.join(__dirname, '..', 'Frontend')));

// ✅ Route principale pour servir "index.html"
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'Frontend', 'index.html'));
});

// Port d'écoute
const PORT = process.env.PORT || 3000;

// Stockage en mémoire des événements (vous pouvez utiliser une base de données)
let beaconEvents = [];
let connectedDevices = new Set();

// Fonction pour logger avec timestamp
function logWithTimestamp(message) {
    const now = new Date();
    const timestamp = now.toISOString();
    console.log(`[${timestamp}] ${message}`);
}

// Endpoint pour les arrivées de beacons
app.post('/beacon/arrival', (req, res) => {
    try {
        const eventData = req.body;
        
        // Valider les données requises
        if (!eventData.beaconId || !eventData.deviceId) {
            return res.status(400).json({ 
                error: 'Champs obligatoires manquants: beaconId, deviceId' 
            });
        }
        
        // Ajouter des métadonnées
        eventData.receivedAt = new Date().toISOString();
        eventData.eventType = 'arrival';
        
        // Stocker l'événement
        beaconEvents.push(eventData);
        
        // Ajouter l'appareil à la liste des appareils connectés
        connectedDevices.add(eventData.deviceId);
        
        // Logger l'événement
        logWithTimestamp(`🟢 ARRIVÉE - Beacon: ${eventData.name || 'Inconnu'} (${eventData.beaconId}) - Device: ${eventData.deviceId} - RSSI: ${eventData.rssi}`);
        
        // Nettoyer les anciens événements (garder seulement les 1000 derniers)
        if (beaconEvents.length > 1000) {
            beaconEvents = beaconEvents.slice(-1000);
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Événement d\'arrivée reçu',
            eventId: beaconEvents.length 
        });
        
    } catch (error) {
        logWithTimestamp(`❌ Erreur lors du traitement de l'arrivée: ${error.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// Endpoint pour les départs de beacons
app.post('/beacon/departure', (req, res) => {
    try {
        const eventData = req.body;
        
        // Valider les données requises
        if (!eventData.beaconId || !eventData.deviceId) {
            return res.status(400).json({ 
                error: 'Champs obligatoires manquants: beaconId, deviceId' 
            });
        }
        
        // Ajouter des métadonnées
        eventData.receivedAt = new Date().toISOString();
        eventData.eventType = 'departure';
        
        // Stocker l'événement
        beaconEvents.push(eventData);
        
        // Ajouter l'appareil à la liste des appareils connectés
        connectedDevices.add(eventData.deviceId);
        
        // Logger l'événement
        logWithTimestamp(`🔴 DÉPART - Beacon: ${eventData.name || 'Inconnu'} (${eventData.beaconId}) - Device: ${eventData.deviceId} - RSSI: ${eventData.rssi}`);
        
        // Nettoyer les anciens événements (garder seulement les 1000 derniers)
        if (beaconEvents.length > 1000) {
            beaconEvents = beaconEvents.slice(-1000);
        }
        
        res.status(200).json({ 
            success: true, 
            message: 'Événement de départ reçu',
            eventId: beaconEvents.length 
        });
        
    } catch (error) {
        logWithTimestamp(`❌ Erreur lors du traitement du départ: ${error.message}`);
        res.status(500).json({ error: 'Erreur interne du serveur' });
    }
});

// Endpoint pour vérifier la connexion (ping)
app.get('/ping', (req, res) => {
    res.status(200).json({ 
        success: true, 
        message: 'Serveur actif',
        timestamp: new Date().toISOString() 
    });
});

// Endpoint pour obtenir tous les événements
app.get('/events', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    
    const paginatedEvents = beaconEvents
        .slice(-limit - offset, -offset || undefined)
        .reverse();
    
    res.json({
        events: paginatedEvents,
        total: beaconEvents.length,
        connectedDevices: Array.from(connectedDevices)
    });
});

// Endpoint pour obtenir les statistiques
app.get('/stats', (req, res) => {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentEvents = beaconEvents.filter(event => 
        new Date(event.receivedAt) > last24h
    );
    
    const arrivals = recentEvents.filter(e => e.eventType === 'arrival').length;
    const departures = recentEvents.filter(e => e.eventType === 'departure').length;
    
    // Compter les beacons uniques
    const uniqueBeacons = new Set(recentEvents.map(e => e.beaconId));
    
    res.json({
        totalEvents: beaconEvents.length,
        last24h: {
            total: recentEvents.length,
            arrivals: arrivals,
            departures: departures,
            uniqueBeacons: uniqueBeacons.size
        },
        connectedDevices: Array.from(connectedDevices),
        uptime: process.uptime()
    });
});

// Endpoint pour obtenir l'état actuel des beacons
app.get('/beacons/status', (req, res) => {
    const currentStatus = new Map();
    
    // Parcourir les événements du plus récent au plus ancien
    for (let i = beaconEvents.length - 1; i >= 0; i--) {
        const event = beaconEvents[i];
        
        if (!currentStatus.has(event.beaconId)) {
            currentStatus.set(event.beaconId, {
                beaconId: event.beaconId,
                name: event.name,
                uuid: event.uuid,
                lastSeen: event.receivedAt,
                status: event.eventType,
                rssi: event.rssi,
                deviceId: event.deviceId
            });
        }
    }
    
    const statusArray = Array.from(currentStatus.values());
    const present = statusArray.filter(b => b.status === 'arrival');
    const absent = statusArray.filter(b => b.status === 'departure');
    
    res.json({
        total: statusArray.length,
        present: present.length,
        absent: absent.length,
        beacons: statusArray
    });
});

// Endpoint pour supprimer les anciens événements
app.delete('/events/cleanup', (req, res) => {
    const daysToKeep = parseInt(req.query.days) || 7;
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
    
    const originalCount = beaconEvents.length;
    beaconEvents = beaconEvents.filter(event => 
        new Date(event.receivedAt) > cutoffDate
    );
    
    const deletedCount = originalCount - beaconEvents.length;
    
    logWithTimestamp(`🧹 Nettoyage: ${deletedCount} événements supprimés (plus de ${daysToKeep} jours)`);
    
    res.json({
        success: true,
        message: `${deletedCount} événements supprimés`,
        remaining: beaconEvents.length
    });
});

// Endpoint pour obtenir les événements d'un beacon spécifique
app.get('/beacon/:beaconId/events', (req, res) => {
    const beaconId = req.params.beaconId;
    const limit = parseInt(req.query.limit) || 50;
    
    const beaconEvents_filtered = beaconEvents
        .filter(event => event.beaconId === beaconId)
        .slice(-limit)
        .reverse();
    
    res.json({
        beaconId: beaconId,
        events: beaconEvents_filtered,
        total: beaconEvents_filtered.length
    });
});

// Middleware pour gérer les erreurs 404
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint non trouvé',
        availableEndpoints: [
            'POST /beacon/arrival',
            'POST /beacon/departure',
            'GET /ping',
            'GET /events',
            'GET /stats',
            'GET /beacons/status',
            'GET /beacon/:beaconId/events',
            'DELETE /events/cleanup'
        ]
    });
});

// Middleware pour gérer les erreurs globales
app.use((error, req, res, next) => {
    logWithTimestamp(`❌ Erreur non gérée: ${error.message}`);
    res.status(500).json({ 
        error: 'Erreur interne du serveur',
        message: error.message 
    });
});

// Démarrage du serveur
app.listen(PORT, () => {
    logWithTimestamp(`🚀 Serveur démarré sur le port ${PORT}`);
    logWithTimestamp(`📡 Endpoints disponibles:`);
    logWithTimestamp(`   POST http://localhost:${PORT}/beacon/arrival`);
    logWithTimestamp(`   POST http://localhost:${PORT}/beacon/departure`);
    logWithTimestamp(`   GET  http://localhost:${PORT}/ping`);
    logWithTimestamp(`   GET  http://localhost:${PORT}/events`);
    logWithTimestamp(`   GET  http://localhost:${PORT}/stats`);
    logWithTimestamp(`   GET  http://localhost:${PORT}/beacons/status`);
    logWithTimestamp(`💡 Prêt à recevoir les événements des beacons!`);
});

// Nettoyage automatique des anciens événements (toutes les heures)
setInterval(() => {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 jours
    const originalCount = beaconEvents.length;
    beaconEvents = beaconEvents.filter(event => 
        new Date(event.receivedAt) > cutoffDate
    );
    
    const deletedCount = originalCount - beaconEvents.length;
    if (deletedCount > 0) {
        logWithTimestamp(`🧹 Nettoyage automatique: ${deletedCount} événements supprimés`);
    }
}, 60 * 60 * 1000); // Toutes les heures

// Gestionnaire pour arrêt propre
process.on('SIGINT', () => {
    logWithTimestamp('🛑 Arrêt du serveur...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logWithTimestamp('🛑 Arrêt du serveur...');
    process.exit(0);
});