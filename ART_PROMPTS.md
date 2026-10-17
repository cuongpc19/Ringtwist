# Ring Twist - image prompts

> ⚠ Since 2026-10-17 Home has no picture: it is drawn live in 3D (render3d.js
> `home()`, CLAUDE.md "The look"), and the title is extruded letters
> (`tools/title_art.py`). The cover prompts below (sections 0-1) are kept for a
> store tile or a trailer frame; the owner's render made from them is
> `art/home_cover.jpg` and no longer ships.

Prompts for generating the game's art in an image model. Today every picture in
the game is drawn in SVG (`tools/home_art.py`); these replace it with rendered
art in the style of Seat Jam's home cover (`C:\CuongPC\Game\seatawayO\art\home_cover.jpg`).

| file to deliver | size | used for |
|---|---|---|
| `src/art/home_cover.jpg` | 1080x1620 | the Home screen picture (title added by code) |
| `src/icons/icon-512.png` (+ a 180 px copy) | 1024x1024 | app / "Add to Home Screen" icon |
| `store/cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png` | as named | CrazyGames store tiles (title added by code) |
| `src/art/bee_cheer.png` (only while the card keeps its bee) | 1024x1024, transparent | the bee cheering over LEVEL COMPLETE |
| `src/art/boost_firework.png`, `boost_hammer.png` (optional) | 512x512, transparent | the two booster buttons |

## ⚠ Two rules every image follows

1. **No title.** An image model misspells the name or sets it in the wrong letters
   (Seat Jam learnt this - `seatawayO/COVER_PROMPTS.md`), and the name cannot be
   almost right. Every prompt leaves **empty sky where the title goes**; the game
   draws "Ring Twist" on its burst and lays it over the picture.
2. **Few pieces, and say exactly how many.** A first try asking for "rings" came
   back with seven in a flower - busy, and it filled the title's band and the
   button's floor (the owner, 2026-10-17: "too complex, 2-3 shapes"). Say
   "exactly three" (or two), say "nothing else on the floor", and put "more rings"
   in the negative prompt. No bee on the cover.

## The blocks every prompt is built from

**STYLE**
```
Polished stylised 3D cartoon render for a casual mobile puzzle game, like a premium
designer-vinyl toy: smooth rounded shapes, glossy candy-plastic surfaces with a soft
clearcoat sheen, bright saturated colours, soft sunny daylight from the upper left,
soft ambient occlusion and soft contact shadows, a gentle warm rim light. Clean,
simple, uncluttered, readable at thumbnail size. No text, no letters, no numbers,
no logo, no watermark, no UI, no characters, no animals anywhere in the image.
```

**THE RINGS** - the game's pieces
```
Each ring is a thick glossy plastic tube bent into an open "C", like a small pool
ring with one gap of about 65 degrees: rounded ends at the gap, the tube about a
fifth as thick as the ring is wide, a bright white highlight running along the top
of the tube and a darker tone underneath. The rings do NOT touch each other: a small
gap separates neighbours, and they are locked together by PINS - a short stubby rod
sticks straight out of one ring and ends in a small rounded-square cap that clamps
across the neighbouring ring's tube, rod and cap in the colour of the ring they
come from, the cap a little lighter on top.
```

**THE PLACE** - Seat Jam's sunny scene
```
A bright sunny outdoor scene from a camera just above eye level: a vivid sky-blue
sky (#22B2FC at the top fading to #7FE0FD at the horizon), a few fluffy white
cartoon clouds only at the far left and far right edges, low round green hedges
with small white daisies at both sides of the horizon, and a warm cream tiled
floor (#FDEBC0 fading to #F6C88E) in gentle perspective from the horizon down to
the bottom edge.
```

**Negative prompt** (if the tool has a field for it)
```
text, letters, words, numbers, logo, title, watermark, signature, UI, buttons,
frame, border, bee, insect, character, mascot, animal, person, hands, more rings,
extra rings, many rings, flower arrangement, pile, closed rings without a gap,
rings touching each other, rings merged together, chain links passing through each other,
photo, photorealistic, metal, wood grain, fabric, sharp edges, noise, film grain,
dark muddy colours, low contrast, depth of field blur, cluttered, busy
```

