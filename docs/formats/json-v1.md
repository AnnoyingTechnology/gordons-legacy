# Load format, version 1

Gordon's Legacy saves loads as JSON documents. The TypeScript types in
[`packages/formats/src/load/`](../../packages/formats/src/load/) are the field-by-field reference: every
field there documents its meaning, unit and GRT counterpart. This page gives the conventions.

## Conventions

- **Identification.** Every document starts with `"format": "gordons-legacy.load"` and
  `"schemaVersion": 1`.
- **SI base units** for every quantity: m, m², m³, kg, s, Pa, K, J/kg, kg/m³, m³/kg, m/s. Ballistic
  coefficients are in kg/m² (1 lb/in² = 703.0696 kg/m²). Display units belong to the UI, not to files.
- **Optional fields** are left out when unknown. GRT writes 0 for "not given" (twist, gun mass,
  ballistic coefficients); the importer leaves those fields out instead.
- **No redundant values.** A value derived from others isn't stored: the seating depth follows from the
  case length, projectile length and overall length.
- **Model coefficients in their model's convention.** The propellant's `burnModel` has a `kind`; the
  meaning and units of its coefficients are those of that model (`grt` for GRT's model). Physical
  properties of the powder (heat of explosion, covolume, densities) are in SI.
- **Nothing is lost on import.** Source values without a field are kept verbatim as strings in
  `unmapped` objects: on the load (keyed by their path in the source, such as `gun/newSetting` or
  `appendix/Measurement[1]/charge[2]@source`) and on the caliber definition, projectile and propellant
  (keyed by name).

## Structure

```
Load
├─ format, schemaVersion, title
├─ cartridge     caliber values as loaded (Cartridge)
│  └─ definition the standard's definition (CaliberDefinition), optional, with the cartridge's
│                outline (caseDimensions: CIP table I letters, mapped to names, in m)
├─ barrel        the gun (Barrel), with gasLeaks
├─ projectile    (Projectile)
├─ propellant    the powder model (Propellant), with burnModel, and calibration when the model
│                was fitted to a measured velocity (target, result, pressures before and after)
├─ charge        mass and temperature
├─ ladder        optional
├─ measurements  chronograph data (MeasurementSeries → MeasuredCharge → Shot)
├─ notes, pictures
├─ shotGroups    optional: groups on targets (distance, hits in m, a photo by index with its scale)
├─ importedFrom  optional: source format, writer version, file name
└─ unmapped      optional
```

## Versioning

- A change that old readers could misread (renamed field, changed unit or meaning, new required field)
  increments `schemaVersion`.
- Readers accept every earlier version and upgrade it in memory; writers always write the latest.
- Adding an optional field doesn't need a new version.
