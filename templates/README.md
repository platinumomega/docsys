# DocSystem Preset Template Catalog

## Restore point

GitHub branch: `restore/working-before-quotation-po-json-2026-10-31`  
Original working commit: `3b10bd8a866176b9775ba27e7e41214d10bbaf66`

The branch preserves the repository state **before preparing Quotation JSONs**. It does not back up Firestore document or settings data. To return to that stage, restore the affected files from this branch or revert the subsequent commits after review; do not blindly reset shared work.

## Template families

- `quotation/index.json`: Five Quotation presets extracted from the existing `preset-quotation.html`. Each file includes defaults, form fields, rental/consumables columns, the original effective terms wording, dynamic placeholders, A4 settings, and signature rows.
- `po/index.json`: Six Purchase Order presets based on the uploaded Wellora PO Excel workbook. Each has its own source worksheet, vendor fields, calculation formula, terms, and signatures.
- `index.json`: Catalog for document-family discovery.

The template families remain intentionally independent. A future UI may share the same overall Workspace, business profiles, document storage, and print component, but **Quotation and PO are different document models**.

## Migration and testing

1. Confirm each JSON file parses and the manifest IDs resolve.
2. Test Quotation clause wording against the existing working Quotation renderer, including custom minimum rental days, payment days, and validity.
3. Build and test a standalone PO renderer against all six original Excel worksheets and their formulas.
4. Test A4 preview/print, row wrapping, terms page breaks, currency/SST, signatures, save/open, and access roles.
5. Only then replace the live editor's hard-coded preset definitions with JSON loading.

**Current live status:** Quotation editor unchanged; PO editor not yet connected.

## Data compatibility

Existing Firebase documents remain untouched. If an eventual migration changes its JSON source, keep existing `presetData`, `templateId`, `templateSource` and original document metadata compatible. Never replace the original contract text in saved documents without explicit user action.

Run `node templates/validate-presets.mjs` from the repo root to check the templates before UI integration.
