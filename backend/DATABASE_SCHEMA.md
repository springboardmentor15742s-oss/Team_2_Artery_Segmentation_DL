# Database schema

The SQLite database is initialized automatically on backend startup. The same logical schema can be migrated to PostgreSQL later.

- `users`: login identity, password hash, role, preferences
- `patients`: pseudonymized patient reference and demographics
- `scans`: case/scan metadata, file location, upload status
- `annotations`: ground-truth annotation file references and versions
- `review_annotations`: clinician decisions and comments for a case candidate, linked to its author and scan
- `analysis_jobs`: queued/running/completed/failed processing records
- `segmentation_results`: predicted mask path and evaluation metrics
- `stenosis_findings`: vessel location, reference/minimum diameters and estimated narrowing; not a confirmed diagnosis
- `reports`: generated report metadata
- `notifications`: user-facing event messages
- `audit_logs`: important account and record actions

Relationships: patients 1-to-many scans; scans 1-to-many annotations and analysis jobs; analysis jobs 1-to-many segmentation results; segmentation results 1-to-many stenosis findings; scans 1-to-many reports.

Clinician review annotations are unique per scan, author, and candidate ID. Updating a decision records the update timestamp and creates an audit-log event. Candidate decisions are reviewer annotations and do not change model predictions.

Large medical files are stored under `backend/storage/uploads/`; the database stores the path and metadata rather than the file bytes. For real clinical use, add institution-approved privacy controls, stronger authorization, encryption, backups and content-level file validation.
