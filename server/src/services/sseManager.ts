import { Response } from 'express';
import { SSEEventPayload, appEventEmitter } from './eventEmitter';

/**
 * Métadonnées pour chaque connexion client SSE
 */
interface SSEClient {
  id: string;
  userId: string;
  response: Response;
  connectedAt: Date;
  lastHeartbeat: Date;
}

/**
 * Gestionnaire centralisé des connexions Server-Sent Events
 * Gère l'enregistrement, la déconnexion et le broadcast des évènements
 */
class SSEManager {
  private static instance: SSEManager;
  private clients: Map<string, SSEClient>;
  private heartbeatInterval: NodeJS.Timeout | null;
  private cleanupInterval: NodeJS.Timeout | null;

  // Limites de sécurité
  private readonly MAX_CONNECTIONS_PER_USER = 5;
  private readonly MAX_TOTAL_CONNECTIONS = 1000;
  private readonly HEARTBEAT_INTERVAL_MS = 30000; // 30 secondes
  private readonly CLEANUP_INTERVAL_MS = 300000; // 5 minutes
  private readonly CONNECTION_TTL_MS = 3600000; // 1 heure

  private constructor() {
    this.clients = new Map();
    this.heartbeatInterval = null;
    this.cleanupInterval = null;

    // Écouter les évènements de l'EventEmitter
    appEventEmitter.on('sse-event', (payload: SSEEventPayload) => {
      this.broadcast(payload);
    });

    // Démarrer le heartbeat et le cleanup
    this.startHeartbeat();
    this.startCleanup();

    console.log('🔌 SSE Manager initialisé');
  }

  /**
   * Obtenir l'instance singleton du SSEManager
   */
  public static getInstance(): SSEManager {
    if (!SSEManager.instance) {
      SSEManager.instance = new SSEManager();
    }
    return SSEManager.instance;
  }

  /**
   * Ajouter un nouveau client SSE
   */
  public addClient(clientId: string, userId: string, response: Response): boolean {
    // Vérifier la limite totale de connexions
    if (this.clients.size >= this.MAX_TOTAL_CONNECTIONS) {
      console.warn(`⚠️ Limite de connexions totales atteinte (${this.MAX_TOTAL_CONNECTIONS})`);
      return false;
    }

    // Vérifier la limite de connexions par utilisateur
    const userConnections = Array.from(this.clients.values()).filter(
      client => client.userId === userId
    );

    if (userConnections.length >= this.MAX_CONNECTIONS_PER_USER) {
      console.warn(`⚠️ Limite de connexions atteinte pour l'utilisateur ${userId} (${this.MAX_CONNECTIONS_PER_USER})`);

      // Fermer la connexion la plus ancienne pour cet utilisateur
      const oldestConnection = userConnections.sort((a, b) =>
        a.connectedAt.getTime() - b.connectedAt.getTime()
      )[0];

      this.removeClient(oldestConnection.id);
    }

    // Ajouter le client
    const client: SSEClient = {
      id: clientId,
      userId,
      response,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
    };

    this.clients.set(clientId, client);
    console.log(`✅ Client SSE ajouté: ${clientId} (Utilisateur: ${userId}, Total: ${this.clients.size})`);

    // Envoyer un évènement de connexion initiale
    this.sendToClient(clientId, {
      type: 'CONNECTED' as any,
      data: { message: 'Connecté au flux SSE', clientId },
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Retirer un client SSE
   */
  public removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        client.response.end();
      } catch (error) {
        // Ignorer les erreurs si la réponse est déjà fermée
      }
      this.clients.delete(clientId);
      console.log(`❌ Client SSE retiré: ${clientId} (Total: ${this.clients.size})`);
    }
  }

  /**
   * Envoyer un évènement à un client spécifique
   */
  private sendToClient(clientId: string, payload: SSEEventPayload): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const eventType = payload.type;
      // Strip server-only routing field before sending to client
      const { targetUserIds: _ignored, ...payloadForClient } = payload as any;
      const data = JSON.stringify(payloadForClient);

      client.response.write(`event: ${eventType}\n`);
      client.response.write(`data: ${data}\n\n`);

