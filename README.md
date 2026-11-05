# Finance Manager

A personal finance dashboard for tracking income, expenses, and category budgets. Data lives in Firebase (anonymous auth + Firestore) and updates in real time. Charts show spending by category and income vs expense.

## Features

- **Guest login** — enter a display name and sign in anonymously
- **Income & expenses** — add, edit, and delete transactions
- **Budgets** — set a spending limit per category, with a progress bar (green / yellow / red)
- **Overview** — totals for income, expense, and remaining balance
- **Charts** — doughnut chart for category spend, bar chart for income vs expense
- **Themes** — light and dark mode (saved in `localStorage`)
- **Offline cache** — Firestore IndexedDB persistence when the browser allows it

## Tech stack

- React 18 + Vite
- Chart.js (`react-chartjs-2`)
- Firebase Auth (anonymous) and Cloud Firestore
- Tailwind CSS utility classes

## Getting started

### Requirements

- Node.js 18+ and npm

### Install and run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

### Other scripts

```bash
npm run build    # production build
npm run preview  # serve the built files
```

## Firebase setup

Create a Firebase project, then enable:

1. **Authentication → Sign-in method → Anonymous**
2. **Cloud Firestore** (create a database)

Copy your web app config into a `.env` file in the project root:

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Restart the dev server after changing env vars.

### Firestore data layout

Each signed-in user has documents under their UID:

```
users/{uid}                         # displayName, createdAt
users/{uid}/income/{id}             # source, amount, date, updatedAt
users/{uid}/expenses/{id}           # description, category, amount, date, updatedAt
users/{uid}/budgets/{category}      # amount (category name is the document ID)
```

Lock this down with security rules so users can only read and write their own `users/{uid}` tree.

## How to use

1. Enter a display name and click **Log in**.
2. Add income (source + amount) and expenses (description, category, amount).
3. Optionally set a budget for a category (for example `Food`).
4. Watch totals, charts, and budget bars update as you add data.
5. Hover or use **Edit** / **Delete** on a row to change or remove it.

You must be logged in before transactions or budgets will save.

## Project layout

```
src/
  main.jsx        # app entry
  App.jsx         # UI, auth, and Firestore logic
  index.tsx       # typed version of the same app
  index.css       # Tailwind + base styles
```

## License

Private project (`package.json` `"private": true`).
