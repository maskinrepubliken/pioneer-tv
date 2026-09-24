# Knapp

Kapselknappen: ockra fyllning och bläcktext som primär åtgärd, och tre varianter för de lägen där den inte kan vara det.

Konsumenten skickar `children` som etikett. Finns `href` renderas en länk, annars en `button` med `type` och `onClick`.

`variant: 'sekundar'` ger papper med kant i `line-strong` för åtgärder bredvid den primära. `variant: 'pa-mork'` ger en genomskinlig knapp med kant i `on-dark`, för `surface-ink`, `surface-forest` och `surface-rust`. `storlek: 'stor'` är hero-knappen.

- En primär knapp per yta. Fler och ockran slutar vara en signal.
- Skriv verbet: "Boka ett samtal", inte "Klicka här".
- Kanten på den mörka varianten är heldragen `on-dark`, inte den tonade kant som finns i den tryckta guiden — genomskinliga kanter överlever inte ett e-ink-glas.
- Hover byter yta, aldrig opacitet. Fokus är en heldragen ring, aldrig bara en färgändring.
