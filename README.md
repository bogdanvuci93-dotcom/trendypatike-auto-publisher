# TrendyPatike Auto Publisher

Automatski Instagram carousel sistem za TrendyPatike.

Svaki dan workflow može da uradi sledeće:

1. izabere sneaker temu,
2. istraži temu web pretragom,
3. napiše ultra-kratak tekst na srpskom,
4. nezavisno fact-checkuje isti tekst drugim AI prolazom,
5. generiše 3 tematske AI slike,
6. preko slika renderuje zaključani TrendyPatike dizajn,
7. napravi 3 JPG slajda u formatu 1080×1350,
8. objavi ih kao Instagram carousel preko zvaničnog Instagram API-ja.

## Bezbednost

Početno podešavanje je `DRY_RUN=true`. To znači da sistem može da istraži, generiše i proveri post, ali ga neće objaviti na Instagram dok eksplicitno ne promenimo varijablu na `false`.

Fact-check zaštite:

- koristi web search pri pisanju,
- zatim drugi AI prolaz ponovo proverava web,
- ograničen je na trusted domene po temi,
- minimum 2 konkretna source URL-a,
- svaka tvrdnja mora da referencira izvor,
- ako verifier nije siguran, tema se odbacuje,
- bot pokušava drugu temu umesto da objavi sumnjivu informaciju,
- kratki tekst je hard-limitovan da carousel ne postane zid teksta.

## Dizajn

Dizajn je zaključan u `src/render.mjs`:

- 1080×1350 / 4:5,
- TrendyPatike zelena `#037361`,
- isti zeleni okvir,
- isti logo,
- isti header,
- isti `01 / 03`, `02 / 03`, `03 / 03`,
- isti footer `trendypatike.com`,
- isti condensed editorial stil,
- AI generiše samo pozadinsku fotografiju; tekst i branding se renderuju kodom i zato ostaju konzistentni.

## Raspored

Workflow je podešen na:

**19:35 — Europe/Belgrade — svaki dan**

Fajl: `.github/workflows/daily.yml`

## GitHub Secrets koje treba dodati

Repo → Settings → Secrets and variables → Actions → Secrets:

- `OPENAI_API_KEY`
- `IG_ACCESS_TOKEN`
- `IG_USER_ID`

Nikada ne stavljati ove vrednosti direktno u kod ili commit.

## GitHub Variables

Repo → Settings → Secrets and variables → Actions → Variables:

- `DRY_RUN` = `true`
- `TEXT_MODEL` = `gpt-5`
- `VERIFY_MODEL` = `gpt-5`
- `IMAGE_MODEL` = `gpt-image-1-mini`
- `IMAGE_QUALITY` = `medium`
- `IG_API_VERSION` = `v25.0`

Kada prvi test bude savršen, jedina promena za pravo automatsko objavljivanje je:

`DRY_RUN=false`

## Prvi test

GitHub → Actions → **TrendyPatike Daily Carousel** → Run workflow.

Dok je `DRY_RUN=true`, rezultat će biti sačuvan u `public/posts/...` zajedno sa `metadata.json`, ali Instagram publish će biti preskočen.

## Teme

`data/topics.json` sadrži početnih 30 tema. Kada se one potroše, bot može da istraži i predloži novu temu koja se ne ponavlja.

## Lokalni test

Node.js 22+

```bash
npm install
cp .env.example .env
npm run check
npm run run
```

`.env` je ignorisan kroz `.gitignore`.

## Važno

Instagram nalog mora biti Professional (Business ili Creator) i token mora imati potrebnu content-publishing dozvolu. Slike se objavljuju kao pravi Instagram carousel preko media container → carousel container → media_publish flow-a.
