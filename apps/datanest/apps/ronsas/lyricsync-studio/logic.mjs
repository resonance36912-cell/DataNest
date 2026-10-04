export function parseLyrics(value){return String(value||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
export function formatLrcTime(seconds){const s=Math.max(0,Number(seconds)||0),m=Math.floor(s/60),rest=s-m*60;return String(m).padStart(2,"0")+":"+rest.toFixed(2).padStart(5,"0");}
export function generateLrc({lyrics,durationSeconds,offsetSeconds=0}={}){
 const lines=parseLyrics(lyrics),duration=Number(durationSeconds),offset=Number(offsetSeconds)||0;if(!lines.length)throw new Error("Lyrics are required.");if(!Number.isFinite(duration)||duration<=0)throw new Error("Track duration must be greater than zero.");
 const usable=Math.max(.01,duration-offset),step=usable/lines.length;return lines.map((line,i)=>`[${formatLrcTime(offset+i*step)}]${line}`).join("\n");
}
