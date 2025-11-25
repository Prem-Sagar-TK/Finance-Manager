/*
    Finance Manager - Single-file React + Tailwind + Firebase example

    HOW TO USE
    1 Create a new React project (e.g. using Vite):
    npm create vite@latest finance-manager -- --template react
    cd finance-manager

    2 Install dependencies:
    npm install firebase chart.js react-chartjs-2

    3 Install Tailwind CSS (follow Tailwind docs). Quick steps for a Vite React app:
    npm install -D tailwindcss postcss autoprefixer
    npx tailwindcss init -p
    // then edit tailwind.config.cjs and index.css per Tailwind setup docs:
    // tailwind.config.cjs -> content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}']
    // Add @tailwind directives to src/index.css: @tailwind base; @tailwind components; @tailwind utilities;

    4 Replace the contents of src/App.jsx with this file.

    5 Create a Firebase project in the console and add your config in the firebaseConfig object below.
    Keep the apiKey/appId private in production and use environment variables (VITE_ prefix for Vite).

    6 Run the app:
    npm run dev

    NOTES
    - This file is deliberately self-contained to help you get started. In production split into smaller modules.
    - This uses anonymous auth + a saved display name to associate user data with a Firestore document.
    - Use rules in Firestore to restrict access to each user collection where doc id equals auth.uid.

*/