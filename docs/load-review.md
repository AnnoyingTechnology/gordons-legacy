# Load review

The app reviews every simulated load and shows one list of findings, with a level on a four-step scale:
no flag, note, caution, danger (`packages/app/src/analysis/load-assessment.ts`, requested in issues #2
and #13). It goes beyond GRT, which only coloured a peak above the maximum.

The review knows only what the model predicts. No flag never means safe; the UI says so.

## Maxima

A load is checked against every maximum it knows, the lowest first:

- CIP's Pmax and SAAMI's MAP, entered by the user (`cartridge.standardMaxPressures`), else the caliber
  definition's `maxPressure` under its own `standard` (CIP or SAAMI);
- the load's own maximum (GRT's `pMaxZul`) when it differs from both by more than 0.5 %.

GRT's `method` field can't tell which standard a value comes from: it says `Piezo CIP` even for the
SAAMI 3,792 bar (55,000 psi) of a .223 Rem. load. The two bodies measure differently (CIP through a
drilled case, SAAMI with a conformal transducer), so their values don't convert into each other.

## Findings

| Finding | Level | Rule |
|---|---|---|
| Above a maximum | danger | peak > any maximum (one finding per maximum exceeded) |
| Near the maximum | caution | peak ≥ 90 % of the lowest maximum: less margin than the model's uncertainty (chronograph study: 11–13 % RMS velocity error, docs/model/validation.md) |
| Bench variations | caution | 1 % more powder, 0.5 mm deeper, 2 % less capacity, 1 % heavier bullet together exceed the lowest maximum |
| Double charge fits | caution, or note when the doubled charge stays under the maximum | case fill ≤ 55 %: a double charge fills ≤ 110 % and pours in below the mouth. A check for a loading mistake, not a statement about the load; the double charge is simulated. On the maintainer's nine loads at ≤ 55 % fill, doubled peaks are 118–375 % of the maximum (300 BLK subsonic with A1 118–214 %, N105 168 %; .38 Special 225–375 %): pressure grows much faster than the charge, so a doubled subsonic load is not merely supersonic |
| Heavily compressed | caution | case fill > 110 % (GRT refuses 120 %) |
| Compressed | note | case fill 100–110 % |
| Low fill | note | case fill < 60 %: position-sensitive ignition, spread |
| Incomplete burn | note | < 85 % burnt at the muzzle |
| Low pressure | note | peak < 35 % of the lowest maximum |
| Transonic | note | muzzle velocity between Mach 0.95 and 1.1 at the powder temperature |
| Hot day | caution / note | powder at 40 °C: above the lowest maximum (caution); a subsonic load leaves the subsonic range (note) |
| Cold day | note | powder at −15 °C: a supersonic load drops out of the supersonic range; burn falls below 85 % |

The cold and hot days (−15 °C and 40 °C) are the maintainer's choice (issue #13; cold moved from −5 °C to −15 °C on 2026-10-14): a load worked up
between about 14 and 26 °C, used in winter or in the desert. Climate findings are not a verdict: a load
for one season, or for accuracy in steady conditions, need not pass both.

The thresholds are judgement, not published standards; they are constants with their reasons in the
module, to be revised with the maintainer and with measured data.

## Speed of sound

c = √(γ R T / M) for dry air (γ = 1.4, M = 0.0289644 kg/mol): 340.3 m/s at 15 °C. It doesn't depend on
atmospheric pressure. The powder temperature stands in for the air temperature. The transonic band is
Mach 0.95 to 1.1: the standard drag functions rise steeply near Mach 1, and below 0.95 a subsonic load
keeps a margin that the speed of sound's 0.17 %/K change doesn't eat.
