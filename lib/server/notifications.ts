import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { getActiveDbAdapterName, getMySqlPool } from './db';
import type { InAppNotification } from '../types';
import type { RowDataPacket } from 'mysql2/promise';

let notifDb: DatabaseSync | null = null;

function getNotificationDb(): DatabaseSync {
  if (notifDb) return notifDb;
  const dataDir = resolve('.data');
  mkdirSync(dataDir, { recursive: true });
  const dbPath = resolve(dataDir, 'notifications.db');
  notifDb = new DatabaseSync(dbPath);

  notifDb.exec(`
    CREATE TABLE IF NOT EXISTS in_app_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NULL,
      role TEXT NULL,
      branch_id INTEGER NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'info',
      link TEXT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at TEXT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_recipient ON in_app_notifications(recipient_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_notif_role ON in_app_notifications(role, is_read);
  `);

  return notifDb;
}

export interface CreateNotificationParams {
  recipient_id?: number | null;
  role?: string | null;
  branch_id?: number | null;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'approval' | 'system';
  link?: string | null;
}

export async function createInAppNotification(params: CreateNotificationParams): Promise<number | null> {
  const db = getNotificationDb();
  const {
    recipient_id = null,
    role = null,
    branch_id = null,
    title,
    message,
    type = 'info',
    link = null,
  } = params;

  try {
    const info = db.prepare(
      `INSERT INTO in_app_notifications (recipient_id, role, branch_id, title, message, type, link, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(recipient_id, role, branch_id, title, message, type, link, new Date().toISOString());
    return Number(info.lastInsertRowid);
  } catch (error) {
    console.error('Error creating in-app notification:', error);
    return null;
  }
}

export async function syncPendingRoleNotifications(user: { id: number; role: string; branch_id: number | null }): Promise<void> {
  // Inspect active MySQL database for pending approvals to automatically generate in-app notifications
  if (getActiveDbAdapterName() !== 'mysql') return;

  const db = getNotificationDb();
  try {
    const pool = getMySqlPool();
    if (['manager', 'higher_manager'].includes(user.role)) {
      const [pending] = await pool.query<RowDataPacket[]>(
        `SELECT id, summary, customer_name, requested_by, branch_id, type 
         FROM approvals 
         WHERE status = 'pending' 
           AND (? IS NULL OR branch_id = ? OR ? = 'higher_manager')
         ORDER BY id DESC LIMIT 5`,
        [user.branch_id, user.branch_id, user.role]
      );

      for (const app of pending) {
        const link = '/dashboard?tab=decisions';
        const exists = db.prepare(
          `SELECT id FROM in_app_notifications 
           WHERE link = ? AND (recipient_id = ? OR role = ?) AND is_read = 0 LIMIT 1`
        ).get(link, user.id, user.role);

        if (!exists) {
          db.prepare(
            `INSERT INTO in_app_notifications (recipient_id, role, branch_id, title, message, type, link, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, 'approval', ?, 0, ?)`
          ).run(
            user.id,
            user.role,
            app.branch_id ?? null,
            'Pending Approval Needed',
            `Request "${app.summary || app.type}" is awaiting review.`,
            link,
            new Date().toISOString()
          );
        }
      }
    } else if (user.role === 'agent') {
      const [decided] = await pool.query<RowDataPacket[]>(
        `SELECT id, summary, status, notes, type FROM approvals 
         WHERE requested_by = ? AND status IN ('approved', 'rejected') 
         ORDER BY reviewed_at DESC LIMIT 5`,
        [user.id]
      );

      for (const app of decided) {
        const summaryText = app.summary || app.type;
        const exists = db.prepare(
          `SELECT id FROM in_app_notifications 
           WHERE recipient_id = ? AND title LIKE ? LIMIT 1`
        ).get(user.id, `%${summaryText}%`);

        if (!exists) {
          db.prepare(
            `INSERT INTO in_app_notifications (recipient_id, role, branch_id, title, message, type, link, is_read, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
          ).run(
            user.id,
            user.role,
            user.branch_id ?? null,
            `Request ${app.status === 'approved' ? 'Approved' : 'Rejected'}: ${summaryText}`,
            app.notes ? `Decision: ${app.status}. Note: ${app.notes}` : `Your request "${summaryText}" was ${app.status}.`,
            app.status === 'approved' ? 'success' : 'warning',
            '/dashboard?tab=decisions',
            new Date().toISOString()
          );
        }
      }
    }
  } catch {
    // Non-blocking sync
  }
}

export async function getNotificationsForUser(user: { id: number; role: string; branch_id: number | null }): Promise<{
  notifications: InAppNotification[];
  unreadCount: number;
}> {
  const db = getNotificationDb();
  await syncPendingRoleNotifications(user);

  try {
    const rows = db.prepare(
      `SELECT id, recipient_id, role, branch_id, title, message, type, link, is_read, 
              created_at, read_at
       FROM in_app_notifications
       WHERE (recipient_id = ? OR (recipient_id IS NULL AND (role = ? OR role = 'all' OR role IS NULL)))
         AND (branch_id IS NULL OR branch_id = ? OR ? IN ('admin', 'higher_manager'))
       ORDER BY id DESC
       LIMIT 50`
    ).all(user.id, user.role, user.branch_id ?? null, user.role) as Array<Record<string, unknown>>;

    const notifications: InAppNotification[] = rows.map((r) => ({
      id: Number(r.id),
      recipient_id: r.recipient_id !== null && r.recipient_id !== undefined ? Number(r.recipient_id) : null,
      role: (r.role as string) ?? null,
      branch_id: r.branch_id !== null && r.branch_id !== undefined ? Number(r.branch_id) : null,
      title: String(r.title),
      message: String(r.message),
      type: (r.type as InAppNotification['type']) ?? 'info',
      link: (r.link as string) ?? null,
      is_read: Boolean(r.is_read),
      created_at: r.created_at ? new Date(String(r.created_at)).toISOString() : new Date().toISOString(),
      read_at: r.read_at ? new Date(String(r.read_at)).toISOString() : null,
    }));

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    return { notifications, unreadCount };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return { notifications: [], unreadCount: 0 };
  }
}

export async function markNotificationAsRead(id: number, userId: number): Promise<boolean> {
  const db = getNotificationDb();
  try {
    db.prepare(
      `UPDATE in_app_notifications 
       SET is_read = 1, read_at = ? 
       WHERE id = ? AND (recipient_id = ? OR recipient_id IS NULL)`
    ).run(new Date().toISOString(), id, userId);
    return true;
  } catch (error) {
    console.error('Error marking notification read:', error);
    return false;
  }
}

export async function markAllNotificationsAsRead(user: { id: number; role: string; branch_id: number | null }): Promise<boolean> {
  const db = getNotificationDb();
  try {
    db.prepare(
      `UPDATE in_app_notifications 
       SET is_read = 1, read_at = ? 
       WHERE is_read = 0 
         AND (recipient_id = ? OR (recipient_id IS NULL AND (role = ? OR role = 'all' OR role IS NULL)))`
    ).run(new Date().toISOString(), user.id, user.role);
    return true;
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return false;
  }
}

export function resetNotificationsForTest(): void {
  const db = getNotificationDb();
  try {
    db.exec('DELETE FROM in_app_notifications');
  } catch {}
}
