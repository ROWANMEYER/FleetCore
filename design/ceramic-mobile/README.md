# Ceramic mobile asset proposal — v1

Status: approved by the owner and integrated locally into the existing Ceramic mobile screens. This folder retains the original approval reference; it is not an app route.
Open `asset-review.html` to review the assets and a static mobile assembly.
The approved artwork is used by MobileCeramicTiles and MobileShipmentWizard. Layout and theme styling live in CeramicMobile.module.css. Existing Planner/report mutations are retained.

Assets are in `public/images/ceramic-mobile/v1/`:
- `dispatch-truck.png`: generated white cab / teal trailer, transparent background.
- `dispatch-landscape.svg`: scalable layered pale-blue hills.
- `route-guide.svg`: folded map, teal pins and dotted route.
- `icons/`: existing Lucide icon family plus a matching pallet graphic.
- `tokens.css`: proposed colours, radii and surface shadow; not imported by the app.

The existing `public/icon.svg` FleetCore logo is reused without changes.
Text, numbers, progress indicators, cards and buttons remain interface elements;
they are not baked into the truck or background image.

## Image generation
Built-in `image_gen` was used. The original output remains in the user's generated_images folder;
the project copy is the reusable asset. Transparency is preserved.

Final prompt:
Use case: stylized-concept. Asset type: small reusable transparent PNG illustration for a FleetCore mobile shipment wizard. Create one clean, realistic but softly stylized 3D articulated freight truck, white modern European cab, long solid teal box trailer (#0098AA to #008A9B), black tyres, subtle turquoise reflections. Three-quarter front view, cab toward the LEFT and trailer extending RIGHT, matching the small white-and-teal truck in the supplied reference mobile UI. Show the entire vehicle, generous clear padding, near eye-level camera with slightly visible top, crisp simplified detail that remains legible at 120px wide. Soft daylight, elegant minimal commercial app illustration, grounded with only a faint soft contact shadow. Actual transparent background/alpha, no scenery, no ground plane or rectangle, no mountains, no text, no logos, no lettering, no watermarks, no interface, no extra vehicles. This is a standalone decorative truck asset, not a screen mockup.

## Integration and release boundary
The owner approved the assets, and the design is integrated into the existing Ceramic
mobile list and three-step shipment wizard. Driver/truck/date saving, stop ordering,
WhatsApp draft handling, Planner and report synchronization remain in place.
The mobile send step also requires instructions to be reviewed after reassignment.
No commit, push, production deployment, backend source change or live-data write
was performed for this design integration.


## Release authorization
On 2026-11-23 the owner explicitly requested commit and production deployment.
The release includes the driver-column spacing fix and advances the PWA cache
to fleetcore-v90. No backend or data migration is required. The original approval
screenshots remain the visual reference captured before integration.
