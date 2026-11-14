#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {simulate} from './simulate.mjs';
const file=process.argv[2];
if(!file){console.error('Usage: node src/cli.mjs scenario.json');process.exitCode=1;}
else try{
  const data=await readFile(file,'utf8');
  if(data.length>1048576)throw Error('Input exceeds 1 MiB.');
  process.stdout.write(JSON.stringify(simulate(data),null,2)+'\n');
}catch(error){console.error('Input error: '+error.message);process.exitCode=1;}
