import type { RequestHandler } from './$types';

const SOURCE = String.raw`(() => {
  if (window.__TP_GROWTH_TRACKER__) return;
  window.__TP_GROWTH_TRACKER__ = true;

  var ORIGIN = 'https://trendypatike-growth.bogdanvuci93.workers.dev';
  var COLLECTOR = ORIGIN + '/api/collect';
  var SITE = 'tp_20260909';
  var host = String(location.hostname || '').toLowerCase();
  if (!(host === 'trendypatike.com' || host.endsWith('.trendypatike.com') || host.endsWith('.myshopify.com') || host.endsWith('.shopifypreview.com'))) return;
  if (/^\/(account|challenge|password)(\/|$)/.test(location.pathname)) return;

  var SID='tp_growth_sid', START='tp_growth_started', LAST='tp_growth_last';
  var now=Date.now(), ttl=30*60*1000;
  var get=function(s,k){try{return s.getItem(k)||''}catch(e){return ''}};
  var set=function(s,k,v){try{s.setItem(k,String(v))}catch(e){}};
  var previous=Number(get(localStorage,LAST)||0);
  var sid=get(localStorage,SID), started=Number(get(localStorage,START)||0);
  var fresh=!sid||!started||!previous||(now-previous>ttl);
  if(fresh){
    sid=(crypto&&crypto.randomUUID?crypto.randomUUID().replace(/-/g,'_'):('tp_'+now.toString(36)+'_'+Math.random().toString(36).slice(2,14)));
    started=now; set(localStorage,SID,sid); set(localStorage,START,started);
  }
  set(localStorage,LAST,now);

  var params=new URLSearchParams(location.search);
  var landing=fresh?location.pathname:(get(sessionStorage,'tp_growth_landing')||location.pathname);
  var utmSource=fresh?(params.get('utm_source')||''):(get(sessionStorage,'tp_growth_utm_source')||'');
  var utmCampaign=fresh?(params.get('utm_campaign')||''):(get(sessionStorage,'tp_growth_utm_campaign')||'');
  if(fresh){set(sessionStorage,'tp_growth_landing',landing);set(sessionStorage,'tp_growth_utm_source',utmSource);set(sessionStorage,'tp_growth_utm_campaign',utmCampaign);}

  var alive=[];
  var send=function(type,meta,path){
    try{
      var ts=Date.now(); set(localStorage,LAST,ts);
      var q=new URLSearchParams();
      q.set('site',SITE); q.set('sid',sid); q.set('st',String(started)); q.set('ls',String(ts));
      q.set('lp',String(landing||'/').slice(0,500)); q.set('us',String(utmSource||'').slice(0,120)); q.set('uc',String(utmCampaign||'').slice(0,180));
      q.set('t',String(type||'').slice(0,40)); q.set('p',String(path||location.pathname||'/').slice(0,500)); q.set('ts',String(ts));
      q.set('m',JSON.stringify(meta||{}).slice(0,1500)); q.set('cb',String(ts)+'_'+Math.random().toString(36).slice(2,8));
      var img=new Image(); alive.push(img); var done=function(){var i=alive.indexOf(img);if(i>=0)alive.splice(i,1)};
      img.onload=done; img.onerror=done; img.referrerPolicy='origin'; img.src=COLLECTOR+'?'+q.toString();
    }catch(e){}
  };

  var page=function(){
    send('page_view',{});
    if(location.pathname.indexOf('/products/')===0){
      var h=(location.pathname.split('/products/')[1]||'').split('/')[0]; send('product_view',{handle:h});
    }
  };

  if(fresh){
    send('session_start',{vw:innerWidth,vh:innerHeight,screenW:screen.width,screenH:screen.height,device:innerWidth<768?'mobile':innerWidth<1100?'tablet':'desktop',lang:navigator.language||''});
  }
  page();

  var desc=function(node){
    var el=node instanceof Element?node:null; if(!el)return '';
    var out=el.tagName.toLowerCase();
    if(el.id&&/^[A-Za-z][A-Za-z0-9_-]{0,60}$/.test(el.id))out+='#'+el.id;
    var cls=Array.from(el.classList||[]).filter(function(c){return /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(c)}).slice(0,2);
    if(cls.length)out+='.'+cls.join('.'); return out.slice(0,120);
  };

  var clicks=[];
  document.addEventListener('click',function(ev){
    var dh=Math.max(document.documentElement.scrollHeight,(document.body&&document.body.scrollHeight)||0,innerHeight,1);
    var xp=Math.max(0,Math.min(100,ev.clientX/Math.max(innerWidth,1)*100));
    var yp=Math.max(0,Math.min(100,ev.clientY/Math.max(innerHeight,1)*100));
    var dyp=Math.max(0,Math.min(100,(scrollY+ev.clientY)/dh*100));
    var target=desc(ev.target); send('click',{xPct:xp,yPct:yp,docYPct:dyp,target:target});
    var t=Date.now(); clicks.push({t:t,x:ev.clientX,y:ev.clientY}); while(clicks.length&&t-clicks[0].t>900)clicks.shift();
    if(clicks.length>=3){var a=clicks[clicks.length-3];if(Math.hypot(ev.clientX-a.x,ev.clientY-a.y)<55)send('rage_click',{xPct:xp,yPct:yp,docYPct:dyp,target:target});}
    var el=ev.target instanceof Element?ev.target.closest('a,button,[role="button"],input[type="submit"]'):null; if(!el)return;
    var href=el instanceof HTMLAnchorElement?(el.getAttribute('href')||''):''; var name=el.getAttribute('name')||''; var classes=el.getAttribute('class')||''; var act=el.getAttribute('data-action')||el.getAttribute('data-add-to-cart')||'';
    if(/\/checkout(?:[/?#]|$)/.test(href)||name==='checkout')send('checkout_started',{source:target||'click'});
    if(name==='add'||/add[-_ ]?to[-_ ]?cart/i.test(classes+' '+act))send('add_to_cart',{source:target||'click'});
  },true);

  document.addEventListener('submit',function(ev){
    var f=ev.target instanceof HTMLFormElement?ev.target:null;if(!f)return;var a=f.getAttribute('action')||'';
    if(/\/cart\/add/.test(a))send('add_to_cart',{source:'form'}); if(/\/checkout/.test(a))send('checkout_started',{source:'form'});
  },true);

  if(window.fetch){
    var originalFetch=window.fetch.bind(window);
    window.fetch=async function(){
      var args=Array.prototype.slice.call(arguments), input=args[0], u=typeof input==='string'?input:(input&&input.url)||String(input), response=await originalFetch.apply(window,args);
      try{var p=new URL(u,location.origin);if(response.ok&&/\/cart\/add(?:\.js)?$/.test(p.pathname))send('add_to_cart',{source:'ajax'});}catch(e){}
      return response;
    };
  }

  if(window.XMLHttpRequest){
    var open=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(method,url){
      var args=Array.prototype.slice.call(arguments), p='';try{p=new URL(String(url),location.origin).pathname}catch(e){}
      if(/\/cart\/add(?:\.js)?$/.test(p)){this.addEventListener('load',function(){if(this.status>=200&&this.status<400)send('add_to_cart',{source:'xhr'});},{once:true});}
      return open.apply(this,args);
    };
  }

  var milestones=[25,50,75,90,100], reached={};
  var scroll=function(){var max=Math.max(1,document.documentElement.scrollHeight-innerHeight), d=Math.max(0,Math.min(100,Math.round(scrollY/max*100)));milestones.forEach(function(m){if(d>=m&&!reached[m]){reached[m]=1;send('scroll_depth',{depth:m});}})};
  addEventListener('scroll',scroll,{passive:true}); setTimeout(scroll,700);

  var wrap=function(k){var fn=history[k];if(typeof fn!=='function')return;history[k]=function(){var r=fn.apply(this,arguments);reached={};setTimeout(page,0);return r;}};
  wrap('pushState');wrap('replaceState');addEventListener('popstate',function(){reached={};setTimeout(page,0)});
  window.__TP_GROWTH_STATUS__={version:'2026-09-09.3',collector:COLLECTOR,sessionId:sid};
})();`;

export const GET: RequestHandler = async () => new Response(SOURCE, {
  headers: {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*'
  }
});
