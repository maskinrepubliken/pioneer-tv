Hålkort och skog. Ordbilden bär namnet, perforeringen bär ytorna, och färgerna är höst i en lövskog — varmt, i en bransch som annars är genomgående blå.

I tryck och på affisch vilar systemet på bläck: stora mörka ytor med ljus som tränger genom. I produkt och på webb vänds det. Där är `paper` botten, ytorna är lugna och ljusa, och bläcket är det man läser med — inte det man simmar i. Det är samma varumärke; skillnaden är att en skärm läses i timmar och en affisch i tre sekunder. Bläckytorna finns kvar, men som block: sidhuvud, hero, sidfot, ett enstaka fält.

## Rösten

Skriv som någon som gör arbetet själv, till någon som redan har för mycket att göra.

- Ni om läsaren, vi om oss. Aldrig *man*.
- Korta påståenden före brasklappar. "Era data är era. Ni kan byta leverantör när ni vill."
- Siffror i stället för adjektiv: "två veckor", "32 av 42 system", inte "snabbt" och "heltäckande".
- Inga emojier, inga utropstecken, ingen versalisering för eftertryck. Eftertrycket ligger i `affisch`.
- Säg aldrig att ni står naturen nära. Sidan ser ut så.
- Rubriker i `affisch` är versaler och högst fyra ord. Allt annat är versalgemener.

## Färg

Fem färger, och bara fem. `ink` och `paper` är grunden, `ochre` är signalen, `surface-forest` och `surface-rust` är de andra ytorna.

- Sätt sidan i `paper`. Lyft kort och paneler till `paper-raised`, sänk tabellrader och fält till `paper-sunken`. Skilj dem åt med `line`, aldrig med skugga: systemet har inga skuggor, inga toningar och inga konturer.
- Sätt all text i `ink`, sekundär text i `ink-muted`, etiketter i `ink-faint`. Gå aldrig ljusare än `ink-faint`, och byt aldrig ut en textfärg mot opacitet.
- Ge varje kontroll — fält, knapp, kort man kan klicka — en kant i `line-strong`. `line` räcker inte; den är en regel mellan rader, inte en kant.
- `ochre` är ljuset genom hålen. Använd den som knappfyllning, som hål i perforeringen och som en signal i taget. Aldrig som sidbakgrund: `paper` på `ochre` är 1,3:1, och stora ockrafält bränner.
- `surface-ink`, `surface-forest` och `surface-rust` är hela block, inte tonplattor. Text på dem är `on-dark`; en fokusring på dem är `focus-on-dark`.
- `surface-forest` och `surface-rust` möter aldrig varandra — de ligger 1,45:1 isär i ljushet.
- Länkar är `link` och alltid understrukna.

### Uppmätt kontrast

| Par | Papper | Bläck | E-ink |
| --- | --- | --- | --- |
| `ink` på `paper` | 15,6:1 | 15,6:1 | 14,5:1 |
| `ink-muted` på `paper-sunken` | 7,3:1 | 10,9:1 | 7,2:1 |
| `ink-faint` på `paper-sunken` | 5,6:1 | 7,0:1 | 5,2:1 |
| `ink-faint` på `paper-hover` | 5,3:1 | 5,3:1 | 4,8:1 |
| `link` på `paper` | 9,0:1 | 11,9:1 | 7,2:1 |
| `alarm` på `paper-sunken` | 6,4:1 | 6,8:1 | 4,9:1 |
| `on-dark` på `surface-rust` | 6,2:1 | 6,2:1 | 5,6:1 |
| `on-ochre` på `ochre` | 11,9:1 | 11,9:1 | 10,3:1 |
| `focus-on-dark` mot `surface-rust` | 4,7:1 | 4,7:1 | 4,0:1 |
| `line-strong` mot `paper-sunken` | 3,6:1 | 3,9:1 | 3,2:1 |

### Status bärs aldrig av färg ensam

`surface-forest`, `surface-rust` och `alarm` ligger inom 1,5:1 från varandra i ljushet. Det är paletten som den är tryckt, och den ändras inte — men den gör att ingen får läsa av ett läge på färgen. Sätt alltid ett ord, en siffra eller en fylld/ofylld form bredvid: "3 av 7 klara", ett ifyllt hål mot ett tomt, ordet *Fel* framför `alarm`-texten. På ett e-ink-glas är det skillnaden mellan en status och en gråtonsfläck.

`alarm` är tillagd — den finns inte i den tryckta paletten, och den hör hemma i validering och felmeddelanden, ingen annanstans.

## Typografi

Tre röster, fyra typsnitt, alla från Google Fonts: Rubik, Fraunces, IBM Plex Sans, IBM Plex Mono.

