// QM 2025 Ngoại Ngữ, 40 câu ngang, mã đề 4 số. Coordinates in 100 source pixels.
(function(){
  const point=(x,y)=>[x/100,y/100],marker=(ten,x,y,s)=>({ten,x:x/100,y:y/100,s:s/100});
  MAU.qm40={ten:'QM_40_Ngang – Mã đề 4 số',r:.15,khung:[0,0,17.35,9.19],
    moc:[marker('TL',47,64,49),marker('TR',1687,64,49),marker('BR',1687,857,49),marker('BL',47,857,49),
      ...[[114,343],[341,343],[710,343],[951,343],[1193,343],[1435,343],[341,811],[710,811],[951,811],[1193,811],[1435,811]].map(([x,y],i)=>marker('I'+i,x,y,27))],
    p1:Array.from({length:40},(_,i)=>{const xs=[[758,801,843,886],[999,1042,1085,1127],[1241,1284,1327,1369],[1483,1525,1568,1611]][Math.floor(i/10)];return xs.map(x=>point(x,385+(i%10)*42.65))}),
    p2:[],p3:[],p3hang:[],sbd:[],sbdNhan:[],made:[161,204,246,286].map(x=>Array.from({length:10},(_,i)=>point(x,385+i*42.65))),madeNhan:Array.from({length:10},(_,i)=>String(i))};
  // Large outside squares establish orientation; refine against all smaller marks.
  window.findQMCorners=function(gray,tpl=MAU.qm40){
    const small=OMR.thuNho(gray,900),g=small.g;
    const blocks=OMR.timKhoi(g).filter(b=>b.c>g.w*.010&&b.c<g.w*.055);
    if(blocks.length<4)return null;
    const m=tpl.moc;
    const tplW=Math.hypot(m[1].x-m[0].x,m[1].y-m[0].y);
    const tplH=Math.hypot(m[3].x-m[0].x,m[3].y-m[0].y);
    const expectedRatio=tplH/tplW;
    const minMoc=Math.max(7,Math.floor((tpl.moc.length||12)*0.45));

    const quads=[];
    // Candidate 0: direct extreme corners
    const direct=[[0,0],[g.w,0],[g.w,g.h],[0,g.h]].map(([x,y])=>blocks.reduce((best,b)=>!best||Math.hypot(b.x-x,b.y-y)<Math.hypot(best.x-x,best.y-y)?b:best,null));
    if(new Set(direct).size===4){
      quads.push({corners:direct,score:100});
    }

    // Quadrant candidates to ignore background clutter / keyboard keys outside paper
    const tlCands=blocks.filter(b=>b.x<g.w*0.48&&b.y<g.h*0.48);
    const trCands=blocks.filter(b=>b.x>g.w*0.52&&b.y<g.h*0.48);
    const brCands=blocks.filter(b=>b.x>g.w*0.52&&b.y>g.h*0.52);
    const blCands=blocks.filter(b=>b.x<g.w*0.48&&b.y>g.h*0.52);

    for(const tl of tlCands){
      for(const tr of trCands){
        const topW=Math.hypot(tr.x-tl.x,tr.y-tl.y);
        if(topW<g.w*0.32||Math.abs(tr.y-tl.y)>topW*0.45)continue;
        if(Math.max(tl.c,tr.c)/Math.min(tl.c,tr.c)>1.85)continue;
        for(const bl of blCands){
          const leftH=Math.hypot(bl.x-tl.x,bl.y-tl.y);
          if(leftH<g.h*0.28||Math.abs(bl.x-tl.x)>leftH*0.45)continue;
          if(Math.max(tl.c,bl.c)/Math.min(tl.c,bl.c)>1.85)continue;
          const ratio=leftH/topW;
          if(ratio<expectedRatio*0.68||ratio>expectedRatio*1.38)continue;
          const predX=tr.x+(bl.x-tl.x),predY=tr.y+(bl.y-tl.y);
          const tol=Math.max(topW,leftH)*0.20;
          for(const br of brCands){
            const distPred=Math.hypot(br.x-predX,br.y-predY);
            if(distPred>tol)continue;
            const sizes=[tl.c,tr.c,br.c,bl.c];
            const maxC=Math.max(...sizes),minC=Math.min(...sizes);
            if(maxC/minC>1.95)continue;
            const avgC=(tl.c+tr.c+br.c+bl.c)/4;
            const ratioErr=Math.abs(ratio-expectedRatio)/expectedRatio;
            const paraErr=distPred/Math.max(topW,leftH);
            const sizeSpread=(maxC-minC)/avgC;
            const score=(topW*leftH)/(g.w*g.h)*2.0+(avgC/g.w)*40-paraErr*4-ratioErr*2-sizeSpread*0.8;
            quads.push({corners:[tl,tr,br,bl],score});
          }
        }
      }
    }

    quads.sort((a,b)=>b.score-a.score);
    let bestRefined=null,bestCorners=null;
    const limitCount=Math.min(quads.length,15);
    for(let i=0;i<limitCount;i++){
      const corners=quads[i].corners;
      const H=OMR.phepChieu(tpl.moc.slice(0,4).map(m=>[m.x,m.y]),corners.map(b=>[b.x*small.k,b.y*small.k]));
      if(!H)continue;
      const refined=OMR.tinhChinh(gray,H,tpl);
      if(!refined||refined.soMoc<minMoc)continue;
      if(!bestRefined||refined.soMoc>bestRefined.soMoc){
        bestRefined=refined;
        bestCorners=corners;
        if(refined.soMoc>=tpl.moc.length-2)break;
      }
    }
    if(!bestRefined)return null;
    return {refined:bestRefined,corners:bestCorners};
  };
  window.readQMSheet=function(gray,tpl=MAU.qm40){
    const found=window.findQMCorners(gray,tpl);
    if(!found)return null;
    const {refined}=found;
    const result=OMR.docPhieu(gray,refined.H,tpl,refined.den);
    result.H=refined.H;
    result.soMoc=refined.soMoc;
    return result;
  };
})();
