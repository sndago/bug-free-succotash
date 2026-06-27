const express = require('express');
const router  = express.Router();

const { showLogin, login, logout }                                    = require('../controllers/authController');
const { dashboard }                                                    = require('../controllers/dashboardController');
const { listClients, clientDetail, newClientForm, createClient,
        editClientForm, updateClient, deleteClient,
        approveClient, rejectClient }                                  = require('../controllers/clientController');
const { newTransactionForm, createTransaction,
        editTransactionForm, updateTransaction,
        deleteTransaction,
        listRequests, listTransactions,
        approveTransaction, rejectTransaction,
        approveEditRequest, rejectEditRequest }                        = require('../controllers/transactionController');
const { listUsers, newUserForm, createUser,
        editUserForm, updateUser,
        toggleUserActive, deleteUser }                                 = require('../controllers/userController');
const { listLogs }                                                     = require('../controllers/logController');
const { requireAuth, requireAdmin, requireSuperAdmin }                 = require('../middleware/auth');

router.get('/',    showLogin);
router.post('/login',  login);
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

// Transaction CRUD — tellers can create/edit pending requests; only super_admin can delete
router.get( '/clients/:clientId/transactions/new',              requireAuth,       newTransactionForm);
router.post('/clients/:clientId/transactions',                   requireAuth,       createTransaction);
router.get( '/clients/:clientId/transactions/:txnId/edit',      requireAuth,       editTransactionForm);
router.post('/clients/:clientId/transactions/:txnId',           requireAuth,       updateTransaction);
router.post('/clients/:clientId/transactions/:txnId/delete',    requireSuperAdmin, deleteTransaction);

// Staff management — admin manages tellers; super_admin manages admins + tellers
router.get( '/users',              requireAdmin,      listUsers);
router.get( '/users/new',          requireAdmin,      newUserForm);
router.post('/users',              requireAdmin,      createUser);
router.get( '/users/:id/edit',     requireAdmin,      editUserForm);
router.post('/users/:id',          requireAdmin,      updateUser);
router.post('/users/:id/toggle',   requireAdmin,      toggleUserActive);
router.post('/users/:id/delete',   requireSuperAdmin, deleteUser);

// Activity logs — admin and super_admin only
router.get('/logs', requireAdmin, listLogs);

// Approval workflow — admin and super_admin only
router.get( '/requests',                           requireAdmin, listRequests);
router.post('/transactions/:txnId/approve',        requireAdmin, approveTransaction);
router.post('/transactions/:txnId/reject',         requireAdmin, rejectTransaction);
router.post('/transactions/:txnId/approve-edit',   requireAdmin, approveEditRequest);
router.post('/transactions/:txnId/reject-edit',    requireAdmin, rejectEditRequest);

module.exports = router;
