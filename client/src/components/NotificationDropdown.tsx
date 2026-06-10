import { type CSSProperties, useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import api, { markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '../services/api';
import { getRedirectPath, type NotificationType } from '../utils/notificationRedirect';

interface Notification {
  _id: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEvent?: {
    _id: string;
    title: string;
    date: string;
  };
  relatedApplication?: {
    _id: string;
    status: string;
  };
  relatedUser?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  relatedVenue?: {
    _id: string;
    name: string;
  };
  relatedBooking?: {
    _id: string;
  };
  read: boolean;
  readAt?: string;
  createdAt: string;
}

const NotificationDropdown = () => {
  const { user } = useAuth();
  const { showError, showInfo } = useAlert();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isOrganizer = user?.role === 'ORGANIZER';
  const isComedian = user?.role === 'COMEDIAN';
  const isSpectator = user?.role === 'SPECTATOR';
  const isLieu = user?.role === 'LIEU';
  const shouldShowNotifications = isOrganizer || isComedian || isSpectator || isLieu;

  // Récupérer les notifications
  const { data: notificationsData, isError: isNotifError } = useQuery({
    queryKey: ['notifications', user?._id],
    queryFn: async () => {
      const response = await api.get('/notifications?read=false&limit=10');
      return response.data;
    },
    enabled: !!user && shouldShowNotifications,
    refetchInterval: 30000, // Rafraîchir toutes les 30 secondes
  });

  const notifications: Notification[] = isNotifError ? [] : (notificationsData?.notifications || []);
  const unreadCount = isNotifError ? 0 : (notificationsData?.unreadCount || 0);

  // Fermer le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = async (notification: Notification) => {
    // Marquer comme lue
    if (!notification.read) {
      try {
        await markNotificationAsRead(notification._id);
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      } catch (error) {
        console.error('Erreur lors du marquage de la notification:', error);
        showError('Impossible de marquer la notification comme lue');
      }
    }

    // Naviguer ou afficher un toast selon le résultat de redirection
    const result = getRedirectPath(notification, user?.role);
    if (result.path) {
      navigate(result.path);
    } else if (result.toast) {
      showInfo(result.toast);
    }
    setIsOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (error) {
      console.error('Erreur lors du marquage de toutes les notifications:', error);
      showError('Impossible de marquer toutes les notifications comme lues');
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(notificationId);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch (error) {
      console.error('Erreur lors de la suppression de la notification:', error);
      showError('Impossible de supprimer la notification');
    }
  };

  const getNotificationIcon = (type: Notification['type']): string => {
    switch (type) {
      case 'new_application':
        return '📝';
      case 'application_accepted':
        return '✅';
      case 'application_rejected':
        return '❌';
      case 'event_updated':
        return '📅';
      case 'absence_marked':
        return '🚫';
      case 'event_cancelled':
        return '🛑';
      case 'event_deleted':
        return '🗑️';
      case 'new_event':
        return '📅';
      case 'venue_booking_request':
        return '🏛️';
      case 'venue_booking_response':
        return '🏛️';
      case 'venue_booking_cancelled_by_owner':
        return '🏛️';
      case 'venue_booking_cancelled_by_requester':
        return '🏛️';
      case 'venue_date_blocked':
        return '🔒';
      case 'venue_booking_payment_required':
        return '💳';
      case 'venue_booking_confirmed':
        return '✅';
      case 'venue_booking_payment_reminder':
        return '⏰';
      case 'venue_booking_payment_expired':
        return '⏳';
      case 'venue_booking_refunded':
        return '💰';
      case 'venue_deleted_refund':
        return '🗑️';
      case 'late_cancellation_organizer':
      case 'late_cancellation_comedian':
        return '⚠️';
      default:
        return '🔔';
    }
  };

  if (!shouldShowNotifications) {
    return null;
  }

  const badgeStyle: CSSProperties = {
    position: 'relative',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'opacity 0.2s ease',
    width: '32px',
    height: '32px',
  };

  const badgeCountStyle: CSSProperties = {
    position: 'absolute',
    top: '0px',
    right: '0px',
    backgroundColor: '#dc3545',
    color: '#fff',
    borderRadius: '50%',
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.6em',
    fontWeight: 'bold',
    border: '2px solid #ffffff',
    minWidth: '16px',
  };

  const dropdownStyle: CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    width: '320px',
    maxWidth: '90vw',
    maxHeight: '450px',
    backgroundColor: 'var(--ccc-bg-elevated)',
    borderRadius: '8px',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.12)',
    border: '1px solid var(--ccc-border-subtle)',
    overflow: 'hidden',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
  };

  const notificationItemStyle: CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid var(--ccc-border-subtle)',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    position: 'relative',
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <style>{`
        @media (max-width: 640px) {
          .notification-dropdown {
            left: 0 !important;
            right: auto !important;
            width: 240px !important;
            max-width: 240px !important;
          }
        }
      `}</style>
      <div
        style={badgeStyle}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ color: '#3b82f6' }}
        >
          <path 
            d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            fill="none"
          />
          <path 
            d="M13.73 21a2 2 0 0 1-3.46 0" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        {unreadCount > 0 && (
          <span style={badgeCountStyle}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>

      {isOpen && (
        <div className="notification-dropdown" style={dropdownStyle}>
          {/* En-tête */}
          <div style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--ccc-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--ccc-bg-surface)',
          }}>
            <h3 style={{ margin: 0, color: '#7c3aed', fontSize: '0.95em', fontWeight: 'bold' }}>
              Notifications {unreadCount > 0 && `(${unreadCount})`}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(124, 58, 237, 0.2)',
                  color: '#7c3aed',
                  fontSize: '0.75em',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                Tout lu
              </button>
            )}
          </div>

          {/* Liste des notifications */}
          <div style={{
            overflowY: 'auto',
            maxHeight: '360px',
          }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '30px 16px',
                textAlign: 'center',
                color: 'var(--ccc-text-muted)',
              }}>
                <p style={{ margin: 0, fontSize: '0.9em' }}>
                  {isNotifError ? 'Impossible de charger les notifications' : 'Aucune notification'}
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification._id}
                  onClick={() => handleNotificationClick(notification)}
                  style={{
                    ...notificationItemStyle,
                    backgroundColor: notification.read ? 'transparent' : 'rgba(124, 58, 237, 0.1)',
                    borderLeft: notification.read ? 'none' : '3px solid #7c3aed',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--ccc-bg-surface)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = notification.read ? 'transparent' : 'rgba(124, 58, 237, 0.1)';
                  }}
                >
                  <span style={{ fontSize: '1.3em', flexShrink: 0 }}>
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0,
                      color: 'var(--ccc-text-primary)',
                      fontWeight: notification.read ? 'normal' : 'bold',
                      fontSize: '0.9em',
                      marginBottom: '3px',
                      lineHeight: '1.3',
                    }}>
                      {notification.title}
                    </p>
                    <p style={{
                      margin: 0,
                      color: 'var(--ccc-text-muted)',
                      fontSize: '0.8em',
                      lineHeight: '1.3',
                    }}>
                      {notification.message}
                    </p>
                    <p style={{
                      margin: '3px 0 0 0',
                      color: '#666',
                      fontSize: '0.7em',
                    }}>
                      {new Date(notification.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteNotification(e, notification._id)}
                    style={{
                      padding: '3px 6px',
                      borderRadius: '3px',
                      border: 'none',
                      background: 'rgba(220, 53, 69, 0.2)',
                      color: '#dc3545',
                      cursor: 'pointer',
                      fontSize: '0.75em',
                      flexShrink: 0,
                      minWidth: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 53, 69, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)';
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;

