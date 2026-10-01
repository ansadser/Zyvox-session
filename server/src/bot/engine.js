import { COMMANDS, COMMAND_ALIASES, allCommands } from "./commands.js";
const categoryNames={VARIABLES:"VARIABLES / OWNER / AI / BASIC",OWNER:"OWNER",SETTINGS:"SETTINGS",GROUP:"GROUP",UTILITY:"UTILITY",SEARCH:"SEARCH",EDIT:"EDIT",MISC:"MISC",CONVERTERS:"CONVERTERS",SYSTEM:"SYSTEM",DOWNLOAD:"DOWNLOAD",WHATSAPP:"WHATSAPP"};
const textOf=m=>{const x=m?.message||{};return x.conversation||x.extendedTextMessage?.text||x.imageMessage?.caption||x.videoMessage?.caption||x.documentMessage?.caption||x.buttonsResponseMessage?.selectedButtonId||x.listResponseMessage?.singleSelectReply?.selectedRowId||""};
const mentions=m=>m?.message?.extendedTextMessage?.contextInfo?.mentionedJid||[];
const parse=t=>{t=String(t||"").trim();if(!t.startsWith("."))return null;const p=t.slice(1).trim().split(/\s+/),raw=(p.shift()||"").toLowerCase();return{name:COMMAND_ALIASES[raw]||raw,args:p,body:p.join(" ")}};
const group=j=>j?.endsWith("@g.us");const senderOf=m=>m?.key?.participant||m?.key?.remoteJid||"";
async function send(s,j,t,o={}){return s.sendMessage(j,{text:t,...o})}
function menu(){const a=["*ZYVOX COMMAND MENU*","Prefix: ."];for(const [c,items] of Object.entries(COMMANDS)){a.push("", "*"+(categoryNames[c]||c)+"*");for(const [n,d] of items)a.push("• ."+n+" — "+d)}return a.join("\n")}
function info(n){const c=allCommands().find(x=>x.name===n);return c?"."+c.name+"\n"+c.description+"\nUsage: ."+c.usage+"\nCategory: "+(categoryNames[c.category]||c.category):"❌ Command not found. Use .menu."}
async function owner(c){return !!c.sender&&(c.sender===c.ownerJid||c.sudos.has(c.sender))}
export async function handleMessage({sock,session,msg,db}){
const p=parse(textOf(msg));if(!p)return false;const jid=msg.key.remoteJid;if(!jid||jid==="status@broadcast")return false;
const sender=senderOf(msg),ownerJid=session.ownerJid||(session.phone?session.phone+"@s.whatsapp.net":""),sudos=new Set(await db.getSudos(session.id));const ctx={sender,ownerJid,sudos};
if(session.mode==="private"&&!await owner(ctx))return false;if(!allCommands().some(x=>x.name===p.name))return false;
if(p.name==="menu")return send(sock,jid,menu());if(p.name==="info")return send(sock,jid,info((p.args[0]||"").toLowerCase()));
if(["alive","testalive"].includes(p.name))return send(sock,jid,session.aliveMessage||"Zyvox is alive ✓");
if(p.name==="ping"){const t=Date.now();await send(sock,jid,"🏓 Pong…");return send(sock,jid,"Latency: "+(Date.now()-t)+" ms")}
if(p.name==="uptime"){let n=Math.floor(process.uptime());return send(sock,jid,"⏱ "+Math.floor(n/86400)+"d "+Math.floor(n%86400/3600)+"h "+Math.floor(n%3600/60)+"m "+n%60+"s")}
if(p.name==="settings")return send(sock,jid,"*Zyvox Settings*\nMode: "+(session.mode||"public")+"\nLanguage: "+(session.language||"en")+"\nOwner: "+(ownerJid||"not set")+"\nPrefix: .");
if(p.name==="platform")return send(sock,jid,"Zyvox • Baileys • WhatsApp");
if(p.name==="mode"){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");const v=(p.args[0]||"").toLowerCase();if(!["public","private"].includes(v))return send(sock,jid,"Usage: .mode public|private");session.mode=v;await db.saveSetting(session.id,"mode",v);return send(sock,jid,"Mode: "+v)}
if(p.name==="setalive"){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");if(!p.body||p.body==="help")return send(sock,jid,"Usage: .setalive <message>");session.aliveMessage=p.body;await db.saveSetting(session.id,"alive_message",p.body);return send(sock,jid,"✅ Alive message updated.")}
if(p.name==="setowner"){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");const n=(p.args[0]||"").replace(/\D/g,"");if(!n)return send(sock,jid,"Usage: .setowner <number>");session.ownerJid=n+"@s.whatsapp.net";await db.saveSetting(session.id,"owner_jid",session.ownerJid);return send(sock,jid,"✅ Owner updated.")}
if(p.name==="setname"){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");if(!p.body)return send(sock,jid,"Usage: .setname <name>");try{await sock.updateProfileName(p.body)}catch{}await db.saveSetting(session.id,"bot_name",p.body);return send(sock,jid,"✅ Bot name updated.")}
if(p.name==="language"){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");session.language=p.args[0]||"en";await db.saveSetting(session.id,"language",session.language);return send(sock,jid,"Language: "+session.language)}
if(p.name==="setsudo"||p.name==="delsudo"){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");const t=mentions(msg)[0]||p.args[0];if(!t)return send(sock,jid,"Mention a user or provide a JID.");if(p.name==="setsudo")await db.addSudo(session.id,t.includes("@")?t:t.replace(/\D/g,"")+"@s.whatsapp.net");else await db.removeSudo(session.id,t);return send(sock,jid,"✅ Done.")}
if(p.name==="getsudo")return send(sock,jid,(await db.getSudos(session.id)).join("\n")||"No sudo users.");
if(["setvar","getvar","delvar","allvar"].includes(p.name)){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");if(p.name==="allvar")return send(sock,jid,await db.allVars(session.id));const k=p.args[0];if(p.name==="getvar")return send(sock,jid,(await db.getVar(session.id,k))??"Not set.");if(p.name==="delvar"){await db.delVar(session.id,k);return send(sock,jid,"✅ Deleted.")}const z=p.body.split("=");if(z.length<2)return send(sock,jid,"Usage: .setvar KEY=value");await db.setVar(session.id,z.shift().trim(),z.join("=").trim());return send(sock,jid,"✅ Variable saved.")}
if(p.name==="jid")return send(sock,jid,"JID: "+jid);
if(["tagall","tagadmin","tag"].includes(p.name)){if(!group(jid))return send(sock,jid,"❌ Group only.");const md=await sock.groupMetadata(jid),admins=md.participants.filter(x=>x.admin).map(x=>x.id),targets=p.name==="tagadmin"?admins:p.name==="tag"?mentions(msg):md.participants.map(x=>x.id);return send(sock,jid,p.body||"Attention",{mentions:targets})}
if(["promote","demote","kick"].includes(p.name)){if(!group(jid))return send(sock,jid,"❌ Group only.");const md=await sock.groupMetadata(jid),me=md.participants.find(x=>x.id===sender);if(!me?.admin)return send(sock,jid,"❌ Admin only.");let t=mentions(msg);if(p.name==="kick"&&p.args[0]==="all")t=md.participants.filter(x=>x.id!==sender).map(x=>x.id);if(!t.length)return send(sock,jid,"Mention a member.");await sock.groupParticipantsUpdate(jid,t,p.name==="kick"?"remove":p.name);return send(sock,jid,"✅ Done.")}
if(p.name==="mute"||p.name==="unmute"){if(!group(jid))return send(sock,jid,"❌ Group only.");const md=await sock.groupMetadata(jid),me=md.participants.find(x=>x.id===sender);if(!me?.admin)return send(sock,jid,"❌ Admin only.");await sock.groupSettingUpdate(jid,p.name==="mute"?"announcement":"not_announcement");return send(sock,jid,"✅ Group "+p.name+"d.")}
if(p.name==="gname"||p.name==="gdesc"){if(!group(jid))return send(sock,jid,"❌ Group only.");if(p.name==="gname")await sock.groupUpdateSubject(jid,p.body);else await sock.groupUpdateDescription(jid,p.body);return send(sock,jid,"✅ Updated.")}
if(p.name==="invite"){if(!group(jid))return send(sock,jid,"❌ Group only.");return send(sock,jid,"https://chat.whatsapp.com/"+await sock.groupInviteCode(jid))}
if(p.name==="leave"){if(group(jid))await sock.groupLeave(jid);return true}
if(p.name==="restart"){if(!await owner(ctx))return send(sock,jid,"❌ Owner/sudo only.");await send(sock,jid,"♻️ Restarting…");setTimeout(()=>process.exit(0),500);return true}
return send(sock,jid,"ℹ️ ."+p.name+" is registered in Zyvox, but its feature module is not configured yet. Use .info "+p.name+" for usage.");
}
