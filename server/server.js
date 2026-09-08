const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const db = require('./db');

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "773475002367-kfmlifn4bn181tdlts94ss2q2jmisdaa.apps.googleusercontent.com");
const JWT_SECRET = process.env.JWT_SECRET || 'vava-sports-super-secret-key';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'admin@vavasports.com';

// 1. Google Authentication Endpoint
app.post('/api/auth/google', async (req, res) => {
    try {
        const { token, role } = req.body;
        
        // Verify Google Token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: "773475002367-kfmlifn4bn181tdlts94ss2q2jmisdaa.apps.googleusercontent.com"
        });
        
        const payload = ticket.getPayload();
        const email = payload.email;
        const googleId = payload.sub;
        const name = payload.name;

        // Check superadmin table
        const [verifiedRows] = await db.execute('SELECT * FROM vsa_superadmin WHERE admin_email = ?', [email]);
        if (verifiedRows.length === 0 && email !== SUPERADMIN_EMAIL) {
             return res.status(403).json({ error: "You aren't a verified user." });
        }

        let dbUser = null;
        let finalRole = role; // Default to requested role, verify below

        if (email === SUPERADMIN_EMAIL) {
            finalRole = 'admin';
            dbUser = { id: 0, name: 'Super Admin', email };
        } else if (role === 'coach') {
            const [rows] = await db.execute('SELECT * FROM vsa_coaches WHERE coach_email = ?', [email]);
            if (rows.length > 0) {
                dbUser = rows[0];
                // Update google_id if first login
                if (!dbUser.google_id) {
                    await db.execute('UPDATE vsa_coaches SET google_id = ? WHERE coach_id = ?', [googleId, dbUser.coach_id]);
                }
            } else {
                return res.status(403).json({ error: 'Access denied. Email not found in Coaches database.' });
            }
        } else if (role === 'student') {
            const [rows] = await db.execute('SELECT * FROM vsa_students WHERE student_email = ?', [email]);
            if (rows.length > 0) {
                dbUser = rows[0];
                 if (!dbUser.google_id) {
                    await db.execute('UPDATE vsa_students SET google_id = ? WHERE student_id = ?', [googleId, dbUser.student_id]);
                }
            } else {
                return res.status(403).json({ error: 'Access denied. Email not found in Students database.' });
            }
        }

        if (!dbUser) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        // Generate Session Token
        const sessionToken = jwt.sign(
            { 
                id: dbUser.coach_id || dbUser.student_id || dbUser.id, 
                role: finalRole,
                email: email,
                name: name
            }, 
            JWT_SECRET, 
            { expiresIn: '24h' }
        );

        res.json({ success: true, token: sessionToken, user: dbUser, role: finalRole });

    } catch (error) {
        console.error("Auth Error:", error);
        res.status(401).json({ error: 'Invalid Google Token' });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`VAVA Sports Backend running on port ${PORT}`);
});