- **Rubik Black** är affischrösten. `affisch-webb`, `affisch-mobil`, `affisch` och `sektion` — alltid versaler, en stor rad per yta. Ordbilden i sidhuvudet räknas inte som den raden. `avdelning` är ögonbrynet över rubriken, i `surface-rust`.
- **Fraunces** är resonemanget. All löptext i `brodtext`; ingressen i `ingress`; citat, mellanrubriker och taglinen i `citat` eller `bildtext`, alltid kursiv. Fraunces vill ha luft — under 12 px tappar den, och där tar Gränssnitt över.
- **IBM Plex Sans** är gränssnittet: `knapp-stor`, `knapp`, `navigation`, `formular`. Här, inte i Fraunces, sätts allt som klickas.
- **IBM Plex Mono** är maskinen: `data`, `tabellrad`, `etikett`. Alla siffror sätts här — tabeller, fakturarader, summor, systemnamn och diarienummer. Plex är ritad för IBM, samma företag som gjorde hålkorten.

Ordbilden är ritad mot Rubiks bredder. Byts typsnittet måste ordbilden ritas om.

## Ytor, mått och form

- Knappar är kapslar: `radius-pill`, `ochre` fyllning, `on-ochre` text. Sekundär knapp: `paper` fyllning, `line-strong` kant, `ink` text.
- Kort är `radius-card`, paneler `radius-panel`, fält och kodblock `radius-m`. Rundheten sitter i typsnittet och i radierna — perforeringens hål och rutnätets kanter är raka och exakta.
- Luft kommer ur `space-1` till `space-10`. Sidans innerkant på webben är `space-10`, i ett dokument `space-8`, i ett kort `space-6`.
- Löptext är högst 66 tecken bred, i kort högst 34.
- Ingen rörelse utom det som svarar på en klickning: ett byte till `paper-hover`, direkt, utan övergång. Inga inglidande sektioner, ingen parallax. Ett e-ink-glas ritar om sig 8 gånger i sekunden och gör allt sådant till smet.

### Tillstånd

| Tillstånd | Vad som ändras |
| --- | --- |
| Hover | Ytan byter till `paper-hover`. Aldrig opacitet, aldrig skugga. |
| Fokus | Heldragen ring, 2 px, 2 px luft: `focus` på ljus yta, `focus-on-dark` på `surface-*`. Aldrig enbart en färgändring. |
| Vald | `surface-forest` kant eller `ochre` markör plus ett ord. Aldrig enbart fyllningen. |
| Inaktiv | `paper-sunken` yta, `ink-faint` text, `line` kant. |
| Fel | `alarm` text plus ordet, `alarm` kant på fältet. |

## Motiv och ikoner

Systemet har inget ikonbibliotek. Det har tre motivsläkten — årsringar, stammar och rötter — och en yta, perforeringen. Allt är ritat med cirklar och rundade ändar, linjen avtar där formen tunnar ut, och det ritas i `ochre` eller `on-dark` på en `surface-*`-yta.

Behövs riktiga gränssnittsikoner, ta ett streckbaserat öppet bibliotek med runda ändar och 1,5–2 px linje (Lucide ligger närmast handen), i `ink` eller `ink-muted`, 20 px. Det är ett tillägg, inte en del av den tryckta guiden — flaggat här så ingen tror att det är beslutat.

Reglerna för motiven och hålkortets rutnät står i **Perforering och motiv**; det som gäller läsplattor och e-ink-paneler står i **E-ink**.

## Komponenter

Webbdelarna finns byggda i `window.Maskinrepubliken`: `Nav`, `Hero`, `SektionsRubrik`, `Kort`, `Knapp`, `Bricka`, `Ordbild`, `Perforering`, `RingMatare` och `Sidfot`. Klasserna i `bundle.css` går att använda utan React — komponenterna sätter inga färger själva, allt går via tokens, så ett temabyte räcker för att flytta en sida till e-ink.

Läs kortet för en komponent innan du använder den: den säger vad konsumenten skickar in och vad som inte får göras.

## Aldrig

- Ockra som stor bakgrundsyta. Fyrkantiga hål. Hålen är cirklar, alltid.
- Rost på skog, eller papper på ockra.
- Toning, skugga, kontur eller lutning — på ordbilden eller på något annat.
- Träd, löv, granar, kottar eller fotograferad barrskog. Skogen finns i ljuset, färgen, tiden och rötterna.
- Två motiv i samma ögonkast, eller ett motiv bakom löpande text.
- En mätare som räknar något som inte räknas. Då är den dekoration som låtsas vara data.
