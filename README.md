# Opční laboratoř

Česká vzdělávací hra pro bezpečné procvičení opčního chainu a základních strategií — bez účtu u brokera, bez reálných tickerů a bez skutečných peněz.

## Co umí první verze

- fiktivní tickery, opční chain pro call/put a ceny Bid/Ask,
- virtuální rozpočet **100 000 Kč**,
- každý kontrakt = **100 akcií**,
- sestavení vlastních nohou přímo z chainu,
- předvolby: Long Call, Long Put, Cash-Secured Put, Bull Call Spread, Bear Put Spread a Iron Condor,
- česky vysvětlené scénáře pro růst/pokles, max. zisk, max. riziko a break-even,
- posun simulovaného času o dny, změna ceny podkladu a přecenění otevřených pozic,
- uzavření pozice a sledování P/L.

## Spuštění

Aplikace nepoužívá externí závislosti:

```bash
npm test
npm start
# otevři http://localhost:4173
```

## Důležité omezení

Model cen je záměrně jednoduchý a deterministický pro výuku. Nejde o skutečná tržní data, oceňování ani investiční doporučení.
