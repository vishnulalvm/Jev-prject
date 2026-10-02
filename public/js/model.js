// JevTrade decision model - pure functions, no DOM access.
// Exposes as globals (loaded before js/app.js, no build step/bundler):
//   clamp, S5, avg, f1, f2, inr, inr0, OPTS, LBL, TF, NA, FUND_KEYS,
//   effectiveEvent, jev, factorPhrase

const clamp=(x,a=-1,b=1)=>Math.max(a,Math.min(b,x));
const S5=x=>Math.max(1,Math.min(5,Math.round(x)));
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const f1=n=>(+n).toFixed(1), f2=n=>(+n).toFixed(2);
const inr=n=>'₹'+(+n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const inr0=n=>'₹'+Math.round(+n).toLocaleString('en-IN');
const OPTS={
  macd:[['1','Bullish crossover','pos'],['0.6','Bullish','pos'],['0','Neutral',''],['-0.6','Bearish','neg'],['-1','Bearish crossover','neg']],
  mom:[['1','Strong up','pos'],['0.5','Up','pos'],['0','Flat',''],['-0.5','Down','neg'],['-1','Strong down','neg']],
  mkt:[['1','Bullish','pos'],['0','Neutral',''],['-1','Bearish','neg']],
  sec:[['1','Bullish','pos'],['0','Neutral',''],['-1','Bearish','neg']],
  news:[['1','Very positive','pos'],['0.5','Positive','pos'],['0','Neutral',''],['-0.5','Negative','neg'],['-1','Very negative','neg']],
  fii:[['1','Net buying','pos'],['0','Neutral',''],['-1','Net selling','neg']],
  evt:[['none','None',''],['low','Low',''],['medium','Medium: results < 2 weeks','neg'],['high','High: results, RBI or Budget this week','neg']],
  cat:[['1','Positive','pos'],['0','None',''],['-1','Negative','neg']],
  surv:[['none','None',''],['asm','ASM list','neg'],['gsm','GSM list','neg']],
};
const LBL=Object.fromEntries(Object.entries(OPTS).map(([k,o])=>[k,Object.fromEntries(o.map(([v,t])=>[v,t]))]));
const TF={'1D':{w:.05,label:'the next session',tol:1,win:1},'1W':{w:.15,label:'the next week',tol:3,win:7},'1M':{w:.20,label:'the next month',tol:7,win:30},'3M':{w:.35,label:'the next three months',tol:14,win:90}};
const NA='Not provided. Treated as neutral.';
const FUND_KEYS={nonfin:['pe','spe','peg','fcf','de','ic','pledge'],fin:['pb','spb','pe','spe','peg','gnpa','car','roa']};

function effectiveEvent(v){
  const rank={none:0,low:1,medium:2,high:3};let e=v.evt||'none',byDate=false;const d=v.edays;
  if(d!=null&&d>=0){ if(d<=5&&rank[e]<3){e='high';byDate=true;} else if(d<=14&&rank[e]<2){e='medium';byDate=true;} }
  return {e,byDate,days:d};
}

function jev(v,opts={}){
  const has=k=>Number.isFinite(v[k]);
  const p=v.price, tfk=v.tf||'1W', tf=TF[tfk], fw=tf.w, fin=!!v.fin;
  const macd=+v.macd,mom=+v.mom,mkt=+v.mkt,sec=+v.sec,news=+v.news,cat=+v.cat,fii=+v.fii,surv=v.surv||'none';
  const EV=effectiveEvent(v);
  const atr=has('atr')?v.atr:null;

  // ---- technical factors (null = not provided = neutral) ----
  const emaKeys=['e20','e50','e200'].filter(has);
  let trend=null,above=0,stacked=false,inverted=false;
  if(emaKeys.length){
    const parts=emaKeys.map(k=>p>v[k]?1:-1);
    if(has('e20')&&has('e50'))parts.push(v.e20>v.e50?1:-1);
    if(has('e50')&&has('e200'))parts.push(v.e50>v.e200?1:-1);
    trend=avg(parts);above=emaKeys.filter(k=>p>v[k]).length;
    stacked=emaKeys.length===3&&v.e20>v.e50&&v.e50>v.e200;inverted=emaKeys.length===3&&v.e20<v.e50&&v.e50<v.e200;
  }
  const r=v.rsi;
  const rsi=has('rsi')?(r>=50&&r<65?0.8:r>=65&&r<70?0.4:r>=70&&r<80?-0.3:r>=80?-0.7:r>=40?-0.2:r>=30?-0.6:0.2):null;
  const hasSR=has('sup')&&has('res');
  const up=hasSR?v.res-p:null,down=hasSR?p-v.sup:null;
  const room=hasSR?(up>0&&down>0?up/down:up<=0?9:0):null;
  const sr=hasSR?(up>0&&down>0?clamp(Math.log(up/down)/Math.log(3)):up<=0?0.5:-0.8):null;
  const dir=Math.sign((trend||0)+mom+macd)||0;
  const volume=has('vol')?clamp(v.vol/80)*dir:null;
  const rsDiff=has('sret')&&has('nret')?v.sret-v.nret:null;
  const rs=rsDiff==null?null:clamp(rsDiff/12);
  const vix=has('vix')?(v.vix<13?0.6:v.vix<16?0.2:v.vix<20?-0.3:v.vix<25?-0.7:-1):null;
  const F=[
    {k:'ema',n:'EMA structure',s:trend,w:.17},{k:'rsi',n:'RSI',s:rsi,w:.10},{k:'macd',n:'MACD',s:macd,w:.12},{k:'mom',n:'Momentum',s:mom,w:.10},
    {k:'sr',n:'Support / resistance',s:sr,w:.08},{k:'vol',n:'Volume',s:volume,w:.07},{k:'mkt',n:'Nifty 50 trend',s:mkt,w:.07},{k:'sec',n:'Sector trend',s:sec,w:.07},
    {k:'rs',n:'Relative strength',s:rs,w:.08},{k:'vix',n:'India VIX',s:vix,w:.04},{k:'fii',n:'FII flows',s:fii,w:.05},{k:'news',n:'Market sentiment',s:news,w:.05},
  ];
  const tech=F.reduce((a,f)=>a+(f.s??0)*f.w,0);
  const techCov=F.reduce((a,f)=>a+(f.s==null?0:f.w),0);

  // ---- 20 typed questions ----
  const Q=[];
  const add=(dim,q,type,ans,noul)=>Q.push(Object.assign({id:'Q'+(Q.length+1),dim,q,type,noul},ans));
  const scoreQ=(dim,q,ok,scoreFn,noulFn)=>{const s=ok?scoreFn():null;add(dim,q,'Score',{score:s,na:s==null},s==null?NA:noulFn(s));return s;};
  const choiceQ=(dim,q,choice,options,noul)=>add(dim,q,'Choice',{choice,options,na:choice==null},choice==null?NA:noul);
  const dimScore=a=>{const g=a.filter(x=>x!=null);return g.length?S5(avg(g)):null;};
  const gAvg=a=>{const g=a.filter(x=>x!=null);return g.length?avg(g):null;};
  const ratioScore=x=>x<0.7?5:x<0.9?4:x<1.1?3:x<1.4?2:1;
  const ratioWord=x=>x<0.9?'a discount to peers':x<=1.1?'in line with peers':'a premium to peers';

  const peR=has('pe')&&has('spe')&&v.spe>0?v.pe/v.spe:null;
  const pbR=has('pb')&&has('spb')&&v.spb>0?v.pb/v.spb:null;
  const pegQ=()=>scoreQ('valuation','Does growth justify the multiple?',has('peg'),()=>v.peg<0.8?5:v.peg<1.2?4:v.peg<1.8?3:v.peg<2.5?2:1,()=>`PEG of ${f2(v.peg)}: ${v.peg<1?'growth more than covers the multiple':v.peg<1.8?'growth roughly supports the multiple':'the multiple runs ahead of growth'}.`);
  const peQ=()=>scoreQ('valuation','Is the P/E attractive versus the sector?',peR!=null,()=>ratioScore(peR),()=>`P/E ${f1(v.pe)} is ${f2(peR)}× the sector's ${f1(v.spe)}, ${ratioWord(peR)}.`);
  let q1,q2,q3;
  if(fin){
    q1=scoreQ('valuation','Is the P/B attractive versus the sector?',pbR!=null,()=>ratioScore(pbR),()=>`P/B ${f2(v.pb)} is ${f2(pbR)}× the sector's ${f2(v.spb)}, ${ratioWord(pbR)}.`);
    q2=peQ();q3=pegQ();
  }else{
    q1=peQ();q2=pegQ();
    q3=scoreQ('valuation','Is the free-cash-flow yield compelling?',has('fcf'),()=>v.fcf>6?5:v.fcf>4?4:v.fcf>2.5?3:v.fcf>1?2:1,()=>`FCF yield of ${f1(v.fcf)}% is ${v.fcf>=4?'a solid cash return':v.fcf>=2.5?'moderate':'thin at this price'}.`);
  }
  const valA=gAvg([q1,q2,q3]),valS=dimScore([q1,q2,q3]);
  const valC=valA==null?null:valA>=3.7?'Cheap':valA>=2.5?'Fair':'Expensive';
  choiceQ('valuation','Overall valuation?',valC,['Cheap','Fair','Expensive'],valC==='Cheap'?'Cheap: priced below peers on most measures.':valC==='Fair'?'Fair: multiples roughly in line with peers and growth.':'Expensive: priced at a premium to peers and growth.');

  let q5,q6,q7,bsNames;
  if(fin){
    q5=scoreQ('balance','Is asset quality clean?',has('gnpa'),()=>v.gnpa<1.5?5:v.gnpa<3?4:v.gnpa<5?3:v.gnpa<8?2:1,()=>`Gross NPA of ${f2(v.gnpa)}% is ${v.gnpa<3?'low':v.gnpa<5?'moderate':'high'}.`);
    q6=scoreQ('balance','Is capital adequate?',has('car'),()=>v.car>18?5:v.car>16?4:v.car>14?3:v.car>12?2:1,()=>`Capital adequacy of ${f1(v.car)}% ${v.car>16?'leaves a comfortable buffer':v.car>13?'is above the regulatory floor':'is close to the regulatory floor'}.`);
    q7=scoreQ('balance','Is profitability strong?',has('roa'),()=>v.roa>1.8?5:v.roa>1.2?4:v.roa>0.8?3:v.roa>0.4?2:1,()=>`Return on assets of ${f2(v.roa)}% is ${v.roa>1.5?'strong for a lender':v.roa>0.8?'adequate':'weak'}.`);
    bsNames=['asset quality','capital adequacy','profitability'];
  }else{
    q5=scoreQ('balance','Is leverage conservative?',has('de'),()=>v.de<0.3?5:v.de<0.7?4:v.de<1.2?3:v.de<2?2:1,()=>`Debt/equity of ${f2(v.de)} is ${v.de<0.7?'low':v.de<1.2?'moderate':'high'}.`);
    q6=scoreQ('balance','Is interest comfortably covered?',has('ic'),()=>v.ic>20?5:v.ic>10?4:v.ic>5?3:v.ic>2?2:1,()=>`Earnings cover interest ${f1(v.ic)}×, ${v.ic>10?'a wide margin':v.ic>5?'a reasonable margin':'a thin margin'}.`);
    q7=scoreQ('balance','Is promoter pledging a risk?',has('pledge'),()=>v.pledge<=0?5:v.pledge<5?4:v.pledge<15?3:v.pledge<30?2:1,()=>v.pledge<=0?'No promoter shares are pledged.':`${f1(v.pledge)}% of promoter holding is pledged, ${v.pledge<5?'a minor overhang':v.pledge<15?'worth watching':'a real forced-selling risk'}.`);
    bsNames=['leverage','interest cover','promoter pledge'];
  }
  const bsA=gAvg([q5,q6,q7]),bsS=dimScore([q5,q6,q7]);
  const bsC=bsA==null?null:bsA>=3.7?'Strong':bsA>=2.5?'Adequate':'Weak';
  const weakBS=bsNames.map((n,i)=>[n,[q5,q6,q7][i]]).filter(x=>x[1]!=null).sort((a,b)=>a[1]-b[1])[0];
  choiceQ('balance','Overall balance-sheet strength?',bsC,['Strong','Adequate','Weak'],weakBS?`${bsC}: ${weakBS[0]} is the weakest point at ${weakBS[1]}/5.`:'');

  const q9=scoreQ('momentum','Is the stock in a confirmed uptrend?',trend!=null,()=>S5(3+2*trend),()=>`Price is above ${above} of ${emaKeys.length} EMA${emaKeys.length>1?'s':''}${emaKeys.length===3?`, which are ${stacked?'in bullish order':inverted?'in bearish order':'mixed'}`:''}.`);
  const q10=scoreQ('momentum','Do RSI and MACD support the trend?',true,()=>S5(3+2*(rsi==null?macd:avg([rsi,macd]))),()=>rsi==null?`MACD is ${LBL.macd[v.macd].toLowerCase()}; RSI not provided.`:`RSI ${f1(r)} (${r>=70?'overbought':r>=50?'constructive':r>=30?'soft':'oversold'}) with MACD ${LBL.macd[v.macd].toLowerCase()}.`);
  const q11=scoreQ('momentum','Is it outperforming the Nifty?',rsDiff!=null,()=>rsDiff>=10?5:rsDiff>=3?4:rsDiff>=-3?3:rsDiff>=-10?2:1,()=>`${v.sret>=0?'Up':'Down'} ${f1(Math.abs(v.sret))}% over 3 months vs the Nifty's ${v.nret>=0?'+':''}${f1(v.nret)}%, ${rsDiff>=0?'ahead':'behind'} by ${f1(Math.abs(rsDiff))} points.`);
  const volC=has('vol')?(v.vol>15?'Confirms':v.vol<-15?'Diverges':'Neutral'):null;
  choiceQ('momentum','Does volume confirm the move?',volC,['Confirms','Neutral','Diverges'],`Volume is ${v.vol>0?'+':''}${f1(v.vol)}% vs average, ${volC==='Confirms'?'so participation backs the move':volC==='Diverges'?'so participation is weak':'so no strong signal either way'}.`);
  const momA=gAvg([q9,q10,q11]);const momS=momA==null?null:S5(momA+(volC==='Confirms'?0.4:volC==='Diverges'?-0.4:0));

  const atrPct=atr!=null?atr/p*100:null;
  const q13=scoreQ('macro','Is the volatility regime calm?',has('vix'),()=>v.vix<12?5:v.vix<15?4:v.vix<19?3:v.vix<24?2:1,()=>`India VIX at ${f1(v.vix)} signals ${v.vix<12?'a calm market':v.vix<15?'normal volatility':v.vix<19?'rising stress':'a stressed market'}.`);
  const q14=scoreQ('macro','Are Nifty, sector and FII flows supportive?',true,()=>S5(3+(mkt+sec+fii)*2/3),()=>`Nifty 50 is ${LBL.mkt[v.mkt].toLowerCase()}, the sector is ${LBL.sec[v.sec].toLowerCase()}, and FII cash flow is ${LBL.fii[v.fii].toLowerCase()}.`);
  const evtL={none:'None',low:'Low',medium:'Elevated',high:'High'}[EV.e];
  choiceQ('macro','Is there near-term event risk?',evtL,['None','Low','Elevated','High'],EV.byDate?`Results in ${EV.days} day${EV.days===1?'':'s'} could gap the price.`:{none:'No scheduled events in the window.',low:'Minor scheduled events only.',medium:'Quarterly results within two weeks could gap the price.',high:'Results, RBI policy or the Budget this week could move it sharply.'}[EV.e]);
  const advS=has('adv')?(v.adv>=50?5:v.adv>=10?4:v.adv>=2?3:v.adv>=0.5?2:1):null;
  const liqOk=advS!=null||surv!=='none';
  const q16=scoreQ('macro','Is it liquid and free of surveillance restrictions?',liqOk,()=>surv==='gsm'?1:surv==='asm'?Math.min(advS??3,2):advS,
    ()=>surv==='gsm'?'On the GSM list: trade-for-trade settlement and tight limits apply.':surv==='asm'?`On the ASM list${has('adv')?` with ${inr0(v.adv)} cr daily value`:''}: higher margins apply.`:`Average daily value of ${inr0(v.adv)} cr ${v.adv>=10?'gives easy entry and exit':v.adv>=2?'suits modest positions':'is thin; slippage and exit risk are high'}.`);
  const evtPen={none:0,low:0,medium:0.5,high:1}[EV.e];
  const macA=gAvg([q13,q14,q16]);const macS=S5(macA-evtPen);

  const q17=scoreQ('upside','Is there room before resistance?',hasSR,()=>room>3?5:room>2?4:room>1.2?3:room>0.7?2:1,()=>up>0&&down>0?`${inr(up)} to resistance against ${inr(down)} to support, ${f1(room)}× reward to risk.`:up<=0?'Price has cleared resistance.':'Price has broken below support.');
  const q18=scoreQ('upside','Is market sentiment supportive?',true,()=>S5(3+2*news),()=>`Sentiment is ${LBL.news[v.news].toLowerCase()}.`);
  const catC=cat>0?'Positive':cat<0?'Negative':'None';
  choiceQ('upside','Is there a near-term catalyst?',catC,['Positive','None','Negative'],cat>0?'A positive catalyst is expected.':cat<0?'A negative catalyst is expected.':'No catalyst identified.');
  const catS=cat>0?5:cat<0?1:3;const upS=dimScore([q17,q18,catS]);

  // ---- composite ----
  const fund=(valS!=null?((valS-3)/2)*.5:0)+(bsS!=null?((bsS-3)/2)*.3:0)+cat*.2;
  const fkeys=FUND_KEYS[fin?'fin':'nonfin'];
  const fundFields=fkeys.filter(has).length;
  const coverage=(1-fw)*techCov+fw*(fundFields/fkeys.length*0.8+0.2);
  const evtMult={none:1,low:.95,medium:.85,high:.7}[EV.e];
  const survMult={none:1,asm:.85,gsm:.4}[surv];
  const liqMult=has('adv')?(v.adv<1?.6:v.adv<2?.85:1):1;
  const s=((1-fw)*tech+fw*fund)*evtMult*survMult*liqMult;
  let choice,prob;
  if(s>=0.15){choice='BUY';prob=50+s*48;}else if(s<=-0.15){choice='SELL';prob=50+Math.abs(s)*48;}else{choice='HOLD';prob=55+(1-Math.abs(s)/0.15)*20;}
  prob=Math.round(Math.min(prob,88));
  if(opts.forceChoice){choice=opts.forceChoice;prob=opts.forceProb;}
  const sign=choice==='BUY'?1:choice==='SELL'?-1:0;
  const avail=F.filter(f=>f.s!=null),aw=avail.reduce((a,f)=>a+f.w,0)||1;
  const agree=sign?avail.reduce((a,f)=>a+(Math.sign(f.s)===sign?f.w:0),0)/aw:avail.reduce((a,f)=>a+(Math.abs(f.s)<0.35?f.w:0),0)/aw;

  // ---- trade plan ----
  const buf=atr!=null?0.25*atr:0.005*p;
  const plan={type:choice,entry:p,stop:null,stopBasis:null,target:null,targetBasis:null,rr:null,qty:null,exposure:null,riskAmt:null,trigUp:null,trigDown:null};
  if(choice==='BUY'){
    if(has('sup')&&v.sup<p){const st=v.sup-buf;if(atr==null||p-st<=3*atr){plan.stop=st;plan.stopBasis='just below support';}}
    if(plan.stop==null&&atr!=null){plan.stop=p-1.5*atr;plan.stopBasis='1.5 ATR below price';}
    if(has('res')&&v.res>p){plan.target=v.res;plan.targetBasis='first resistance';}
    else if(plan.stop!=null){plan.target=p+2*(p-plan.stop);plan.targetBasis='2× the risk';}
    if(plan.stop!=null&&plan.target!=null)plan.rr=(plan.target-p)/(p-plan.stop);
  }else if(choice==='SELL'){
    if(has('res')&&v.res>p&&(atr==null||v.res-p<=3*atr)){plan.stop=v.res+buf;plan.stopBasis='just above resistance';}
    else if(has('e20')&&v.e20>p){plan.stop=v.e20+buf;plan.stopBasis='just above the 20 EMA';}
    else if(atr!=null){plan.stop=p+1.5*atr;plan.stopBasis='1.5 ATR above price';}
    if(has('sup')&&v.sup<p){plan.target=v.sup;plan.targetBasis='next support';}
    else if(plan.stop!=null){plan.target=p-2*(plan.stop-p);plan.targetBasis='2× the risk';}
    if(plan.stop!=null&&plan.target!=null)plan.rr=(p-plan.target)/(plan.stop-p);
  }else{
    if(has('res')&&v.res>p)plan.trigUp=v.res;
    if(has('sup')&&v.sup<p)plan.trigDown=v.sup;
  }
  if(plan.stop!=null&&has('cap')&&v.cap>0){
    const rp=has('riskPct')&&v.riskPct>0?v.riskPct:1;
    plan.riskPct=rp;plan.riskAmt=v.cap*rp/100;
    const per=Math.abs(p-plan.stop);
    plan.qty=Math.max(0,Math.floor(Math.min(plan.riskAmt/per,v.cap/p)));
    plan.exposure=plan.qty*p;plan.riskAmt=plan.qty*per;
  }
  const poorEntry=choice==='BUY'&&plan.rr!=null&&plan.rr<1.5;

  // ---- input audit ----
  const checks=[];const ck=(lvl,t)=>checks.push({lvl,t});
  if(surv==='gsm')ck('crit','On the NSE GSM surveillance list. Trade-for-trade settlement and tight limits apply; most traders avoid these.');
  if(surv==='asm')ck('warn','On the ASM surveillance list. Expect higher margins and wider spreads.');
  if(has('adv')&&v.adv<1)ck('crit',`Average daily value is only ${inr0(v.adv*1e7)}. Exits can be hard; size small or skip.`);
  else if(has('adv')&&v.adv<2)ck('warn','Average daily value is under ₹2 cr. Expect slippage on larger orders.');
  if(v.dataDays!=null){
    if(v.dataDays<0)ck('warn','The data date is in the future. Check it.');
    else if(v.dataDays>tf.tol)ck('warn',`Your data is ${v.dataDays} day${v.dataDays===1?'':'s'} old, which is stale for a ${tfk} view. Refresh prices before acting.`);
  }
  if(has('e20')&&Math.abs(p/v.e20-1)>0.25)ck('warn',`Price is ${f1(Math.abs(p/v.e20-1)*100)}% away from the 20 EMA. Check for a typo or a recent split or bonus.`);
  if(has('sup')&&v.sup>=p)ck('warn','Support is at or above price. Update the level if the stock has broken down.');
  if(has('res')&&v.res<=p)ck('info','Price is at or above resistance: a breakout, or an outdated level.');
  if(atrPct!=null&&atrPct>8)ck('warn',`ATR is ${f1(atrPct)}% of price, unusually high. Check the value and period.`);
  if(has('rsi')&&((r>=60&&mom<0)||(r<=40&&mom>0)))ck('warn','RSI and momentum disagree. Recheck both on the same chart and timeframe.');
  if(macd>0&&trend!=null&&trend<=-0.6)ck('info','MACD is bullish while price sits below its EMAs. That can be an early turn or a stale reading.');
  if(choice!=='HOLD'&&atr==null)ck('warn','ATR is missing, so the stop uses price levels only. Add ATR for volatility-based stops.');
  if(poorEntry)ck('warn',`Reward to risk is only ${f1(plan.rr)}:1 at this price. A better entry is closer to support.`);
  if(choice==='SELL'&&plan.rr!=null&&plan.rr<1)ck('info',`As a short, reward to risk is only ${f1(plan.rr)}:1. The exit signal still stands for holders.`);
  if(v.edays!=null&&v.edays>=0&&v.edays<=tf.win&&!EV.byDate)ck('info',`Results fall inside your ${tfk} window (in ${v.edays} days).`);
  if(rsDiff==null&&(has('sret')||has('nret')))ck('info','Add both the stock and Nifty 3-month returns to measure relative strength.');
  if(!has('adv')&&surv==='none')ck('info','Add average daily traded value so Jev can check liquidity.');
  const nCrit=checks.filter(c=>c.lvl==='crit').length,nWarn=checks.filter(c=>c.lvl==='warn').length;
  const quality=Math.max(0,Math.min(100,Math.round(coverage*100)-20*nCrit-8*nWarn));
  const qLabel=quality>=80?'Good':quality>=55?'Fair':'Poor';

  const riskPts=(atrPct==null?0:atrPct>4?2:atrPct>2.5?1:0)+(has('vix')?(v.vix>22?2:v.vix>16?1:0):0)+({none:0,low:0,medium:1,high:2}[EV.e])+(sr!=null&&sr<0&&sign>0?1:0)+(!fin&&q7!=null&&q7<=2?1:0)+({none:0,asm:1,gsm:3}[surv])+(has('adv')?(v.adv<0.5?2:v.adv<2?1:0):0);
  const risk=riskPts<=1?'Low':riskPts<=2?'Moderate':riskPts<=4?'Elevated':'High';
  const confPts=(agree>=.8?2:agree>=.6?1:0)+(Math.abs(s)>=.5?2:Math.abs(s)>=.3?1:0)-(riskPts>=4?1:0)-(coverage<0.6?2:coverage<0.85?1:0)-(poorEntry?1:0)-(nCrit?2:0)-(qLabel==='Poor'?1:0);
  const conf=confPts>=4?'High':confPts>=2?'Medium':'Low';
  const tS=avg([trend??0,mkt]),mS=avg([mom,macd,rsi??0]);
  const upProb=sign>0?prob:sign<0?100-prob:Math.round(50+s*60);

  const list=a=>a.filter(Boolean).join(', ')+'.';
  const dims=[
    {id:'valuation',name:'Valuation attractiveness',score:valS,label:valC||'No data',tone:valC==='Cheap'?'pos':valC==='Expensive'?'neg':valC?'mid':'na',noul:valS==null?(fin?'Add P/B, P/E or PEG to score valuation.':'Add P/E, PEG or FCF yield to score valuation.'):list([pbR!=null&&`P/B ${f2(pbR)}× sector`,peR!=null&&`P/E ${f2(peR)}× sector`,has('peg')&&`PEG ${f2(v.peg)}`,!fin&&has('fcf')&&`FCF yield ${f1(v.fcf)}%`])},
    {id:'balance',name:fin?'Balance-sheet strength (lender)':'Balance-sheet strength',score:bsS,label:bsC||'No data',tone:bsC==='Strong'?'pos':bsC==='Weak'?'neg':bsC?'mid':'na',noul:bsS==null?(fin?'Add gross NPA, CAR or ROA to score this.':'Add debt/equity, interest cover or pledge to score this.'):fin?list([has('gnpa')&&`GNPA ${f2(v.gnpa)}%`,has('car')&&`CAR ${f1(v.car)}%`,has('roa')&&`ROA ${f2(v.roa)}%`]):list([has('de')&&`Debt/equity ${f2(v.de)}`,has('ic')&&`interest cover ${f1(v.ic)}×`,has('pledge')&&`pledge ${f1(v.pledge)}%`])},
    {id:'momentum',name:'Momentum and relative strength',score:momS,label:momS==null?'No data':momS>=4?'Strong':momS===3?'Moderate':'Weak',tone:momS==null?'na':momS>=4?'pos':momS===3?'mid':'neg',noul:list([emaKeys.length&&`Above ${above}/${emaKeys.length} EMAs`,has('rsi')&&`RSI ${f1(r)}`,rsDiff!=null&&`${rsDiff>=0?'+':''}${f1(rsDiff)} pts vs Nifty`,volC&&`volume ${volC.toLowerCase()}`])},
    {id:'macro',name:'Macro sensitivity and risk',score:macS,label:macS>=4?'Low risk':macS===3?'Moderate risk':'High risk',tone:macS>=4?'pos':macS===3?'mid':'neg',noul:list([has('vix')&&`India VIX ${f1(v.vix)}`,`FIIs ${LBL.fii[v.fii].toLowerCase()}`,has('adv')&&`${inr0(v.adv)} cr daily value`,surv!=='none'&&`${surv.toUpperCase()} list`,`event risk ${evtL.toLowerCase()}`])},
    {id:'upside',name:'Upside probability and catalysts',score:upS,label:`${upProb}% upside`,tone:upProb>=60?'pos':upProb<=40?'neg':'mid',noul:list([room!=null&&`${f1(room)}× reward to risk`,`sentiment ${LBL.news[v.news].toLowerCase()}`,`catalyst ${catC.toLowerCase()}`])},
  ];

  const drivers=F.filter(f=>f.s!=null).map(f=>({k:f.k,n:f.n,c:f.s*f.w*(1-fw)}));
  if(valS!=null)drivers.push({k:'val',n:'Valuation',c:fw*.5*(valS-3)/2});
  if(bsS!=null)drivers.push({k:'bs',n:'Balance sheet',c:fw*.3*(bsS-3)/2});
  if(cat)drivers.push({k:'cat',n:'Catalyst',c:fw*.2*cat});
  drivers.sort((a,b)=>Math.abs(b.c)-Math.abs(a.c));

  const lc=t=>/^([A-Z]{2}|Nifty)/.test(t)?t:t.charAt(0).toLowerCase()+t.slice(1);
  const scored=dims.filter(d=>d.score!=null);
  const weakest=scored.slice().sort((a,b)=>a.score-b.score)[0],strongest=scored.slice().sort((a,b)=>b.score-a.score)[0];
  const d0=drivers[0]?lc(drivers[0].n):'the inputs',d1=drivers[1]?lc(drivers[1].n):'';
  const led=d1?`${d0} and ${d1}`:d0;
  const q20=choice==='HOLD'?`No clear edge at ${prob}% probability; ${lc(weakest.name)} (${weakest.score}/5) holds it back.`
    :choice==='BUY'?`${prob}% probability with ${conf.toLowerCase()} confidence, led by ${led}${poorEntry?`; entry is poor at ${f1(plan.rr)}:1 reward to risk`:weakest.score<=2?`; ${lc(weakest.name)} (${weakest.score}/5) is the main drag`:''}.`
    :`${prob}% probability with ${conf.toLowerCase()} confidence, led by ${led}${strongest.score>=4?`; ${lc(strongest.name)} (${strongest.score}/5) is the main offset`:''}.`;
  choiceQ('action','Overall action?',choice,['BUY','HOLD','SELL'],q20);
  // Noul = yes/no question answered with a probability (0–1)
  const PMAP=[0.05,0.25,0.5,0.75,0.95];
  ['Q9','Q16','Q18'].forEach(id=>{const q=Q.find(x=>x.id===id);q.type='Noul';q.p=q.score==null?null:PMAP[q.score-1];});

  return {choice,prob,conf,confBars:Math.max(1,Math.min(5,confPts+1)),agree,atrPct,risk,upProb,coverage,
    composite:+s.toFixed(3),technical:+tech.toFixed(3),fundamental:+fund.toFixed(3),fundWeight:fw,eventMultiplier:evtMult,surveillanceMultiplier:survMult,liquidityMultiplier:liqMult,event:EV,
    marketTrend:tS>=.4?'Bullish':tS<=-.4?'Bearish':'Neutral',
    momentum:mS>=.6?'Strong':mS>=.2?'Moderate':mS>-.2?'Weak':'Negative',
    strength:Math.round(Math.min(Math.abs(s),1)*100),
    rsDiff,plan,poorEntry,checks,quality,qLabel,
    ctx:{above,emaN:emaKeys.length,room,dir,peR,pbR,rsDiff,brokeSupport:hasSR&&down<=0},
    drivers,dims,questions:Q};
}

function factorPhrase(d,v,x){
  const up=d.c>0;
  switch(d.k){
    case 'ema':return up?(x.above===x.emaN?`Price above all ${x.emaN===3?'key ':''}EMAs`:`Price above ${x.above} of ${x.emaN} EMAs`):(x.above===0?`Price below all ${x.emaN===3?'key ':''}EMAs`:`Price below ${x.emaN-x.above} of ${x.emaN} EMAs`);
    case 'rsi':return up?(v.rsi<30?`RSI ${f1(v.rsi)} is oversold, rebound possible`:`RSI ${f1(v.rsi)} in a constructive zone`):(v.rsi>=70?`RSI ${f1(v.rsi)} is overbought`:`RSI ${f1(v.rsi)} shows weak momentum`);
    case 'macd':return `MACD ${LBL.macd[v.macd].toLowerCase()}`;
    case 'mom':return up?(v.mom==='1'?'Strong upward momentum':'Upward momentum'):(v.mom==='-1'?'Strong downward momentum':'Downward momentum');
    case 'sr':return up?(x.room>=9?'Price has cleared resistance':`${f1(x.room)}× reward to risk before resistance`):(x.brokeSupport?'Price has broken support':`Only ${f1(x.room)}× reward to risk before resistance`);
    case 'vol':{const t=`${v.vol>0?'+':''}${Math.round(v.vol)}%`;return x.dir>=0?(up?`Volume ${t} vs average backs the move`:`Thin volume (${t}) behind the rally`):(up?`Selling on light volume (${t})`:`Heavy volume (${t}) on the decline`);}
    case 'mkt':return `Nifty 50 trend is ${up?'bullish':'bearish'}`;
    case 'sec':return `Sector trend is ${up?'bullish':'bearish'}`;
    case 'rs':return up?`Outperforming the Nifty by ${f1(x.rsDiff)} pts (3M)`:`Lagging the Nifty by ${f1(-x.rsDiff)} pts (3M)`;
    case 'vix':return up?`Calm India VIX at ${f1(v.vix)}`:`Elevated India VIX at ${f1(v.vix)}`;
    case 'fii':return up?'FIIs are net buyers in cash':'FIIs are net sellers in cash';
    case 'news':return up?'Positive market sentiment':'Negative market sentiment';
    case 'val':return up?'Attractive valuation':`Rich valuation${x.pbR?` (${f2(x.pbR)}× sector P/B)`:x.peR?` (${f2(x.peR)}× sector P/E)`:''}`;
    case 'bs':return up?'Strong balance sheet':'Weak balance sheet';
    case 'cat':return up?'Positive catalyst ahead':'Negative catalyst ahead';
  }
  return d.n;
}
