const User        = require('../models/User');
const Client      = require('../models/Client');
const Transaction = require('../models/Transaction');
const logger      = require('./logger');

/* ── Transaction generator ───────────────────── */
let _refSeq = 0;
const makeRef = (date) => {
  const ds = new Date(date).toISOString().slice(0, 10).replace(/-/g, '');
  const n  = (++_refSeq).toString(36).padStart(4, '0').toUpperCase();
  return `TXN-${ds}-${n}`;
};

const CREDITS = [
  { description: 'Salary Deposit',          category: 'deposit',    min: 2200, max: 4800 },
  { description: 'Wire Transfer Received',   category: 'transfer',   min: 500,  max: 3000 },
  { description: 'Cash Deposit',             category: 'deposit',    min: 100,  max: 1000 },
  { description: 'Interest Credit',          category: 'interest',   min: 4,    max: 55   },
  { description: 'Refund Received',          category: 'deposit',    min: 25,   max: 450  },
  { description: 'Dividend Credit',          category: 'interest',   min: 30,   max: 200  },
];

const DEBITS = [
  { description: 'ATM Withdrawal',           category: 'withdrawal', min: 100,  max: 500  },
  { description: 'Bill Payment — Electricity', category: 'payment',  min: 75,   max: 180  },
  { description: 'Bill Payment — Internet',   category: 'payment',   min: 45,   max: 90   },
  { description: 'Bill Payment — Insurance',  category: 'payment',   min: 90,   max: 280  },
  { description: 'Grocery Store',             category: 'payment',   min: 55,   max: 230  },
  { description: 'Online Purchase',           category: 'payment',   min: 20,   max: 380  },
  { description: 'Transfer Out',              category: 'transfer',  min: 200,  max: 1400 },
  { description: 'Monthly Service Fee',       category: 'fee',       min: 5,    max: 22   },
  { description: 'POS Purchase',              category: 'payment',   min: 15,   max: 200  },
  { description: 'Subscription Charge',       category: 'payment',   min: 10,   max: 50   },
];

const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];
const round = (n, step = 5) => Math.round(n / step) * step;

function makeTransactions(clientId, targetBalance) {
  const now  = new Date();
  const N    = 18 + Math.floor(Math.random() * 10); // 18–27 transactions
  let balance = targetBalance * (0.38 + Math.random() * 0.2); // start 38–58 % of current

  const txns = [];

  for (let i = 0; i < N; i++) {
    // Spread evenly over 180 days, oldest first
    const date = new Date(now);
    date.setDate(date.getDate() - Math.round(((N - 1 - i) / (N - 1)) * 180));
    date.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));

    const type = Math.random() < 0.44 ? 'credit' : 'debit';
    let tpl, amount;

    if (type === 'credit') {
      tpl    = pick(CREDITS);
      amount = tpl.category === 'interest'
        ? Math.max(parseFloat((balance * 0.0022).toFixed(2)), 1)
        : round(tpl.min + Math.random() * (tpl.max - tpl.min));
      balance += amount;
    } else {
      tpl    = pick(DEBITS);
      const cap = Math.min(tpl.max, balance * 0.35);
      amount = tpl.category === 'fee'
        ? parseFloat((tpl.min + Math.random() * (tpl.max - tpl.min)).toFixed(2))
        : round(Math.max(tpl.min, Math.random() * cap));
      balance = Math.max(balance - amount, 0);
    }

    txns.push({
      client:       clientId,
      type,
      amount:       parseFloat(amount.toFixed(2)),
      description:  tpl.description,
      category:     tpl.category,
      reference:    makeRef(date),
      balanceAfter: parseFloat(balance.toFixed(2)),
      status:       Math.random() > 0.05
        ? 'completed'
        : (Math.random() > 0.5 ? 'pending' : 'failed'),
      date,
    });
  }

  // Final correcting transaction to land on targetBalance
  const diff = parseFloat((targetBalance - balance).toFixed(2));
  if (Math.abs(diff) >= 0.01) {
    const type = diff > 0 ? 'credit' : 'debit';
    txns.push({
      client:       clientId,
      type,
      amount:       Math.abs(diff),
      description:  type === 'credit' ? 'Salary Deposit' : 'Account Settlement',
      category:     type === 'credit' ? 'deposit' : 'payment',
      reference:    makeRef(now),
      balanceAfter: parseFloat(targetBalance.toFixed(2)),
      status:       'completed',
      date:         new Date(now.setHours(10, 0, 0, 0)),
    });
  }

  return txns;
}

async function seedTransactions(clients) {
  const all = [];
  for (const c of clients) all.push(...makeTransactions(c._id, c.balance));
  await Transaction.insertMany(all);
  logger.success(`Seeded ${all.length} transactions across ${clients.length} clients`);
}

/* ── Main seed ───────────────────────────────── */
const seed = async () => {
  const userCount = await User.countDocuments();

  if (userCount === 0) {
    logger.info('No users found — seeding default accounts…');

    const users = await User.create([
      { name: 'Super Admin', email: 'superadmin@cone.app', password: 'Admin@1234',  role: 'super_admin' },
      { name: 'Jane Admin',  email: 'admin@cone.app',      password: 'Admin@1234',  role: 'admin'       },
      { name: 'Tom Teller',  email: 'teller@cone.app',     password: 'Teller@1234', role: 'teller'      },
    ]);

    const teller = users[2];

    const clients = await Client.create([
      { name: 'Alice Johnson', email: 'alice@clients.com', phone: '555-0101', accountNumber: 'ACC-001', accountType: 'savings',  balance: 12500.00, status: 'active',    assignedTeller: teller._id },
      { name: 'Bob Smith',     email: 'bob@clients.com',   phone: '555-0102', accountNumber: 'ACC-002', accountType: 'checking', balance:  4300.50, status: 'active',    assignedTeller: teller._id },
      { name: 'Carol White',   email: 'carol@clients.com', phone: '555-0103', accountNumber: 'ACC-003', accountType: 'business', balance: 89750.00, status: 'active'                              },
      { name: 'David Brown',   email: 'david@clients.com', phone: '555-0104', accountNumber: 'ACC-004', accountType: 'savings',  balance:  2100.00, status: 'inactive'                            },
      { name: 'Eva Martinez',  email: 'eva@clients.com',   phone: '555-0105', accountNumber: 'ACC-005', accountType: 'checking', balance:  6800.25, status: 'active'                              },
      { name: 'Frank Lee',     email: 'frank@clients.com', phone: '555-0106', accountNumber: 'ACC-006', accountType: 'savings',  balance: 15000.00, status: 'active',    assignedTeller: teller._id },
    ]);

    await seedTransactions(clients);

    logger.success('Seed complete');
    logger.info('  superadmin@cone.app  /  Admin@1234  (Super Admin)');
    logger.info('  admin@cone.app       /  Admin@1234  (Admin)');
    logger.info('  teller@cone.app      /  Teller@1234 (Teller)\n');
  } else {
    // Patch: seed transactions if they are missing from an existing database
    const txnCount = await Transaction.countDocuments();
    if (txnCount === 0) {
      logger.info('Seeding transactions for existing clients…');
      const clients = await Client.find().lean();
      await seedTransactions(clients);
    }
  }
};

module.exports = seed;
