import React, { useEffect, useState, useRef } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import {
  getFirestore, enableIndexedDbPersistence, collection, doc, setDoc, addDoc,
  updateDoc, deleteDoc, onSnapshot, orderBy, query, serverTimestamp
} from 'firebase/firestore';

Chart.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

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

enableIndexedDbPersistence(db).catch(() => {});

const formatMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

function BudgetList({ budgets, catTotals, formatMoney }) {
  return (
    <div>
      {Object.keys(budgets).length === 0 ? (
        <div className="text-center text-sm text-gray-400 p-6 mx-auto w full">No budgets set</div>
      ) : (
        Object.entries(budgets).map(([cat, limit]) => {
          const spent = catTotals[cat] || 0;
          const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
          const barStyle = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-yellow-400' : 'bg-green-500';
          return (
            <div key={cat} className="mb-4">
              <div className="flex justify-between text-sm">
                <span>{cat}</span>
                <span>{formatMoney(spent)} / {formatMoney(limit)}</span>
              </div>
              <div className="w-full bg-opacity-10 bg-gray-200 rounded h-2 mt-2 overflow-hidden">
                <div className={`${barStyle} h-full`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState(localStorage.getItem('guestName') || '');
  const [status, setStatus] = useState('Offline');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  const [income, setIncome] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState({});

  const [incomeForm, setIncomeForm] = useState({ source: '', amount: '' });
  const [expenseForm, setExpenseForm] = useState({ description: '', category: '', amount: '' });
  const [budgetForm, setBudgetForm] = useState({ category: '', amount: '' });
  const [editing, setEditing] = useState({ type: null, id: null });

  const unsubRefs = useRef({ income: null, expense: null, budgets: null });

  function cleanupListeners() {
    if (unsubRefs.current.income) unsubRefs.current.income();
    if (unsubRefs.current.expense) unsubRefs.current.expense();
    if (unsubRefs.current.budgets) unsubRefs.current.budgets();
    unsubRefs.current = { income: null, expense: null, budgets: null };
  }

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u && localStorage.getItem('guestName')) {
        setUser(u);
        setStatus('Online');
      } else {
        setUser(null);
        setStatus('Offline');
        setIncome([]); setExpenses([]); setBudgets({});
        cleanupListeners();
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    const qInc = query(collection(db, 'users', uid, 'income'), orderBy('date', 'desc'));
    unsubRefs.current.income = onSnapshot(qInc, (snap) => {
      setIncome(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Income snapshot error', err));

    const qExp = query(collection(db, 'users', uid, 'expenses'), orderBy('date', 'desc'));
    unsubRefs.current.expense = onSnapshot(qExp, (snap) => {
      setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Expense snapshot error', err));

    const budgetsCol = collection(db, 'users', uid, 'budgets');
    unsubRefs.current.budgets = onSnapshot(budgetsCol, (snap) => {
      const b = {};
      snap.forEach(d => b[d.id] = d.data().amount);
      setBudgets(b);
    }, (err) => console.error('Budget snapshot error', err));

    return () => cleanupListeners();
  }, [user]);

  

  const handleLogin = async () => {
    if (!displayName || displayName.trim().length === 0) return alert('Enter a display name');
    try {
      await signInAnonymously(auth);
      const u = auth.currentUser;
      await setDoc(doc(db, 'users', u.uid), { displayName: displayName.trim(), createdAt: serverTimestamp() }, { merge: true });
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

  const saveTransaction = async (type) => {
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

  const removeItem = async (type, id) => {
    if (!user) return;
    const uid = user.uid;
    if (!confirm('Delete this item?')) return;
    try {
      await deleteDoc(doc(db, 'users', uid, type === 'income' ? 'income' : 'expenses', id));
    } catch (err) {
      console.error(err);
    }
  };

  const startEdit = (type, item) => {
    setEditing({ type, id: item.id });
    if (type === 'income') setIncomeForm({ source: item.source || '', amount: item.amount || '' });
    else setExpenseForm({ description: item.description || '', category: item.category || '', amount: item.amount || '' });
  };

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

  const totalIncome = income.reduce((s, it) => s + (it.amount || 0), 0);
  const totalExpense = expenses.reduce((s, it) => s + (it.amount || 0), 0);
  const catTotals = expenses.reduce((acc, it) => { const c = it.category || 'Uncategorized'; acc[c] = (acc[c] || 0) + (it.amount || 0); return acc; }, {});

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

  

  return (
    <div className={`min-h-screen w-screen mx-auto ${theme === 'light' ? 'bg-gray-50 text-gray-800' : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 text-gray-100'}`}>
      <header className={`backdrop-blur sticky top-0 z-50 ${theme === 'light' ? 'bg-white/60 border-b' : 'bg-slate-900/60 border-b border-slate-800'} px-4 py-3`}> 
        <div className=" mx-auto flex w-screen items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 rounded-md bg-gradient-to-r from-indigo-600 to-cyan-500 text-white">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L3 6v6c0 5 3.58 9.74 9 10 5.42-.26 9-5 9-10V6l-9-4z" fill="currentColor"/></svg>
            </div>
            <div>
              <div className="font-semibold text-lg">Finance Manager</div>
              <div className="text-xs text-gray-400">Track income, expenses & budgets</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3">
              <div className="text-sm">
                <div className="font-medium">{localStorage.getItem('guestName') || displayName || 'Guest User'}</div>
                <div className={`text-xs ${status === 'Online' ? 'text-green-400' : 'text-gray-400'}`}>{status}</div>
              </div>
            </div>
            <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-2 rounded-full hover:bg-white/5">
              {theme === 'light' ? '🌞' : '🌙'}
            </button>
            {user ? (
              <button onClick={handleLogout} className="px-3 py-2 rounded-md bg-red-600 text-white text-sm">Logout</button>
            ) : (
              <div className="flex items-center gap-2">
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="px-3 py-2 rounded bg-white/5 text-sm" />
                <button onClick={handleLogin} className="px-3 py-2 rounded bg-gradient-to-r from-indigo-600 to-cyan-500 text-white text-sm">Log in</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 grid gap-6 md:grid-cols-3">
        <section className="md:col-span-2 space-y-6">
          <div className="bg-gradient-to-br from-white/5 to-white/3 p-4 rounded-lg shadow">
            <div className="flex justify-between items-center mb-2">
              <div>
                <div className="text-sm text-gray-400">Total Income</div>
                <div className="text-2xl font-semibold text-green-300">{formatMoney(totalIncome)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Total Expense</div>
                <div className="text-2xl font-semibold text-red-400">{formatMoney(totalExpense)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Balance</div>
                <div className={`text-2xl font-semibold ${totalIncome - totalExpense >= 0 ? 'text-white' : 'text-red-400'}`}>{formatMoney(totalIncome - totalExpense)}</div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white/5 p-3 rounded">
                <h4 className="font-medium mb-2">Spending by Category</h4>
                <Doughnut data={doughnutData} />
              </div>
              <div className="bg-white/5 p-3 rounded">
                <h4 className="font-medium mb-2">Income vs Expense</h4>
                <Bar data={barData} />
              </div>
            </div>
          </div>

          <div className="bg-white/3 p-4 rounded-lg shadow">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Transactions</h3>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-3 bg-white/5 rounded">
                <h4 className="font-medium mb-2">Add Income</h4>
                <input className="w-full mb-2 p-2 rounded bg-white/5" placeholder="Source" value={incomeForm.source} onChange={(e) => setIncomeForm(f => ({ ...f, source: e.target.value }))} />
                <input type="number" className="w-full mb-2 p-2 rounded bg-white/5" placeholder="Amount" value={incomeForm.amount} onChange={(e) => setIncomeForm(f => ({ ...f, amount: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={() => saveTransaction('income')} className="flex-1 py-2 rounded bg-gradient-to-r from-green-500 to-green-400 text-white">{editing.type === 'income' ? 'Update' : 'Add'}</button>
                  <button onClick={() => { setIncomeForm({ source: '', amount: '' }); setEditing({ type: null, id: null }); }} className="py-2 px-3 rounded bg-white/5">Clear</button>
                </div>
              </div>

              <div className="p-3 bg-white/5 rounded">
                <h4 className="font-medium mb-2">Add Expense</h4>
                <input className="w-full mb-2 p-2 rounded bg-white/5" placeholder="Description" value={expenseForm.description} onChange={(e) => setExpenseForm(f => ({ ...f, description: e.target.value }))} />
                <input className="w-full mb-2 p-2 rounded bg-white/5" placeholder="Category" value={expenseForm.category} onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))} />
                <input type="number" className="w-full mb-2 p-2 rounded bg-white/5" placeholder="Amount" value={expenseForm.amount} onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
                <div className="flex gap-2">
                  <button onClick={() => saveTransaction('expense')} className="flex-1 py-2 rounded bg-gradient-to-r from-red-500 to-red-400 text-white">{editing.type === 'expense' ? 'Update' : 'Add'}</button>
                  <button onClick={() => { setExpenseForm({ description: '', category: '', amount: '' }); setEditing({ type: null, id: null }); }} className="py-2 px-3 rounded bg-white/5">Clear</button>
                </div>
              </div>
            </div>

            <div className="mt-6 grid md:grid-cols-2 gap-4">
              <div className="bg-white/5 p-3 rounded">
                <h4 className="font-medium mb-2">Recent Income</h4>
                {income.length === 0 ? <div className="text-sm text-gray-400">No income yet</div> : (
                  <ul className="space-y-2">
                    {income.map(i => (
                      <li key={i.id} className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{i.source}</div>
                          <div className="text-xs text-gray-400">{formatMoney(i.amount)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit('income', i)} className="text-sm px-2 py-1 rounded bg-white/5">Edit</button>
                          <button onClick={() => removeItem('income', i.id)} className="text-sm px-2 py-1 rounded bg-red-600 text-white">Delete</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-white/5 p-3 rounded">
                <h4 className="font-medium mb-2">Recent Expenses</h4>
                {expenses.length === 0 ? <div className="text-sm text-gray-400">No expenses yet</div> : (
                  <ul className="space-y-2">
                    {expenses.map(e => (
                      <li key={e.id} className="flex justify-between items-center">
                        <div>
                          <div className="font-medium">{e.description} <span className="text-xs text-gray-400">({e.category})</span></div>
                          <div className="text-xs text-gray-400">{formatMoney(e.amount)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => startEdit('expense', e)} className="text-sm px-2 py-1 rounded bg-white/5">Edit</button>
                          <button onClick={() => removeItem('expense', e.id)} className="text-sm px-2 py-1 rounded bg-red-600 text-white">Delete</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="bg-white/5 p-4 rounded shadow">
            <h4 className="font-semibold mb-3">Budget Management</h4>
            <input className="w-full mb-2 p-2 rounded bg-white/5" placeholder="Category" value={budgetForm.category} onChange={(e) => setBudgetForm(f => ({ ...f, category: e.target.value }))} />
            <input type="number" className="w-full mb-2 p-2 rounded bg-white/5" placeholder="Limit amount" value={budgetForm.amount} onChange={(e) => setBudgetForm(f => ({ ...f, amount: e.target.value }))} />
            <button onClick={saveBudget} className="w-full py-2 rounded bg-gradient-to-r from-indigo-600 to-cyan-500 text-white">Save Budget</button>
          </div>

          <div className="bg-white/5 p-4 rounded shadow">
            <h4 className="font-semibold mb-3">Budget Status</h4>
            <BudgetList budgets={budgets} catTotals={catTotals} formatMoney={formatMoney} />
          </div>

          <div className="bg-white/5 p-4 rounded shadow text-sm text-gray-400">
            <div className="font-medium mb-2">Tips</div>
            <ul className="list-disc ml-4 space-y-1">
              <li>Use budgets to cap spending per category.</li>
              <li>Click edit to update entries quickly.</li>
              <li>Data persists via Firestore; set security rules to protect user data.</li>
            </ul>
          </div>
        </aside>
      </main>

      <footer className="py-6 text-center text-sm text-gray-400">Built with ❤️ · React + Tailwind + Firebase</footer>
    </div>
  );
}
