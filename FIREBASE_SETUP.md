# DocSystem — Firebase authentication setup

DocSystem is copied from noagrp/docfac. Authentication is connected to Firebase project `docsystem-c29ec`, but document data and settings still use the original local/JSON workflow until the next migration stage.

## First administrator (bootstrap)

1. In Firebase Console > Authentication > Sign-in method, enable **Email/Password**.
2. In Authentication > Users, add your first user or use an existing Email/Password user. Note that the user's Firebase Authentication **UID** is needed.
3. In Firestore Database, create the `users` collection. Add a document with its **document ID exactly equal to the Authentication UID**.
4. Set three fields: `email` (the exact Firebase Authentication email), `role` = `superadmin`, and `status` = `active`.
5. Paste the Firestore rules provided directly in ChatGPT into Firebase Console > Firestore Database > Rules, then **Publish**.

The initial admin must be inserted using the Firebase Console because client rules do not allow self-promotion. Additional user profiles can later be managed through a properly authorized admin UI. Valid roles: `superadmin`, `manager`, `staff`. Valid statuses: `active`, `inactive`.

## Security and scope

The browser Firebase configuration is intended to be public; it is not a password. Keep account access secured with Firebase Authentication and Firestore Rules. The browser UI gate alone is not a substitute for Firestore security rules.

Documents, business settings and user profile management now use Firestore. Enable and publish the matching rules before testing. The original localStorage cache remains for initial migration; PDF generation remains on demand. Generated PDFs do not need to be stored.
