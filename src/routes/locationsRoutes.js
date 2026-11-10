const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { listLocations, createLocation, updateLocation, deleteLocation } = require('../controllers/locationsController');

// Todas as rotas de /locations exigem login; cada usuário só vê os próprios locais.
router.use(authMiddleware);

router.get('/', listLocations);
router.post('/', createLocation);
router.put('/:id', updateLocation);
router.delete('/:id', deleteLocation);

module.exports = router;
