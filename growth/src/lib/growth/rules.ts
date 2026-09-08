export type RecommendationStatus = 'SCALE' | 'KEEP' | 'WATCH' | 'PAUSE' | 'WEBSITE_ISSUE' | 'LOW_SAMPLE';

export type AdSnapshot = {
  spend: number;
  revenue: number;
  purchases: number;
  ctr: number;
  cpc: number;
  atcRate: number;
  checkoutRate?: number;
};

export type Recommendation = {
  status: RecommendationStatus;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
  budgetChangePct?: number;
};

export function recommendAd(ad: AdSnapshot, targetCPA = 900): Recommendation {
  const roas = ad.spend > 0 ? ad.revenue / ad.spend : 0;
  const cpa = ad.purchases > 0 ? ad.spend / ad.purchases : Infinity;

  if (ad.spend < targetCPA && ad.purchases < 2) {
    return { status: 'LOW_SAMPLE', confidence: 'low', reason: 'Nema dovoljno potrošnje ili kupovina za sigurnu odluku.' };
  }

  if (ad.purchases >= 5 && roas >= 3 && cpa <= targetCPA) {
    return { status: 'SCALE', confidence: 'high', reason: 'Stabilne kupovine, dobar ROAS i CPA ispod cilja.', budgetChangePct: 15 };
  }

  if (ad.purchases === 0 && ad.spend >= targetCPA * 2 && ad.atcRate >= 8) {
    return { status: 'WEBSITE_ISSUE', confidence: 'medium', reason: 'Oglas dovodi zainteresovane korisnike, ali kupovina puca kasno u funnelu.' };
  }

  if (ad.purchases === 0 && ad.spend >= targetCPA * 3 && ad.atcRate < 3) {
    return { status: 'PAUSE', confidence: 'high', reason: 'Velika potrošnja bez kupovina i slab signal namere za kupovinu.' };
  }

  if (roas >= 2) {
    return { status: 'KEEP', confidence: 'medium', reason: 'Performanse su pozitivne; nema dovoljno razloga za agresivnu promenu.' };
  }

  return { status: 'WATCH', confidence: 'medium', reason: 'Rezultati su mešoviti; sačekati još podataka pre promene budžeta.' };
}
