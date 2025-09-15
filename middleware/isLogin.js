import jwt from 'jsonwebtoken'
import User from '../schema/userSchema.js'

// Ensure req.user is a real user document by awaiting DB lookup
const isLogin = async (req, res, next) => {
    try {
        // Try cookie-parser first; fallback to parsing Cookie header safely
        const rawCookie = req.cookies?.jwt || (req.headers?.cookie || '').split('; ').find((c) => c.startsWith('jwt='))?.split('=')[1];
        const token = rawCookie?.trim();

        if (!token) return res.status(401).send({ success: false, message: 'User Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded?.userId) return res.status(401).send({ success: false, message: 'User Unauthorized - Invalid Token' });

        const user = await User.findById(decoded.userId).select('-password');
        if (!user) return res.status(404).send({ success: false, message: 'User not found' });

        req.user = user; // Attach actual user document
        next();
    } catch (error) {
        console.log(`error in isLogin middleware ${error.message}`);
        res.status(500).send({
            success: false,
            message: error.message || 'Internal server error'
        })
    }
}

export default isLogin