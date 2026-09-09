import type { RequestHandler } from './$types';

const SOURCE = String.raw`(() => {
  if (window.__TP_REPLAY_RECORDER__) return;
  window.__TP_REPLAY_RECORDER__ = true;

  var ORIGIN='https://trendypatike-growth.bogdanvuci93.workers.dev';
  var ENDPOINT=ORIGIN+'/api/replay/collect';
  var sid='';
  try{sid=(window.__TP_GROWTH_STATUS__&&window.__TP_GROWTH_STATUS__.sessionId)||localStorage.getItem('tp_growth_sid')||'';}catch(e){}
  if(!/^[A-Za-z0-9_-]{10,80}$/.test(sid))return;
  if(/^\/(account|challenge|password)(\/|$)/.test(location.pathname))return;

  var queue=[],sending=false,stopped=false,lastPointerAt=0,lastScrollAt=0,lastSnapshotAt=0,lastHtml='',snapshotCount=0,dirty=true,idleTimer=0;
  var importantPage=function(){return /^\/products\//.test(location.pathname)||/^\/cart(?:\/|$)/.test(location.pathname);};
  var safeLabel=function(el){try{if(!(el instanceof Element))return '';var v=el.getAttribute('aria-label')||el.getAttribute('title')||el.getAttribute('data-track')||'';if(!v)v=(el.textContent||'').replace(/\s+/g,' ').trim();return v.slice(0,100);}catch(e){return '';}};
  var push=function(ev){if(stopped)return;queue.push(ev);if(queue.length>160)queue.splice(0,queue.length-160);if(queue.length>=60)flush();};

  var sanitize=function(){
    try{
      var clone=document.documentElement.cloneNode(true);
      clone.querySelectorAll('script,noscript,iframe,object,embed,template').forEach(function(n){n.remove();});
      clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"],meta[http-equiv="content-security-policy"],meta[http-equiv="refresh"],link[rel="preload"],link[rel="prefetch"],link[rel="preconnect"]').forEach(function(n){n.remove();});
      clone.querySelectorAll('input').forEach(function(n){var type=String(n.getAttribute('type')||'text').toLowerCase();if(type!=='button'&&type!=='submit'&&type!=='reset'){n.setAttribute('value','');n.removeAttribute('checked');}n.removeAttribute('autocomplete');});
      clone.querySelectorAll('textarea').forEach(function(n){n.textContent='';});
      clone.querySelectorAll('select option').forEach(function(n){n.removeAttribute('selected');});
      clone.querySelectorAll('[contenteditable]').forEach(function(n){n.textContent='';});
      clone.querySelectorAll('form').forEach(function(n){n.setAttribute('action','#');n.setAttribute('autocomplete','off');});
      clone.querySelectorAll('a[href]').forEach(function(n){try{var u=new URL(n.getAttribute('href'),location.href);n.setAttribute('href',u.origin===location.origin?u.pathname:'#');}catch(e){n.setAttribute('href','#');}});
      var head=clone.querySelector('head');
      if(head){var base=document.createElement('base');base.href=location.origin+'/';head.prepend(base);var style=document.createElement('style');style.textContent='html{scroll-behavior:auto!important}body{pointer-events:none!important}input,textarea,select{color:transparent!important;text-shadow:none!important}';head.appendChild(style);}
      return '<!doctype html>'+clone.outerHTML;
    }catch(e){return '';}
  };

  var snapshot=function(force){
    if(stopped||snapshotCount>=3)return;
    if(!importantPage()&&!force)return;
    var now=Date.now();
    if(!force&&(!dirty||now-lastSnapshotAt<5000))return;
    var html=sanitize();
    lastSnapshotAt=now;
    if(!html||html.length>235000){dirty=false;return;}
    if(!force&&html===lastHtml){dirty=false;return;}
    lastHtml=html;dirty=false;snapshotCount++;
    push({kind:'snapshot',t:now,html:html,path:location.pathname||'/',vw:innerWidth,vh:innerHeight,x:scrollX,y:scrollY});
  };

  var scheduleSnapshot=function(force,delay){
    if(stopped||snapshotCount>=3||(!importantPage()&&!force))return;
    clearTimeout(idleTimer);
    idleTimer=setTimeout(function(){
      var run=function(){snapshot(Boolean(force));};
      try{if('requestIdleCallback' in window)window.requestIdleCallback(run,{timeout:1200});else setTimeout(run,0);}catch(e){setTimeout(run,0);}
    },Math.max(0,delay||0));
  };

  var flush=function(){
    if(sending||!queue.length||stopped)return;
    sending=true;
    var batch=queue.splice(0,Math.min(queue.length,80));
    var seq=(batch[0]&&batch[0].t)||Date.now();
    fetch(ENDPOINT,{method:'POST',mode:'cors',credentials:'omit',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:sid,seq:seq,events:batch})})
      .then(function(r){return r.json().catch(function(){return {};}).then(function(p){return {ok:r.ok,p:p};});})
      .then(function(res){if(res.p&&res.p.capped)stopped=true;else if(!res.ok)queue=batch.concat(queue).slice(-160);})
      .catch(function(){queue=batch.concat(queue).slice(-160);})
      .finally(function(){sending=false;});
  };

  try{new MutationObserver(function(){dirty=true;}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','src','hidden','aria-expanded']});}catch(e){}

  addEventListener('mousemove',function(ev){var now=Date.now();if(now-lastPointerAt<220)return;lastPointerAt=now;push({kind:'pointer',t:now,x:Math.round(ev.clientX),y:Math.round(ev.clientY)});},{passive:true});
  addEventListener('touchmove',function(ev){var now=Date.now();if(now-lastPointerAt<180)return;var t=ev.touches&&ev.touches[0];if(!t)return;lastPointerAt=now;push({kind:'pointer',t:now,x:Math.round(t.clientX),y:Math.round(t.clientY)});},{passive:true});
  addEventListener('scroll',function(){var now=Date.now();if(now-lastScrollAt<180)return;lastScrollAt=now;push({kind:'scroll',t:now,x:Math.round(scrollX),y:Math.round(scrollY)});},{passive:true});
  addEventListener('click',function(ev){push({kind:'click',t:Date.now(),x:Math.round(ev.clientX),y:Math.round(ev.clientY),label:safeLabel(ev.target)});if(importantPage()){dirty=true;scheduleSnapshot(false,900);}},true);
  addEventListener('visibilitychange',function(){push({kind:'visibility',t:Date.now(),state:document.visibilityState});if(document.visibilityState==='hidden')flush();});
  addEventListener('pagehide',function(){flush();});

  var routeChanged=function(){dirty=true;snapshotCount=0;scheduleSnapshot(false,1200);};
  var oldPush=history.pushState,oldReplace=history.replaceState;
  history.pushState=function(){var r=oldPush.apply(this,arguments);routeChanged();return r;};
  history.replaceState=function(){var r=oldReplace.apply(this,arguments);routeChanged();return r;};
  addEventListener('popstate',routeChanged);

  // Full DOM cloning is deliberately deferred until the browser is idle and is
  // limited to high-intent product/cart pages. Cursor/scroll signals stay light.
  scheduleSnapshot(false,1400);
  setInterval(flush,5000);
  window.__TP_REPLAY_STATUS__={version:'2026-09-09.2',endpoint:ENDPOINT,sessionId:sid,mode:'priority-idle'};
})();`;

export const GET: RequestHandler = async () => new Response(SOURCE, {
  headers: {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*'
  }
});
