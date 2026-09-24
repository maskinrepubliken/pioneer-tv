# Ordbild

Visar ordbilden som en bild ur resursgruppen Logotyp, i rätt bredd och med rätt alternativtext.

Konsumenten skickar `src` — en URL till en av filerna i gruppen Logotyp — och väljer färgvariant efter ytan komponenten står på. Filerna kan inte ärva färg: `ordbild-*-black.svg` på ljusa ytor, `-papper.svg` på `surface-ink`, `surface-forest` och `surface-rust`, `-ockra.svg` bara på bläck och skog.

Använd tvåradaren när det finns plats och enradaren i sidhuvud, sidfot och e-postsignatur. `bredd` är px och går aldrig under 120.

- Rita aldrig om ordbilden och sätt den aldrig på nytt i Rubik. Bredderna är hela greppet.
- Ingen skugga, kontur, lutning eller gradient. Lägg inget ovanpå den.
- Sätt `alt=""` om samma namn står i text intill, annars läses det två gånger.
- Taglinen ingår inte. Sätt den som text under blocket, vänsterställd mot samma kant.
