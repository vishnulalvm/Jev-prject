// JevTrade UI: DOM wiring, rendering, TypeSafe Jev API calls and Ask Jev.
// Depends on the globals defined in js/model.js, loaded first.
(function(){
  const $=id=>document.getElementById(id);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const C=2*Math.PI*86;
  const isMac=/Mac|iPhone|iPad/.test(navigator.platform);
  if(isMac)$('msg').innerHTML='Press <b>⌘</b> + <b>Enter</b> from any field. Not SEBI-registered investment advice.';
  const DEFAULT_MSG=$('msg').innerHTML;

  // ---------- theme ----------
  const root=document.documentElement;
  const sysDark=()=>matchMedia('(prefers-color-scheme: dark)').matches;
  const curTheme=()=>root.dataset.theme||(sysDark()?'dark':'light');
  function paintTheme(){const d=curTheme()==='dark';$('theme').innerHTML=`<svg class="i"><use href="#i-${d?'moon':'sun'}"/></svg>`;$('theme').setAttribute('aria-label',`Switch to ${d?'light':'dark'} theme`);}
  try{const t=localStorage.getItem('jev-theme');if(t)root.dataset.theme=t;}catch(e){}
  paintTheme();
  $('theme').onclick=()=>{root.dataset.theme=curTheme()==='dark'?'light':'dark';try{localStorage.setItem('jev-theme',root.dataset.theme);}catch(e){}paintTheme();};

  // ---------- market status ----------
  function marketStatus(){
    const now=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    const d=now.getDay(),m=now.getHours()*60+now.getMinutes(),open=d>=1&&d<=5&&m>=555&&m<930;
    $('mkt-status').textContent=open?'NSE open':'NSE closed';$('mkt-dot').classList.toggle('closed',!open);
  }
  marketStatus();setInterval(marketStatus,60000);

  // ---------- pages ----------
  function showPage(name){
    document.querySelectorAll('[data-page]').forEach(b=>b.toggleAttribute('aria-current',b.dataset.page===name)||b.dataset.page===name&&b.setAttribute('aria-current','page'));
    document.querySelectorAll('[data-page]').forEach(b=>{if(b.dataset.page===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    ['analyze','history','how','why'].forEach(p=>$('page-'+p).hidden=p!==name);
    if(name==='history')renderHistory();
    window.scrollTo(0,0);
  }
  document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));

  // ---------- inputs ----------
  $('tickers').innerHTML="RELIANCE TCS HDFCBANK INFY ICICIBANK SBIN BHARTIARTL ITC LT HINDUNILVR KOTAKBANK AXISBANK MARUTI SUNPHARMA TITAN BAJFINANCE M&M ASIANPAINT NTPC POWERGRID ULTRACEMCO WIPRO HCLTECH ONGC TATASTEEL".split(' ').map(t=>`<option value="${t}">`).join('');
  const SELS=Object.keys(OPTS);
  const DEFAULT_SEL={macd:'0',mom:'0',mkt:'0',sec:'0',news:'0',fii:'0',evt:'none',cat:'0',surv:'none'};
  SELS.forEach(k=>{$(k).innerHTML=OPTS[k].map(([v,t])=>`<option value="${v}">${t}</option>`).join('');});
  const toneSel=k=>{const o=OPTS[k].find(x=>x[0]===$(k).value);$(k).dataset.tone=o?o[2]:'';};
  const NUMS=['price','rsi','e20','e50','e200','vol','atr','sup','res','adv','sret','nret','vix','pe','spe','peg','fcf','de','ic','pledge','pb','spb','gnpa','car','roa','cap','riskPct'];
  let exchange='NSE',tf='1W',kind='nonfin';

  $('exch').onclick=e=>{e.preventDefault();exchange=exchange==='NSE'?'BSE':'NSE';$('exch').textContent=exchange;$('exch').setAttribute('aria-label',`Exchange ${exchange}, click to switch`);markStale();};
  document.querySelectorAll('[data-tf]').forEach(b=>b.onclick=()=>{tf=b.dataset.tf;document.querySelectorAll('[data-tf]').forEach(x=>x.setAttribute('aria-pressed',x===b));markStale();});
  const TF_HINT={'1D':'Daily candles for levels; 15-min chart to time the entry','1W':'Daily candles, 14-period RSI and ATR','1M':'Daily candles, 14-period RSI and ATR','3M':'Weekly candles for trend, daily for levels'};
  // Fundamentals are weighted by timeframe (fw): 5% on 1D, 15% on 1W, 20% on 1M, 35% on 3M.
  // Below ~20% they barely move the call, so collapse the step by default on 1D/1W.
  let fundOpen=false;
  function paintFundStep(){
    const low=TF[tf].w<0.2;
    $('fund-toggle').hidden=!low||fundOpen;
    $('fund-fields').hidden=low&&!fundOpen;
    $('fund-hint').textContent=low?'Optional — carries little weight on this timeframe':'From Screener.in or the latest quarterly results (optional)';
  }
  $('fund-toggle').onclick=()=>{fundOpen=true;paintFundStep();};
  const setTF=t=>{tf=t;document.querySelectorAll('[data-tf]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.tf===t));$('tf-hint').textContent=TF_HINT[t];paintFundStep();};
  document.querySelectorAll('[data-tf]').forEach(b=>b.addEventListener('click',()=>{$('tf-hint').textContent=TF_HINT[tf];paintFundStep();}));
  $('size-toggle').onclick=()=>{const open=$('size-fields').hidden;$('size-fields').hidden=!open;$('size-toggle').setAttribute('aria-expanded',open);$('size-toggle').textContent=open?'Hide position sizing':'Size my position';};
  const setKind=k=>{kind=k;document.querySelectorAll('[data-kind]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.kind===k));document.querySelectorAll('[data-only]').forEach(el=>el.hidden=el.dataset.only!==k);};
  document.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>{setKind(b.dataset.kind);derived();markStale();});

  const todayIST=()=>{const n=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));n.setHours(0,0,0,0);return n;};
  const isoIn=days=>{const d=todayIST();d.setDate(d.getDate()+days);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  $('edate').min=isoIn(0);$('ddate').max=isoIn(0);
  const daysFrom=val=>{if(!val)return null;const [y,m,d]=val.split('-').map(Number);return Math.round((new Date(y,m-1,d)-todayIST())/864e5);};
  const edays=()=>daysFrom($('edate').value);
  const ddays=()=>{const d=daysFrom($('ddate').value);return d==null?null:-d;};

  const PRESETS={
    RELIANCE:{name:'Reliance Industries',kind:'nonfin',tf:'1W',price:1420.50,rsi:60,macd:'1',e20:1398.20,e50:1372.40,e200:1318.60,mom:'1',sup:1380,res:1510,atr:22.40,vol:'+42',adv:1450,sret:'+9.5',nret:'+3.1',mkt:'1',sec:'1',vix:12.6,evt:'low',news:'0.5',fii:'1',pe:26,spe:20,peg:1.3,fcf:2.4,de:0.42,ic:7.5,pledge:0,cat:'1',surv:'none',cap:500000,riskPct:1,edate:null,notes:''},
    HDFCBANK:{name:'HDFC Bank',kind:'fin',tf:'1W',price:995,rsi:56,macd:'0.6',e20:984,e50:972,e200:945,mom:'0.5',sup:970,res:1035,atr:14,vol:'+12',adv:2100,sret:'+5.2',nret:'+3.1',mkt:'1',sec:'1',vix:12.6,evt:'none',news:'0.5',fii:'1',pb:2.6,spb:2.2,pe:20,spe:17,peg:1.4,gnpa:1.3,car:19.2,roa:1.9,cat:'0',surv:'none',cap:500000,riskPct:1,edate:null,notes:''},
    TCS:{name:'Tata Consultancy Services',kind:'nonfin',tf:'1M',price:3452,rsi:47,macd:'0.6',e20:3440,e50:3478,e200:3612,mom:'0',sup:3380,res:3560,atr:48,vol:'-8',adv:900,sret:'-6.0',nret:'+3.0',mkt:'1',sec:'0',vix:14.4,evt:'none',news:'0',fii:'0',pe:26,spe:28,peg:2.4,fcf:4.2,de:0.08,ic:60,pledge:0,cat:'0',surv:'none',cap:500000,riskPct:1,edate:9,notes:'Deal wins steady, margins flat'},
    INFY:{name:'Infosys',kind:'nonfin',tf:'1W',price:1478,rsi:34,macd:'-1',e20:1532,e50:1566,e200:1621,mom:'-1',sup:1440,res:1600,atr:34,vol:'+55',adv:1100,sret:'-12.0',nret:'+1.0',mkt:'0',sec:'-1',vix:16.8,evt:'low',news:'-0.5',fii:'-1',pe:22,spe:26,peg:2.1,fcf:4.8,de:0.1,ic:80,pledge:0,cat:'-1',surv:'none',cap:500000,riskPct:1,edate:null,notes:''}
  };

  function load(sym){
    const p=PRESETS[sym];if(!p)return;
    $('ticker').value=sym;setTF(p.tf);setKind(p.kind);$('ddate').value=isoIn(0);
    NUMS.forEach(k=>{$(k).value=p[k]??'';$(k).classList.remove('invalid');});
    SELS.forEach(k=>{$(k).value=p[k];toneSel(k);});
    $('edate').value=p.edate!=null?isoIn(p.edate):'';$('edate').classList.toggle('empty',!$('edate').value);
    $('notes').value=p.notes||'';
    if(p.cap!=null||p.riskPct!=null){$('size-fields').hidden=false;$('size-toggle').setAttribute('aria-expanded','true');$('size-toggle').textContent='Hide position sizing';}
    derived();
  }

  function num(k){const raw=String($(k).value).replace(/[%,₹\s]/g,'');if(raw==='')return NaN;return parseFloat(raw);}
  function read(){
    const v={};NUMS.forEach(k=>v[k]=num(k));SELS.forEach(k=>v[k]=$(k).value);
    v.ticker=($('ticker').value||'').trim().toUpperCase();v.tf=tf;v.edays=edays();v.dataDays=ddays();v.notes=$('notes').value.trim();v.exchange=exchange;v.fin=kind==='fin';
    return v;
  }

  function derived(){
    const v=read(),p=v.price,t=[],f=[],e=[];
    const emas=[v.e20,v.e50,v.e200].filter(Number.isFinite);
    if(Number.isFinite(p)&&emas.length)t.push(`Price above ${emas.filter(x=>p>x).length} of ${emas.length} EMA${emas.length>1?'s':''}`);
    if([p,v.sup,v.res].every(Number.isFinite)&&v.res>v.sup&&p>v.sup&&p<v.res)t.push(`${((v.res-p)/(p-v.sup)).toFixed(1)}× reward to risk`);
    if(Number.isFinite(p)&&Number.isFinite(v.atr)&&p>0)t.push(`ATR ${(v.atr/p*100).toFixed(1)}% of price`);
    if(Number.isFinite(v.sret)&&Number.isFinite(v.nret)){const d=v.sret-v.nret;t.push(`${d>=0?'+':''}${d.toFixed(1)} pts vs Nifty`);}
    if(v.fin&&Number.isFinite(v.pb)&&Number.isFinite(v.spb)&&v.spb>0)f.push(`${(v.pb/v.spb).toFixed(2)}× sector P/B`);
    if(Number.isFinite(v.pe)&&Number.isFinite(v.spe)&&v.spe>0)f.push(`${(v.pe/v.spe).toFixed(2)}× sector P/E`);
    const EV=effectiveEvent(v);
    if(v.edays!=null)e.push(v.edays<0?'Results date has passed':`Results in ${v.edays} day${v.edays===1?'':'s'}`);
    if(EV.byDate)e.push(`Event risk raised to ${EV.e==='high'?'High':'Medium'}`);
    $('d-tech').innerHTML=t.map(x=>`<span>${esc(x)}</span>`).join('');
    $('d-fund').innerHTML=f.map(x=>`<span>${esc(x)}</span>`).join('');
    $('d-evt').innerHTML=e.map(x=>`<span>${esc(x)}</span>`).join('');
  }

  function msg(t,err){const m=$('msg');if(err){m.textContent=t;}else m.innerHTML=t;m.classList.toggle('err',!!err);}
  const markStale=()=>$('out').classList.add('is-stale');
  const bad=(k,t)=>{msg(t,true);$(k).classList.add('invalid');$(k).focus();$(k).scrollIntoView({block:'center',behavior:reduce?'auto':'smooth'});return false;};

  function validate(v){
    NUMS.concat(['ticker']).forEach(k=>$(k).classList.remove('invalid'));
    if(!v.ticker)return bad('ticker','Enter an NSE symbol or BSE code to analyze.');
    if(!/^[A-Z0-9&\-]{1,20}$/.test(v.ticker))return bad('ticker','Use an NSE symbol like RELIANCE or M&M, or a BSE scrip code like 500325.');
    if(!Number.isFinite(v.price)||v.price<=0)return bad('price','Enter the current price in rupees.');
    const badNum=NUMS.find(k=>!$(k).closest('[data-only]')?.hidden&&$(k).value.trim()!==''&&!Number.isFinite(v[k]));
    if(badNum)return bad(badNum,'Use numbers only in the highlighted field.');
    if(Number.isFinite(v.rsi)&&(v.rsi<0||v.rsi>100))return bad('rsi','RSI must be between 0 and 100.');
    if(Number.isFinite(v.sup)&&Number.isFinite(v.res)&&v.sup>=v.res)return bad('sup','Support must be below resistance.');
    if(Number.isFinite(v.pledge)&&(v.pledge<0||v.pledge>100))return bad('pledge','Promoter pledge must be between 0 and 100%.');
    if(Number.isFinite(v.riskPct)&&(v.riskPct<=0||v.riskPct>5))return bad('riskPct','Risk per trade should be between 0.1% and 5%.');
    if(Number.isFinite(v.cap)&&v.cap<=0)return bad('cap','Trading capital must be above zero.');
    if(Number.isFinite(v.adv)&&v.adv<0)return bad('adv','Average daily value can’t be negative.');
    msg(DEFAULT_MSG);return true;
  }

  // ---------- render ----------
  const dotsHTML=s=>s==null?`<span class="lab na">No data</span>`:`<span class="dots ${s>=4?'s-pos':s===3?'s-mid':'s-neg'}" aria-label="Score ${s} of 5">${[1,2,3,4,5].map(i=>`<i class="${i<=s?'on':''}"></i>`).join('')}<b>${s}</b></span>`;
  const segbar=pct=>`<b style="width:${Math.max(4,Math.min(100,pct))}%"></b>`;
  const toneOf=c=>({BUY:'pos',SELL:'neg',HOLD:'mid',Cheap:'pos',Fair:'mid',Expensive:'neg',Strong:'pos',Adequate:'mid',Weak:'neg',Confirms:'pos',Diverges:'neg',Elevated:'neg',High:'neg',Positive:'pos',Negative:'neg'}[c]||'');
  const DIM_NAMES={valuation:'Valuation attractiveness',balance:'Balance-sheet strength',momentum:'Momentum and relative strength',macro:'Macro sensitivity and risk',upside:'Upside probability and catalysts'};
  const PRIMS=`<div class="prim"><div class="t"><span class="tb">Choice</span>Pick one option</div><div class="d">Returns the option, a probability for each option, and confidence.</div></div><div class="prim"><div class="t"><span class="tb">Score</span>Rate on ordered levels</div><div class="d">Five levels, 5 most favorable. Returns a weighted score and confidence.</div></div><div class="prim"><div class="t"><span class="tb">Noul</span>Yes or no</div><div class="d">Returns the probability that the answer is yes, from 0 to 1.</div></div>`;
  $('prims-a').innerHTML=PRIMS;$('prims-b').innerHTML=PRIMS;
  const ICON=(id,name)=>{$(id).innerHTML=`<svg class="i"><use href="#i-${name}"/></svg>`;};
  const setTone=(el,t)=>{el.classList.remove('pos','neg','mid');if(t)el.classList.add(t);};

  let lastState=null;

  // ---------- history (local, temporary — this browser only) ----------
  const HIST_KEY='jev-history',HIST_MAX=20;
  function loadHistory(){try{const a=JSON.parse(localStorage.getItem(HIST_KEY));return Array.isArray(a)?a:[];}catch(e){return [];}}
  function saveHistoryEntry(v,R){
    try{
      const list=loadHistory();
      list.unshift({ticker:v.ticker,exchange:v.exchange,tf:v.tf,choice:R.choice,prob:R.prob,conf:R.conf,at:new Date().toISOString()});
      localStorage.setItem(HIST_KEY,JSON.stringify(list.slice(0,HIST_MAX)));
    }catch(e){/* localStorage unavailable or full — skip silently */}
  }
  function clearHistory(){try{localStorage.removeItem(HIST_KEY);}catch(e){}renderHistory();}
  function fmtWhen(iso){
    const d=new Date(iso);if(isNaN(d))return '';
    return d.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  }
  function renderHistory(){
    const list=loadHistory();
    $('hist-empty').hidden=list.length>0;
    $('hist-clear').hidden=!list.length;
    $('hist-list').innerHTML=list.map((h,i)=>`<button type="button" class="hist-row" data-hi="${i}">
      <span class="hr-tk">${esc(h.ticker)}${h.exchange==='BSE'?' <small>(BSE)</small>':''}</span>
      <span class="lab ${toneOf(h.choice)}">${esc(h.choice)}</span>
      <span class="hr-prob">${h.prob}%</span>
      <span class="hr-tf">${esc(h.tf)}</span>
      <span class="hr-conf">${esc(h.conf)} confidence</span>
      <span class="hr-when">${fmtWhen(h.at)}</span>
    </button>`).join('');
    $('hist-list').querySelectorAll('[data-hi]').forEach(b=>b.onclick=()=>{
      const h=list[+b.dataset.hi];if(!h)return;
      showPage('analyze');
      $('ticker').value=h.ticker;
      if(PRESETS[h.ticker])load(h.ticker);
      msg(`Loaded ${h.ticker} from history — re-enter or confirm inputs, then Analyze again.`);
    });
  }
  $('hist-clear').onclick=clearHistory;

  function render(v,R,ms){
    const out=$('out'),tone=R.choice==='BUY'?'buy':R.choice==='SELL'?'sell':'hold';
    ['accent','accent-soft','accent-tint'].forEach((k,i)=>out.style.setProperty('--'+k,`var(--${tone}${['','-soft','-tint'][i]})`));
    $('r-sub').textContent=`${v.ticker}${v.exchange==='BSE'?' (BSE)':''} at ${inr(v.price)}, ${v.tf} view, based on your input data`;
    $('r-time').textContent=`Jev API: ${ms<1?'<1':Math.round(ms)} ms`;
    lastV=v;
    $('o-verdict').textContent=R.choice;
    const t0=performance.now();
    (function tick(t){const k=reduce?1:Math.min(1,(t-t0)/900),e=1-Math.pow(1-k,3);$('o-prob').textContent=Math.round(R.prob*e);if(k<1)requestAnimationFrame(tick);})(t0);
    $('bar').style.strokeDashoffset=C*(1-R.prob/100);

    const tfl=TF[v.tf].label;
    let head,desc;
    if(R.choice==='HOLD'){head='No clear signal';desc=`Inputs are mixed, so Jev sees no strong edge over ${tfl}.`;}
    else{const w=R.choice==='BUY'?'buy':'sell';head=(R.prob>=78&&R.conf==='High'?'Strong ':R.prob>=65?'':'Weak ')+w+' signal';head=head.charAt(0).toUpperCase()+head.slice(1);
      desc=`${R.prob>=75?'High':R.prob>=65?'Moderate':'Modest'} probability of ${R.choice==='BUY'?'positive':'negative'} movement over ${tfl}, based on current market conditions and indicators.`;}
    if(R.poorEntry){head='Buy bias, poor entry';desc=`The setup leans positive over ${tfl}, but reward to risk is only ${f1(R.plan.rr)}:1 at this price.`;}
    if(R.coverage<0.6)desc+=' Many inputs are blank, so confidence is limited.';
    $('o-head').textContent=head;$('o-desc').textContent=desc;
    $('o-conf').textContent=R.conf;$('o-confbar').innerHTML=segbar(R.confBars/5*100);
    $('o-sigword').textContent=R.strength>=70?'Strong':R.strength>=40?'Moderate':'Weak';
    $('o-sigbar').innerHTML=segbar(R.strength);

    const tT=R.marketTrend==='Bullish'?'pos':R.marketTrend==='Bearish'?'neg':'';
    $('o-trend').textContent=R.marketTrend;setTone($('o-trend'),tT);setTone($('ic-trend'),tT);ICON('ic-trend',R.marketTrend==='Bearish'?'trend-down':'trend');
    const mT=R.momentum==='Strong'?'pos':R.momentum==='Negative'?'neg':R.momentum==='Weak'?'mid':'';
    $('o-mom').textContent=R.momentum;setTone($('o-mom'),mT);setTone($('ic-mom'),mT);
    const rd=R.rsDiff,rsT=rd==null?'':rd>=3?'pos':rd<=-3?'neg':'mid';
    $('o-rs').textContent=rd==null?'Not provided':`${rd>=0?'+':''}${rd.toFixed(1)} pts`;setTone($('o-rs'),rsT);setTone($('ic-rs'),rsT);
    const rkT=R.risk==='Low'?'pos':R.risk==='Moderate'?'mid':'neg';
    $('o-risk').textContent=R.risk;setTone($('o-risk'),rkT);setTone($('ic-risk'),rkT);

    // key factors
    const items=R.drivers.filter(d=>Math.abs(d.c)>=0.004).slice(0,4).map(d=>({t:factorPhrase(d,v,R.ctx),k:d.c>0?'up':'down'}));
    const E=R.event;
    if(E.e==='medium'||E.e==='high')items.push({t:`Monitor event risk (${E.byDate||(E.days!=null&&E.days>=0)?`results in ${E.days} day${E.days===1?'':'s'}`:E.e==='high'?'major event this week':E.e==='medium'?'results within 2 weeks':'minor events'})`,k:'warn'});
    if(!items.length)items.push({t:'No strong factor either way',k:'warn'});
    $('o-factors').innerHTML=items.slice(0,5).map(i=>`<li><span class="fi ${i.k}"><svg class="i"><use href="#i-${i.k==='up'?'up':i.k==='down'?'down':'minus'}"/></svg></span>${esc(i.t)}</li>`).join('');

    // trade plan
    const P=R.plan,pct=x=>`${x>=0?'+':''}${(x*100).toFixed(1)}%`,rows=[];
    let lead='';
    if(R.choice==='BUY'){
      lead=R.poorEntry?'Setup is positive but the entry is stretched. Wait for a pullback toward support, or take a smaller position.':R.conf==='High'?'Consider a buy with the stop below. Trend, momentum and market agree.':'Consider a small buy with the stop below. Not every input agrees.';
      rows.push(['Entry',inr(P.entry)]);
      rows.push(['Stop-loss',P.stop!=null?`${inr(P.stop)}<small>${pct(P.stop/P.entry-1)}, ${P.stopBasis}</small>`:'<small>Add support or ATR</small>']);
      rows.push(['Target',P.target!=null?`${inr(P.target)}<small>${pct(P.target/P.entry-1)}, ${P.targetBasis}</small>`:'—']);
    }else if(R.choice==='SELL'){
      lead='Exit or avoid. In the Indian cash market a Sell means reduce exposure; shorting needs F&O or intraday.';
      rows.push(['Price now',inr(P.entry)]);
      rows.push(['Invalidation',P.stop!=null?`${inr(P.stop)}<small>${pct(P.stop/P.entry-1)}, ${P.stopBasis}</small>`:'<small>Add resistance or ATR</small>']);
      rows.push(['Downside target',P.target!=null?`${inr(P.target)}<small>${pct(P.target/P.entry-1)}, ${P.targetBasis}</small>`:'—']);
    }else{
      lead='No clear edge. Hold existing positions and wait for price to confirm a direction.';
      rows.push(['Buy trigger',P.trigUp!=null?`Close above ${inr(P.trigUp)}`:'<small>Add resistance</small>']);
      rows.push(['Sell trigger',P.trigDown!=null?`Close below ${inr(P.trigDown)}`:'<small>Add support</small>']);
    }
    if(P.rr!=null)rows.push(['Reward to risk',`<span class="${P.rr>=2?'pos':P.rr>=1.5?'':'neg'}">${f1(P.rr)} : 1</span>`]);
    if(R.choice!=='HOLD'){
      if(P.qty!=null)rows.push(['Position size',`${P.qty.toLocaleString('en-IN')} shares<small>${inr0(P.exposure)}, risking ${inr0(P.riskAmt)} (${P.riskPct}%)</small>`]);
      else if(P.stop!=null)rows.push(['Position size','<small>Add capital in step 6</small>']);
    }
    $('o-plan').innerHTML=`<p class="rec" style="margin-bottom:12px">${esc(lead)}</p><dl class="plan">${rows.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl><p class="rec small">Jev's view over ${tfl}. Not SEBI-registered investment advice.</p>`;

    // input audit
    const qT=R.qLabel==='Good'?'pos':R.qLabel==='Fair'?'mid':'neg';
    $('o-qlab').className='lab '+qT;$('o-qlab').textContent=`${R.qLabel} data, ${R.quality}/100`;
    $('o-qbar').style.width=R.quality+'%';$('o-qbar').style.background=`var(--${qT==='pos'?'buy':qT==='mid'?'hold':'sell'})`;
    $('o-qsub').textContent=`${Math.round(R.coverage*100)}% of weighted inputs provided${v.dataDays!=null?`, data from ${v.dataDays===0?'today':v.dataDays+' day'+(v.dataDays===1?'':'s')+' ago'}`:''}.`;
    const order={crit:0,warn:1,info:2};
    const cks=R.checks.slice().sort((a,b)=>order[a.lvl]-order[b.lvl]);
    $('o-checks').innerHTML=(cks.length?cks:[{lvl:'ok',t:'All inputs pass the sanity checks.'}]).map(c=>`<li><span class="ci ${c.lvl}">${c.lvl==='crit'?'!':c.lvl==='warn'?'!':c.lvl==='ok'?'✓':'i'}</span><span>${esc(c.t)}</span></li>`).join('');

    $('o-dims').innerHTML=R.dims.map(d=>`<div class="dim"><span class="dn">${d.name}</span>${dotsHTML(d.score)}<span class="lab ${d.tone}">${esc(d.label)}</span><span class="nl" title="${esc(d.noul)}">${esc(d.noul)}</span></div>`).join('');

    const ansHTML=q=>{
      if(q.na)return '<span class="lab na">Not provided</span>';
      if(q.type==='Score')return dotsHTML(q.score)+(q.apiScore!=null?`<span class="cf">${q.apiScore.toFixed(2)} of 5</span>`:'');
      if(q.type==='Noul'){const p=q.p;return `<span class="lab ${p>=.6?'pos':p<=.4?'neg':'mid'}">Yes ${Math.round(p*100)}%</span>`;}
      return `<span class="lab ${toneOf(q.choice)}">${esc(q.choice)}</span>`+(q.probs&&q.probs[q.choice]!=null?`<span class="cf">p ${Math.round(q.probs[q.choice]*100)}%</span>`:'');
    };
    const qRow=(q,final)=>`<div class="q${final?' final':''}"><span class="qid">${q.id}</span><div><div class="qt">${esc(q.q)}</div><div class="qn">${esc(q.noul)}</div></div><div class="qa">${ansHTML(q)}<span class="tbs"><span class="tb">${q.type}</span>${q.conf!=null?`<span class="tb" title="Confidence from Jev">conf ${q.conf.toFixed(2)}</span>`:''}${q.api?'<span class="tb api">API</span>':''}</span></div><button class="qask" type="button" data-ask="${q.id}" aria-label="Ask about ${q.id}">Ask</button></div>`;
    const dScore=Object.fromEntries(R.dims.map(d=>[d.id,d.score]));
    $('o-questions').innerHTML=Object.keys(DIM_NAMES).map(g=>`<div class="qg"><div class="qg-h"><h4>${DIM_NAMES[g]}</h4>${dotsHTML(dScore[g])}</div>${R.questions.filter(q=>q.dim===g).map(q=>qRow(q)).join('')}</div>`).join('')+qRow(R.questions[19],true);
    document.querySelectorAll('[data-ask]').forEach(b=>b.onclick=()=>{showView('ask');const id=b.dataset.ask;if(askMode==='explain')ask(`Explain ${id} in more detail. What would change its answer?`);else{$('q').value=R.questions.find(x=>x.id===id).q;autosize();$('q').focus();}});

    lastState=buildState(v,R);
    $('state-doc').textContent=JSON.stringify(lastState,null,2);
    resetThread(v.ticker);
    out.classList.remove('is-stale');
    saveHistoryEntry(v,R);
  }

  function buildState(v,R){
    const has=k=>Number.isFinite(v[k]),inp={};
    const put=(k,name)=>{if(has(k))inp[name]=v[k];};
    put('price','priceINR');put('rsi','rsi14');put('e20','ema20');put('e50','ema50');put('e200','ema200');put('vol','volumeVsAvgPct');put('atr','atrINR');put('sup','supportINR');put('res','resistanceINR');put('vix','indiaVix');
    put('adv','avgDailyValueCr');put('sret','stock3mReturnPct');put('nret','nifty3mReturnPct');
    put('pe','pe');put('spe','sectorPe');put('peg','peg');
    if(v.fin){put('pb','pb');put('spb','sectorPb');put('gnpa','grossNpaPct');put('car','capitalAdequacyPct');put('roa','roaPct');}else{put('fcf','fcfYieldPct');put('de','debtToEquity');put('ic','interestCover');put('pledge','promoterPledgePct');}
    put('cap','tradingCapitalINR');put('riskPct','riskPerTradePct');
    Object.assign(inp,{macd:LBL.macd[v.macd],momentum:LBL.mom[v.mom],nifty50Trend:LBL.mkt[v.mkt],sectorTrend:LBL.sec[v.sec],marketSentiment:LBL.news[v.news],fiiCashFlow5d:LBL.fii[v.fii],eventRiskSelected:LBL.evt[v.evt],nextCatalyst:LBL.cat[v.cat],surveillance:LBL.surv[v.surv],companyType:v.fin?'Bank/NBFC':'Non-financial'});
    if(v.dataDays!=null)inp.dataAgeDays=v.dataDays;
    if(v.edays!=null)inp.resultsInDays=v.edays;
    const notProvided=['rsi','e20','e50','e200','vol','atr','sup','res','adv','sret','nret','vix',...FUND_KEYS[v.fin?'fin':'nonfin']].filter(k=>!has(k));
    return {
      stock:v.ticker,exchange:v.exchange,market:'India (NSE/BSE)',currency:'INR',timeframe:v.tf,analyzedAt:new Date().toISOString(),
      userNotes:v.notes||null,
      decision:{choice:R.choice,probability:R.prob,confidence:R.conf,signalStrength:R.strength,marketTrend:R.marketTrend,momentum:R.momentum,risk:R.risk,upsideProbability:R.upProb,inputCoverage:Math.round(R.coverage*100)+'%',effectiveEventRisk:R.event.e},
      model:{composite:R.composite,technicalComposite:R.technical,fundamentalComposite:R.fundamental,fundamentalWeight:R.fundWeight,eventMultiplier:R.eventMultiplier,
        rules:'composite = ((1-fw)*technical + fw*fundamental) * eventMultiplier * surveillanceMultiplier (ASM .85, GSM .4) * liquidityMultiplier (daily value < ₹1 cr .6, < ₹2 cr .85), where fw is 0.05 (1D), 0.15 (1W), 0.20 (1M) or 0.35 (3M). BUY if composite >= 0.15, SELL if <= -0.15, else HOLD. BUY/SELL probability = 50 + |composite|*48. Relative strength = stock 3M return minus Nifty 3M return, scaled by 12 points. BUY/SELL probability is capped at 88. Technical weights: EMA structure .17, MACD .12, RSI .10, momentum .10, support/resistance .08, relative strength .08, volume .07, Nifty 50 trend .07, sector trend .07, FII flows .05, sentiment .05, India VIX .04. Blank inputs count as neutral (0) and lower confidence. India VIX bands: <13 calm, 13-16 normal, 16-20 elevated, 20-25 stressed. Fundamental = valuation .5, balance sheet .3, catalyst .2. Event multiplier: none 1, low .95, medium .85, high .7; a results date within 14 days forces at least medium, within 5 days high.',
        keyFactors:R.drivers.slice(0,6).map(d=>({factor:d.n,points:+(d.c*100).toFixed(1)}))},
      tradePlan:{type:R.plan.type,entry:R.plan.entry,stopOrInvalidation:R.plan.stop&&+R.plan.stop.toFixed(2),stopBasis:R.plan.stopBasis,target:R.plan.target&&+R.plan.target.toFixed(2),targetBasis:R.plan.targetBasis,rewardToRisk:R.plan.rr&&+R.plan.rr.toFixed(2),buyTrigger:R.plan.trigUp,sellTrigger:R.plan.trigDown,quantity:R.plan.qty,exposureINR:R.plan.exposure,riskINR:R.plan.riskAmt&&Math.round(R.plan.riskAmt),poorEntry:R.poorEntry},
      inputAudit:{quality:R.quality,label:R.qLabel,checks:R.checks.map(c=>`${c.lvl}: ${c.t}`)},
      dimensions:R.dims.map(d=>({dimension:d.name,score:d.score,label:d.label,noul:d.noul})),
      engine:`TypeSafe ${R.apiModel}`,
      answers:R.questions.map(q=>({id:q.id,question:q.q,type:q.type,...(q.na?{notProvided:true}:q.type==='Score'?{score:q.apiScore??q.score}:q.type==='Noul'?{probabilityYes:q.p}:{choice:q.choice}),...(q.conf!=null?{confidence:+q.conf.toFixed(2)}:{}),reason:q.noul,...(q.localReason?{inputFacts:q.localReason}:{})})),
      inputs:inp,notProvided
    };
  }

  function analyze(){
    const v=read();if(!validate(v))return;
    if(!API.available){msg('Jev API is unavailable. Check TYPESAFE_API_KEY on the server and reload.',true);return;}
    const btn=$('go');btn.disabled=true;btn.querySelector('span').textContent='Analyzing…';
    $('out').classList.add('busy');$('bar').style.strokeDashoffset=C;
    const done=()=>{$('out').classList.remove('busy');btn.disabled=false;btn.querySelector('span').textContent='Analyze with Jev';};
    (async()=>{
      const t0=performance.now();
      // `base` composes the trade plan, dimension scores and input audit from the
      // typed rules below; mergeApi() then overlays Jev's own answers on top of it.
      const base=jev(v);
      const {questions,map}=apiQuestions(v,base);
      try{
        const resp=await callJev(apiState(v),questions);
        API.last=resp.model||API.model;
        const R=mergeApi(v,base,resp,map,questions);
        render(v,R,performance.now()-t0);
        done();
        if(matchMedia('(max-width:1099px)').matches)$('out').scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});
      }catch(e){
        done();
        msg(e.status===401?'The TypeSafe API key was rejected (401). Check TYPESAFE_API_KEY on the server.':e.status===429||e.status===529?'TypeSafe is busy or rate-limited. Try again shortly.':`Jev API call failed: ${e.message}`,true);
      }
    })();
  }

  function resetAll(){
    $('ticker').value='';NUMS.forEach(k=>{$(k).value='';$(k).classList.remove('invalid');});
    SELS.forEach(k=>{$(k).value=DEFAULT_SEL[k];toneSel(k);});
    $('edate').value='';$('edate').classList.add('empty');$('notes').value='';fundOpen=false;setTF('1W');setKind('nonfin');$('ddate').value=isoIn(0);
    $('cap').value='';$('riskPct').value='';$('size-fields').hidden=true;$('size-toggle').setAttribute('aria-expanded','false');$('size-toggle').textContent='Size my position';
    derived();markStale();$('f').scrollTop=0;$('ticker').focus();
    msg('Enter a symbol and price, then add whatever else you know.');
  }

  // ================= TypeSafe Jev API (via same-origin proxy) =================
  // The API key never reaches the browser. server.js holds it and forwards
  // requests to https://api.typesafe.ai/v1/systemone. JevTrade is Jev-API-only:
  // there is no local-rules fallback, so analysis is blocked until this succeeds.
  const API={available:false,model:null,last:null};
  async function detectApi(){
    try{
      const ctl=new AbortController();setTimeout(()=>ctl.abort(),2500);
      const r=await fetch('/api/jev/health',{cache:'no-store',signal:ctl.signal});
      if(r.ok){const j=await r.json();if(j&&j.ok){API.available=true;API.model=j.model||'jev-latest';}}
    }catch(e){}
    paintEngine();paintAskModes();
    if(!API.available)msg('Jev API is unavailable. Check TYPESAFE_API_KEY on the server and reload.',true);
  }
  function paintEngine(){
    const b=$('engine');
    b.querySelector('span').textContent=`Jev API${API.last?' ('+API.last+')':API.model?' ('+API.model+')':''}`;
    b.title=API.available?'Connected to the TypeSafe Jev API':'Jev API unavailable. Run JevTrade with server.js and a valid TYPESAFE_API_KEY.';
    b.classList.toggle('live',API.available);
  }

  async function callJev(state,questions,timeoutMs=25000){
    const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),timeoutMs);
    try{
      const r=await fetch('/api/jev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,questions}),signal:ctl.signal});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){const e=new Error(j.error||`HTTP ${r.status}`);e.status=r.status;throw e;}
      return j;
    }finally{clearTimeout(t);}
  }

  function apiState(v){
    const has=k=>Number.isFinite(v[k]);const o={};const put=(obj,k,name,round)=>{if(has(k))obj[name]=round?+v[k].toFixed(round):v[k];};
    const tech={};put(tech,'rsi','rsi_14');tech.macd=LBL.macd[v.macd];put(tech,'e20','ema_20_inr');put(tech,'e50','ema_50_inr');put(tech,'e200','ema_200_inr');
    tech.momentum=LBL.mom[v.mom];put(tech,'vol','volume_vs_20d_avg_pct');put(tech,'atr','atr_14_inr');
    if(has('atr'))tech.atr_pct_of_price=+(v.atr/v.price*100).toFixed(2);
    put(tech,'sup','support_inr');put(tech,'res','resistance_inr');put(tech,'adv','avg_daily_traded_value_cr');
    put(tech,'sret','stock_3m_return_pct');put(tech,'nret','nifty_3m_return_pct');
    const mkt={nifty50_trend:LBL.mkt[v.mkt],sector_trend:LBL.sec[v.sec],market_sentiment:LBL.news[v.news],fii_cash_flow_5d:LBL.fii[v.fii]};put(mkt,'vix','india_vix');
    const fund={company_type:v.fin?'Bank or NBFC':'Non-financial company'};
    put(fund,'pe','pe');put(fund,'spe','sector_pe');put(fund,'peg','peg');
    if(v.fin){put(fund,'pb','pb');put(fund,'spb','sector_pb');put(fund,'gnpa','gross_npa_pct');put(fund,'car','capital_adequacy_pct');put(fund,'roa','roa_pct');}
    else{put(fund,'fcf','fcf_yield_pct');put(fund,'de','debt_to_equity');put(fund,'ic','interest_cover');put(fund,'pledge','promoter_pledge_pct');}
    const ev={event_risk:LBL.evt[v.evt],next_catalyst:LBL.cat[v.cat],exchange_surveillance:LBL.surv[v.surv]};
    if(v.edays!=null)ev.results_in_days=v.edays;
    Object.assign(o,{stock:v.ticker,exchange:v.exchange,market:'Indian equities (NSE/BSE), prices in INR',horizon:`${v.tf} (${TF[v.tf].label})`,price_inr:v.price,technicals:tech,market_context:mkt,fundamentals:fund,events:ev});
    if(v.notes)o.trader_notes=v.notes;
    return o;
  }

  const LV=(a,b,c,d,e)=>[a,b,c,d,e]; // 5 ordered levels, least to most favorable
  function apiQuestions(v,R){
    const fin=v.fin,h=TF[v.tf].label,Q={},map={};
    const want=id=>{const q=R.questions.find(x=>x.id===id);return q&&!q.na;};
    const add=(id,key,def)=>{if(id!=='Q20'&&!want(id)&&!['Q14','Q15','Q18','Q19','Q10'].includes(id))return;Q[key]=def;map[key]=id;};
    const sc=(instructions,criteria)=>({type:'score',instructions,criteria});
    const ch=(instructions,criteria)=>({type:'choice',instructions,criteria});
    const nl=(instructions,t,f)=>({type:'noul',instructions,criteria:{true:t,false:f}});
    if(fin){
      add('Q1','q01_pb_vs_sector',sc('How attractive is the P/B relative to the sector P/B?',LV('Far above sector (1.4x or more)','Above sector','In line with sector','Below sector','Far below sector (0.7x or less)')));
      add('Q2','q02_pe_vs_sector',sc('How attractive is the P/E relative to the sector P/E?',LV('Far above sector (1.4x or more)','Above sector','In line with sector','Below sector','Far below sector (0.7x or less)')));
      add('Q3','q03_peg',sc('Does earnings growth justify the valuation multiple, judged by PEG?',LV('Multiple far ahead of growth (PEG 2.5+)','Multiple ahead of growth','Growth roughly supports the multiple','Growth supports it well','Growth well ahead of the multiple (PEG under 0.8)')));
      add('Q5','q05_asset_quality',sc('How clean is asset quality, judged by gross NPA?',LV('Very high NPAs (8%+)','High NPAs','Moderate NPAs','Low NPAs','Very low NPAs (under 1.5%)')));
      add('Q6','q06_capital',sc('How comfortable is capital adequacy (CAR) versus the regulatory floor?',LV('At or near the floor (12% or less)','Thin buffer','Adequate buffer','Comfortable buffer','Very strong buffer (18%+)')));
      add('Q7','q07_profitability',sc('How strong is profitability for a lender, judged by ROA?',LV('Very weak (under 0.4%)','Weak','Adequate','Strong','Very strong (1.8%+)')));
    }else{
      add('Q1','q01_pe_vs_sector',sc('How attractive is the P/E relative to the sector P/E?',LV('Far above sector (1.4x or more)','Above sector','In line with sector','Below sector','Far below sector (0.7x or less)')));
      add('Q2','q02_peg',sc('Does earnings growth justify the valuation multiple, judged by PEG?',LV('Multiple far ahead of growth (PEG 2.5+)','Multiple ahead of growth','Growth roughly supports the multiple','Growth supports it well','Growth well ahead of the multiple (PEG under 0.8)')));
      add('Q3','q03_fcf_yield',sc('How compelling is the free-cash-flow yield?',LV('Very thin (1% or less)','Thin','Moderate','Solid','Very high (6%+)')));
      add('Q5','q05_leverage',sc('How conservative is leverage, judged by debt to equity?',LV('Very high (2x or more)','High','Moderate','Low','Very low (under 0.3x)')));
      add('Q6','q06_interest_cover',sc('How comfortably do earnings cover interest costs?',LV('Barely (2x or less)','Thin margin','Reasonable margin','Wide margin','Very wide margin (20x+)')));
      add('Q7','q07_pledge',sc('How low is the risk from pledged promoter shares?',LV('Heavy pledging (30%+), forced-selling risk','Significant pledging','Some pledging worth watching','Minor pledging','No pledged shares')));
    }
    add('Q4','q04_valuation',ch('Overall, how is the stock valued against peers and its growth?',{Cheap:'Priced below peers on most measures',Fair:'Roughly in line with peers and growth',Expensive:'Priced at a premium to peers and growth'}));
    add('Q8','q08_balance_sheet',ch('Overall, how strong is the balance sheet for this type of company?',{Strong:'Low financial risk',Adequate:'Some weak spots but manageable',Weak:'Meaningful financial risk'}));
    add('Q9','q09_uptrend',nl('Is the stock in a confirmed uptrend, with price above its 20, 50 and 200 EMAs and the EMAs stacked in bullish order?','Confirmed uptrend','Not a confirmed uptrend'));
    add('Q10','q10_rsi_macd',sc('How well do RSI and MACD support upward momentum?',LV('Strongly bearish or badly overbought','Weak','Mixed','Supportive','Strongly supportive')));
    add('Q11','q11_relative_strength',sc('How strongly is the stock outperforming the Nifty 50 over 3 months?',LV('Lagging by 10+ points','Lagging','In line','Outperforming','Outperforming by 10+ points')));
    add('Q12','q12_volume',ch('Does trading volume confirm the current price move?',{Confirms:'Above-average volume backs the move',Neutral:'Volume gives no clear signal',Diverges:'Weak participation behind the move'}));
    add('Q13','q13_volatility_regime',sc('How calm is the market volatility regime, judged by India VIX?',LV('Stressed (24+)','Elevated','Normal','Calm','Very calm (under 12)')));
    add('Q14','q14_tailwinds',sc('How supportive are the Nifty 50 trend, sector trend and FII cash flows together?',LV('Strong headwinds','Headwinds','Mixed','Tailwinds','Strong tailwinds')));
    add('Q15','q15_event_risk',ch(`How much scheduled event risk is there over ${h}?`,{None:'No scheduled events',Low:'Minor events only',Elevated:'Quarterly results within two weeks',High:'Results, RBI policy or the Budget within days'}));
    add('Q16','q16_liquidity',nl('Is the stock liquid enough, and free of ASM or GSM surveillance restrictions, for a normal retail position?','Liquid and unrestricted','Illiquid or under surveillance'));
    add('Q17','q17_room',sc('How much room is there to resistance compared with the distance to support?',LV('No room or support broken','Little room','Balanced','Good room (2x+)','Lots of room (3x+) or clean breakout')));
    add('Q18','q18_sentiment',nl(`Is market sentiment supportive of the stock rising over ${h}?`,'Supportive','Not supportive'));
    add('Q19','q19_catalyst',ch('What is the direction of the next known catalyst?',{Positive:'A positive catalyst is expected',None:'No catalyst identified',Negative:'A negative catalyst is expected'}));
    add('Q20','q20_action',ch(`For a swing trader in Indian equities, what is the best action over ${h}, given every field in the state?`,{BUY:'Expect a rise; reward outweighs risk',HOLD:'No clear edge either way',SELL:'Expect a fall; exit or avoid'}));
    return {questions:Q,map};
  }

  function mergeApi(v,local,resp,map,qdefs){
    const ans=resp.answers||{};
    const a20=ans.q20_action;
    if(!a20||!a20.probabilities)throw new Error('Missing overall action in response');
    let choice=a20.choice;const probs=a20.probabilities;
    const guard=[];
    const crit=local.checks.some(c=>c.lvl==='crit');
    if(choice==='BUY'&&crit){choice='HOLD';guard.push('Guardrail: BUY downgraded to HOLD because the input audit found a critical issue (liquidity or GSM).');}
    const prob=Math.round((probs[choice]??0)*100);
    const R=jev(v,{forceChoice:choice,forceProb:prob});
    // overlay typed answers
    for(const [key,id] of Object.entries(map)){
      const a=ans[key];const q=R.questions.find(x=>x.id===id);if(!a||!q)continue;
      q.api=true;q.na=false;q.localReason=q.noul;
      const pc=x=>Math.round(x*100)+'%';
      if(a.type==='score'){q.apiScore=+a.score+1;q.score=S5(q.apiScore);q.conf=a.confidence;q.probs=a.probabilities;
        const crit=qdefs[key].criteria;const top=Object.entries(a.probabilities).sort((x,y)=>y[1]-x[1])[0];
        q.noul=`Jev: most likely “${crit[+top[0]]}” (${pc(top[1])}).`;}
      else if(a.type==='choice'){if(id!=='Q20')q.choice=a.choice;q.conf=a.confidence;q.probs=a.probabilities;
        q.noul='Jev: '+Object.entries(a.probabilities).sort((x,y)=>y[1]-x[1]).slice(0,3).map(([k,x])=>`${k} ${pc(x)}`).join(', ')+'.';}
      else if(a.type==='noul'){q.p=+a.noul;q.score=S5(1+4*q.p);q.noul=`Jev: ${pc(q.p)} probability the answer is yes.`;}
    }
    const q20=R.questions[19];q20.choice=choice;q20.conf=a20.confidence;q20.probs=probs;
    // dimension scores from API answers (composite scoring in code)
    const byDim=d=>R.questions.filter(q=>q.dim===d&&!q.na&&q.score!=null&&q.type!=='Choice');
    const avgS=d=>{const g=byDim(d);return g.length?avg(g.map(q=>q.apiScore??q.score)):null;};
    const qc=id=>R.questions.find(x=>x.id===id);
    R.dims.forEach(d=>{
      const a=avgS(d.id);if(a==null)return;d.score=S5(a);
      if(d.id==='valuation'&&!qc('Q4').na){d.label=qc('Q4').choice;d.tone=toneOf(d.label)||'mid';}
      if(d.id==='balance'&&!qc('Q8').na){d.label=qc('Q8').choice;d.tone=toneOf(d.label)||'mid';}
      if(d.id==='momentum'){d.label=d.score>=4?'Strong':d.score===3?'Moderate':'Weak';d.tone=d.score>=4?'pos':d.score===3?'mid':'neg';}
      if(d.id==='macro'){d.label=d.score>=4?'Low risk':d.score===3?'Moderate risk':'High risk';d.tone=d.score>=4?'pos':d.score===3?'mid':'neg';}
    });
    const upProb=Math.round(100*((probs.BUY||0)+0.5*(probs.HOLD||0)));
    const up=R.dims.find(d=>d.id==='upside');up.label=`${upProb}% upside`;up.tone=upProb>=60?'pos':upProb<=40?'neg':'mid';R.upProb=upProb;
    // confidence from Jev, gated by code
    let cLvl=a20.confidence>=0.75?2:a20.confidence>=0.5?1:0;
    if(R.poorEntry)cLvl--; if(crit)cLvl=0; if(R.qLabel==='Poor')cLvl--;
    cLvl=Math.max(0,cLvl);
    R.conf=['Low','Medium','High'][cLvl];R.confBars=[1,3,5][cLvl];
    R.strength=Math.round(Math.abs((probs.BUY||0)-(probs.SELL||0))*100);
    R.engine='api';R.apiModel=resp.model;R.usage=resp.usage;R.guard=guard;R.apiConfidence=a20.confidence;R.actionProbs=probs;
    guard.forEach(g=>R.checks.unshift({lvl:'warn',t:g}));
    q20.noul=`Jev: ${Object.entries(probs).sort((a,b)=>b[1]-a[1]).map(([k,p])=>`${k} ${Math.round(p*100)}%`).join(', ')}; confidence ${a20.confidence.toFixed(2)}.${guard.length?' '+guard[0]:''}`;
    return R;
  }

  // ---------- result tabs ----------
  function showView(name){
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-selected',b.dataset.view===name));
    ['decision','questions','ask'].forEach(x=>$('v-'+x).hidden=x!==name);
    if(name==='ask')setTimeout(()=>{if(!$('q').disabled)$('q').focus();},0);
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
  document.querySelectorAll('[data-goview]').forEach(b=>b.onclick=()=>showView(b.dataset.goview));

  // ---------- Ask Jev ----------
  let sample=null,sampleChecked=false,turns=[],ctl=null,busy=false,askMode='explain',lastV=null;
  const SUGG=['Why this call and not HOLD?','What would flip the decision?','Is my stop-loss in the right place?','Which inputs should I double-check?'];
  const CHECKS=['Is the stop-loss below a meaningful support level?','Is the stock overextended from its 20 EMA?','Would the results announcement likely increase volatility?','Is this a breakout with genuine volume behind it?'];
  function paintAskModes(){
    const canCheck=API.available,canExplain=!!sample;
    $('am-check').hidden=!canCheck;$('am-explain').hidden=!canExplain;
    $('ask-modes').hidden=!(canCheck&&canExplain);
    if(askMode==='explain'&&!canExplain&&canCheck)askMode='check';
    if(askMode==='check'&&!canCheck&&canExplain)askMode='explain';
    document.querySelectorAll('[data-am]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.am===askMode));
    const list=askMode==='check'?CHECKS:SUGG;
    $('sugg').innerHTML=list.map(s=>`<button type="button">${s}</button>`).join('');
    $('sugg').querySelectorAll('button').forEach(b=>b.onclick=()=>ask(b.textContent));
    $('ask-title').textContent=askMode==='check'?'Ask Jev a yes/no question':'Ask about this analysis';
    $('ask-lede').textContent=askMode==='check'?'Jev answers each question as a Noul: the probability that the answer is yes, judged against the same state as the decision. Phrase it so yes or no makes sense.':'Claude explains the analysis using the same state document: your inputs, your notes and all 20 typed answers. It won’t invent prices or news.';
    $('q').placeholder=askMode==='check'?'e.g. Is the stock overextended from its 20 EMA?':'Ask a follow-up, e.g. what would flip this to Hold?';
    const off=!canCheck&&!canExplain&&sampleChecked;
    $('q').disabled=off;$('send').disabled=off||!$('q').value.trim();
    $('sugg').querySelectorAll('button').forEach(b=>b.disabled=off);
    if(off)$('ask-note').textContent='Run JevTrade with server.js for Jev yes/no checks, or open it on claude.ai for explanations.';
  }
  document.querySelectorAll('[data-am]').forEach(b=>b.onclick=()=>{askMode=b.dataset.am;paintAskModes();});
  (async()=>{try{if(window.claude&&claude.use)sample=await claude.use('sample');}catch(e){sample=null;}sampleChecked=true;paintAskModes();})();

  function resetThread(tk){
    turns=[];if(ctl){ctl.abort();ctl=null;}
    $('thread').querySelectorAll('.mu,.mj').forEach(n=>n.remove());$('ask-empty').hidden=false;
    $('ask-note').textContent=`Grounded in the ${tk} analysis.`;
  }
  const RULES=`You are Jev, the decision-analysis model inside JevTrade, which covers Indian equities listed on NSE and BSE only. Prices are in Indian rupees (₹), volatility context is India VIX, and the benchmark is the Nifty 50.
Answer the user's follow-up question using ONLY the state document below. It holds the user's inputs and notes, the timeframe, the scoring rules, and Jev's 20 typed answers (Choice = one option with probabilities and confidence, Score = 1 to 5 where 5 is most favorable, Noul = probability the answer is yes; each answer also has a reason line). Fields listed in notProvided were left blank and were treated as neutral. The state also has a trade plan (stop, target, reward to risk, position size) and an input audit with data-quality warnings. Answers come from the TypeSafe Jev API and are not validated on Indian market outcomes. Say so if asked about accuracy.
Rules:
- Ground every claim in the state document and cite answer ids in parentheses, like (Q7).
- If the question needs data that is not in the state document, say exactly what is missing. Never invent prices, news, results dates or fundamentals.
- For "what would change" questions, use the scoring rules and name concrete input thresholds.
- If asked about non-Indian stocks or markets, say JevTrade covers only NSE and BSE listed stocks.
- Plain text only: no markdown, headings, bullets or bold. Two short paragraphs at most, under 110 words total.
- Be direct and specific. Do not add investment-advice disclaimers.`;
  const paras=t=>t.split(/\n{2,}/).map(p=>`<p>${esc(p.trim()).replace(/\n/g,'<br>')}</p>`).join('');
  function setBusy(b){busy=b;const s=$('send');s.textContent=b?'Stop':'Ask';s.classList.toggle('stop',b);s.disabled=!b&&!$('q').value.trim();}
  async function askCheck(text){
    $('ask-empty').hidden=true;const th=$('thread');
    const u=document.createElement('div');u.className='mu';u.textContent=text;th.appendChild(u);
    const j=document.createElement('div');j.className='mj thinking';j.innerHTML='<div class="who"><i></i>Jev · Noul</div><div class="body">Checking…</div>';th.appendChild(j);th.scrollTop=th.scrollHeight;
    $('q').value='';autosize();setBusy(true);$('send').disabled=true;
    const body=j.querySelector('.body');
    try{
      const resp=await callJev(apiState(lastV),{user_check:{type:'noul',instructions:text}});
      const p=+resp.answers.user_check.noul,pct=Math.round(p*100),tone=p>=.6?'buy':p<=.4?'sell':'hold';
      const word=p>=.8?'Very likely yes':p>=.6?'Likely yes':p>.4?'Uncertain':p>.2?'Likely no':'Very likely no';
      j.classList.remove('thinking');
      body.innerHTML=`<p><b style="color:var(--${tone})">${word}</b>, ${pct}% probability of yes.</p><div class="noulbar"><b style="width:${pct}%;background:var(--${tone})"></b></div><p class="nl-meta">${esc(resp.model||'jev')} · judged against the ${esc(lastV.ticker)} state</p>`;
    }catch(e){
      j.classList.remove('thinking');j.classList.add('error');
      body.innerHTML=`<p>${e.status===401?'The TypeSafe API key was rejected. Check TYPESAFE_API_KEY on the server.':e.status===429||e.status===529?'TypeSafe is busy. Try again in a moment.':'Jev couldn’t answer just now. Try again.'}</p>`;
    }finally{setBusy(false);th.scrollTop=th.scrollHeight;}
  }
  async function ask(text){
    text=(text||'').trim();if(!text||busy||!lastState)return;
    if(askMode==='check'){if(API.available&&lastV)return askCheck(text);return;}
    if(!sample)return;
    $('ask-empty').hidden=true;const th=$('thread');
    const u=document.createElement('div');u.className='mu';u.textContent=text;th.appendChild(u);
    const j=document.createElement('div');j.className='mj thinking';j.innerHTML='<div class="who"><i></i>Jev</div><div class="body">Thinking…</div>';th.appendChild(j);th.scrollTop=th.scrollHeight;
    $('q').value='';autosize();
    const content=turns.length===0?`${RULES}\n\nSTATE DOCUMENT (JSON):\n${JSON.stringify(lastState)}\n\nQuestion: ${text}`:text;
    const input=[...turns,{role:'user',content}];ctl=new AbortController();setBusy(true);
    const body=j.querySelector('.body');
    try{
      const {text:ans,truncated}=await sample(input,{signal:ctl.signal,cache:false,modelTier:'quick',onText:({text:t})=>{j.classList.remove('thinking');body.innerHTML=paras(t);th.scrollTop=th.scrollHeight;}});
      j.classList.remove('thinking');body.innerHTML=paras(ans)+(truncated?'<p style="color:var(--faint);font-size:12px">Answer cut short. Ask a narrower question.</p>':'');
      turns.push({role:'user',content},{role:'assistant',content:ans});
    }catch(e){
      j.classList.remove('thinking');
      if(e&&e.code==='cancelled')body.innerHTML=e.text?paras(e.text):'<p style="color:var(--faint)">Stopped.</p>';
      else{j.classList.add('error');const copy={not_granted:'Ask Jev needs permission to use Claude. Reload the page to be asked again.',rate_limited:'Too many questions at once. Wait a moment, then ask again.',session_expired:'Your session expired. Reload the page to continue.',sampling_disabled:'Asking Claude is turned off for this account.',prompt_too_large:'This conversation is too long. Run the analysis again to start fresh.',refused:'Jev can’t answer that one. Try asking about the analysis itself.'}[e&&e.code]||'Jev couldn’t answer just now. Try again.';body.innerHTML=(e&&e.text?paras(e.text):'')+`<p>${copy}</p>`;}
    }finally{ctl=null;setBusy(false);th.scrollTop=th.scrollHeight;}
  }
  function autosize(){const t=$('q');t.style.height='auto';t.style.height=Math.min(t.scrollHeight,100)+'px';if(!busy)$('send').disabled=!t.value.trim();}
  $('q').addEventListener('input',autosize);
  $('q').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask($('q').value);}});
  $('send').onclick=()=>{if(busy)ctl&&ctl.abort();else ask($('q').value);};
  $('toggle-state').onclick=()=>{const d=$('state-doc');d.hidden=!d.hidden;$('toggle-state').textContent=d.hidden?'View state document':'Hide state document';};

  // ---------- wiring ----------
  $('reset').onclick=resetAll;
  $('go').onclick=analyze;
  $('ticker').addEventListener('change',e=>{const s=e.target.value.trim().toUpperCase();if(PRESETS[s]&&!$('price').value)load(s);});
  $('f').addEventListener('input',e=>{e.target.classList&&e.target.classList.remove('invalid');if(e.target.tagName==='SELECT')toneSel(e.target.id);if(e.target.id==='edate')e.target.classList.toggle('empty',!e.target.value);derived();markStale();});
  $('f').addEventListener('change',e=>{if(e.target.tagName==='SELECT')toneSel(e.target.id);derived();markStale();});
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.target.id==='q')return;
    if(e.ctrlKey||e.metaKey){if(!$('page-analyze').hidden){e.preventDefault();analyze();}}
    else if(e.target.closest&&e.target.closest('#f')&&e.target.tagName==='INPUT'){e.preventDefault();analyze();}
  });

  detectApi();
  load('RELIANCE');
})();
