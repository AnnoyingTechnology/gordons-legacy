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

CIP also defines, and GRT's cartridge designer shows, two pressures above Pmax: PK, the highest
permitted single statistical pressure (Pmax + 15 %), and PE, the mean proof pressure (Pmax + 25 %).
**Neither is shown here, deliberately.** They are criteria for testing a lot of factory ammunition
against a proof barrel, not headroom for a handload; beside a simulated peak they would read as
permission to go 15 % over the maximum. A future agent reaching for parity should leave them out.

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
| Case capacity typical | note | the load's capacity is within 0.3 % of the caliber file's typical value (GRT `V`): probably not measured |
| Case capacity far from typical | caution | more than 10 % from the typical value: brass makes differ by a few percent; a wrong entry or unit? |
| Monolithic bullet | note | the bullet's name matches a common all-copper or brass line (Barnes TSX/TTSX/LRX, Hornady GMX/CX, Nosler E-Tip, Lapua Naturalis, Hammer, Cutting Edge, Lehigh, Peregrine, Sako Powerhead…): harder to engrave, longer for its weight; makers publish separate data and recommend a jump (Barnes: at least 0.050″) |
| Early burnout, long barrel | note | burnout within 20 % of the travel and a barrel sweeping ≥ 10 case capacities: where the model over-predicted measured velocities by a median 15 % (validation.md) |
| Transonic | note | muzzle velocity between Mach 0.95 and 1.1 at the powder temperature |
| Temperature limit | note | past a powder temperature (colder or hotter than the load's), the peak exceeds the lowest maximum, the speed regime changes, the powder stops burning out, or the model can't simulate |

The temperature range (`analysis/temperature-range.ts`, the maintainer's scale, issue #13) simulates the
load from −50 to 50 °C every 5 °C, then refines each change to 0.5 °C by bisection: within limits where
the peak stays under the lowest maximum, the speed regime stays the load's own and the powder still burns
out. The review notes where the load leaves those limits on each side; it is not a verdict, since a load
for one season, or for accuracy in steady conditions, need not cover the range.

The thresholds are judgement, not published standards; they are constants with their reasons in the
module, to be revised with the maintainer and with measured data.

## Speed of sound

c = √(γ R T / M) for dry air (γ = 1.4, M = 0.0289644 kg/mol): 340.3 m/s at 15 °C. It doesn't depend on
atmospheric pressure. The powder temperature stands in for the air temperature. The transonic band is
Mach 0.95 to 1.1: the standard drag functions rise steeply near Mach 1, and below 0.95 a subsonic load
keeps a margin that the speed of sound's 0.17 %/K change doesn't eat.
