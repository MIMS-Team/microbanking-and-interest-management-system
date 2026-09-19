import React from 'react';
import { LucideIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';

/**
 * KPI Stat Card Component
 * Exactly matches the card design from the reference screenshot:
 * - Subtle border, rounded corners, soft shadow
 * - Top row: Title and icon in light pill badge
 * - Large metric number with formatted units
 * - Bottom row: Green/Red trend indicator + subtitle label
 */

interface StatCardProps {
  title: string;
  value: string;
  trend: string;
  trendPositive?: boolean;
  subtitle: string;
  icon: LucideIcon;
  iconBg?: string;
  iconColor?: string;
  onClick?: () => void;
}

export default function StatCard({
  title,
  value,
  trend,
  trendPositive = true,
  subtitle,
  icon: Icon,
  iconBg = 'bg-slate-100',
  iconColor = 'text-slate-600',
  onClick,
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs transition-all hover:border-slate-300 ${
        onClick ? 'cursor-pointer hover:shadow-sm' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 tracking-tight">
          {title}
        </span>
        <div className={`w-8 h-8 rounded-lg ${iconBg} ${iconColor} flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold text-slate-900 tracking-tight">
          {value}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 text-xs">
        <span
          className={`inline-flex items-center font-medium ${
            trendPositive ? 'text-emerald-600' : 'text-amber-600'
          }`}
        >
          {trendPositive ? (
            <ArrowUpRight className="w-3.5 h-3.5 mr-0.5 inline" />
          ) : (
            <ArrowDownRight className="w-3.5 h-3.5 mr-0.5 inline" />
          )}
          {trend}
        </span>
        <span className="text-slate-500 text-[11px] truncate">{subtitle}</span>
      </div>
    </div>
  );
}
