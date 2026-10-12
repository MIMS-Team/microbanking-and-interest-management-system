import { NextRequest, NextResponse } from 'next/server';
import { requireUser, jsonError, verifyCsrf, enforceRateLimit, NO_CACHE_HEADERS } from '@/lib/server/api';
import { AuthError, employeeHasPermission, findEmployeeWithAuthByEmail, findEmployeeById, getActiveDbAdapterName, getMySqlPool, getSqliteDb } from '@/lib/server/db';
import { deliverEmployeeNotifications, queueEmployeeNotification } from '@/lib/server/employee-delivery';
import { requestPasswordReset } from '@/lib/server/auth';
import type { RowDataPacket } from 'mysql2/promise';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  try{verifyCsrf(request);const {user}=await requireUser(request,['admin']);if(!await employeeHasPermission(user.id,'employees.manage'))throw new AuthError('Employee management permission is required.',403);
    const id=Number((await context.params).id),employee=await findEmployeeById(id);if(!employee)throw new AuthError('Employee not found.',404);
    await enforceRateLimit(request,'PASSWORD_RESET_REQUEST',`employee-delivery:${id}`);const {action}=await request.json();
    if(action==='recovery'){await requestPasswordReset(employee.email);return NextResponse.json({message:'Recovery OTP sent to the employee. The current password is unchanged.'},{headers:NO_CACHE_HEADERS});}
    if(action==='invitation'){const auth=await findEmployeeWithAuthByEmail(employee.email);if(!auth?.must_change_password||employee.status!=='active')throw new AuthError('This employee does not require onboarding.',409);await queueEmployeeNotification(id,'onboarding');}
    else if(action!=='retry')throw new AuthError('Choose invitation, recovery or retry.');
    const delivery=await deliverEmployeeNotifications(id);return NextResponse.json({message:`Employee notification delivery: ${delivery.status}. Failed deliveries retain a controlled retry.`,deliveryStatus:delivery.status},{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}
export async function GET(request:NextRequest,context:{params:Promise<{id:string}>}){
  try{const {user}=await requireUser(request,['admin']);if(!await employeeHasPermission(user.id,'employees.read'))throw new AuthError('Employee read permission is required.',403);const id=Number((await context.params).id);
    const notifications=getActiveDbAdapterName()==='mysql'?(await getMySqlPool().query<RowDataPacket[]>('SELECT id,kind,status,attempts,created_at,delivered_at,available_at,error_code FROM employee_notifications WHERE employee_id=? ORDER BY id DESC LIMIT 30',[id]))[0]:getSqliteDb().prepare('SELECT id,kind,status,attempts,created_at,delivered_at,available_at,error_code FROM employee_notifications WHERE employee_id=? ORDER BY id DESC LIMIT 30').all(id);
    return NextResponse.json({notifications},{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}
