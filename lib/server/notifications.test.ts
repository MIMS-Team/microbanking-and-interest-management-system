import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getNotificationsRoute, POST as postNotificationsRoute } from '../../app/api/notifications/route';
import {
  createInAppNotification,
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  resetNotificationsForTest,
} from './notifications';
import {
  createEmployee,
  createSession,
  resetDatabase,
  type PublicEmployee,
} from './db';
import { passwordHash, hashSessionToken, authCookies } from './auth';

describe('In-App Notification System & Role Routing Tests', () => {
  let admin: PublicEmployee;
  let manager: PublicEmployee;
  let higherManager: PublicEmployee;
  let agent: PublicEmployee;

  beforeEach(async () => {
    resetDatabase();
    resetNotificationsForTest();

    admin = await createEmployee({
      full_name: 'Admin User',
      email: 'admin@ravindu.bank',
      password_hash: passwordHash('Password123!'),
      role: 'admin',
      branch_id: null,
      status: 'active',
    });

    higherManager = await createEmployee({
      full_name: 'Executive Manager',
      email: 'exec@ravindu.bank',
      password_hash: passwordHash('Password123!'),
      role: 'higher_manager',
      branch_id: null,
      status: 'active',
    });

    manager = await createEmployee({
      full_name: 'Branch Manager',
      email: 'manager@ravindu.bank',
      password_hash: passwordHash('Password123!'),
      role: 'manager',
      branch_id: 1,
      status: 'active',
    });

    agent = await createEmployee({
      full_name: 'Field Agent',
      email: 'agent@ravindu.bank',
      password_hash: passwordHash('Password123!'),
      role: 'agent',
      branch_id: 1,
      status: 'active',
    });
  });

  it('correctly tracks unread counter (1, 2, etc.) when notifications are created', async () => {
    // Initially agent has 0 notifications
    let result = await getNotificationsForUser(agent);
    expect(result.unreadCount).toBe(0);
    expect(result.notifications).toHaveLength(0);

    // 1st notification sent to agent
    await createInAppNotification({
      recipient_id: agent.id,
      title: 'First Notification',
      message: 'Your account request was approved.',
      type: 'success',
    });

    result = await getNotificationsForUser(agent);
    expect(result.unreadCount).toBe(1);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].title).toBe('First Notification');
    expect(result.notifications[0].is_read).toBe(false);

    // 2nd notification sent to agent
    await createInAppNotification({
      recipient_id: agent.id,
      title: 'Second Notification',
      message: 'Customer verification completed.',
      type: 'info',
    });

    result = await getNotificationsForUser(agent);
    expect(result.unreadCount).toBe(2);
    expect(result.notifications).toHaveLength(2);

    // Marking one as read decreases count from 2 to 1
    const firstId = result.notifications[0].id;
    await markNotificationAsRead(firstId, agent.id);

    result = await getNotificationsForUser(agent);
    expect(result.unreadCount).toBe(1);

    // Marking all as read clears count to 0
    await markAllNotificationsAsRead(agent);
    result = await getNotificationsForUser(agent);
    expect(result.unreadCount).toBe(0);
  });

  it('delivers role-targeted notifications to appropriate roles', async () => {
    // Broadcast notification for all branch managers
    await createInAppNotification({
      role: 'manager',
      branch_id: 1,
      title: 'Pending Approval for Branch #1',
      message: 'New fixed deposit opened requiring supervisory sign-off.',
      type: 'approval',
      link: '/dashboard?tab=decisions',
    });

    // Manager in branch 1 sees it (unreadCount = 1)
    const managerResult = await getNotificationsForUser(manager);
    expect(managerResult.unreadCount).toBe(1);
    expect(managerResult.notifications[0].title).toBe('Pending Approval for Branch #1');

    // Agent in branch 1 does NOT see manager's notification (unreadCount = 0)
    const agentResult = await getNotificationsForUser(agent);
    expect(agentResult.unreadCount).toBe(0);

    // Higher manager (bank-wide) sees high-level or higher_manager notifications
    await createInAppNotification({
      role: 'higher_manager',
      title: 'HR Escalation',
      message: 'Employee promotion requires dual-control verification.',
      type: 'warning',
      link: '/dashboard?tab=approvals',
    });

    const hmResult = await getNotificationsForUser(higherManager);
    expect(hmResult.unreadCount).toBe(1);
    expect(hmResult.notifications[0].title).toBe('HR Escalation');

    // System Administrator receives admin-targeted notifications
    await createInAppNotification({
      role: 'admin',
      title: 'Database Backup Completed',
      message: 'Automated nightly encryption snapshot verified.',
      type: 'info',
    });

    const adminResult = await getNotificationsForUser(admin);
    expect(adminResult.unreadCount).toBe(1);
    expect(adminResult.notifications[0].title).toBe('Database Backup Completed');
  });

  it('handles /api/notifications GET and POST actions with session verification', async () => {
    const rawToken = 'test-session-token-for-manager';
    const tokenHash = hashSessionToken(rawToken);
    await createSession({
      token_hash: tokenHash,
      employee_id: manager.id,
      expires_at: new Date(Date.now() + 3600000),
    });

    // GET /api/notifications
    const getReq = new NextRequest('http://127.0.0.1:3000/api/notifications', {
      headers: {
        cookie: `${authCookies.SESSION_COOKIE}=${rawToken}`,
      },
    });

    const getRes = await getNotificationsRoute(getReq);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData).toHaveProperty('notifications');
    expect(getData).toHaveProperty('unreadCount');

    // POST /api/notifications with action: 'send'
    const testReq = new NextRequest('http://127.0.0.1:3000/api/notifications', {
      method: 'POST',
      headers: {
        cookie: `${authCookies.SESSION_COOKIE}=${rawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'send',
        title: 'New Account Approval',
        message: 'Savings account application reviewed.',
        type: 'approval',
      }),
    });

    const testRes = await postNotificationsRoute(testReq);
    expect(testRes.status).toBe(200);
    const testData = await testRes.json();
    expect(testData.success).toBe(true);
    expect(testData.unreadCount).toBeGreaterThanOrEqual(1);

    // POST /api/notifications with action: 'mark_all_read'
    const readAllReq = new NextRequest('http://127.0.0.1:3000/api/notifications', {
      method: 'POST',
      headers: {
        cookie: `${authCookies.SESSION_COOKIE}=${rawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'mark_all_read' }),
    });

    const readAllRes = await postNotificationsRoute(readAllReq);
    expect(readAllRes.status).toBe(200);
    const readAllData = await readAllRes.json();
    expect(readAllData.unreadCount).toBe(0);
  });
});
