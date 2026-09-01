const jwt = require('jsonwebtoken');

// Validates the Bearer JWT on every protected request.
// Attaches the decoded payload to req.user so route handlers can read it.
const isAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Token is NULL' });
    }

    // TODO: JWT_SECRET must be set in .env
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token is INVALID' });
        }
        req.user = user;
        next();
    });
};

module.exports = isAuth;
