// Alert Store - Single source of truth for all alert data
// Uses service factory and follows architecture contract strictly
// UI components only interact with this store - never directly with services

import { create } from "zustand";
import { alertService } from "@/middleware/services/service-factory";
import { AlertEntity, AlertType } from "@/backend/domain/entities/Alert";

let activeAlertsUserId: string | null = null;
let activeAlertsUnsubscribe: (() => void) | null = null;

interface AlertState {
  // Data
  alerts: AlertEntity[];
  unreadCount: number;

  // Loading states
  loading: boolean;
  refreshing: boolean;

  // Error states
  error: string | null;

  // Pagination
  hasMore: boolean;
  lastLoadedAt?: string;

  // Actions
  loadAlerts: (refresh?: boolean) => Promise<void>;
  subscribeToAlerts: (userId: string) => () => void;
  markAsRead: (alertId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteAlert: (alertId: string) => Promise<void>;
  refreshAlerts: () => Promise<void>;
  clearErrors: () => void;

  // Utility actions
  getAlertsByType: (type: AlertType) => AlertEntity[];
  getUnreadAlerts: () => AlertEntity[];
  getSocialAlerts: () => AlertEntity[];
  getDareAlerts: () => AlertEntity[];
  getTruthAlerts: () => AlertEntity[];
}

export const useAlertStore = create<AlertState>((set, get) => ({
  // Initial state
  alerts: [],
  unreadCount: 0,
  loading: false,
  refreshing: false,
  error: null,
  hasMore: true,

  // Load alerts
  loadAlerts: async (refresh = false) => {
    const { loading, alerts } = get();

    // Prevent duplicate loads
    if (loading && !refresh) return;

    set({
      loading: true,
      error: null,
      refreshing: refresh,
    });

    try {
      // Get current user from auth store
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      const response = await alertService.getAlerts({
        userId: currentUser.id,
        limit: refresh ? undefined : 20, // Load more on pagination
        unreadOnly: false,
      });

      if (response.success && response.alerts) {
        // Convert service alerts to AlertEntity instances
        const alertEntities = response.alerts.map((alertData: any) => {
          if (alertData instanceof AlertEntity) {
            return alertData; // Already an AlertEntity
          }
          // Convert plain object to AlertEntity
          return AlertEntity.create({
            id: alertData.id || "",
            userId: alertData.userId || "",
            type: alertData.type || "SYSTEM_NOTIFICATION",
            entityId: alertData.entityId || "",
            actorId: alertData.actorId || "",
            message: alertData.message || "",
            metadata: alertData.metadata || {},
            isRead: alertData.isRead || false,
            createdAt: alertData.createdAt || new Date().toISOString(),
            updatedAt: alertData.updatedAt || new Date().toISOString(),
          });
        });

        const mergedAlerts = refresh
          ? alertEntities
          : [...alerts, ...alertEntities];
        const unreadCount = mergedAlerts.filter(
          (alert) => !alert.isRead,
        ).length;

        set({
          alerts: mergedAlerts,
          unreadCount,
          loading: false,
          refreshing: false,
          hasMore: response.alerts.length > 0,
          lastLoadedAt: new Date().toISOString(),
        });
      } else {
        throw new Error("Failed to load alerts");
      }
    } catch (error) {
      console.error("❌ AlertStore: Error loading alerts:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to load alerts";
      set({
        error: errorMessage,
        loading: false,
        refreshing: false,
      });
    }
  },

  // Subscribe to real-time alerts
  subscribeToAlerts: (userId: string) => {
    if (activeAlertsUserId === userId && activeAlertsUnsubscribe) {
      return () => {
        if (activeAlertsUserId === userId && activeAlertsUnsubscribe) {
          activeAlertsUnsubscribe();
          activeAlertsUnsubscribe = null;
          activeAlertsUserId = null;
        }
      };
    }

    if (activeAlertsUnsubscribe) {
      activeAlertsUnsubscribe();
      activeAlertsUnsubscribe = null;
      activeAlertsUserId = null;
    }

    let unsubscribe: (() => void) | null = null;

    // Use client-side Firebase SDK for real-time updates
    import("firebase/firestore")
      .then(
        ({
          getFirestore,
          collection,
          query,
          where,
          onSnapshot,
          orderBy,
          limit,
        }) => {
          const db = getFirestore();
          const alertsRef = collection(db, "alerts");
          const q = query(
            alertsRef,
            where("userId", "==", userId),
            orderBy("createdAt", "desc"),
            limit(50), // Keep enough recent alerts to cover both Social and Sus tabs
          );

          unsubscribe = onSnapshot(
            q,
            (snapshot) => {
              const alerts = snapshot.docs.map((doc) => {
                const data = doc.data();

                // Create proper AlertEntity instance with methods
                const alertEntity = AlertEntity.create({
                  id: doc.id,
                  userId: data.userId || "",
                  type: data.type || "SYSTEM_NOTIFICATION",
                  entityId: data.entityId || "",
                  actorId: data.actorId || "",
                  message: data.message || "",
                  metadata: data.metadata || {},
                  isRead: data.isRead || false,
                  createdAt:
                    data.createdAt?.toDate?.()?.toISOString?.() ||
                    data.createdAt ||
                    new Date().toISOString(),
                  updatedAt:
                    data.updatedAt?.toDate?.()?.toISOString?.() ||
                    data.updatedAt ||
                    new Date().toISOString(),
                });

                return alertEntity;
              });

              set({
                alerts,
                loading: false,
                refreshing: false,
                error: null,
                lastLoadedAt: new Date().toISOString(),
              });

              // Update unread count
              const unreadCount = alerts.filter(
                (alert) => !alert.isRead,
              ).length;
              set({ unreadCount });

              // Trigger profile data fetching for new alerts
              setTimeout(() => {
                alerts.forEach((alert) => {
                  if (alert.actorId) {
                    // This will be handled by the AlertsScreen component
                  }
                });
              }, 0);
            },
            (error) => {
              console.error("❌ AlertStore: Real-time listener error:", error);
              set({
                error: error.message,
                loading: false,
                refreshing: false,
              });
            },
          );

          activeAlertsUserId = userId;
          activeAlertsUnsubscribe = () => {
            unsubscribe?.();
            if (activeAlertsUserId === userId) {
              activeAlertsUnsubscribe = null;
              activeAlertsUserId = null;
            }
          };
        },
      )
      .catch((error) => {
        console.error("❌ AlertStore: Failed to import Firebase:", error);
        set({
          error: "Failed to initialize real-time alerts",
          loading: false,
          refreshing: false,
        });
      });

    // Return unsubscribe function (immediately, will be set when import completes)
    return () => {
      if (activeAlertsUserId === userId && activeAlertsUnsubscribe) {
        activeAlertsUnsubscribe();
      } else if (unsubscribe) {
        unsubscribe();
      }
    };
  },

  // Mark alert as read
  markAsRead: async (alertId: string) => {
    try {
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      const response = await alertService.markAlertAsRead({
        alertId,
        userId: currentUser.id,
      });

      if (response.success) {
        // Update local state - create new AlertEntity instances
        set((state) => ({
          alerts: state.alerts.map((alert) =>
            alert.id === alertId ? alert.markAsRead() : alert,
          ),
          unreadCount: Math.max(0, state.unreadCount - 1),
        }));
      } else {
        throw new Error("Failed to mark alert as read");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to mark alert as read";
      set({ error: errorMessage });
    }
  },

  // Mark all alerts as read
  markAllAsRead: async () => {
    try {
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      const response = await alertService.markAllAlertsAsRead(currentUser.id);

      if (response.success) {
        // Update local state - create new AlertEntity instances
        set((state) => ({
          alerts: state.alerts.map((alert) => alert.markAsRead()),
          unreadCount: 0,
        }));
      } else {
        throw new Error("Failed to mark all alerts as read");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to mark all alerts as read";
      set({ error: errorMessage });
    }
  },

  // Delete alert
  deleteAlert: async (alertId: string) => {
    try {
      const { useAuthStore } = await import("./useAuthStore-v2");
      const currentUser = useAuthStore.getState().user;

      if (!currentUser?.id) {
        throw new Error("User not authenticated");
      }

      const response = await alertService.deleteAlert(alertId, currentUser.id);

      if (response.success) {
        // Update local state
        const alertToDelete = get().alerts.find(
          (alert) => alert.id === alertId,
        );
        set((state) => ({
          alerts: state.alerts.filter((alert) => alert.id !== alertId),
          unreadCount:
            alertToDelete && !alertToDelete.isRead
              ? Math.max(0, state.unreadCount - 1)
              : state.unreadCount,
        }));
      } else {
        throw new Error("Failed to delete alert");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete alert";
      set({ error: errorMessage });
    }
  },

  // Refresh alerts
  refreshAlerts: async () => {
    set({ refreshing: true });
    await get().loadAlerts(true);
    set({ refreshing: false });
  },

  // Clear errors
  clearErrors: () => {
    set({ error: null });
  },

  // Utility methods
  getAlertsByType: (type: AlertType) => {
    return get().alerts.filter((alert) => alert.type === type);
  },

  getUnreadAlerts: () => {
    return get().alerts.filter((alert) => !alert.isRead);
  },

  getSocialAlerts: () => {
    return get().alerts.filter((alert) => alert.isSocialAlert());
  },

  getDareAlerts: () => {
    return get().alerts.filter((alert) => alert.isDareRelated());
  },

  getTruthAlerts: () => {
    return get().alerts.filter((alert) => alert.isTruthRelated());
  },
}));
