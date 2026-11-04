// QM 2025 Ngoại Ngữ, 40 câu ngang, mã đề 4 số. Coordinates in 100 source pixels.
(function(){
  const point=(x,y)=>[x/100,y/100],marker=(ten,x,y,s)=>({ten,x:x/100,y:y/100,s:s/100});
  MAU.qm40={ten:'QM_40_Ngang – Mã đề 4 số',r:.15,khung:[0,0,17.35,9.19],
    moc:[marker('TL',47,64,49),marker('TR',1687,64,49),marker('BR',1687,857,49),marker('BL',47,857,49),
      ...[[114,343],[341,343],[710,343],[951,343],[1193,343],[1435,343],[341,811],[710,811],[951,811],[1193,811],[1435,811]].map(([x,y],i)=>marker('I'+i,x,y,27))],
    p1:Array.from({length:40},(_,i)=>{const xs=[[758,801,843,886],[999,1042,1085,1127],[1241,1284,1327,1369],[1483,1525,1568,1611]][Math.floor(i/10)];return xs.map(x=>point(x,385+(i%10)*42.65))}),
    p2:[],p3:[],p3hang:[],sbd:[],sbdNhan:[],made:[161,204,246,286].map(x=>Array.from({length:10},(_,i)=>point(x,385+i*42.65))),madeNhan:Array.from({length:10},(_,i)=>String(i))};
  // Large outside squares establish orientation; refine against all smaller marks.
  window.findQMCorners=function(gray,tpl=MAU.qm40,guideHints=null){
    const small=OMR.thuNho(gray,1000),g=small.g;
    const minDim=Math.min(g.w,g.h);
    const allBlocks=OMR.timKhoi(g).filter(b=>b.c>minDim*0.0072&&b.c<minDim*0.075);
    if(allBlocks.length<4)return null;
    allBlocks.sort((a,b)=>b.c-a.c);
    const blocks=allBlocks.slice(0,65);

    const m=tpl.moc;
    const tplW=Math.hypot(m[1].x-m[0].x,m[1].y-m[0].y);
    const tplH=Math.hypot(m[3].x-m[0].x,m[3].y-m[0].y);
    const expectedRatio=tplH/tplW;
    const minMoc=Math.max(6,Math.floor((tpl.moc.length||12)*0.40));

    const quads=[];

    // Candidate 0A: Guide-box target proximity (4 corner target boxes in camera UI)
    const hints=Array.isArray(guideHints)&&guideHints.length===4
      ? guideHints.map(([nx,ny])=>[nx*g.w,ny*g.h])
      : [[g.w*0.11,g.h*0.16],[g.w*0.89,g.h*0.16],[g.w*0.89,g.h*0.88],[g.w*0.11,g.h*0.88]];
    const maxHintDist=minDim*0.30;
    const guided=hints.map(([hx,hy])=>{
      let best=null,bestVal=-1e9;
      for(const b of blocks){
        const d=Math.hypot(b.x-hx,b.y-hy);
        if(d>maxHintDist)continue;
        const val=b.c*3.8-d*0.25;
        if(val>bestVal){bestVal=val;best=b;}
      }
      return best;
    });
    if(guided.every(Boolean)&&new Set(guided).size===4){
      quads.push({corners:guided,score:150});
    }

    // Candidate 0B: Size-weighted extreme corners
    const direct=[[0,0],[g.w,0],[g.w,g.h],[0,g.h]].map(([x,y])=>blocks.reduce((best,b)=>{
      const valB=b.c*2.4-Math.hypot(b.x-x,b.y-y)*0.22;
      if(!best)return b;
      const valBest=best.c*2.4-Math.hypot(best.x-x,best.y-y)*0.22;
      return valB>valBest?b:best;
    },null));
    if(direct.every(Boolean)&&new Set(direct).size===4){
      quads.push({corners:direct,score:120});
    }

    // Quadrant candidates to ignore background clutter / keyboard keys outside paper
    const tlCands=blocks.filter(b=>b.x<g.w*0.56&&b.y<g.h*0.52);
    const trCands=blocks.filter(b=>b.x>g.w*0.44&&b.y<g.h*0.52);
    const brCands=blocks.filter(b=>b.x>g.w*0.44&&b.y>g.h*0.48);
    const blCands=blocks.filter(b=>b.x<g.w*0.56&&b.y>g.h*0.48);

    for(const tl of tlCands){
      for(const tr of trCands){
        if(tr.x<=tl.x)continue;
        const topW=Math.hypot(tr.x-tl.x,tr.y-tl.y);
        if(topW<minDim*0.25||Math.abs(tr.y-tl.y)>topW*0.45)continue;
        if(Math.max(tl.c,tr.c)/Math.min(tl.c,tr.c)>2.05)continue;
        for(const bl of blCands){
          if(bl.y<=tl.y)continue;
          const leftH=Math.hypot(bl.x-tl.x,bl.y-tl.y);
          if(leftH<minDim*0.26||Math.abs(bl.x-tl.x)>leftH*0.45)continue;
          if(Math.max(tl.c,bl.c)/Math.min(tl.c,bl.c)>2.05)continue;
          const ratio=leftH/topW;
          if(ratio<expectedRatio*0.62||ratio>expectedRatio*1.45)continue;
          const predX=tr.x+(bl.x-tl.x),predY=tr.y+(bl.y-tl.y);
          const tol=Math.max(topW,leftH)*0.22;
          for(const br of brCands){
            const distPred=Math.hypot(br.x-predX,br.y-predY);
            if(distPred>tol)continue;
            const sizes=[tl.c,tr.c,br.c,bl.c];
            const maxC=Math.max(...sizes),minC=Math.min(...sizes);
            if(maxC/minC>2.15)continue;
            const avgC=(tl.c+tr.c+br.c+bl.c)/4;
            const ratioErr=Math.abs(ratio-expectedRatio)/expectedRatio;
            const paraErr=distPred/Math.max(topW,leftH);
            const sizeSpread=(maxC-minC)/avgC;
            const score=(topW*leftH)/(g.w*g.h)*2.2+(avgC/minDim)*65-paraErr*4-ratioErr*2-sizeSpread*0.8;
            quads.push({corners:[tl,tr,br,bl],score});
          }
        }
      }
    }

    quads.sort((a,b)=>b.score-a.score);
    let bestRefined=null,bestCorners=null;
    const limitCount=Math.min(quads.length,18);
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
    if(!bestRefined&&OMR.timMoc){
      const fbCorners=OMR.timMoc(g,tpl);
      if(fbCorners&&fbCorners.length===4){
        const H=OMR.phepChieu(tpl.moc.slice(0,4).map(m=>[m.x,m.y]),fbCorners.map(b=>[b.x*small.k,b.y*small.k]));
        if(H){
          const refined=OMR.tinhChinh(gray,H,tpl);
          if(refined&&refined.soMoc>=minMoc){
            bestRefined=refined;
            bestCorners=fbCorners;
          }
        }
      }
    }

    if(!bestRefined)return null;
    return {
      refined: bestRefined,
      corners: bestCorners,
      origCorners: bestCorners ? bestCorners.map(b => [b.x * small.k, b.y * small.k]) : null,
      smallK: small.k,
      length: 4
    };
  };
  window.readQMSheet=function(gray,tpl=MAU.qm40,guideHints=null){
    const found=window.findQMCorners(gray,tpl,guideHints);
    if(!found)return null;
    const {refined}=found;
    const result=OMR.docPhieu(gray,refined.H,tpl,refined.den);
    result.H=refined.H;
    result.soMoc=refined.soMoc;
    return result;
  };
})();
