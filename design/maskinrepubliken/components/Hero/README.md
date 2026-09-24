# Hero

Sidans öppning: bläckyta, affischraden i Rubik Black, en ingress i Fraunces, en knapp och en rad brickor under en linje.

Konsumenten skickar `rubrik` (bryt raderna själv med `br`), `ingress`, `knapp`, valfritt `loft` — den kursiva ockraraden bredvid knappen — och `brickor` som en lista med korta texter.

Rubriken renderas som `h1`. Under 720 px växlar den till mobilens 50 px.

- Högst tre rader i rubriken, högst fyra ord per rad.
- Ingressen är högst 54 tecken bred.
- En Hero per sida, och den bär sidans enda affischrad.
- Hero sätter ingen egen navigering. Lägg en Nav ovanför med `paMork`.
