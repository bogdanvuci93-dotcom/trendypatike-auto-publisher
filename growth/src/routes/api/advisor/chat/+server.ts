import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { validOrderSql } from '$lib/server/orders';

const DAY = 86400000;
const pct = (a:number,b:number) => b ? (a/b)*100 : 0;
const fmt = (n:number) => new Intl.NumberFormat('sr-RS',{maximumFractionDigits:1}).format(n);

type Action = { id:string; label:string; kind:'link'|'sync'; href?:string; provider?:'shopify'|'meta'; tone?:'primary'|'warn' };

export const POST: RequestHandler = async ({ request, platform }) => {
  const db = platform?.env?.DB;
  if (!db) return json({ ok:false, error:'D1 nije dostupan' }, { status:503 });
  const body = await request.json().catch(()=>({})) as { message?:string; period?:string };
  const message = String(body.message || '').trim().slice(0,800);
  if (!message) return json({ ok:false, error:'Napiši pitanje.' }, { status:400 });

  const now = Date.now();
  const period = ['today','yesterday','7d','30d'].includes(String(body.period)) ? String(body.period) : '7d';
  let from = now - 7*DAY, to = now;
  if(period==='today'){ const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Belgrade'})); d.setHours(0,0,0,0); from=d.getTime(); }
  if(period==='yesterday'){ const d=new Date(new Date().toLocaleString('en-US',{timeZone:'Europe/Belgrade'})); d.setHours(0,0,0,0); to=d.getTime(); from=to-DAY; }
  if(period==='30d') from=now-30*DAY;

  const dayFrom = new Date(from).toISOString().slice(0,10);
  const dayTo = new Date(Math.max(from,to-1)).toISOString().slice(0,10);

  const [shop,sessions,topExit,topProduct,meta] = await Promise.all([
    db.prepare(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM shopify_orders WHERE ${validOrderSql()} AND created_at>=?1 AND created_at<?2`).bind(from,to).first<any>(),
    db.prepare(`SELECT COUNT(DISTINCT s.id) sessions,
      COUNT(DISTINCT CASE WHEN e.type='product_view' THEN s.id END) product_views,
      COUNT(DISTINCT CASE WHEN e.type='add_to_cart' THEN s.id END) atc,
      COUNT(DISTINCT CASE WHEN e.type='checkout_started' THEN s.id END) checkout,
      COUNT(DISTINCT CASE WHEN s.purchased=1 THEN s.id END) purchased,
      COUNT(DISTINCT CASE WHEN e.type='rage_click' THEN s.id END) rage,
      COUNT(DISTINCT CASE WHEN e.type='dead_click' THEN s.id END) dead
      FROM sessions s LEFT JOIN events e ON e.session_id=s.id AND e.event_ts>=?1 AND e.event_ts<?2
      WHERE s.started_at>=?1 AND s.started_at<?2`).bind(from,to).first<any>(),
    db.prepare(`SELECT path, COUNT(DISTINCT session_id) exits,
      AVG(CAST(json_extract(meta_json,'$.activeMs') AS REAL)) active_ms,
      AVG(CAST(json_extract(meta_json,'$.maxScroll') AS REAL)) scroll
      FROM events WHERE type='page_exit' AND event_ts>=?1 AND event_ts<?2 GROUP BY path ORDER BY exits DESC LIMIT 1`).bind(from,to).first<any>(),
    db.prepare(`SELECT MAX(i.title) title, COUNT(DISTINCT o.id) orders, SUM(i.line_total) revenue
      FROM shopify_order_items i JOIN shopify_orders o ON o.id=i.order_id
      WHERE ${validOrderSql('o')} AND o.created_at>=?1 AND o.created_at<?2
      GROUP BY COALESCE(i.product_id,i.title) ORDER BY revenue DESC LIMIT 1`).bind(from,to).first<any>(),
    db.prepare(`SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(impressions),0) impressions,
      COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(purchases),0) purchases, COALESCE(SUM(purchase_value),0) purchase_value,
      COALESCE(SUM(reach),0) reach, COALESCE(SUM(link_clicks),0) link_clicks, COALESCE(SUM(landing_page_views),0) landing_views,
      COALESCE(SUM(add_to_cart),0) atc, COALESCE(SUM(checkouts),0) checkouts
      FROM meta_daily WHERE day>=?1 AND day<=?2`).bind(dayFrom,dayTo).first<any>()
  ]);

  const s = Number(sessions?.sessions||0), pdp=Number(sessions?.product_views||0), atc=Number(sessions?.atc||0), checkout=Number(sessions?.checkout||0), purchased=Number(sessions?.purchased||0);
  const atcRate=pct(atc,pdp||s), checkoutRate=pct(checkout,atc), purchaseRate=pct(purchased,checkout||s);
  const spend=Number(meta?.spend||0), impressions=Number(meta?.impressions||0), clicks=Number(meta?.clicks||0), mp=Number(meta?.purchases||0), pv=Number(meta?.purchase_value||0);
  const ctr=pct(clicks,impressions), cpc=clicks?spend/clicks:0, cpm=impressions?spend/impressions*1000:0, roas=spend?pv/spend:0;
  const q=message.toLowerCase();
  const actions:Action[]=[];
  let title='Analiza prodavnice';
  const evidence:string[]=[];
  let answer='';

  const funnelText = `U izabranom periodu imaš ${s} sesija, ${pdp} sesija sa proizvodom, ${atc} ATC, ${checkout} checkout i ${purchased} potvrđenih kupovina povezanih sa tracker sesijom. PDP→ATC je ${fmt(atcRate)}%, ATC→checkout ${fmt(checkoutRate)}%, a checkout→kupovina ${fmt(purchaseRate)}%.`;

  if(/oglas|meta|ads|cpm|ctr|cpc|roas|kampanj/.test(q)){
    title='Meta Ads — šta podaci govore';
    answer=`${funnelText} Meta je potrošila ${fmt(spend)} u valuti naloga, CTR je ${fmt(ctr)}%, CPC ${fmt(cpc)}, CPM ${fmt(cpm)}, a ROAS ${fmt(roas)}. ${clicks>=20 && atcRate<4 ? 'Oglasi dovode klikove, ali veliki deo problema nastaje posle klika — prioritet je proizvodna stranica, ponuda i izbor veličine, ne povećanje budžeta.' : mp===0 && spend>0 ? 'Nema pripisanih Meta kupovina, zato ne bih povećavao budžet dok se ne proveri funnel posle klika.' : 'Rezultat oglasa treba čitati zajedno sa storefront funnelom, ne samo po CTR-u.'}`;
    evidence.push(`Spend ${fmt(spend)}`,`CTR ${fmt(ctr)}%`,`CPC ${fmt(cpc)}`,`CPM ${fmt(cpm)}`,`ROAS ${fmt(roas)}`);
    actions.push({id:'ads',label:'Otvori detalje oglasa',kind:'link',href:'/ads',tone:'primary'},{id:'meta-sync',label:'Osveži Meta sada',kind:'sync',provider:'meta'});
  } else if(/checkout|korpa|cart|atc|odust|kupovin/.test(q)){
    title='Gde kupci odustaju';
    let bottleneck='Najveći pad trenutno nije moguće pouzdano izdvojiti.';
    if(pdp>=5 && atcRate<5) bottleneck=`Najveći problem je pre korpe: samo ${fmt(atcRate)}% sesija sa proizvodom dodaje u korpu. Fokusiraj cenu, veličine, dostavu, CTA i poverenje na PDP-u.`;
    else if(atc>=3 && checkoutRate<40) bottleneck=`Najveći problem je posle ATC: samo ${fmt(checkoutRate)}% ATC sesija nastavlja na checkout. Proveri cart drawer, cenu dostave, checkout CTA i neočekivane troškove.`;
    else if(checkout>=3 && purchaseRate<45) bottleneck=`Najveći problem je checkout: samo ${fmt(purchaseRate)}% checkout sesija ima potvrđenu kupovinu. Prioritet su checkout friction, dostava, način plaćanja i poverenje.`;
    answer=`${funnelText} ${bottleneck}`;
    evidence.push(`PDP→ATC ${fmt(atcRate)}%`,`ATC→Checkout ${fmt(checkoutRate)}%`,`Checkout→Kupovina ${fmt(purchaseRate)}%`);
    actions.push({id:'sessions',label:'Pusti najbitnije replay-e',kind:'link',href:'/sessions?filter=important',tone:'primary'},{id:'heat',label:'Otvori Heatmaps',kind:'link',href:'/heatmaps'});
  } else if(/proizvod|patik|model|lot|šta da menj|sta da menj/.test(q)){
    title='Proizvodi — šta prvo menjati';
    const top=String(topProduct?.title||'');
    answer=`${funnelText} ${top ? `Najviše prihoda u periodu nosi ${top} (${fmt(Number(topProduct?.revenue||0))} RSD). ` : ''}${atcRate<4 ? 'Prvo bih radio na proizvodnoj stranici: jasniji izbor veličine, vidljivija dostava/rok, jači CTA iznad prevoja i više poverenja oko zamene/povrata.' : 'PDP nije očigledno glavno usko grlo; proveri korpu i checkout pre većih promena na proizvodu.'}`;
    if(top) evidence.push(`Top proizvod: ${top}`,`Prihod: ${fmt(Number(topProduct?.revenue||0))} RSD`);
    evidence.push(`PDP→ATC ${fmt(atcRate)}%`);
    actions.push({id:'products',label:'Otvori proizvode',kind:'link',href:'/products',tone:'primary'},{id:'heat',label:'Pogledaj klikove na PDP-u',kind:'link',href:'/heatmaps'});
  } else {
    title='Šta bih sada uradio';
    const exit = topExit?.path ? ` Najčešći izlaz je ${topExit.path} (${Number(topExit.exits||0)} izlaza; prosečno aktivno ${Math.round(Number(topExit.active_ms||0)/1000)} s).` : '';
    answer=`${funnelText}${exit} ${atcRate<4 ? 'Prvi prioritet: PDP→ATC je slab — proveri proizvodnu stranicu i replay sesije bez ATC.' : checkoutRate<40 && atc>0 ? 'Prvi prioritet: ljudi dodaju u korpu ali ne nastavljaju na checkout — pregledaj ATC bez checkout replay-e.' : purchaseRate<45 && checkout>0 ? 'Prvi prioritet: checkout gubi previše ljudi — pregledaj checkout bez kupovine.' : 'Nema jednog dramatičnog uskog grla; sledeće proveri Meta kvalitet saobraćaja i stranice sa najviše izlaza.'}`;
    evidence.push(`Sesije ${s}`,`PDP ${pdp}`,`ATC ${atc}`,`Checkout ${checkout}`,`Kupovine ${purchased}`);
    actions.push({id:'sessions',label:'Otvori najbitnije sesije',kind:'link',href:'/sessions?filter=important',tone:'primary'},{id:'shop-sync',label:'Osveži Shopify',kind:'sync',provider:'shopify'},{id:'meta-sync',label:'Osveži Meta',kind:'sync',provider:'meta'});
  }

  return json({ok:true,title,answer,evidence,actions,period,generatedAt:Date.now(),limitations:'Mogu automatski da osvežim podatke i odvedem te na tačan problem. Izmene Shopify teme/proizvoda još ne izvršavam bez posebne write dozvole i potvrde.'});
};
