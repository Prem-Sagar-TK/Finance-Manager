import React, { useEffect, useState, useRef } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signOut, User } from 'firebase/auth';
import {
  getFirestore, enableIndexedDbPersistence, collection, doc, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp, Unsubscribe
} from 'firebase/firestore';

Chart.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

// ------------------- TYPES -------------------
interface IncomeItem {
  id: string;
  source: string;
  amount: number;
  date?: any;
  updatedAt?: any;
}

interface ExpenseItem {
  id: string;
  description: string;
  category: string;
  amount: number;
  date?: any;
  updatedAt?: any;
}

// ------------------- FIREBASE CONFIG -------------------
// Replace with your own config or use environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBg5yL6Z8Q2pK9nM3wX1vC5jD4eR7fT9uH',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'financemanager-5e8c3.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'financemanager-5e8c3',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'financemanager-5e8c3.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:123456789012:web:abcdef1234567890abcde'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Try enabling persistence (best-effort)
enableIndexedDbPersistence(db).catch((err) => {
  // console.warn('Persistence not enabled:', err.code);
});

// ------------------- UTILS -------------------
const formatMoney = (n: number | undefined) => `$${Number(n || 0).toFixed(2)}`;

// ------------------- MAIN APP -------------------
export default function App() {
  // --- Auth & UI State ---
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState(localStorage.getItem('guestName') || '');
  const [status, setStatus] = useState('Offline');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  // --- Data State ---
  const [income, setIncome] = useState<IncomeItem[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  // --- Form state ---
  const [incomeForm, setIncomeForm] = useState({ source: '', amount: '' });
  const [expenseForm, setExpenseForm] = useState({ description: '', category: '', amount: '' });
  const [budgetForm, setBudgetForm] = useState({ category: '', amount: '' });
  const [editing, setEditing] = useState<{ type: 'income' | 'expense' | null; id: string | null }>({ type: null, id: null });

  // --- Refs for cleanup ---
  const unsubRefs = useRef<{ income: Unsubscribe | null; expense: Unsubscribe | null; budgets: Unsubscribe | null }>({ income: null, expense: null, budgets: null });

  // --- UI Effects ---
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // --- Auth observer ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u: User | null) => {
      if (u && localStorage.getItem('guestName')) {
        setUser(u);
        setStatus('Online');
      } else {
        setUser(null);
        setStatus('Offline');
        // Clear data when logged out
        setIncome([]); setExpenses([]); setBudgets({});
        // Unsubscribe existing listeners
        cleanupListeners();
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Attach Firestore listeners when user logs in ---
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    // Income
    const qInc = query(collection(db, 'users', uid, 'income'), orderBy('date', 'desc'));
    unsubRefs.current.income = onSnapshot(qInc, (snap) => {
      setIncome(snap.docs.map(d => ({ id: d.id, ...d.data() } as IncomeItem)));
    }, (err) => console.error('Income snapshot error', err));

    // Expenses
    const qExp = query(collection(db, 'users', uid, 'expenses'), orderBy('date', 'desc'));
    unsubRefs.current.expense = onSnapshot(qExp, (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as ExpenseItem)));
    }, (err) => console.error('Expense snapshot error', err));

    // Budgets (no ordering needed)
    const budgetsCol = collection(db, 'users', uid, 'budgets');
    unsubRefs.current.budgets = onSnapshot(budgetsCol, (snap) => {
      const b: Record<string, number> = {};
      snap.forEach(d => b[d.id] = d.data().amount);
      setBudgets(b);
    }, (err) => console.error('Budget snapshot error', err));

    return () => cleanupListeners();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function cleanupListeners() {
    if (unsubRefs.current.income) unsubRefs.current.income();
    if (unsubRefs.current.expense) unsubRefs.current.expense();
    if (unsubRefs.current.budgets) unsubRefs.current.budgets();
    unsubRefs.current = { income: null, expense: null, budgets: null };
  }

  // --- Auth actions ---
  const handleLogin = async () => {
    if (!displayName || displayName.trim().length === 0) return alert('Enter a display name');
    try {
      await signInAnonymously(auth);
      const u = auth.currentUser;
      // save display name to users/{uid}
      if (u) await setDoc(doc(db, 'users', u.uid), { displayName: displayName.trim(), createdAt: serverTimestamp() }, { merge: true });
      localStorage.setItem('guestName', displayName.trim());
    } catch (err) {
      console.error('Login error', err);
      alert('Could not sign in. See console.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('guestName');
      setDisplayName('');
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  // --- Transactions ---
  const saveTransaction = async (type: string) => {
    if (!user) return alert('Not logged in');
    const uid = user.uid;

    if (type === 'income') {
      const amt = parseFloat(incomeForm.amount);
      if (!incomeForm.source || !amt || amt <= 0) return alert('Invalid income');

      try {
        if (editing.type === 'income' && editing.id) {
          await updateDoc(doc(db, 'users', uid, 'income', editing.id), { source: incomeForm.source, amount: amt, updatedAt: serverTimestamp() });
        } else {
          await addDoc(collection(db, 'users', uid, 'income'), { source: incomeForm.source, amount: amt, date: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        setIncomeForm({ source: '', amount: '' });
        setEditing({ type: null, id: null });
      } catch (err) {
        console.error(err);
        alert('Could not save income');
      }
    } else {
      const amt = parseFloat(expenseForm.amount);
      if (!expenseForm.description || !amt || amt <= 0) return alert('Invalid expense');

      try {
        if (editing.type === 'expense' && editing.id) {
          await updateDoc(doc(db, 'users', uid, 'expenses', editing.id), { description: expenseForm.description, category: expenseForm.category || 'General', amount: amt, updatedAt: serverTimestamp() });
        } else {
          await addDoc(collection(db, 'users', uid, 'expenses'), { description: expenseForm.description, category: expenseForm.category || 'General', amount: amt, date: serverTimestamp(), updatedAt: serverTimestamp() });
        }
        setExpenseForm({ description: '', category: '', amount: '' });
        setEditing({ type: null, id: null });
      } catch (err) {
        console.error(err);
        alert('Could not save expense');
      }
    }
  };

  const removeItem = async (type: string, id: string) => {
    if (!user) return;
    const uid = user.uid;
    if (!confirm('Delete this item?')) return;
    try {
      await deleteDoc(doc(db, 'users', uid, type === 'income' ? 'income' : 'expenses', id));
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (type: string, item: IncomeItem | ExpenseItem) => {
    setEditing({ type: type as 'income' | 'expense', id: item.id });
    if (type === 'income') setIncomeForm({ source: (item as IncomeItem).source || '', amount: String((item as IncomeItem).amount) || '' });
    else setExpenseForm({ description: (item as ExpenseItem).description || '', category: (item as ExpenseItem).category || '', amount: String((item as ExpenseItem).amount) || '' });
    // switch view handled by layout
  };

  // --- Budgets ---
  const saveBudget = async () => {
    if (!user) return alert('Not logged in');
    const uid = user.uid;
    const cat = budgetForm.category?.trim();
    const amt = parseFloat(budgetForm.amount);
    if (!cat || !amt || amt <= 0) return alert('Invalid budget');
    try {
      await setDoc(doc(db, 'users', uid, 'budgets', cat), { amount: amt });
      setBudgetForm({ category: '', amount: '' });
    } catch (err) {
      console.error(err);
      alert('Could not save budget');
    }
  };

  // --- Derived values for UI ---
  const totalIncome = income.reduce((s, it) => s + (it.amount || 0), 0);
  const totalExpense = expenses.reduce((s, it) => s + (it.amount || 0), 0);
  const catTotals = expenses.reduce((acc: Record<string, number>, it) => { const c = it.category || 'Uncategorized'; acc[c] = (acc[c] || 0) + (it.amount || 0); return acc; }, {});

  // --- Charts data ---
  const doughnutData = {
    labels: Object.keys(catTotals).length ? Object.keys(catTotals) : ['No Data'],
    datasets: [{ data: Object.keys(catTotals).length ? Object.values(catTotals) : [1], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'], borderWidth: 0 }]
  };

  const barData = {
    labels: ['Balance'],
    datasets: [
      { label: 'Income', data: [totalIncome], backgroundColor: '#48bb78' },
      { label: 'Expense', data: [totalExpense], backgroundColor: '#ff6b6b' }
    ]
  };

  // --- Helper UI pieces ---
  const BudgetList = () => {
    return (
      <div>
        {Object.keys(budgets).length === 0 ? (
          <div className={`text-center text-sm p-8 rounded-lg ${theme === 'light' ? 'bg-gray-100 text-gray-500' : 'bg-white/5 text-gray-400'}`}>📌 No budgets set yet. Create your first budget above!</div>
        ) : (
          Object.entries(budgets).map(([cat, limit]: [string, number]) => {
            const spent = catTotals[cat] || 0;
            const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
            const barStyle = pct >= 100 ? 'bg-gradient-to-r from-red-500 to-red-600' : pct >= 80 ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' : 'bg-gradient-to-r from-green-500 to-green-600';
            const statusText = pct >= 100 ? '⚠️ Over' : pct >= 80 ? '⚡ High' : '✅ Good';
            return (
              <div key={cat} className={`mb-5 p-4 rounded-lg border-2 ${theme === 'light' ? 'bg-white border-gray-200' : 'bg-white/5 border-white/10'} hover:shadow-md transition-all duration-200`}>
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-gray-800">{cat}</span>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${pct >= 100 ? 'bg-red-100 text-red-700' : pct >= 80 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{statusText} {Math.round(pct)}%</span>
                </div>
                <div className="text-sm text-gray-600 mb-2">{formatMoney(spent)} / {formatMoney(limit)}</div>
                <div className={`w-full bg-gray-300 rounded-full h-3 overflow-hidden shadow-inner`}>
                  <div className={`${barStyle} h-full rounded-full transition-all duration-500 ease-out shadow-md`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${theme === 'light' ? 'bg-gray-50 text-gray-800' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-gray-100'}`}>
      {/* HEADER */}
      <header className={`backdrop-blur sticky top-0 z-50 shadow-lg transition-all duration-300 ${theme === 'light' ? 'bg-white/70 border-b border-gray-200' : 'bg-slate-900/70 border-b border-slate-700'} px-4 py-4`}> 
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer group">
            <div className="p-3 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-lg group-hover:shadow-xl transition-shadow duration-300 transform group-hover:scale-110 duration-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 6v6c0 5 3.58 9.74 9 10 5.42-.26 9-5 9-10V6l-9-4z" fill="currentColor"/></svg>
            </div>
            <div>
              <div className="font-bold text-xl bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">Finance Manager</div>
              <div className="text-xs text-gray-500">Smart money tracking</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4 px-4 py-2 rounded-full bg-white/10 backdrop-blur">
              <div className="text-sm">
                <div className="font-semibold">{localStorage.getItem('guestName') || displayName || 'Guest User'}</div>
                <div className={`text-xs font-medium flex items-center gap-1 ${status === 'Online' ? 'text-green-400' : 'text-gray-400'}`}>
                  <span className={`w-2 h-2 rounded-full ${status === 'Online' ? 'bg-green-400' : 'bg-gray-400'}`}></span>
                  {status}
                </div>
              </div>
            </div>
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-2 rounded-full hover:bg-white/20 transition-colors duration-200 text-xl">
              {theme === 'light' ? '🌞' : '🌙'}
            </button>
            {user ? (
              <button onClick={handleLogout} className="px-4 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200">Logout</button>
            ) : (
              <div className="flex items-center gap-2">
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 border-2 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-indigo-500' : 'bg-white/10 border-white/20 focus:border-cyan-500'}`} />
                <button onClick={handleLogin} className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-500 text-white text-sm font-semibold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200">Log in</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto p-6 grid gap-8 md:grid-cols-3">
        {/* Left column - Summary & Charts */}
        <section className="md:col-span-2 space-y-8">
          <div className={`bg-gradient-to-br ${theme === 'light' ? 'from-white to-gray-50 border border-gray-200' : 'from-white/10 to-white/5 border border-white/10'} p-8 rounded-2xl shadow-xl hover:shadow-2xl transition-shadow duration-300`}>
            <h2 className="text-lg font-bold mb-6 text-gray-600">Financial Overview</h2>
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className={`p-6 rounded-xl ${theme === 'light' ? 'bg-gradient-to-br from-green-50 to-green-100 border border-green-200' : 'bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-700/30'} hover:shadow-lg transition-all duration-300 transform hover:scale-105`}>
                <div className="text-sm font-semibold text-gray-600 mb-2">💰 Total Income</div>
                <div className="text-3xl font-bold text-green-600">{formatMoney(totalIncome)}</div>
              </div>
              <div className={`p-6 rounded-xl ${theme === 'light' ? 'bg-gradient-to-br from-red-50 to-red-100 border border-red-200' : 'bg-gradient-to-br from-red-900/20 to-red-800/10 border border-red-700/30'} hover:shadow-lg transition-all duration-300 transform hover:scale-105`}>
                <div className="text-sm font-semibold text-gray-600 mb-2">💸 Total Expense</div>
                <div className="text-3xl font-bold text-red-600">{formatMoney(totalExpense)}</div>
              </div>
              <div className={`p-6 rounded-xl ${theme === 'light' ? `bg-gradient-to-br ${totalIncome - totalExpense >= 0 ? 'from-blue-50 to-blue-100 border border-blue-200' : 'from-orange-50 to-orange-100 border border-orange-200'}` : `bg-gradient-to-br ${totalIncome - totalExpense >= 0 ? 'from-blue-900/20 to-blue-800/10 border border-blue-700/30' : 'from-orange-900/20 to-orange-800/10 border border-orange-700/30'}`} hover:shadow-lg transition-all duration-300 transform hover:scale-105`}>
                <div className="text-sm font-semibold text-gray-600 mb-2">📊 Balance</div>
                <div className={`text-3xl font-bold ${totalIncome - totalExpense >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{formatMoney(totalIncome - totalExpense)}</div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-xl ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-white/5 border border-white/10'} shadow-md hover:shadow-lg transition-all duration-300`}>
                <h4 className="font-bold mb-4 text-gray-700">📈 Spending by Category</h4>
                <div className="h-64">
                  <Doughnut data={doughnutData} />
                </div>
              </div>
              <div className={`p-6 rounded-xl ${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-white/5 border border-white/10'} shadow-md hover:shadow-lg transition-all duration-300`}>
                <h4 className="font-bold mb-4 text-gray-700">📊 Income vs Expense</h4>
                <div className="h-64">
                  <Bar data={barData} />
                </div>
              </div>
            </div>
          </div>

          {/* Transactions */}
          <div className={`${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-white/5 border border-white/10'} p-8 rounded-2xl shadow-xl`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-2xl bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">💳 Transactions</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-xl border-2 ${theme === 'light' ? 'border-green-200 bg-green-50' : 'border-green-700/30 bg-green-900/10'} hover:shadow-lg transition-all duration-300`}>
                <h4 className="font-bold mb-4 text-green-700 flex items-center gap-2"><span className="text-xl">📥</span>Add Income</h4>
                <input className={`w-full mb-3 p-3 rounded-lg font-medium border-2 transition-all duration-200 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-green-500' : 'bg-white/10 border-white/20 focus:border-green-500'}`} placeholder="Income source" value={incomeForm.source} onChange={(e) => setIncomeForm(f => ({ ...f, source: e.target.value }))} />
                <input type="number" className={`w-full mb-4 p-3 rounded-lg font-medium border-2 transition-all duration-200 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-green-500' : 'bg-white/10 border-white/20 focus:border-green-500'}`} placeholder="Amount" value={incomeForm.amount} onChange={(e) => setIncomeForm(f => ({ ...f, amount: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={() => saveTransaction('income')} className="flex-1 py-3 rounded-lg bg-gradient-to-r from-green-500 to-green-600 text-white font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200">{editing.type === 'income' ? '✏️ Update' : '➕ Add'}</button>
                  <button onClick={() => { setIncomeForm({ source: '', amount: '' }); setEditing({ type: null, id: null }); }} className={`py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${theme === 'light' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-white/10 text-white hover:bg-white/20'}`}>🔄 Clear</button>
                </div>
              </div>

              <div className={`p-6 rounded-xl border-2 ${theme === 'light' ? 'border-red-200 bg-red-50' : 'border-red-700/30 bg-red-900/10'} hover:shadow-lg transition-all duration-300`}>
                <h4 className="font-bold mb-4 text-red-700 flex items-center gap-2"><span className="text-xl">📤</span>Add Expense</h4>
                <input className={`w-full mb-3 p-3 rounded-lg font-medium border-2 transition-all duration-200 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-red-500' : 'bg-white/10 border-white/20 focus:border-red-500'}`} placeholder="What did you spend on?" value={expenseForm.description} onChange={(e) => setExpenseForm(f => ({ ...f, description: e.target.value }))} />
                <input className={`w-full mb-3 p-3 rounded-lg font-medium border-2 transition-all duration-200 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-red-500' : 'bg-white/10 border-white/20 focus:border-red-500'}`} placeholder="Category (e.g., Food)" value={expenseForm.category} onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))} />
                <input type="number" className={`w-full mb-4 p-3 rounded-lg font-medium border-2 transition-all duration-200 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-red-500' : 'bg-white/10 border-white/20 focus:border-red-500'}`} placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={() => saveTransaction('expense')} className="flex-1 py-3 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white font-bold shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200">{editing.type === 'expense' ? '✏️ Update' : '➕ Add'}</button>
                  <button onClick={() => { setExpenseForm({ description: '', category: '', amount: '' }); setEditing({ type: null, id: null }); }} className={`py-3 px-4 rounded-lg font-semibold transition-all duration-200 ${theme === 'light' ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-white/10 text-white hover:bg-white/20'}`}>🔄 Clear</button>
                </div>
              </div>
            </div>

            {/* Recent lists */}
            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <div className={`p-6 rounded-xl ${theme === 'light' ? 'bg-green-50 border border-green-200' : 'bg-green-900/10 border border-green-700/30'}`}>
                <h4 className="font-bold mb-4 text-green-700 flex items-center gap-2"><span className="text-xl">📊</span>Recent Income</h4>
                {income.length === 0 ? <div className="text-center py-8 text-gray-500">💭 No income recorded yet</div> : (
                  <ul className="space-y-3">
                    {income.map(i => (
                      <li key={i.id} className={`flex justify-between items-center p-4 rounded-lg ${theme === 'light' ? 'bg-white border border-green-100' : 'bg-white/5 border border-green-700/20'} hover:shadow-md transition-all duration-200 group`}>
                        <div>
                          <div className="font-semibold text-gray-800">{i.source}</div>
                          <div className="text-sm text-gray-500">{formatMoney(i.amount)}</div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button onClick={() => startEdit('income', i)} className="text-sm px-3 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-200">✏️</button>
                          <button onClick={() => removeItem('income', i.id)} className="text-sm px-3 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors duration-200">🗑️</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={`p-6 rounded-xl ${theme === 'light' ? 'bg-red-50 border border-red-200' : 'bg-red-900/10 border border-red-700/30'}`}>
                <h4 className="font-bold mb-4 text-red-700 flex items-center gap-2"><span className="text-xl">📊</span>Recent Expenses</h4>
                {expenses.length === 0 ? <div className="text-center py-8 text-gray-500">💭 No expenses recorded yet</div> : (
                  <ul className="space-y-3">
                    {expenses.map(e => (
                      <li key={e.id} className={`flex justify-between items-center p-4 rounded-lg ${theme === 'light' ? 'bg-white border border-red-100' : 'bg-white/5 border border-red-700/20'} hover:shadow-md transition-all duration-200 group`}>
                        <div>
                          <div className="font-semibold text-gray-800">{e.description} <span className="text-xs font-normal text-gray-500 bg-gray-200/50 px-2 py-1 rounded ml-2">#{e.category}</span></div>
                          <div className="text-sm text-gray-500">{formatMoney(e.amount)}</div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button onClick={() => startEdit('expense', e)} className="text-sm px-3 py-1 rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors duration-200">✏️</button>
                          <button onClick={() => removeItem('expense', e.id)} className="text-sm px-3 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors duration-200">🗑️</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* Right column - Budgets */}
        <aside className="space-y-8">
          <div className={`${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-white/5 border border-white/10'} p-8 rounded-2xl shadow-xl hover:shadow-2xl transition-shadow duration-300`}>
            <h4 className="font-bold text-xl mb-6 bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">🎯 Budget Management</h4>
            <input className={`w-full mb-4 p-4 rounded-lg font-medium border-2 transition-all duration-200 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-indigo-500' : 'bg-white/10 border-white/20 focus:border-cyan-500'}`} placeholder="Category name" value={budgetForm.category} onChange={(e) => setBudgetForm(f => ({ ...f, category: e.target.value }))} />
            <input type="number" className={`w-full mb-6 p-4 rounded-lg font-medium border-2 transition-all duration-200 focus:outline-none ${theme === 'light' ? 'bg-white border-gray-300 focus:border-indigo-500' : 'bg-white/10 border-white/20 focus:border-cyan-500'}`} placeholder="Spending limit" value={budgetForm.amount} onChange={(e) => setBudgetForm(f => ({ ...f, amount: e.target.value }))} />
            <button onClick={saveBudget} className="w-full py-4 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-500 text-white font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200">💾 Save Budget</button>
          </div>

          <div className={`${theme === 'light' ? 'bg-white border border-gray-200' : 'bg-white/5 border border-white/10'} p-8 rounded-2xl shadow-xl`}>
            <h4 className="font-bold text-xl mb-6 bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">📈 Budget Status</h4>
            <BudgetList />
          </div>

          <div className={`${theme === 'light' ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200' : 'bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-700/30'} p-8 rounded-2xl shadow-lg`}>
            <div className="font-bold text-lg mb-4 text-blue-700 flex items-center gap-2"><span className="text-xl">💡</span>Pro Tips</div>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-lg">✓</span>
                <span className="text-gray-700">Set budgets to limit spending per category</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">✓</span>
                <span className="text-gray-700">Hover over transactions to quickly edit or delete</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">✓</span>
                <span className="text-gray-700">Your data syncs via Firestore for security</span>
              </li>
            </ul>
          </div>
        </aside>
      </main>

      <footer className={`py-8 text-center text-sm ${theme === 'light' ? 'bg-gray-100 text-gray-600 border-t border-gray-200' : 'bg-white/5 text-gray-400 border-t border-white/10'} transition-colors duration-300`}>
        <div className="max-w-6xl mx-auto">
          <p className="font-medium">✨ Built with ❤️ using React + Tailwind + Firebase</p>
          <p className="text-xs mt-2 opacity-75">© 2025 Finance Manager • All your financial data is secure</p>
        </div>
      </footer>
    </div>
  );
}
