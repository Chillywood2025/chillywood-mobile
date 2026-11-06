// Test-only psql-stdin command boundaries. This is not a concurrency simulator.
// standard_conforming_strings=on, as in the local native PostgreSQL runners.
// Bounded to the registered valid SQL fixtures (ASCII dollar tags, no psql
// meta commands/COPY stream). Whole-input lexical validation intentionally
// fails closed; it does not emulate partial execution before malformed input.
export function splitNativePsqlStatements(source) {
 const statements=[];
 let start=0,index=0,quote=null,escape=false,block=0,line=false;
 while(index<source.length) {
  if(line){if(source[index]==='\n')line=false;index++;continue;}
  if(block){
   if(source.slice(index,index+2)==='/*'){block++;index+=2;}
   else if(source.slice(index,index+2)==='*/'){block--;index+=2;}
   else index++;
   continue;
  }
  if(quote){
   if(source.startsWith(quote,index)){
    if(quote.length===1&&source[index+1]===quote){index+=2;continue;}
    index+=quote.length;quote=null;escape=false;
   }else if(escape&&source[index]==='\\')index+=2;
   else index++;
   continue;
  }
  if(source.slice(index,index+2)==='--'){line=true;index+=2;continue;}
  if(source.slice(index,index+2)==='/*'){block=1;index+=2;continue;}
  if(source[index]==="'"||source[index]==='"'){
   escape=source[index]==="'"&&/[eE]/u.test(source[index-1]??'')&&!/[\w$]/u.test(source[index-2]??'');
   quote=source[index++];continue;
  }
  if(source[index]==='$'&&!/[\p{L}\p{N}_$]/u.test(source[index-1]??'')){
   const match=source.slice(index).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/u);
   if(match){quote=match[0];index+=quote.length;continue;}
  }
  if(source[index]==='\\')throw Error('native_setup_psql_meta_command_unsupported');
  if(source[index]===';'){statements.push(source.slice(start,index+1));start=index+1;}
  index++;
 }
 if(quote||block)throw Error('native_setup_unterminated_sql');
 if(source.slice(start).trim())statements.push(source.slice(start));
 return statements;
}