      client.lastHeartbeat = new Date();
    } catch (error) {
      console.error(`❌ Erreur lors de l'envoi à ${clientId}:`, error);
      this.removeClient(clientId);
    }
  }

  /**
   * Broadcaster un évènement à tous les clients connectés
   */
  public broadcast(payload: SSEEventPayload): void {
    // Si des cibles spécifiques sont définies, broadcast ciblé uniquement
    if ((payload as any).targetUserIds && (payload as any).targetUserIds.length > 0) {
      this.broadcastToUsers((payload as any).targetUserIds, payload);
      return;
    }

    const clientIds = Array.from(this.clients.keys());
    console.log(`📢 Broadcasting ${payload.type} à ${clientIds.length} client(s)`);
    clientIds.forEach(clientId => {
      this.sendToClient(clientId, payload);
    });
  }

  /**
   * Broadcaster un évènement à un ensemble ciblé d'utilisateurs
   */
  public broadcastToUsers(userIds: string[], payload: SSEEventPayload): void {
    const targetClients = Array.from(this.clients.values()).filter(
      client => userIds.includes(client.userId)
    );

    console.log(`🎯 Targeted broadcast ${payload.type} → ${userIds.length} user(s) ciblé(s), ${targetClients.length} client(s) actif(s)`);

    targetClients.forEach(client => {
      this.sendToClient(client.id, payload);
    });
  }

  /**
   * Envoyer un heartbeat (keep-alive) à tous les clients
   */
  private sendHeartbeat(): void {
    const clientIds = Array.from(this.clients.keys());

    clientIds.forEach(clientId => {
      const client = this.clients.get(clientId);
      if (client) {
        try {
          // Envoyer un commentaire SSE pour maintenir la connexion
          client.response.write(': heartbeat\n\n');
          client.lastHeartbeat = new Date();
        } catch (error) {
          console.error(`❌ Erreur heartbeat pour ${clientId}:`, error);
          this.removeClient(clientId);
        }
      }
    });
  }

  /**
   * Démarrer l'intervalle de heartbeat
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL_MS);

    console.log(`💓 Heartbeat démarré (intervalle: ${this.HEARTBEAT_INTERVAL_MS}ms)`);
  }

  /**
   * Nettoyer les connexions obsolètes
   */
  private cleanupStaleConnections(): void {
    const now = new Date().getTime();
    const staleClients: string[] = [];

    this.clients.forEach((client, clientId) => {
      const lastActivity = Math.max(
        client.connectedAt.getTime(),
        client.lastHeartbeat.getTime()
      );

      if (now - lastActivity > this.CONNECTION_TTL_MS) {
        staleClients.push(clientId);
      }
    });

    if (staleClients.length > 0) {
      console.log(`🧹 Nettoyage de ${staleClients.length} connexion(s) obsolète(s)`);
      staleClients.forEach(clientId => this.removeClient(clientId));
    }
  }

  /**
   * Démarrer l'intervalle de nettoyage
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, this.CLEANUP_INTERVAL_MS);

    console.log(`🧹 Cleanup démarré (intervalle: ${this.CLEANUP_INTERVAL_MS}ms)`);
  }

  /**
   * Arrêter tous les intervalles et fermer toutes les connexions
   */
  public shutdown(): void {
    console.log('⏹️ Arrêt du SSE Manager...');

    // Arrêter les intervalles
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Fermer toutes les connexions
    const clientIds = Array.from(this.clients.keys());
    clientIds.forEach(clientId => this.removeClient(clientId));

    console.log('✅ SSE Manager arrêté');
  }

  /**
   * Obtenir le nombre de connexions actives
   */
  public getActiveConnectionsCount(): number {
    return this.clients.size;
  }

  /**
   * Obtenir les statistiques des connexions
   */
  public getStats(): {
    totalConnections: number;
    userConnections: Record<string, number>;
    oldestConnection: Date | null;
  } {
    const userConnections: Record<string, number> = {};
    let oldestConnection: Date | null = null;

    this.clients.forEach(client => {
      // Compter les connexions par utilisateur
      userConnections[client.userId] = (userConnections[client.userId] || 0) + 1;

      // Trouver la connexion la plus ancienne
      if (!oldestConnection || client.connectedAt < oldestConnection) {
        oldestConnection = client.connectedAt;
      }
    });

    return {
      totalConnections: this.clients.size,
      userConnections,
      oldestConnection,
    };
  }
}

// Exporter l'instance singleton
export const sseManager = SSEManager.getInstance();
