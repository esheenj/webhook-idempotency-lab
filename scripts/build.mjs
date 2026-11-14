import {mkdir,copyFile,rm} from 'node:fs/promises';
await rm('dist',{force:true,recursive:true});await mkdir('dist',{recursive:true});
for(const f of ['index.html','style.css','app.mjs'])await copyFile('site/'+f,'dist/'+f);
await copyFile('src/simulate.mjs','dist/simulate.mjs');
console.log('Offline browser playground built in dist/');
