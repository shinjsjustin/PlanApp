const express = require('express');
const path = require('path');

const { renderPage } = require('../legal/render');

const router = express.Router();

const PAGE_NAMES = ['about', 'privacy', 'terms'];
const TOKENS_CSS = path.join(__dirname, '../client/src/index.css');
const LEGAL_CSS = path.join(__dirname, '../legal/legal.css');

PAGE_NAMES.forEach((name) => {
    router.get(`/${name}`, (req, res) => {
        res.type('html').send(renderPage(name));
    });
});

router.get('/legal/tokens.css', (req, res) => res.type('css').sendFile(TOKENS_CSS));
router.get('/legal/legal.css', (req, res) => res.type('css').sendFile(LEGAL_CSS));

module.exports = router;
