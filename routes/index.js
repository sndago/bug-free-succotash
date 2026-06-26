const express = require('express');
const router  = express.Router();

const { showLogin, login, logout }                                    = require('../controllers/authController');
const { dashboard }                                                    = require('../controllers/dashboardController');
const { clientDetail, newClientForm, createClient,
        editClientForm, updateClient, deleteClient }                   = require('../controllers/clientController');
const { requireAuth, requireAdmin, requireSuperAdmin }                 = require('../middleware/auth');

router.get('/',    showLogin);
router.post('/login',  login);
router.post('/logout', logout);

router.get('/dashboard', requireAuth, dashboard);

// Client CRUD — note: /clients/new must come before /clients/:id
router.get( '/clients/new',        requireAdmin,      newClientForm);
router.post('/clients',            requireAdmin,      createClient);
router.get( '/clients/:id',        requireAuth,       clientDetail);
router.get( '/clients/:id/edit',   requireAdmin,      editClientForm);
router.post('/clients/:id',        requireAdmin,      updateClient);
router.post('/clients/:id/delete', requireSuperAdmin, deleteClient);

module.exports = router;
