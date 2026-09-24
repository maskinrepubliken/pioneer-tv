# Nav

Sidhuvudet: ordbilden till vänster, länkarna till höger och en primär knapp sist.

Konsumenten skickar `ordbild` — vanligen enradaren — och `lankar` som en lista av `{ text, href, aktiv }`. Den aktiva sidan markeras med `aria-current` och en understrykning. `knapp` är valfri.

`paMork: true` ger bläckbotten, vilket är grundläget på en sida som öppnar med en Hero.

- Tre till fem länkar. Är de fler hör resten hemma i sidfoten.
- Ordbilden i sidhuvudet räknas inte som sidans stora rad — Hero äger den.
- Aktiv sida markeras med en linje, aldrig med enbart en färg eller en tonad opacitet.
