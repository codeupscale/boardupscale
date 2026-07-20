import { NOTIFICATION_TYPES, type NotificationType } from '../notification.constants';

/**
 * Internal dispatch contract — used by domain services.
 * By default the actor is excluded (no self-notify).
 * Set includeActor=true for create flows where the creator should also be notified.
 */
export interface NotifyUsersDto {
  organizationId: string;
  actorUserId: string;
  type: NotificationType | string;
  title: string;
  body?: string;
  data?: Record<string, any>;
  /** Raw candidate IDs — null/undefined stripped; actor stripped unless includeActor */
  recipientUserIds: Array<string | null | undefined>;
  /** When true, actorUserId may remain in recipients (ticket/project create). */
  includeActor?: boolean;
}

export function isKnownNotificationType(type: string): type is NotificationType {
  return Object.values(NOTIFICATION_TYPES).includes(type as NotificationType);
}
