/**
 * Bounded SQL dialect bridge for the existing banking queries. Values always
 * remain protocol parameters. New PostgreSQL-only tools use native SQL directly.
 * This is not a general MySQL parser or a schema migration tool.
 */
const identityTables = new Set(['branches','staff','authentication_audit','customers','rates','rate_history','savings_accounts','fixed_deposits','approvals','money_operations','ledger_entries','interest_runs','interest_credits','interest_accruals','audit_logs','ownership_history','assignment_history','job_runs','backup_inventory','employee_notifications']);
const conflictKeys = {
  staff_authentication:'employee_id', otp_challenges:'id', employee_sessions:'token_hash',
  banking_approval_limits:'user_id', http_rate_buckets:'key_hash',
  action_receipts:'actor_id,operation_key', job_claims:'job,boundary',
};

function quotedEnd(sql, start) {
  const quote=sql[start]; let i=start+1;
  while(i<sql.length) {
    if(sql[i]===quote) {if(sql[i+1]===quote){i+=2;continue;}return i+1;}
    if(sql[i]==='\\')i++;
    i++;
  }
  throw new Error('Unterminated SQL literal.');
}
function closingParen(sql,start) {
  let depth=1;
  for(let i=start+1;i<sql.length;i++) {
    if(sql[i]==="'"||sql[i]==='"'||sql[i]==='`'){i=quotedEnd(sql,i)-1;continue;}
    if(sql[i]==='(')depth++;
    if(sql[i]===')'&&!--depth)return i;
  }
  throw new Error('Unbalanced SQL expression.');
}
function argumentsOf(sql) {
  const parts=[]; let start=0;
  for(let i=0;i<sql.length;i++) {
    if(sql[i]==="'"||sql[i]==='"'){i=quotedEnd(sql,i)-1;continue;}
    if(sql[i]==='('){i=closingParen(sql,i);continue;}
    if(sql[i]===','){parts.push(sql.slice(start,i).trim());start=i+1;}
  }
  parts.push(sql.slice(start).trim());return parts;
}
const interval=(unit,value)=>`((${value})::numeric * INTERVAL '1 ${unit.toLowerCase()}')`;
const jsonPath=path=>{
  if(!/^'\$\.[A-Za-z_][A-Za-z_0-9]*'$/.test(path))throw new Error('Unsupported JSON path.');
  return path.slice(3,-1);
};
function functions(sql) {
  let result='';
  for(let i=0;i<sql.length;) {
    if(sql[i]==="'"||sql[i]==='"'||sql[i]==='`') {
      const end=quotedEnd(sql,i),literal=sql.slice(i,end);
      result+=sql[i]==='`'?'"'+literal.slice(1,-1)+'"':literal;i=end;continue;
    }
    const match=/^([A-Za-z_][A-Za-z_0-9]*)\s*\(/.exec(sql.slice(i));
    if(!match){result+=sql[i++];continue;}
    const start=i+match[0].length-1,end=closingParen(sql,start);
    const inner=functions(sql.slice(start+1,end)),args=argumentsOf(inner),name=match[1].toUpperCase();
    let expression;
    switch(name) {
      case 'UTC_TIMESTAMP': expression="(clock_timestamp() AT TIME ZONE 'UTC')";break;
      case 'DATE': expression=`((${inner})::date)`;break;
      case 'TIME': expression=`((${inner})::time)`;break;
      case 'DATE_FORMAT': {
        const formats={"'%Y-%m-%d'":"'YYYY-MM-DD'","'%Y-%m'":"'YYYY-MM'","'%Y-%m-01'":"'YYYY-MM-01'","'%x-%v'":"'IYYY-IW'"};
        if(!formats[args[1]])throw new Error('Unsupported date format.');
        expression=`to_char((${args[0]})::timestamp,${formats[args[1]]})`;break;
      }
      case 'DATE_ADD': expression=`((${args[0]})::timestamp + ${args[1]})::date`;break;
      case 'TIMESTAMPADD': expression=`((${args[2]})::timestamp + ${interval(args[0],args[1])})`;break;
      case 'TIMESTAMPDIFF': {
        const unit=args[0].toUpperCase();
        if(unit==='YEAR')expression=`EXTRACT(YEAR FROM age((${args[2]})::date,(${args[1]})::date))`;
        else {
          const factors={MICROSECOND:1000000,SECOND:1,MINUTE:1/60,DAY:1/86400};
          if(!(unit in factors))throw new Error('Unsupported timestamp unit.');
          expression=`TRUNC(EXTRACT(EPOCH FROM ((${args[2]})::timestamp-(${args[1]})::timestamp))*${factors[unit]})`;
        }break;
      }
      case 'DATEDIFF': expression=`((${args[0]})::date-(${args[1]})::date)`;break;
      case 'LAST_DAY': expression=`(date_trunc('month',(${inner})::timestamp)+INTERVAL '1 month'-INTERVAL '1 day')::date`;break;
      case 'DAY': expression=`EXTRACT(DAY FROM (${inner})::timestamp)`;break;
      case 'WEEKDAY': expression=`(EXTRACT(ISODOW FROM (${inner})::timestamp)-1)`;break;
      case 'IF': expression=`(CASE WHEN (${args[0]})::text IN ('1','true','t') THEN ${args[1]} ELSE ${args[2]} END)`;break;
      case 'INSTR': expression=`strpos(lower((${args[0]})::text),lower((${args[1]})::text))`;break;
      case 'JSON_ARRAYAGG': expression=`jsonb_agg(${inner})`;break;
      case 'JSON_OBJECT': expression=`jsonb_build_object(${inner})`;break;
      case 'JSON_EXTRACT': expression=`(${args[0]}::jsonb -> '${jsonPath(args[1])}')`;break;
      case 'JSON_UNQUOTE': expression=`(${inner} #>> '{}')`;break;
      case 'JSON_REMOVE': expression=`(${args[0]}::jsonb - '${jsonPath(args[1])}')`;break;
      case 'JSON_SET': expression=`jsonb_set(${args[0]}::jsonb,'{${jsonPath(args[1])}}',to_jsonb((${args[2]})::${jsonPath(args[1])==='approval_id'?'integer':'text'}))`;break;
      case 'GROUP_CONCAT': {
        const m=/^(.+?)\s+ORDER BY\s+(.+?)\s+SEPARATOR\s+('.+')$/is.exec(inner);
        if(!m)throw new Error('Unsupported owner aggregation.');
        expression=`string_agg(${m[1]}::text,${m[3]} ORDER BY ${m[2]})`;break;
      }
      case 'MIN': expression=/\bBETWEEN\b/i.test(inner)?`bool_and(${inner})`:`${match[1]}(${inner})`;break;
      default: expression=`${match[1]}(${inner})`;
    }
    result+=expression;i=end+1;
  }
  return result;
}

/** @param {string} sql @param {unknown[]} parameters */
export function postgresStatement(sql,parameters=[]) {
  const values=[];
  // Renumber every occurrence, including repeated bindings and expanded IN lists.
  // PostgreSQL cannot bind an array as a single scalar inside IN (...).
  let positional=0;
  const bound=sql.replace(/'(?:(?:'')|\\.|[^'\\])*'|`[^`]*`|\$(\d+)|\?/g,(token,index)=>{
    if(token.startsWith("'")||token.startsWith('`'))return token;
    const value=parameters[index?Number(index)-1:positional++];
    if(value===undefined)throw new Error('Missing SQL parameter.');
    const append=value=>{values.push(value instanceof Date?value.toISOString():typeof value==='boolean'?Number(value):value);return '$'+values.length;};
    if(Array.isArray(value))return value.length?value.map(append).join(','):'NULL';
    return append(value);
  });
  let statement=functions(bound);
  statement=statement.replace(/\bWHERE TRUE\b/gi,'WHERE 1=1').replace(/\bWHERE FALSE\b/gi,'WHERE 1=0');
  statement=statement.replace(/'(?:(?:'')|[^'])*'|\b(TRUE|FALSE)\b|\bCURRENT_TIMESTAMP(?:\(3\))?/gi,(token,boolean)=>boolean?(boolean.toUpperCase()==='TRUE'?'1':'0'):token.startsWith("'")?token:"(clock_timestamp() AT TIME ZONE 'UTC')");
  statement=statement.replace(/\bINTERVAL\s+(-?\d+|\$\d+|[A-Za-z_]\w*)\s+(MICROSECOND|SECOND|MINUTE|HOUR|DAY|MONTH|YEAR)\b/gi,(_,value,unit)=>interval(unit,value))
    .replace(/\bAS\s+DATETIME\b/gi,'AS TIMESTAMP')
    .replace(/\bAS\s+UNSIGNED\b/gi,'AS BIGINT')
    .replace(/<=>/g,'IS NOT DISTINCT FROM')
    .replace(/\bFORCE INDEX\s*\([^)]*\)/gi,'')
    .replace(/\bBINARY\s+(?=[A-Za-z_])/gi,'');
  // Each parameter occurrence is independent, so an untyped null test is safe
  // to cast to text without changing the types inferred by other occurrences.
  statement=statement.replace(/(\$\d+)\s+IS (NOT )?NULL/g,'$1::text IS $2NULL');
  statement=statement.replace(/([,(]\s*)-(\$\d+)/g,'$1-($2)::numeric');
  if(/FROM staff s LEFT JOIN branches b/i.test(statement))statement=statement.replace(/FOR SHARE\s*$/i,'FOR SHARE OF s');
  if(/JOIN role_catalog r/i.test(statement)&&/JOIN role_permissions p/i.test(statement)&&/FOR SHARE\s*$/i.test(statement)){
    statement=statement.replace(/FOR SHARE\s*$/i,'AND permission_grant_locked(s.id,p.permission_code) FOR SHARE OF s');
  }
  const inserted=/^\s*INSERT\s+(IGNORE\s+)?INTO\s+(\w+)/i.exec(statement);
  if(inserted) {
    const table=inserted[2].toLowerCase();
    if(inserted[1])statement=statement.replace(/INSERT\s+IGNORE/i,'INSERT')+' ON CONFLICT DO NOTHING';
    if(/ON DUPLICATE KEY UPDATE/i.test(statement)) {
      const key=conflictKeys[table];if(!key)throw new Error('Unsupported conflict target: '+table);
      statement=statement.replace(/ON DUPLICATE KEY UPDATE\s+([\s\S]*)$/i,(_,updates)=>
        `ON CONFLICT (${key}) DO UPDATE SET `+updates
          .replace(/VALUES\((\w+)\)/gi,'EXCLUDED.$1')
          .replace(/(?<==\s*)\b(failed_attempts|user_id)\b/g,`${table}.$1`));
    }
    if(identityTables.has(table)&&! /\bRETURNING\b/i.test(statement))statement+=' RETURNING id';
  }
  // MySQL permits UPDATE JOIN; PostgreSQL spells the source as FROM.
  const joined=/^\s*UPDATE approvals a JOIN otp_challenges c\s+ON ([\s\S]+?)\s+SET ([\s\S]+?)\s+WHERE ([\s\S]+)$/i.exec(statement);
  if(joined)statement=`UPDATE approvals a SET ${joined[2].replace(/\ba\.(\w+)\s*=/g,'$1=')} FROM otp_challenges c WHERE ${joined[1]} AND ${joined[3]}`;
  // An integer approval ID is compared to a JSON string in the legacy HR query.
  statement=statement.replace(/p\.id\s*=\s*(\([^\n]+?#>> '\{\}'\))/g,'p.id=($1)::integer');
  return {statement,values};
}
