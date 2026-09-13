# Platform audio review

Functional test build for private, collaborative audio review. It supports ChatGPT sign-in, project roles and invitations, nested folders, original-file uploads to object storage, version history, playback, downloads, and timestamped comments.

Structured metadata is stored in D1 and audio files are stored in R2. The Sites deployment applies the checked-in Drizzle migration and supplies both bindings.
