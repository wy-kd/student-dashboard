import {seedDemo} from '../lib/seed';import {db} from '../lib/db';
try{await seedDemo();console.log('Demo data added. Remove it in Settings.');}finally{await db.$disconnect();}
