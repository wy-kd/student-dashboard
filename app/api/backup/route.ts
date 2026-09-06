import {NextRequest,NextResponse} from 'next/server';
import {requireAuth,sameOrigin,jsonBody,errorResponse} from '@/lib/auth';
import {exportBackup,restoreBackup,toCsv,saveBackup} from '@/lib/backup';
import {entitySchema} from '@/lib/validation';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:NextRequest){try{await requireAuth(req);const backup=await exportBackup();const entity=req.nextUrl.searchParams.get('csv');const filename=entity?`${entitySchema.parse(entity)}.csv`:'student-dashboard-backup.json';const body=entity?toCsv(backup.data[entitySchema.parse(entity)]):JSON.stringify(backup,null,2);return new NextResponse(body,{headers:{'Content-Type':entity?'text/csv;charset=utf-8':'application/json','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}});}catch(e){return errorResponse(e)}}
export async function POST(req:NextRequest){try{sameOrigin(req);await requireAuth(req);const b=await jsonBody(req);if(b.action==='backup')await saveBackup();else await restoreBackup(b);return NextResponse.json({ok:true});}catch(e){return errorResponse(e)}}
