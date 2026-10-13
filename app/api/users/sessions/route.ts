import {NextRequest,NextResponse} from 'next/server';
import {requireUser,jsonError,NO_CACHE_HEADERS} from '@/lib/server/api';
import {AuthError,employeeHasPermission,getSqlPool} from '@/lib/server/db';
export const runtime='nodejs';
export async function GET(request:NextRequest){
  try{const {user}=await requireUser(request,['admin','higher_manager']);if(!await employeeHasPermission(user.id,'sessions.read'))throw new AuthError('Session history permission is required.',403);
    const params=new URL(request.url).searchParams,page=Number(params.get('page')||1),employeeId=params.get('employee_id')?Number(params.get('employee_id')):null;
    if(!Number.isSafeInteger(page)||page<1||page>100000||employeeId!==null&&(!Number.isSafeInteger(employeeId)||employeeId<1))throw new AuthError('Invalid session history filters.');
    const [sessions]=await getSqlPool().query(`SELECT s.employee_id,e.full_name,s.created_at,s.last_activity_at,s.expires_at,s.revoked_at,s.revocation_reason FROM employee_sessions s JOIN staff e ON e.id=s.employee_id WHERE (? IS NULL OR s.employee_id=?) ORDER BY s.created_at DESC,s.employee_id DESC,s.token_hash DESC LIMIT 30 OFFSET ?`,[employeeId,employeeId,(page-1)*30]);
    return NextResponse.json({sessions,page},{headers:NO_CACHE_HEADERS});
  }catch(error){return jsonError(error);}
}
