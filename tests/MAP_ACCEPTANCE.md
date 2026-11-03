# Combined Map acceptance — schema 9, no new SQL

## Local coverage

Pure collection tests cover segment/booking departure-arrival dates, stay ranges, unscheduled ideas, unknown/invalid/zero coordinates, mixed-trip segment exclusion, namespaced IDs, type/day/category filters and transient matching place details. Server component tests check trip scoping, minimal booking projection, error handling and viewer propagation. The existing PostgreSQL migration test verifies the projection against authenticated grants. UI tests exercise map/list selection, filtering, no automatic Places calls, explicit detail loading, no provider values in save defaults, no-key behavior and offline blocking. A mock SDK checks marker cleanup, selection and reconnect behavior without contacting Google. These tests do not establish live provider or signed-in production success.

## Live steps

1. Open a trip's Map without optional keys. Confirm the combined list and external Maps/day/booking/Ideas links work, search is visibly unavailable, and changing filters makes no provider request.
2. Add a destination, stay, activity and transportation leg with different departure/arrival cities and dates. Add a booking with cities and an arrival date. Confirm both endpoints appear on the appropriate day; stays remain visible through their saved range. City markers must say approximate center, with no claim of exact venue/terminal position.
3. Keep one activity without a city and one unscheduled idea. Both remain in the all-days list, but unknown coordinates create no marker. On a selected day, the undated checkbox controls unscheduled ideas and saved places.
4. With a browser Maps key configured, confirm type/day/category filters keep list/markers consistent. Click a marker: its card is selected, focused and visible. Select a card's point: that marker is selected. Filtering out that item removes its active selection. Check mobile and desktop for overflow and usable controls.
5. With Places configured, explicitly load a Google-ID itinerary idea's current details. Check genuine provider attribution/retrieval time and the new venue pin. Reload: no automatic lookup occurs and provider content is not persisted as the user's label/notes. Save/place mutations still require approval and Editor/Owner access.
6. Search deliberately. Fresh results remain labeled unsaved and separate from filtered trip locations. Their map/list selection works even when a saved record uses the same place ID. Do not imply these are AI recommendations or confirmed plans.
7. As Viewer, confirm shared location data and filters work, with no edit/delete/paid lookup controls or private uploader files. Check direct writes remain blocked using the collaboration acceptance guide.
8. Disconnect and reconnect after map load. Provider interactions remain disabled offline; reconnect restores the map without an empty detached container. Essential downloaded information remains available through the separate encrypted offline reader, with no offline-map promise.