## 0. Easiest: repaint the game's own layout

`python tools/home_art.py --ref art/ref` writes the cover the game draws, in both
layouts the owner asked for ("3 or 4 rings in two lines"):

| file | rings |
|---|---|
| `art/ref/cover_pyramid3_notitle.png` | three: purple on top, blue and orange under it (the game's current one) |
| `art/ref/cover_grid4_notitle.png` | four in a 2x2: purple and green on top, blue and orange under them |

(`cover_pyramid3.png` / `cover_grid4.png` are the same with the title, to see where
it lands.) Give the **no-title** file to the image model as the reference image
(image-to-image; if the tool asks for a strength, about 0.45-0.6 keeps the layout)
with:
```
Repaint this image as a polished stylised 3D cartoon render for a casual mobile
puzzle game, keeping its composition exactly: the same sky, clouds, hedges and tiled
floor in the same places, and exactly the same rings - the same number, positions,
sizes, colours and gap directions, in the same two rows - with the same short pins
and the same caps clamped across the neighbouring tubes, and the same small gaps
between the rings (they must not touch or merge). Turn the flat shapes into glossy candy-plastic
toys: thick smooth tubes with a clearcoat sheen, soft highlights along the top of
each tube, soft ambient occlusion and soft contact shadows on the floor; fluffy
volumetric clouds; soft rounded hedges with little white daisies; warm cream floor
tiles in gentle perspective. Soft sunny daylight from the upper left, bright
saturated colours, clean and uncluttered. Keep the big empty sky in the upper half
exactly as empty: no title, no text, no letters, no logo, no extra objects. Do not
add more rings, characters or animals. Vertical, 1080x1620.
```
Use the negative prompt below too. Sections 1-3 are the same pictures from words
only, for a tool that takes no reference image.

## 1. Home cover - `home_cover.jpg`, 1080x1620

STYLE + THE RINGS + THE PLACE, then **one** of these two.

**A - three rings in two rows** (what the game draws today):
```
Vertical 2:3 image, 1080x1620. The horizon is 61% of the way down.
Exactly THREE rings and nothing else on the floor, arranged as a small pyramid in
the middle of the frame: a purple ring (#984BE0) on top, a sky-blue ring (#2FA8E8)
at the bottom left and an orange ring (#FF8C26) at the bottom right, the two bottom
rings standing upright on the floor. The rings do not touch - a small gap between
each pair - and are locked by pins: the purple ring sends two short purple pins
down, one ending in a purple cap clamped across the blue ring's tube, one in a
purple cap clamped across the orange ring's tube; the blue ring sends one short
blue pin sideways, ending in a blue cap clamped across the orange ring's tube. The
gaps face outwards: the purple ring's straight up, the blue ring's to the left, the
orange ring's to the right. The group spans 40% of the image width and runs from
48% to 74% of the height, with one soft shadow under it on the floor.
Keep the band from 12% to 46% of the height EMPTY plain sky - a logo goes there.
Keep the bottom quarter quiet: floor tiles only - buttons go there. Keep everything
that matters inside the middle 70% of the width: phones crop the sides.
```

**B - four rings in two rows**:
```
Vertical 2:3 image, 1080x1620. The horizon is 61% of the way down.
Exactly FOUR rings and nothing else on the floor, in a 2x2 square, centred: on the
top row a purple ring (#984BE0) on the left and a green ring (#5CC236) on the right;
on the bottom row a sky-blue ring (#2FA8E8) on the left and an orange ring (#FF8C26)
on the right, standing upright on the floor. The rings do not touch - a small gap
between neighbours - and are locked by pins: the purple ring sends a short purple
pin right to the green ring and one down to the blue ring; the green ring sends a
green pin down to the orange ring; the blue ring sends a blue pin right to the
orange ring - each pin a short rod ending in a cap clamped across the neighbour's
tube. The gaps all face outwards, to the four corners: purple up-left, green
up-right, blue down-left, orange down-right. The group spans 40% of the image width
and runs from 48% to 76% of the height, with one soft shadow under it.
Keep the band from 12% to 46% of the height EMPTY plain sky - a logo goes there.
Keep the bottom quarter quiet: floor tiles only - buttons go there. Keep everything
that matters inside the middle 70% of the width: phones crop the sides.
```

## 2. App icon - `icon-512.png`, 1024x1024

STYLE + THE RINGS, then:
```
Square 1:1 app icon, 1024x1024, full bleed - no rounded corners, no border (the phone
rounds them). Background: a bright sky-blue radial gradient (#5DD0FF in the centre to
#1E9BE6 at the edges) with a soft golden glow behind the subject. Subject: exactly
TWO rings, a sky-blue one and an orange one, side by side with a small gap, the
orange one locked to the blue one by a short orange pin whose cap clamps across the
blue tube, seen straight on, together filling 75% of the icon, centred. A bold
simple silhouette that still reads at 48x48 pixels. Nothing else.
```

## 3. Store tiles - CrazyGames

STYLE + THE RINGS + THE PLACE, then:
```
Exactly THREE rings and nothing else on the floor, in two rows like a small pyramid:
sky-blue and orange standing on the bottom row, purple above them, not touching -
locked by short pins whose caps clamp across the neighbour's tube - their gaps
facing outwards, with one soft shadow under the group.
```
then the framing for the size:

- **1920x1080**: `16:9 landscape. The rings in the lower half, centred, about 30% of the width, their base at 82% of the height. The top 45% is EMPTY sky for a title. Nothing touches the edges.`
- **800x1200**: `2:3 portrait. The rings in the middle, about 55% of the width, their centre at 62% of the height. The top 40% is EMPTY sky for a title. Nothing touches the edges.`
- **800x800**: `1:1 square. The rings in the lower half, about 50% of the width, their base at 84% of the height. The top 42% is EMPTY sky for a title. Nothing touches the edges.`

## 4. The cheering bee - `bee_cheer.png` (only if the card keeps its bee)

STYLE without its last sentence's "no characters, no animals", then:
```
The mascot is a small chubby chibi bumblebee whose head is as big as its body: a
round golden-yellow head (#FFD84A) with big glossy dark-navy eyes with white
catchlights, soft pink cheeks and a wide happy open smile; two thin antennae ending
in round dark-plum balls; a round yellow body with two broad dark-plum stripes
(#3A2E4F) and a tiny dark stinger; short stubby arms; two small translucent
pale-blue wings. A soft dark-navy (#24305E) painted edge around the silhouette.
Square 1:1, 1024x1024, the bee alone, front view, centred, filling 80% of the frame,
both arms raised high in a cheer, a pink pom-pom in its left hand and a purple
pom-pom in its right. Transparent background (or flat pure #00FF00, no shadow).
```

## 5. Booster tiles (optional) - 512x512 each

STYLE, then one of:
```
Square 1:1, 512x512. A single glossy rounded-square game button seen straight on,
like a candy-plastic tile: an orange face (#FFAB3A) with a lighter top half, a darker
orange slab edge (#B5621A) showing underneath, a thin white rim. On its face, filling
two thirds of it, a chunky cartoon firework rocket tilted 35 degrees to the right:
purple body with two white stripes, a light-purple nose cone, a yellow base ring and
a short curled fuse. Transparent background (or flat #00FF00).
```
```
Square 1:1, 512x512. A single glossy rounded-square game button seen straight on,
like a candy-plastic tile: a sky-blue face (#46B8F0) with a lighter top half, a darker
blue slab edge (#1C6EA3) showing underneath, a thin white rim. On its face, filling
two thirds of it, a chunky cartoon mallet tilted 30 degrees to the left: a purple
head with a white star and yellow end caps, an orange handle. Transparent
background (or flat #00FF00).
```

## Judging what comes back

Shrink each result to 200 px wide and check:

- Is it the number of rings asked for - not one more?
- Does every ring read as a ring with a gap (the game's whole mechanic)?
- Is the title band still plain sky, with no letters the model invented?
- Is the bottom third of the cover quiet floor, and everything inside the middle
  70% of its width?

If the count or the title band fails, regenerate: neither can be fixed afterwards.
