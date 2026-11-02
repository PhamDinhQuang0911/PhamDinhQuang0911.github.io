// QM 2025 Ngoại Ngữ, 40 câu ngang, mã đề 4 số. Coordinates in 100 source pixels.
(function(){
  const point=(x,y)=>[x/100,y/100],marker=(ten,x,y,s)=>({ten,x:x/100,y:y/100,s:s/100});
  MAU.qm40={ten:'QM_40_Ngang – Mã đề 4 số',r:.15,khung:[0,0,17.35,9.19],
    moc:[marker('TL',47,64,49),marker('TR',1687,64,49),marker('BR',1687,857,49),marker('BL',47,857,49),
      ...[[114,343],[341,343],[710,343],[951,343],[1193,343],[1435,343],[341,811],[710,811],[951,811],[1193,811],[1435,811]].map(([x,y],i)=>marker('I'+i,x,y,27))],
    p1:Array.from({length:40},(_,i)=>{const xs=[[758,801,843,886],[999,1042,1085,1127],[1241,1284,1327,1369],[1483,1525,1568,1611]][Math.floor(i/10)];return xs.map(x=>point(x,385+(i%10)*42.65))}),
    p2:[],p3:[],p3hang:[],sbd:[],sbdNhan:[],made:[161,204,246,286].map(x=>Array.from({length:10},(_,i)=>point(x,385+i*42.65))),madeNhan:Array.from({length:10},(_,i)=>String(i))};
  // Large outside squares establish orientation; refine against all smaller marks.
  window.readQMSheet=function(gray,tpl=MAU.qm40){const small=OMR.thuNho(gray,900),g=small.g,blocks=OMR.timKhoi(g).filter(b=>b.c>g.w*.012&&b.c<g.w*.045);if(blocks.length<4)return null;
    const corners=[[0,0],[g.w,0],[g.w,g.h],[0,g.h]].map(([x,y])=>blocks.reduce((best,b)=>!best||Math.hypot(b.x-x,b.y-y)<Math.hypot(best.x-x,best.y-y)?b:best,null));if(new Set(corners).size!==4)return null;
    const H=OMR.phepChieu(tpl.moc.slice(0,4).map(m=>[m.x,m.y]),corners.map(b=>[b.x*small.k,b.y*small.k]));if(!H)return null;const refined=OMR.tinhChinh(gray,H,tpl);if(!refined)return null;const result=OMR.docPhieu(gray,refined.H,tpl,refined.den);result.H=refined.H;result.soMoc=refined.soMoc;return result;
  };
})();
