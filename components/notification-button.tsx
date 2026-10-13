'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Info,
  ExternalLink,
  RefreshCw,
  X,
} from 'lucide-react';
import type { InAppNotification } from '@/lib/types';
import type { PublicEmployee } from '@/app/_components';

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const diffMs = Date.now() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

interface NotificationButtonProps {
  user: PublicEmployee | null;
}

export function NotificationButton({ user }: NotificationButtonProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications', {
        credentials: 'include',
        headers: { 'Cache-Control': 'no-store' },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(Number(data.unreadCount || 0));
      }
    } catch {
      // non-blocking
    }
  }, [user]);

  // Initial fetch and 15s polling
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      void fetchNotifications();
    }, 0);
    const interval = setInterval(fetchNotifications, 15000);
    const onFocus = () => void fetchNotifications();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, fetchNotifications]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleMarkAsRead = async (id: number, event?: React.MouseEvent) => {
    event?.stopPropagation();
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_read', id }),
      });
    } catch {
      void fetchNotifications();
    }
  };

  const handleMarkAllAsRead = async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    try {
      await fetch('/api/notifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_all_read' }),
      });
    } catch {
      void fetchNotifications();
    }
  };

  const handleItemClick = (notification: InAppNotification) => {
    if (!notification.is_read) {
      void handleMarkAsRead(notification.id);
    }
    if (notification.link) {
      setOpen(false);
      router.push(notification.link);
    }
  };

  if (!user) return null;

  const filtered = notifications.filter((n) =>
    filter === 'unread' ? !n.is_read : true
  );


  const getNotificationBadge = (type: string) => {
    switch (type) {
      case 'approval':
        return {
          icon: <ShieldCheck className="h-4 w-4 text-amber-600" />,
          bg: 'bg-amber-50 border-amber-200/80',
        };
      case 'success':
        return {
          icon: <Check className="h-4 w-4 text-emerald-600" />,
          bg: 'bg-emerald-50 border-emerald-200/80',
        };
      case 'warning':
        return {
          icon: <ShieldAlert className="h-4 w-4 text-rose-600" />,
          bg: 'bg-rose-50 border-rose-200/80',
        };
      default:
        return {
          icon: <Info className="h-4 w-4 text-sky-600" />,
          bg: 'bg-sky-50 border-sky-200/80',
        };
    }
  };

  return (
    <div className="relative inline-block text-left">
      {/* Notification Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="notification-trigger relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-1"
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="notification-badge absolute -top-1.5 -right-1.5 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-rose-600 px-1 text-[11px] font-bold text-white shadow-md ring-2 ring-white animate-in zoom-in-50 duration-200"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Popover Panel */}
      {open && (
        <div
          ref={dropdownRef}
          className="notification-dropdown absolute right-0 mt-2.5 w-[420px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200/90 bg-white shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150"
          role="dialog"
          aria-label="Notification center"
        >
          {/* Header Row: Title & Window Controls */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="font-bold text-slate-900 text-sm tracking-tight whitespace-nowrap">Notifications</span>
              {unreadCount > 0 && (
                <span className="whitespace-nowrap inline-flex items-center rounded-full bg-rose-50 border border-rose-200/70 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => void fetchNotifications()}
                title="Refresh notifications"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Sub-Header Toolbar: Filter Tabs & Quick Actions */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-2.5 text-xs gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  filter === 'all'
                    ? 'bg-sky-100 text-sky-800 font-semibold border border-sky-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unread')}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                  filter === 'unread'
                    ? 'bg-sky-100 text-sky-800 font-semibold border border-sky-300 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-transparent'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkAllAsRead()}
                  title="Mark all notifications as read"
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 shadow-xs transition cursor-pointer"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 mb-3 border border-sky-100">
                  <Bell className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                  {filter === 'unread'
                    ? 'You are completely caught up! New alerts will appear here.'
                    : 'System alerts and approvals will show up here as they occur.'}
                </p>
              </div>
            ) : (
              filtered.map((item) => {
                const badge = getNotificationBadge(item.type);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`group relative flex items-start gap-3 p-3.5 transition cursor-pointer ${
                      item.is_read
                        ? 'bg-white hover:bg-slate-50/80 text-slate-700'
                        : 'bg-sky-50/40 hover:bg-sky-50/70 text-slate-900 border-l-2 border-l-sky-500'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${badge.bg} shadow-xs`}>
                      {badge.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-semibold truncate leading-snug">
                          {item.title}
                        </h4>
                        {!item.is_read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2.5 mt-2 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(item.created_at)}
                        </span>
                        {item.link && (
                          <span className="inline-flex items-center gap-0.5 text-sky-600 font-medium hover:underline">
                            View details <ExternalLink className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mark as read action */}
                    <div className="shrink-0 self-start mt-0.5 ml-1">
                      {!item.is_read ? (
                        <button
                          type="button"
                          onClick={(e) => void handleMarkAsRead(item.id, e)}
                          title="Mark as read"
                          className="rounded-md p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="p-1 text-slate-300 block" title="Read">
                          <CheckCheck className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              B-Trust Real-Time Alert Center
            </span>
            <span>
              {notifications.length} {notifications.length === 1 ? 'notification' : 'notifications'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
