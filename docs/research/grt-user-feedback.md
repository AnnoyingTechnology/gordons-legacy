# What GRT users complain about

A survey of forum threads (October 2026, issue #10), to choose what Gordon's Legacy should fix beyond
parity. Forum posts are anecdotes, not measurements; they show what users notice.

## Complaints, and where this project stands

| Complaint | Examples | Status here |
|---|---|---|
| Default powder models far off | .45 ACP: velocities 100–200 ft/s high, upper loads shown as heavily over-pressure ([Firing Line](https://thefiringline.com/forums/showthread.php?p=6904683)); N165 in .284 Win: GRT over-pressure at VV's published maximum ([AccurateShooter](https://forum.accurateshooter.com/threads/grt-numbers.4134343/)); "VV powders never matched" | Same finding on the maintainer's loads (docs/model/validation.md: +8 % mean velocity error). Velocity calibration exists; research engine in progress; data repository (M4) to carry each model's provenance and confidence. |
| Pistol cartridges in carbine barrels over-predicted | "I never get the increases it predicts past 10 inches" ([CanadianGunNutz](https://www.canadiangunnutz.com/forum/threads/gordon%E2%80%99s-reloading-tool.2487621/)) | Matches our subsonic and long-barrel errors (up to 40 %). Research engine target. |
| OBT nodes unreliable | "6 months trying to get OBT to work, I gave up"; "~40 % of predicted nodes are not accurate loads" ([AccurateShooter](https://forum.accurateshooter.com/threads/gordons-reloading-tool.4029708/)) | Labelled as unvalidated; to check against published work (decision 2026-10-13). |
| Default case capacities wrong | "case capacities a long way off reality" ([AfricaHunting](https://www.africahunting.com/threads/do-we-trust-gordons-reloading-tool.87291/)) | Help text says to weigh water. Possible: a review note when the capacity is still the standard's default. |
| Monolithic bullets poorly modelled | Hammer bullets ([AfricaHunting](https://www.africahunting.com/threads/do-we-trust-gordons-reloading-tool.87291/)) | Not addressed. Possible: a review note for copper/monolithic projectiles. |
| No Mac version, Wine trouble, download removed | Catalina, Mint 22.2 ([AccurateShooter](https://forum.accurateshooter.com/threads/gordons-reloading-tool-how-do-i-get-it-to-work.4043910/), [CanadianGunNutz](https://www.canadiangunnutz.com/forum/threads/gordon%E2%80%99s-reloading-tool.2487621/)) | Solved by design: web app, offline, single-file copy. |
| Cramped interface, small fonts, incomplete imperial units | "I wish the fonts were bigger", "use imperial units isn't thorough" ([M14forum](https://www.m14forum.com/threads/gordons-reloading-tool.507043/)); "soooo cramped" ([Stalking Directory](https://www.thestalkingdirectory.co.uk/threads/gordons-reloading-tool-grt.181304/page-2)) | Larger inputs and results hierarchy done (#1, #3, #5); units per kind of quantity. Browser zoom works. |
| Database frozen since 2021–2022 | "will be frozen in time" ([CanadianGunNutz](https://www.canadiangunnutz.com/forum/threads/gordon%E2%80%99s-reloading-tool.2487621/)) | Data repository (M4), still to create. |
| Missing cartridges | A 6.5-06 AI had to be designed by hand ([AccurateShooter](https://forum.accurateshooter.com/threads/gordons-reloading-tool-how-do-i-get-it-to-work.4043910/)) | Cartridge designer (M5). |

Users agree on the remedy: measured case capacity and bullet length, then calibration on their own
chronograph data, and published data as the reference.

## Inventory

GRT has no component inventory. Reloaders use separate tools (Reloader USA, BenchLog, Reloader's
WorkShop, an Android "Reloading Inventory" app) or spreadsheets. What they ask of them: stock of powder,
primers, bullets and brass deducted when a batch is loaded, cost per round, a low-stock shopping list,
and syncing between the bench and a phone ([LongRangeHunting](https://www.longrangehunting.com/threads/software-for-reloading-inventory.351515/),
[Reloading Inventory](https://allbestapps.net/android/reloading-inventory)). Syncing needs a server or
shared files, which this project avoids.

## Other tools seen

Web-based successors to GRT are appearing (Loadscope, Ballistic Swiss Knife), so an open,
long-lived rewrite still has a place, but not a monopoly.
