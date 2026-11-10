const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { listRecords, createRecord, updateRecord } = require('../controllers/recordsController');

// Todas as rotas de /records exigem login.
router.use(authMiddleware);

router.get('/', listRecords);
router.post('/', createRecord);
router.put('/:id', updateRecord);

module.exports = router;
