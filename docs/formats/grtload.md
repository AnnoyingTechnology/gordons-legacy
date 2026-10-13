# GRT `.grtload` format

Observed 2026-10-13 on 74 load files written by GRT `2021.2030-NIGHTLY` (67 of the maintainer's, 7 from
the CC0 corpus) and on the corpus's 49 `.caliber`, 48 `.projectile` and 12 `.propellant` files. GRT
publishes no specification, so treat anything not listed here as unknown and keep it when converting.
The importer is `packages/formats/src/grt/`.

## Encoding

- XML. Every string attribute value is URL-encoded (percent-encoding), and so is the text of `title`.
  Attribute values are in double quotes, except the root's `version`, in single quotes. The files hold
  no raw non-ASCII bytes.
- Decoded bytes are UTF-8 in newer files and Latin-1 in older ones (`Environ%2020%B0C`): try UTF-8
  strictly, then fall back to Latin-1. One of the maintainer's files has a character GRT already stored
  as U+FFFD (`%EF%BF%BD`), which can't be recovered.
- Numbers use a dot as the decimal separator. GRT writes full double precision
  (`36.829999999999998`).

## Structure

```
GordonsReloadingTool  version="2021.2030-NIGHTLY"
└─ InnerBallistikInput
   ├─ title
   ├─ config        name, value, unit, type, descr      (UI state, e.g. CurveFocusIdx)
   ├─ caliber       input*                              (cartridge and chamber)
   ├─ caliberfile   var* (name, value)                  (embedded copy of the caliber definition)
   ├─ gun           input*, leakagegroup/leakage/var*   (barrel; gas-leakage openings)
   ├─ projectile    input*
   ├─ propellant    input*
   └─ appendix      note*, Measurement*, gallery*       (notes, chronograph data, pictures)
```

`input` and `var` elements carry `name`, `value`, `unit`, `type` and `descr`. Read the unit from the
`unit` attribute; don't assume it.

## Inputs

Units as observed. Meanings marked (inferred) come from GRT's manual or context, not from a spec.

| Section | Name | Unit | Meaning |
|---|---|---|---|
| caliber | `CaliberName` | | Caliber name |
| caliber | `oal` | mm | Cartridge overall length |
| caliber | `caselen` | mm | Case length |
| caliber | `casevol` | cm³ | Case capacity |
| caliber | `Dz` | mm | Groove (or bore) diameter (inferred) |
| caliber | `Aeff` | mm² | Effective bore cross-section |
| caliber | `pMaxZul` | bar | Maximum permitted pressure (CIP) |
| caliber | `ps` | bar | Initial pressure, used by the simulation; always equal to the projectile's `gpressure`, which the simulation ignores |
| caliber | `sebert` | | Sebert factor: share of charge mass added to the projectile's effective mass |
| caliber | `method` | | Pressure-measurement method; always `Piezo CIP` so far |
| caliber | `shotshell` | | Shotshell flag (inferred) |
| gun | `GunName` | | Gun name |
| gun | `xe` | mm | Barrel length |
| gun | `twistlen` | mm | Twist length |
| gun | `mgun` | kg | Gun mass (recoil) |
| gun | `gjump`, `gjumpUnlock` | mm | Jump to the lands, and its override flag (inferred) |
| projectile | `ProjectileName`, `mname`, `pname`, `lotid` | | Name, maker, product, lot |
| projectile | `mp` | g | Projectile mass |
| projectile | `Dbul` | mm | Projectile diameter |
| projectile | `glen` | mm | Projectile length |
| projectile | `gdepth` | mm | Seating depth; always equals `caselen + glen − oal` |
| projectile | `g1bc`, `g7bc` | | Ballistic coefficients |
| projectile | `gfriction`, `gfrictionUnlock` | bar | Bullet resistance, relative to GRT's default (0 = default, may be negative; manual p. 33); the flag only unlocks the editor field |
| projectile | `gpressure` | bar | Initial pressure: the gas pressure at which the projectile starts to move (manual p. 33) |
| projectile | `gTailType` | | Base type: 0 flat, 1 hollow base, 2 boat-tail (order of the manual) |
| projectile | `gtailh`, `gTailDiaA`, `gTailDiaB` | mm | Cone length (or cavity depth) and its two end diameters, in either order |
| projectile | `gUBCS` | | Universal Bullet Classification Scheme code; no effect on simulation |
| projectile | `mode` | | `0`, or `userfile` for user-defined projectiles |
| propellant | `mname`, `pname`, `lotid` | | Maker, product, lot |
| propellant | `mc` | g | Charge mass |
| propellant | `Qex` | kJ/kg | Heat of explosion |
| propellant | `k` | | Ratio of specific heats |
| propellant | `eta` | cm³/kg (sic) | Covolume; the value is in cm³/g, see Known defects |
| propellant | `pc` | kg/m³ | Powder grain density (inferred) |
| propellant | `pcd` | kg/m³ | Powder bulk density (inferred) |
| propellant | `Ba` | | Dynamic vivacity |
| propellant | `a0`, `a1`, `z1`, `z2` | | Form-function parameters (three-phase burn model) |
| propellant | `pt` | °C | Powder temperature at firing; the model's reference is 21 °C |
| propellant | `tcc`, `tch` | | Change of `Ba` per °C below and above 21 °C; 0 = GRT's internal default (manual p. 14) |
| propellant | `laddercnt`, `laddermc` | –, g | Ladder: number of charges, the main one included (below 2: disabled), and the mass each step **subtracts**; `mc` is the ladder's maximum (manual p. 36; `Compute` in the binary) |
| propellant | `imageUuid`, `imageDetailUuid` | | Pictures in GRT's database |
| config | `CurveFocusIdx` | | Selected ladder curve (display state) |
| gun | `leakagegroup/leakage` | mm | `var`s `type` (always 0), `name`, `descr`, `position`, `width`, `height`; a revolver's cylinder gap is a `width` at a `position` |

