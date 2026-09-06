export type RecordRow = { id:string; demo?:boolean; [key:string]: any };
export const entities = ['semester','subject','assignment','task','milestone','exam','examTopic','class','studySession','grade','importantDate','weeklyContent'] as const;
export type Entity = typeof entities[number];
export type Data = {[K in Entity]: RecordRow[]} & {setting: {name:string;timezone:string;dailyHours:number;activeSemesterId:string|null}};
export type Field = {key:string;label:string;type?:'text'|'textarea'|'number'|'date'|'datetime-local'|'time'|'color'|'select'|'checkbox';required?:boolean;options?:string[];relation?:Entity;min?:number;max?:number;default?:string|number|boolean;hint?:string};
const text=(key:string,label:string,required=false):Field=>({key,label,required});
const number=(key:string,label:string,def=0,max=100,min=0):Field=>({key,label,type:'number',default:def,min,max});
const select=(key:string,label:string,options:string[],def=options[0]):Field=>({key,label,type:'select',options,default:def});
const relation=(key:string,label:string,entity:Entity,required=false):Field=>({key,label,relation:entity,required,type:'select'});
const date=(key:string,label:string,required=false,datetime=false):Field=>({key,label,type:datetime?'datetime-local':'date',required});
const notes:Field={key:'notes',label:'Notes',type:'textarea'};
const links:Field={key:'links',label:'Useful links',type:'textarea',hint:'One https:// or http:// link per line'};
const priority=select('priority','Priority',['Low','Medium','High','Critical'],'Medium');
const hours=(key:string,label:string,def=0)=>number(key,label,def,10000);
const subject=relation('subjectId','Subject','subject',true);
const optionalLinks=[relation('subjectId','Subject','subject'),relation('assignmentId','Assignment','assignment'),relation('examId','Exam','exam')];
export const labels:Record<Entity,string>={semester:'Semester',subject:'Subject',assignment:'Assignment',task:'Task',milestone:'Milestone',exam:'Exam',examTopic:'Revision topic',class:'Class',studySession:'Study session',grade:'Grade',importantDate:'Important date',weeklyContent:'Weekly content'};
export const fields:Record<Entity,Field[]>={
 semester:[text('name','Semester name',true),date('startDate','Semester starts',true),date('endDate','Semester ends',true),date('teachingStart','First teaching week starts',true),number('teachingWeeks','Number of teaching weeks',13,52,1),date('examStart','Exam period starts'),date('examEnd','Exam period ends'),notes],
 subject:[text('code','Subject code',true),text('name','Subject name',true),relation('semesterId','Semester','semester',true),text('lecturer','Lecturer'),text('tutor','Tutor'),{key:'color',label:'Subject colour',type:'color',default:'#4f46e5'},notes,links],
 assignment:[text('name','Assignment name',true),subject,{key:'description',label:'Description',type:'textarea'},number('weighting','Weighting (%)'),date('releaseDate','Release date'),date('dueAt','Due date and time',true,true),hours('estimatedHours','Estimated total hours',10),hours('actualHours','Hours logged outside study sessions'),number('progress','Manual progress (%)'),priority,number('difficulty','Difficulty (1–5)',3,5,1),select('status','Status',['Not Started','Planning','In Progress','Reviewing','Ready to Submit','Submitted']),notes,links],
 task:[text('name','Task',true),...optionalLinks,date('dueAt','Due date and time',false,true),select('status','Status',['Not Started','In Progress','Completed']),priority,hours('estimatedHours','Estimated hours',1),hours('actualHours','Actual hours'),notes],
 milestone:[text('name','Milestone',true),relation('assignmentId','Assignment','assignment',true),date('dueAt','Target date and time',true,true),{key:'done',label:'Completed',type:'checkbox',default:false}],
 exam:[text('name','Exam name',true),subject,date('dueAt','Exam date and start time',true,true),number('duration','Duration (minutes)',120,1440,1),text('location','Location'),number('weighting','Weighting (%)',40),number('progress','Manual revision progress (%)'),number('confidence','Confidence (1–5)',3,5,1),hours('estimatedHours','Estimated revision hours',20),{key:'completed',label:'Exam completed',type:'checkbox',default:false},notes],
 examTopic:[text('name','Topic or practice exam',true),relation('examId','Exam','exam',true),select('kind','Type',['Topic','Practice exam','Mock exam']),select('status','Status',['Not Started','Learning','Revising','Confident']),notes],
 class:[text('name','Class name',true),subject,{key:'day',label:'Day',type:'select',options:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],default:1},date('startDate','Repeat from',true),date('endDate','Repeat until',true),{key:'startTime',label:'Start time',type:'time',required:true},{key:'endTime',label:'End time',type:'time',required:true},select('kind','Class type',['Lecture','Tutorial','Workshop','Practical','Lab','Study session']),text('location','Location'),notes],
 studySession:[text('name','Session name',true),...optionalLinks,date('dueAt','Date and start time',true,true),hours('plannedHours','Planned hours',1),hours('actualHours','Actual hours'),{key:'completed',label:'Completed',type:'checkbox',default:false},notes],
 grade:[relation('assignmentId','Assignment','assignment'),relation('examId','Exam','exam'),number('score','Score',0,100000),number('maximum','Maximum score',100,100000,0.01),notes],
 importantDate:[text('name','Event name',true),relation('semesterId','Semester','semester'),date('dueAt','Date and time',true,true),date('endDate','End date (optional)'),select('kind','Type',['Academic','Break','Holiday','Census','Personal']),notes],
 weeklyContent:[text('name','Content title',true),subject,number('week','Teaching week',1,52,1),{key:'completed',label:'Completed',type:'checkbox',default:false},notes,links]
};
export function defaults(entity:Entity):Record<string,any>{return Object.fromEntries(fields[entity].map(f=>[f.key,f.default??(f.type==='checkbox'?false:'')]));}
