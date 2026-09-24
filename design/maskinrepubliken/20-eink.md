# E-ink

Temat **E-ink (Kaleido)** visar inte en ny palett. Det visar vad ett färg-e-ink-glas faktiskt återger av den här: filtret framför bläcket sänker mättnaden till ungefär tre femtedelar och lyfter allt en aning, och panelens vita är ett ljust grått, inte ett varmt papper. Bygg och granska i det temat när målet är en läsplatta, så överraskar inget på glaset.

Det som ändras:

- `paper` blir `#e9e7e1` i stället för `#f4efe4`. Varmheten finns inte att hämta på ett Kaleido-glas — den ligger i typsnittet och i formen i stället.
- `surface-forest`, `surface-rust`, `ochre` och `alarm` tappar mättnad. `ochre` blir `#d8c381`: fortfarande ljuset genom hålen, men svagare. Räkna inte med att den syns tvärs över ett rum.
- `ink`, `on-ochre` och `focus` står kvar oförändrade. Bläcket är det panelen är bäst på.

## Rita för glaset

- **Ingen genomskinlighet.** Varje ton är en egen token, inte en opacitet över en annan yta. Därför finns `ink-muted`, `ink-faint`, `paper-sunken` och `paper-hover` som solida värden.
- **Ingen rörelse, inga övergångar.** En panel ritar om sig några gånger i sekunden och lämnar spöken efter sig. Tillståndsbyten sker direkt, som ett omslag: ny yta, ny kant.
- **Inga skuggor och inga toningar.** Systemet har ändå inga — här blir det också ett tekniskt krav. Djup ritas med `line-strong` och med `paper-raised` mot `paper-sunken`.
- **Håll kanter tjocka nog.** Under 1 px vid panelens egen upplösning försvinner en linje helt. Rita hårfina regler i `line`, kanter på kontroller i `line-strong` och minst 1 px vid faktisk pixeltäthet.
- **Perforeringen håller.** Hålen är solida cirklar i full täckning och är det som klarar glaset bäst av allt i systemet. Är något halvton, gör om det till hål.
- **Ingen status i färg.** Den regeln gäller överallt, men här är den obönhörlig: `surface-forest`, `surface-rust` och `alarm` blir tre nästan identiska mellangrå på ett gråskaleglas. Ett ord, en siffra eller ett ifyllt hål bär läget.
- **Typstorlek upp ett steg.** `tabellrad` på 13 px och `etikett` på 12 px är satta för skärm och tryck. På ett glas med långsam uppritning, sätt tabeller i `formular` och etiketter i `tabellrad` i stället.

## Gråskalepaneler

Ska systemet ut på en ren gråskalepanel — Carta, en äldre reMarkable — finns inget tema för det ännu. Tills det finns: rita i papperstemat, byt alla fem färgytorna mot `ink` och `paper`, och låt perforeringen, ordbilden och motiven bära identiteten ensamma. De är ritade för en färg från början.
