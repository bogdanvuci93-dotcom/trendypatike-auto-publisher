import type { RequestHandler } from './$types';

const SOURCE = String.raw`(() => {
  if (window.__TP_GROWTH_TRACKER__) return;
  window.__TP_GROWTH_TRACKER__ = true;

  var ORIGIN='https://trendypatike-growth.bogdanvuci93.workers.dev';
  var COLLECTOR=ORIGIN+'/api/collect';
  var SITE='tp_20260909';
  var VERSION='2026-09-09.6';
  var host=String(location.hostname||'').toLowerCase();
  if(!(host==='trendypatike.com'||host.endsWith('.trendypatike.com')||host.endsWith('.myshopify.com')||host.endsWith('.shopifypreview.com')))return;
  if(/^\/(account|challenge|password)(\/|$)/.test(location.pathname))return;

  var SID='tp_growth_sid',START='tp_growth_started',LAST='tp_growth_last';
  var now=Date.now(),ttl=30*60*1000;
  var get=function(s,k){try{return s.getItem(k)||''}catch(e){return ''}};
  var set=function(s,k,v){try{s.setItem(k,String(v))}catch(e){}};
  var previous=Number(get(localStorage,LAST)||0),sid=get(localStorage,SID),started=Number(get(localStorage,START)||0);
  var fresh=!sid||!started||!previous||(now-previous>ttl);
  if(fresh){sid=(crypto&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,'_'):('tp_'+now.toString(36)+'_'+Math.random().toString(36).slice(2,14)));started=now;set(localStorage,SID,sid);set(localStorage,START,started);}
  set(localStorage,LAST,now);

  var params=new URLSearchParams(location.search);
  var landing=fresh?location.pathname:(get(sessionStorage,'tp_growth_landing')||location.pathname);
  var utmSource=fresh?(params.get('utm_source')||''):(get(sessionStorage,'tp_growth_utm_source')||'');
  var utmCampaign=fresh?(params.get('utm_campaign')||''):(get(sessionStorage,'tp_growth_utm_campaign')||'');
  var fbclid=fresh?(params.get('fbclid')||''):(get(sessionStorage,'tp_growth_fbclid')||'');
  var ref='';try{if(document.referrer){var ru=new URL(document.referrer);ref=(ru.origin+ru.pathname).slice(0,500)}}catch(e){}
  if(fresh){set(sessionStorage,'tp_growth_landing',landing);set(sessionStorage,'tp_growth_utm_source',utmSource);set(sessionStorage,'tp_growth_utm_campaign',utmCampaign);set(sessionStorage,'tp_growth_fbclid',fbclid);}

  var device=function(){return innerWidth<768?'mobile':innerWidth<1100?'tablet':'desktop';};
  var viewport=function(){return {vw:innerWidth,vh:innerHeight,device:device()};};
  var docHeight=function(){return Math.max(document.documentElement.scrollHeight,(document.body&&document.body.scrollHeight)||0,innerHeight,1);};
  var clampPct=function(n){return Math.max(0,Math.min(100,Number(n)||0));};
  var alive=[];
  var send=function(type,meta,path){try{
    var ts=Date.now();set(localStorage,LAST,ts);
    var q=new URLSearchParams();q.set('site',SITE);q.set('sid',sid);q.set('st',String(started));q.set('ls',String(ts));
    q.set('lp',String(landing||'/').slice(0,500));q.set('rf',String(ref||'').slice(0,500));q.set('us',String(utmSource||'').slice(0,120));q.set('uc',String(utmCampaign||'').slice(0,180));q.set('fb',String(fbclid||'').slice(0,300));
    q.set('t',String(type||'').slice(0,40));q.set('p',String(path||location.pathname||'/').slice(0,500));q.set('ts',String(ts));q.set('m',JSON.stringify(meta||{}).slice(0,2400));q.set('cb',String(ts)+'_'+Math.random().toString(36).slice(2,8));
    var img=new Image();alive.push(img);var done=function(){var i=alive.indexOf(img);if(i>=0)alive.splice(i,1)};img.onload=done;img.onerror=done;img.referrerPolicy='origin';img.src=COLLECTOR+'?'+q.toString();
  }catch(e){}};

  var currentPath=location.pathname||'/';
  var pageStarted=Date.now(),lastTick=pageStarted,activeMs=0,visibleMs=0,maxScroll=0,lastInteraction=null;
  var tick=function(){var t=Date.now(),d=Math.min(30000,Math.max(0,t-lastTick));if(document.visibilityState==='visible'){visibleMs+=d;if(document.hasFocus())activeMs+=d;}lastTick=t;};
  var resetPage=function(){currentPath=location.pathname||'/';pageStarted=Date.now();lastTick=pageStarted;activeMs=0;visibleMs=0;maxScroll=0;lastInteraction=null;};
  var pageExit=function(reason,path){
    tick();
    var dh=docHeight(),vp=viewport(),top=clampPct(scrollY/dh*100),mid=clampPct((scrollY+innerHeight/2)/dh*100),bottom=clampPct((scrollY+innerHeight)/dh*100);
    send('page_exit',{activeMs:activeMs,visibleMs:visibleMs,maxScroll:maxScroll,reason:reason||'navigate',scrollY:Math.round(scrollY),docHeight:dh,exitTopPct:top,exitMidPct:mid,exitBottomPct:bottom,vw:vp.vw,vh:vp.vh,device:vp.device,lastInteraction:lastInteraction},path||currentPath);
  };
  var page=function(){currentPath=location.pathname||'/';var vp=viewport();send('page_view',{vw:vp.vw,vh:vp.vh,device:vp.device,docHeight:docHeight()},currentPath);if(currentPath.indexOf('/products/')===0){var h=(currentPath.split('/products/')[1]||'').split('/')[0];send('product_view',{handle:h},currentPath);}if(currentPath==='/cart'||currentPath.indexOf('/cart/')===0)send('cart_view',{source:'page'},currentPath);};

  if(fresh)send('session_start',{vw:innerWidth,vh:innerHeight,screenW:screen.width,screenH:screen.height,device:device(),lang:navigator.language||''});
  page();

  var desc=function(node){var el=node instanceof Element?node:null;if(!el)return '';var out=el.tagName.toLowerCase();if(el.id&&/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(el.id))out+='#'+el.id;var cls=Array.from(el.classList||[]).filter(function(c){return /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(c)}).slice(0,2);if(cls.length)out+='.'+cls.join('.');return out.slice(0,120);};
  var safeLabel=function(el){if(!el)return '';var v=el.getAttribute('aria-label')||el.getAttribute('title')||el.getAttribute('data-track')||'';if(!v){v=(el.textContent||'').replace(/\s+/g,' ').trim();}return v.slice(0,100);};
  var mutationSeq=0;try{new MutationObserver(function(){mutationSeq++;}).observe(document.documentElement,{subtree:true,childList:true,attributes:true});}catch(e){}
  var clicks=[];
  document.addEventListener('click',function(ev){
    var dh=docHeight(),xp=clampPct(ev.clientX/Math.max(innerWidth,1)*100),yp=clampPct(ev.clientY/Math.max(innerHeight,1)*100),docY=scrollY+ev.clientY,dyp=clampPct(docY/dh*100);
    var interactive=ev.target instanceof Element?ev.target.closest('a,button,[role="button"],input[type="submit"],[data-action]'):null;
    var target=desc(interactive||ev.target),label=safeLabel(interactive),href=interactive&&interactive.getAttribute?interactive.getAttribute('href')||'':'';
    var vp=viewport(),clickMeta={xPct:xp,yPct:yp,docYPct:dyp,docYpx:Math.round(docY),docHeight:dh,clientX:Math.round(ev.clientX),clientY:Math.round(ev.clientY),target:target,label:label,href:href,vw:vp.vw,vh:vp.vh,device:vp.device};
    lastInteraction={label:label,target:target,href:href,ts:Date.now(),docYPct:dyp};
    send('click',clickMeta,currentPath);
    var t=Date.now();clicks.push({t:t,x:ev.clientX,y:ev.clientY});while(clicks.length&&t-clicks[0].t>900)clicks.shift();if(clicks.length>=3){var a=clicks[clicks.length-3];if(Math.hypot(ev.clientX-a.x,ev.clientY-a.y)<55)send('rage_click',clickMeta,currentPath);}
    if(!interactive)return;
    var name=interactive.getAttribute('name')||'',classes=interactive.getAttribute('class')||'',act=interactive.getAttribute('data-action')||interactive.getAttribute('data-add-to-cart')||'';
    if(/\/checkout(?:[/?#]|$)/.test(href)||name==='checkout')send('checkout_started',{source:label||target},currentPath);
    if(/\/cart(?:[/?#]|$)/.test(href))send('cart_view',{source:label||target},currentPath);
    if(name==='add'||/add[-_ ]?to[-_ ]?cart/i.test(classes+' '+act+' '+label))send('add_to_cart',{source:label||target,product:currentPath.indexOf('/products/')===0?currentPath.split('/products/')[1]:''},currentPath);
    var beforeUrl=location.href,beforeMutation=mutationSeq;setTimeout(function(){if(location.href===beforeUrl&&mutationSeq===beforeMutation&&!/\/checkout/.test(href)&&!name&&!/add[-_ ]?to[-_ ]?cart/i.test(classes+' '+act+' '+label)){send('dead_click',clickMeta,currentPath);}},900);
  },true);

  document.addEventListener('submit',function(ev){var f=ev.target instanceof HTMLFormElement?ev.target:null;if(!f)return;var a=f.getAttribute('action')||'';if(/\/cart\/add/.test(a))send('add_to_cart',{source:'form',product:currentPath.indexOf('/products/')===0?currentPath.split('/products/')[1]:''},currentPath);if(/\/checkout/.test(a))send('checkout_started',{source:'form'},currentPath);},true);

  if(window.fetch){var originalFetch=window.fetch.bind(window);window.fetch=async function(){var args=Array.prototype.slice.call(arguments),input=args[0],u=typeof input==='string'?input:(input&&input.url)||String(input),response=await originalFetch.apply(window,args);try{var p=new URL(u,location.origin);if(response.ok&&/\/cart\/add(?:\.js)?$/.test(p.pathname))send('add_to_cart',{source:'ajax',product:currentPath.indexOf('/products/')===0?currentPath.split('/products/')[1]:''},currentPath);}catch(e){}return response;};}
  if(window.XMLHttpRequest){var open=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(method,url){var args=Array.prototype.slice.call(arguments),p='';try{p=new URL(String(url),location.origin).pathname}catch(e){}if(/\/cart\/add(?:\.js)?$/.test(p)){this.addEventListener('load',function(){if(this.status>=200&&this.status<400)send('add_to_cart',{source:'xhr',product:currentPath.indexOf('/products/')===0?currentPath.split('/products/')[1]:''},currentPath);},{once:true});}return open.apply(this,args);};}

  var milestones=[25,50,75,90,100],reached={};
  var scroll=function(){var max=Math.max(1,document.documentElement.scrollHeight-innerHeight),d=clampPct(Math.round(scrollY/max*100));if(d>maxScroll)maxScroll=d;milestones.forEach(function(m){if(d>=m&&!reached[m]){reached[m]=1;var vp=viewport();send('scroll_depth',{depth:m,vw:vp.vw,vh:vp.vh,device:vp.device},currentPath);}});};addEventListener('scroll',scroll,{passive:true});setTimeout(scroll,700);

  setInterval(function(){tick();if(document.visibilityState==='visible')send('heartbeat',{activeMs:activeMs,visibleMs:visibleMs,maxScroll:maxScroll,scrollY:Math.round(scrollY),docHeight:docHeight()},currentPath);},20000);
  addEventListener('visibilitychange',function(){tick();});
  addEventListener('pagehide',function(){pageExit('pagehide',currentPath);});

  var navigate=function(reason,fn,args){var old=currentPath;pageExit(reason,old);var r=fn.apply(history,args);reached={};resetPage();setTimeout(page,0);return r;};
  ['pushState','replaceState'].forEach(function(k){var fn=history[k];if(typeof fn==='function')history[k]=function(){return navigate(k,fn,arguments);};});
  addEventListener('popstate',function(){var old=currentPath;pageExit('popstate',old);reached={};resetPage();setTimeout(page,0);});
  window.__TP_GROWTH_STATUS__={version:VERSION,collector:COLLECTOR,sessionId:sid};
})();`;

export const GET: RequestHandler = async () => new Response(SOURCE, {
  headers: {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*'
  }
});
