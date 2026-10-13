import { NextRequest, NextResponse } from 'next/server';
import { requireUser, jsonError, NO_CACHE_HEADERS } from '@/lib/server/api';
import {
  getNotificationsForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  createInAppNotification,
} from '@/lib/server/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser(request);
    const result = await getNotificationsForUser(user);
    return NextResponse.json(result, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser(request);
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      id?: number;
      title?: string;
      message?: string;
      type?: 'info' | 'warning' | 'success' | 'approval' | 'system';
      link?: string;
      role?: string;
      recipient_id?: number;
    };

    const action = body.action || 'mark_read';

    if (action === 'mark_read' && body.id) {
      await markNotificationAsRead(Number(body.id), user.id);
    } else if (action === 'mark_all_read') {
      await markAllNotificationsAsRead(user);
    } else if (action === 'send' && body.title && body.message) {
      await createInAppNotification({
        recipient_id: body.recipient_id ?? user.id,
        role: body.role ?? null,
        branch_id: user.branch_id,
        title: body.title,
        message: body.message,
        type: body.type ?? 'info',
        link: body.link ?? null,
      });
    }

    const updated = await getNotificationsForUser(user);
    return NextResponse.json(
      { success: true, ...updated },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error) {
    return jsonError(error);
  }
}
