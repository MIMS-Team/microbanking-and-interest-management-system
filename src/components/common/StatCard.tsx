'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  trend: string;
  trendLabel: string;
  isPositive?: boolean;
  icon: LucideIcon;
}

// KPI stat card matching the banking dashboard reference layout
export default function StatCard({
  title,
  value,
  trend,
  trendLabel,
  isPositive = true,
  icon: Icon,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-xs transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
        <div className="flex items-center gap-1.5 mt-2 text-xs">
          <span className={`font-semibold ${isPositive ? 'text-emerald-600' : 'text-amber-600'}`}>
            {trend}
          </span>
          <span className="text-slate-400 font-medium">{trendLabel}</span>
        </div>
      </div>
    </div>
  );
}
