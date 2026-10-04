const motifs=["establish the world","introduce movement","raise tension","reveal a detail","shift perspective","land the final image"];
export function generateScenes(input={}){
 const concept=String(input.concept||"").trim();if(!concept)throw new Error("Concept is required.");
 const mood=String(input.mood||"cinematic").trim()||"cinematic",duration=Math.max(1,Number(input.durationSeconds)||60),count=Math.min(12,Math.max(1,Math.round(Number(input.sceneCount)||6))),step=duration/count;
 return Array.from({length:count},(_,i)=>({scene:i+1,start:Number((i*step).toFixed(2)),end:Number(((i+1)*step).toFixed(2)),mood,prompt:`${concept}. ${motifs[i%motifs.length]}; ${mood} tone; scene ${i+1} of ${count}.`}));
}
