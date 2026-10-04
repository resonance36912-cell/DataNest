export function replayContentMatches(existingHash:string,newHash:string):boolean{
  return Boolean(existingHash)&&existingHash===newHash;
}

export function chronologicalFromNewestFirst<T>(rows:T[]):T[]{
  return [...rows].reverse();
}
