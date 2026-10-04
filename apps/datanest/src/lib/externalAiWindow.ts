export type CompanionPlacementInput = {
  screenLeft:number;
  screenTop:number;
  screenWidth:number;
  screenHeight:number;
  browserLeft:number;
  browserTop:number;
  browserWidth:number;
  browserHeight:number;
  dockWidth:number;
  preferredWidth:number;
};

export type CompanionPlacement = {
  left:number;
  top:number;
  width:number;
  height:number;
  reserveRight:number;
};

function clamp(value:number,min:number,max:number){
  return Math.max(min,Math.min(max,value));
}

export function calculateCompanionPlacement(input:CompanionPlacementInput):CompanionPlacement{
  const gap=8;
  const minCompanionWidth=360;
  const navReserve=220;
  const minMainWidth=360;
  const screenRight=input.screenLeft+input.screenWidth;
  const screenBottom=input.screenTop+input.screenHeight;
  const browserRight=input.browserLeft+input.browserWidth;
  const freeRight=Math.max(0,screenRight-browserRight);
  const freeLeft=Math.max(0,input.browserLeft-input.screenLeft);

  let width=clamp(input.preferredWidth,460,760);
  let left:number;
  let reserveRight=0;

  if(freeRight>=width+gap){
    // Best case: keep the provider completely outside DataNest.
    left=browserRight+gap;
  }else if(freeLeft>=width+gap){
    // Prefer unused screen space over covering the app.
    left=input.browserLeft-gap-width;
  }else{
    // When DataNest is maximized, reserve a right-hand visual rail inside the
    // app and place the companion directly over that reserved rail. This makes
    // the external window read as an extension of the DataNest dock instead of
    // floating over the middle of the workspace.
    const maxDockedWidth=
      input.browserWidth-input.dockWidth-navReserve-minMainWidth-gap;

    if(maxDockedWidth>=minCompanionWidth){
      width=Math.min(width,maxDockedWidth);
      left=screenRight-width;
      const overlap=Math.max(0,browserRight-left);
      reserveRight=overlap>0?Math.min(input.browserWidth,overlap+gap):0;
    }else{
      // Very narrow desktops cannot support four usable columns. Preserve the
      // Return to DataNest dock and fall back to the previous non-dock overlay.
      const mainSpace=input.browserWidth-input.dockWidth-gap*2;
      width=Math.min(width,Math.max(320,mainSpace));
      left=clamp(
        browserRight-input.dockWidth-gap-width,
        input.screenLeft,
        Math.max(input.screenLeft,screenRight-width)
      );
    }
  }

  const height=clamp(input.browserHeight,620,input.screenHeight);
  const top=clamp(
    input.browserTop,
    input.screenTop,
    Math.max(input.screenTop,screenBottom-height)
  );

  return {
    left:Math.round(left),
    top:Math.round(top),
    width:Math.round(width),
    height:Math.round(height),
    reserveRight:Math.round(reserveRight)
  };
}


export type ActualCompanionWindow = {
  left:number;
  top:number;
  width:number;
  height:number;
};

export function companionReserveForActualWindow(
  desired:CompanionPlacement,
  actual:ActualCompanionWindow
):number{
  if(desired.reserveRight<=0)return 0;

  // Browsers may adjust requested popup geometry for window chrome and display scaling.
  // Accept small geometry drift, but reject tab/full-window fallbacks before reserving DataNest space.
  const edgeTolerance=48;
  const sizeTolerance=72;
  const desiredRight=desired.left+desired.width;
  const actualRight=actual.left+actual.width;
  const isDocked=
    Math.abs(actualRight-desiredRight)<=edgeTolerance&&
    Math.abs(actual.left-desired.left)<=edgeTolerance&&
    Math.abs(actual.width-desired.width)<=sizeTolerance;

  return isDocked?desired.reserveRight:0;
}
