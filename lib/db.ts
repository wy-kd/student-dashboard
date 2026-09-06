import {PrismaClient} from '@prisma/client';
const globalDb=globalThis as unknown as {studentDb?:PrismaClient};
export const db=globalDb.studentDb??new PrismaClient();
if(process.env.NODE_ENV!=='production')globalDb.studentDb=db;
