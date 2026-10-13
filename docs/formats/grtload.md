# GRT `.grtload` format

Observed 2026-10-13 on 67 load files written by GRT `2021.2030-NIGHTLY`. GRT publishes no
specification, so treat anything not listed here as unknown and keep it when converting.

## Encoding

- XML. Every string attribute value is URL-encoded (percent-encoding).
- Decoded bytes are UTF-8 in newer files and Latin-1 in older ones: try UTF-8 strictly, then fall back
  to Latin-1. Some accented characters were already stored by GRT as U+FFFD and can't be recovered.
- Numbers use a dot as the decimal separator.

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
| caliber | `ps` | bar | Shot-start pressure (inferred) |
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
| projectile | `gdepth` | mm | Seating depth (inferred) |
| projectile | `g1bc`, `g7bc` | | Ballistic coefficients |
| projectile | `gfriction`, `gfrictionUnlock` | bar | Bore friction, and its override flag (inferred) |
| projectile | `gpressure` | bar | Engraving / pull-out resistance (inferred) |
| projectile | `gTailType`, `gTailDiaA`, `gTailDiaB`, `gtailh`, `gUBCS` | mm | Boat-tail geometry (inferred) |
| projectile | `mode` | | `0`, or `userfile` for user-defined projectiles |
| propellant | `mname`, `pname`, `lotid` | | Maker, product, lot |
| propellant | `mc` | g | Charge mass |
| propellant | `Qex` | kJ/kg | Heat of explosion |
| propellant | `k` | | Ratio of specific heats |
| propellant | `eta` | cm³/kg | Covolume |
| propellant | `pc` | kg/m³ | Powder grain density (inferred) |
| propellant | `pcd` | kg/m³ | Powder bulk density (inferred) |
| propellant | `Ba` | | Dynamic vivacity |
| propellant | `a0`, `a1`, `z1`, `z2` | | Form-function parameters (three-phase burn model) |
| propellant | `pt` | °C | Powder temperature |
| propellant | `tcc`, `tch` | | Temperature coefficients, cold and hot |
| propellant | `laddercnt`, `laddermc` | –, g | Ladder: number of steps and charge step |

`caliberfile` holds about a hundred `var` entries: CIP drawing dimensions (`L0`–`L6`, `R`, `P0`–`P2`,
`G1`, `H1`…, plus `c_`-prefixed counterparts), `Pmax`, `cipname` (short caliber name), `ciptype`,
`cipdate`, `ciprevdate` and authorship fields.

## Measurements

```
Measurement  index, title, showinreport
└─ charge    name, note, value, source, menu, menuunit, menuvalue, expanded, expandedstats, showinreport
   └─ shot   name, note, velocity, pressure
```

- `charge/@value` is the charge mass in **kg**. `shot/@velocity` is in m/s.
- `note` often names the gun used, which may differ from the load's `gun` section.
- GRT copies its demo chronograph data into new loads. Charges whose note contains
  `EXAMPLE ONLY! DO NOT USE THIS LOAD` aren't user data: drop them on import.
- Shots with a velocity of 0 are empty rows.

## Known defects

- User-entered chrono charges can be off by a factor of 10 (for example 0.0034 kg recorded instead of
  0.00034 kg). Flag charges that differ greatly from the load's `mc` instead of trusting them.
- Component files (`.projectile` and others) exported by GRT's Linux build use `<svar` instead of
  `<var`, and GRT can't read them back. Accept both on import.
