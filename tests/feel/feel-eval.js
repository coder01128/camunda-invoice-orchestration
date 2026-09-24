// Evaluate a FEEL expression on the connected cluster via c8ctl (no shell, so multi-line FEEL survives on Windows).
const {execFileSync}=require("child_process"),path=require("path");
const C8=process.env.C8CTL_JS||path.join(process.env.APPDATA||"",
  "npm/node_modules/@camunda8/cli/dist/index.js");
const PROFILE="--profile="+(process.env.C8_PROFILE||"smoke-test");
module.exports=(expr,vars)=>{
  const out=execFileSync(process.execPath,[C8,"feel","evaluate",expr,"--vars",JSON.stringify(vars),PROFILE,"--json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  const p=JSON.parse(out.split("\n").filter(l=>!l.startsWith("[camunda-sdk]")).join("\n"));
  return p.result!==undefined?p.result:p;
};
