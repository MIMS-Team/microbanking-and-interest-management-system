import { NextRequest,NextResponse } from 'next/server';
import { requireUser,jsonError,NO_CACHE_HEADERS,verifyCsrf } from '@/lib/server/api';
import { AuthError,employeeHasPermission,getMySqlPool } from '@/lib/server/db';
import { deliverEmployeeNotifications } from '@/lib/server/employee-delivery';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  try{const {user}=await requireUser(request,['admin','higher_manager']);if(!await employeeHasPermission(user.id,'operations.read'))throw new AuthError('Operator read permission is required.',403);
    const [jobs]=await getMySqlPool().query(`SELECT j.id,j.job,j.boundary,j.status,j.attempt,j.started_at,j.finished_at,j.notification_status,c.retry_after,c.lease_until,
      CASE WHEN j.status='failed' THEN 'Job failed. Review restricted operator logs and the retry deadline.' ELSE NULL END AS failure_notice
      FROM job_runs j LEFT JOIN job_claims c ON c.run_id=j.id ORDER BY j.id DESC LIMIT 50`);
    const [notifications]=await getMySqlPool().query('SELECT n.id,s.full_name,n.kind,n.status,n.attempts,n.created_at,n.delivered_at,n.error_code FROM employee_notifications n JOIN staff s ON s.id=n.employee_id ORDER BY n.id DESC LIMIT 50');
    return NextResponse.json({jobs,notifications},{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}
export async function POST(request:NextRequest){
  try{verifyCsrf(request);const scheduler=process.env.SCHEDULER_KEY;
    if(!scheduler||scheduler.length<32||request.headers.get('authorization')!==`Bearer ${scheduler}`){const {user}=await requireUser(request,['admin','higher_manager']);if(!await employeeHasPermission(user.id,'employees.manage'))throw new AuthError('Employee delivery management permission is required.',403);}
    // A bounded drain lets the scheduler retry safely without monopolizing a worker.
    const outcomes=[];for(let i=0;i<20;i++){const outcome=await deliverEmployeeNotifications();outcomes.push(outcome.status);if(outcome.status==='idle')break;}
    return NextResponse.json({message:'Processed due employee deliveries.',outcomes},{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}
