const express   = require('express');
const router    = express.Router();
const rateLimit = require('express-rate-limit');

const { showLogin, login, logout }                                    = require('../controllers/authController');
const { dashboard }                                                    = require('../controllers/dashboardController');
const { listClients, clientDetail, newClientForm, createClient,
        editClientForm, updateClient, deleteClient,
        approveClient, rejectClient,
        addAccountForm, createAccount,
        uploadPhoto }                                                   = require('../controllers/clientController');
const { newTransactionForm, createTransaction,
        editTransactionForm, updateTransaction,
        deleteTransaction,
        listRequests, listTransactions,
        approveTransaction, rejectTransaction,
        approveEditRequest, rejectEditRequest }                        = require('../controllers/transactionController');
const { listUsers, userDetail, newUserForm, createUser,
        editUserForm, updateUser,
        toggleUserActive, deleteUser, uploadUserPhoto }                = require('../controllers/userController');
const { listLogs }                                                     = require('../controllers/logController');
const { listArchive, restoreClient,
        restoreTransaction, restoreUser }                              = require('../controllers/archiveController');
const { listBranches, createBranch,
        toggleBranch, deleteBranch,
        branchBalances }                                               = require('../controllers/branchController');
const { requireAuth, requireAdmin, requireSuperAdmin }                 = require('../middleware/auth');

// Strict rate limit for login — 10 attempts per 15 min per IP, failed only
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again in 15 minutes.',
});

router.get('/',    showLogin);
router.post('/login',  loginLimiter, login);
router.post('/logout', logout);

router.get('/dashboard', requireAuth, dashboard);
router.get('/transactions', requireAuth, listTransactions);

// Client CRUD — note: /clients/new must come before /clients/:id
router.get( '/clients',            requireAuth,       listClients);
router.get( '/clients/new',        requireAuth,       newClientForm);
router.post('/clients',            requireAuth,       createClient);
router.get( '/clients/:id',        requireAuth,       clientDetail);
router.get( '/clients/:id/edit',   requireAdmin,      editClientForm);
router.post('/clients/:id',        requireAdmin,      updateClient);
router.post('/clients/:id/delete',   requireSuperAdmin, deleteClient);
router.post('/clients/:id/approve',  requireAdmin,      approveClient);
router.post('/clients/:id/reject',   requireAdmin,      rejectClient);
router.post('/clients/:id/photo',    requireAuth,       uploadPhoto);
router.get( '/clients/:id/accounts/new', requireAdmin,  addAccountForm);
router.post('/clients/:id/accounts',     requireAdmin,  createAccount);

// Transaction CRUD — tellers can create/edit pending requests; only super_admin can delete
router.get( '/clients/:clientId/transactions/new',              requireAuth,       newTransactionForm);
router.post('/clients/:clientId/transactions',                   requireAuth,       createTransaction);
router.get( '/clients/:clientId/transactions/:txnId/edit',      requireAuth,       editTransactionForm);
router.post('/clients/:clientId/transactions/:txnId',           requireAuth,       updateTransaction);
router.post('/clients/:clientId/transactions/:txnId/delete',    requireSuperAdmin, deleteTransaction);

// Staff management — admin manages tellers; super_admin manages admins + tellers
router.get( '/users',              requireAdmin,      listUsers);
router.get( '/users/new',          requireAdmin,      newUserForm);
router.get( '/users/:id',          requireAdmin,      userDetail);
router.post('/users',              requireAdmin,      createUser);
router.get( '/users/:id/edit',     requireAdmin,      editUserForm);
router.post('/users/:id',          requireAdmin,      updateUser);
router.post('/users/:id/toggle',   requireAdmin,      toggleUserActive);
router.post('/users/:id/photo',    requireAdmin,      uploadUserPhoto);
router.post('/users/:id/delete',   requireSuperAdmin, deleteUser);

// Branch management — admin and super_admin only
router.get( '/branches/balances',          requireAdmin,      branchBalances);
router.get( '/branches',                   requireAdmin,      listBranches);
router.post('/branches',                   requireAdmin,      createBranch);
router.post('/branches/:id/toggle',        requireAdmin,      toggleBranch);
router.post('/branches/:id/delete',        requireSuperAdmin, deleteBranch);

// Activity logs — admin and super_admin only
router.get('/logs', requireAdmin, listLogs);

// Archive — super_admin only
router.get( '/archive',                               requireSuperAdmin, listArchive);
router.post('/archive/clients/:id/restore',           requireSuperAdmin, restoreClient);
router.post('/archive/transactions/:id/restore',      requireSuperAdmin, restoreTransaction);
router.post('/archive/users/:id/restore',             requireSuperAdmin, restoreUser);

// Approval workflow — admin and super_admin only
router.get( '/requests',                           requireAdmin, listRequests);
router.post('/transactions/:txnId/approve',        requireAdmin, approveTransaction);
router.post('/transactions/:txnId/reject',         requireAdmin, rejectTransaction);
router.post('/transactions/:txnId/approve-edit',   requireAdmin, approveEditRequest);
router.post('/transactions/:txnId/reject-edit',    requireAdmin, rejectEditRequest);

module.exports = router;
