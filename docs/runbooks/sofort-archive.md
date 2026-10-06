# Sofort list archive

- Deactivation jobs set `Kid.archived=true` after channel attempts even if some or all channels fail. Channel errors remain in the job result; archive-write failures are also reported. Activation restores the normal list only after every channel succeeds.
- Archived and normal lists use the existing inventory API with `archived=true/false`, before pagination. Other callers without the parameter retain the full inventory.
- Return to list calls `POST /api/v1/kids/archive/` with `kid_number`, `kid_id`, `archived=false`. It does not activate marketplaces, change EAN mappings, stock status, photos or place.
- Archive is a local list state, not proof that external listings are inactive. Archive writes preserve marketplace flags, including active ones after partial deactivation. Generic Kid updates cannot write `archived`.
- Delete reuses existing Kid deletion, including related records and managed photos. The archive asks for confirmation; returning is non-destructive.
- Migration `database.0053_kid_archived` adds an indexed boolean, default false. Existing products remain in the normal list; no historical deactivation backfill is performed.
- Apply the migration before deploying the service code. Server migration and deployment require separate approval. Rollback can leave the added column in place and restore previous application images.

Live production activation/deactivation is not verified by local tests.
