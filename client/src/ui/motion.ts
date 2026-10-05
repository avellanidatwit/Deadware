export interface Sample { time: number; x: number; y: number }
/** Follow the actual server polyline; never extrapolate into unconfirmed terrain. */
export function interpolateMotion(samples: readonly Sample[], time: number, fallback: {x:number;y:number}): {x:number;y:number} {
  if (!samples.length) return fallback;
  if(time<=samples[0].time) return samples[0];
  for(let i=1;i<samples.length;i++) {
    const a=samples[i-1], b=samples[i];
    if(time>b.time) continue;
    const duration=b.time-a.time, fraction=duration>0?Math.max(0,Math.min(1,(time-a.time)/duration)):1;
    return {x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
  }
  return samples[samples.length-1];
}
