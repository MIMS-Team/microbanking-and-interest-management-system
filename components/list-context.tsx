'use client';
import { createContext } from 'react';
import type { Resource } from '@/lib/banking/list-options';
export interface PageInfo{page:number;pageSize:number;total:number;search:string;status:string;sort:'newest'|'oldest'}
export const ListContext=createContext<{pages:Partial<Record<Resource,PageInfo>>;load:(resource:Resource,options:PageInfo)=>Promise<void>}|null>(null);