`caliberfile` holds about a hundred `var` entries: CIP drawing dimensions (`L0`–`L6`, `R`, `P0`–`P2`,
`G1`, `H1`…, plus `c_`-prefixed counterparts), `Pmax`, `cipname` (short caliber name), `ciptype`,
`cipdate`, `ciprevdate` and authorship fields.

## Measurements

```
Measurement  index, title, showinreport
└─ charge    name, note, value, source, menu, menuunit, menuvalue, expanded, expandedstats, showinreport
   └─ shot   name, note, velocity, pressure
```

- `charge/@value` is the charge mass in **kg**. `shot/@velocity` is in m/s. `shot/@pressure` is 0 in
  every file seen, so its unit is unknown (bar assumed).
- `expanded`, `expandedstats`, `menu`, `menuunit`, `menuvalue` and `sourceoptions` hold the state of
  GRT's measurement table. `source` was always empty.
- `note` often names the gun used, which may differ from the load's `gun` section.
- GRT copies its demo chronograph data into new loads. Charges whose note contains
  `EXAMPLE ONLY! DO NOT USE THIS LOAD` aren't user data: drop them on import.
- Shots with a velocity of 0 are empty rows.

## Notes and pictures

- `note` has `title`, `text`, `showinreport` and `reporttemplate` (the note is a report template whose
  placeholders, such as `Result.MaxPressure`, GRT fills in; manual p. 72–77). `index`, `hasfocus`,
  `config`, `selstart`, `sellength` and `scrollposition` are editor state.
- GRT adds a "HOW TO USE" note to new loads, starting `"Dear GRT user"`, asking for uploads to the GRT
  lab, which no longer exists. Drop it on import.
- `gallery` (`title` is always `Pictures`) holds `picture` elements: `name`, `type` (`jpeg`), `width`,
  `height` and `data`, the image in base64.

## Component files

`.caliber`, `.projectile` and `.propellant` files share the root `GordonsReloadingTool`, with one
section of `var` elements: `caliberfile`, `projectilefile` or `propellantfile`.

- `.caliber` and `.projectile` vars carry only `name` and `value`, no units: lengths in mm, pressures
  in bar, and the projectile mass `gmass` in **grains** (loads use grams).
- A `.projectile` file may hold many `projectilefile` sections (one corpus file holds 22).
- `.projectile` names differ from loads: `gdia` (diameter), `gmass`, `gtailType`, `gtailDiaA`,
  `gtailDiaB`, plus `caliber` (nominal, such as `.264`), `gdepthmax` and, once, `gmaterial`.
- `.propellant` vars carry units like loads, but label the covolume correctly (`cm3/g`), and add the
  derived sorting factors `Bp`, `Br` and `Brp` (manual p. 46; the stored `Br` matches the formula) and
  `Qlty` (always 0).
- All three carry authorship: `cdate`, `cby`, `mdate`, `mby`, `origin`, `descr`, and sometimes `type`,
  `mode` (`userfile` for user-made), `status`.

## Known defects

- Loads label the covolume `eta` as cm³/kg, but the value is in cm³/g: it equals the `.propellant`
  value labelled cm³/g, and about 1 cm³/g is the physical magnitude.
- User-entered chrono charges can be off by a factor of 10 (for example 0.0034 kg recorded instead of
  0.00034 kg). Flag charges that differ greatly from the load's `mc` instead of trusting them.
- Component files (`.projectile` and others) exported by GRT's Linux build use `<svar` instead of
  `<var`, and GRT can't read them back. Accept both on import.
