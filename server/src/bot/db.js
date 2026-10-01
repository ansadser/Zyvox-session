export function createBotDb(pool){return{
async init(){if(!pool)return;await pool.query("CREATE TABLE IF NOT EXISTS bot_settings(session_id VARCHAR(64) REFERENCES sessions(session_id) ON DELETE CASCADE,key VARCHAR(64) NOT NULL,value TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(session_id,key)); CREATE TABLE IF NOT EXISTS bot_sudos(session_id VARCHAR(64) REFERENCES sessions(session_id) ON DELETE CASCADE,jid VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(session_id,jid)); CREATE TABLE IF NOT EXISTS bot_variables(session_id VARCHAR(64) REFERENCES sessions(session_id) ON DELETE CASCADE,key VARCHAR(128) NOT NULL,value TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(session_id,key));")},
async getSetting(s,k){if(!pool)return null;const{rows}=await pool.query("SELECT value FROM bot_settings WHERE session_id=$1 AND key=$2",[s,k]);return rows[0]?.value??null},
async saveSetting(s,k,v){if(pool)await pool.query("INSERT INTO bot_settings(session_id,key,value,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(session_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[s,k,String(v)])},
async getSudos(s){if(!pool)return[];const{rows}=await pool.query("SELECT jid FROM bot_sudos WHERE session_id=$1 ORDER BY created_at",[s]);return rows.map(r=>r.jid)},
async addSudo(s,j){if(pool)await pool.query("INSERT INTO bot_sudos(session_id,jid) VALUES($1,$2) ON CONFLICT DO NOTHING",[s,j])},
async removeSudo(s,j){if(pool)await pool.query("DELETE FROM bot_sudos WHERE session_id=$1 AND jid=$2",[s,j])},
async getVar(s,k){if(!pool)return null;const{rows}=await pool.query("SELECT value FROM bot_variables WHERE session_id=$1 AND key=$2",[s,k]);return rows[0]?.value??null},
async setVar(s,k,v){if(pool)await pool.query("INSERT INTO bot_variables(session_id,key,value,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(session_id,key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",[s,k,v])},
async delVar(s,k){if(pool)await pool.query("DELETE FROM bot_variables WHERE session_id=$1 AND key=$2",[s,k])},
async allVars(s){if(!pool)return"Database disabled.";const{rows}=await pool.query("SELECT key,value FROM bot_variables WHERE session_id=$1 ORDER BY key",[s]);return rows.length?rows.map(r=>r.key+" = "+r.value).join("\n"):"No variables."}
}};
