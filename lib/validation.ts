import {z} from 'zod';
import {fields, entities, type Entity} from './model';
export function validDate(value:string){ const s=value.slice(0,10);const d=new Date(s+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(+d)&&d.toISOString().slice(0,10)===s; }
export function schemaFor(entity:Entity){
 const shape:Record<string,z.ZodType>={};
 for(const f of fields[entity]){
  let rule:z.ZodType;
  if(f.type==='checkbox') rule=z.boolean();
  else if(f.type==='number'||f.key==='day') {let n=z.number().min(f.min??0).max(f.key==='day'?6:f.max??100000); if(['day','week','teachingWeeks','difficulty','confidence','duration'].includes(f.key)) n=n.int();rule=n;}
  else {
   let s=z.string().max(f.type==='textarea'?20000:500);if(f.required)s=s.min(1,`${f.label} is required`);
   rule=s;
   if(f.type==='date'||f.type==='datetime-local') rule=s.refine(v=>!v&&!f.required||validDate(v)&&(f.type==='date'?v.length===10:/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(v)),`Enter a valid ${f.label.toLowerCase()}`);
   if(f.type==='time')rule=s.regex(/^([01]\d|2[0-3]):[0-5]\d$/,'Enter a valid time');
   if(f.type==='color')rule=s.regex(/^#[0-9a-fA-F]{6}$/);
   if(f.options)rule=z.enum(f.options as [string,...string[]]);
   if(f.key==='links')rule=s.refine(v=>v.split('\n').filter(x=>x.trim()).every(x=>{try{return ['http:','https:'].includes(new URL(x.trim()).protocol)}catch{return false}}),'Use complete http:// or https:// links, one per line');
   if(f.relation||(!f.required&&['date','datetime-local'].includes(f.type??'')))rule=z.union([rule,z.null()]).transform(v=>v||null);
  }
  shape[f.key]=rule;
 }
 return z.object(shape).strict().superRefine((row,ctx)=>{
  const r=row as any;const fail=(path:string,message:string)=>ctx.addIssue({code:'custom',path:[path],message});
  if(r.startDate&&r.endDate&&r.startDate>r.endDate)fail('endDate','End date must follow the start date');
  if(entity==='semester'){
   if(r.teachingStart<r.startDate||r.teachingStart>r.endDate)fail('teachingStart','Teaching must start within the semester');
   if(!!r.examStart!==!!r.examEnd)fail('examEnd','Enter both exam period dates');
   if(r.examStart&&r.examEnd<r.examStart)fail('examEnd','Exam period must end after it starts');
  }
  if(entity==='class'&&r.endTime<=r.startTime)fail('endTime','End time must be later than start time');
  if(r.releaseDate&&r.releaseDate>r.dueAt.slice(0,10))fail('releaseDate','Release date cannot follow the deadline');
  if(entity==='importantDate'&&r.endDate&&r.endDate<r.dueAt.slice(0,10))fail('endDate','End date cannot precede the event');
  if(entity==='grade') {if(Number(!!r.assignmentId)+Number(!!r.examId)!==1)fail('assignmentId','Choose exactly one assignment or exam');if(r.score>r.maximum)fail('score','Score cannot exceed maximum score');}
  if(r.assignmentId&&r.examId)fail('examId','Choose an assignment or an exam, not both');
 });
}
export const entitySchema=z.enum(entities);
export const settingSchema=z.object({name:z.string().trim().min(1).max(80),timezone:z.string().refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false}},'Enter a valid IANA timezone'),dailyHours:z.number().min(.25).max(16),activeSemesterId:z.string().nullable()}).strict();
