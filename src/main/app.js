require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3000;
const FARE_PER_TRIP = Number(process.env.FARE_PER_TRIP) || 20;
const crypto = require('crypto'); // Require crypto for OTP generation

if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET environment variable is required.');
}

app.use(bodyParser.json());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

const db = mysql.createPool({
    host: process.env.MS_HOST,
    user: process.env.MS_USER,
    password: process.env.MS_PASS,
    database: process.env.MS_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

db.getConnection((err, conn) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to MySQL database.');
    conn.release();
});

// Ensure pin column exists in students table
db.query("SHOW COLUMNS FROM students LIKE 'pin'", (err, results) => {
    if (!err && results && results.length === 0) {
        db.query('ALTER TABLE students ADD COLUMN pin VARCHAR(255)', (alterErr) => {
            if (alterErr) console.log('Note on adding pin column:', alterErr.message);
        });
    }
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Helper function to send email
const sendEmail = (to, subject, text) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text
    };

    return new Promise((resolve, reject) => {
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                reject(error);
            } else {
                resolve(info);
            }
        });
    });
};

// Middleware to require authenticated server-side session
const requireAuth = (req, res, next) => {
    if (req.session && req.session.studentId) {
        return next();
    }
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
};

// API route to check current session status
app.get('/api/session', (req, res) => {
    if (req.session && req.session.studentId) {
        return res.json({
            authenticated: true,
            studentId: req.session.studentId,
            name: req.session.studentName
        });
    }
    return res.json({ authenticated: false });
});

// API route to log out and destroy session
app.post('/api/logout', (req, res) => {
    if (req.session) {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Error logging out.' });
            }
            res.clearCookie('connect.sid');
            return res.json({ success: true, message: 'Logged out successfully.' });
        });
    } else {
        return res.json({ success: true, message: 'Logged out successfully.' });
    }
});

// API route to register student or set PIN
app.post('/api/register', async (req, res) => {
    const { studentId, name, email, pin } = req.body;
    if (!studentId || !pin) {
        return res.status(400).json({ success: false, message: 'Student ID and PIN are required.' });
    }

    const pinStr = String(pin).trim();
    if (pinStr.length < 4) {
        return res.status(400).json({ success: false, message: 'PIN must be at least 4 digits.' });
    }

    try {
        const hashedPin = await bcrypt.hash(pinStr, 10);
        const [existing] = await db.promise().execute('SELECT * FROM students WHERE studentid = ?', [studentId]);

        if (existing.length > 0) {
            await db.promise().execute(
                'UPDATE students SET pin = ? WHERE studentid = ?',
                [hashedPin, studentId]
            );
            return res.json({ success: true, message: 'PIN set successfully.' });
        } else {
            await db.promise().execute(
                'INSERT INTO students (studentid, name, email, credits, card_status, pin) VALUES (?, ?, ?, ?, ?, ?)',
                [studentId, name || studentId, email || `${studentId}@vitstudent.ac.in`, 100, 'active', hashedPin]
            );
            return res.json({ success: true, message: 'Student registered successfully.' });
        }
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ success: false, message: 'Database error during registration.' });
    }
});

app.post('/api/login', async (req, res) => {
    const { studentId, pin } = req.body;

    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    try {
        const [rows] = await db.promise().execute('SELECT name, credits, pin FROM students WHERE studentid = ?', [studentId]);

        if (rows.length === 0) {
            return res.json({
                success: false,
                message: 'Invalid student ID.'
            });
        }

        const student = rows[0];
        if (student.pin) {
            if (!pin) {
                return res.status(400).json({ success: false, message: 'PIN is required.' });
            }
            const isMatch = await bcrypt.compare(String(pin), student.pin);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Invalid PIN.' });
            }
        }

        req.session.studentId = studentId;
        req.session.studentName = student.name;

        return res.json({
            success: true,
            name: student.name,
            newCredits: student.credits
        });
    } catch (error) {
        console.error('Database error:', error);
        return res.status(500).json({ success: false, message: 'An error occurred. Please try again later.' });
    }
});

// Middleware to check if card is blocked
const checkCardStatus = (req, res, next) => {
    const studentId = req.session?.studentId || req.body?.studentId || req.params?.studentId;
    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }
    
    const query = 'SELECT card_status FROM students WHERE studentid = ?';
    db.query(query, [studentId], (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ success: false, message: 'Student not found or database error.' });
        }

        if (results[0].card_status === 'blocked') {
            return res.status(403).json({ success: false, message: 'Access Denied! Card is Blocked.' });
        }

        next(); // Proceed if card is not blocked
    });
};

// API route to process shuttle payment (requires session and PIN)
app.post('/api/pay', requireAuth, checkCardStatus, async (req, res) => {
    const studentId = req.session.studentId;
    const { pin } = req.body;
    if (!pin) {
        return res.status(400).json({ success: false, message: 'PIN is required for payment.' });
    }

    let connection;
    try {
        connection = await db.promise().getConnection();
        await connection.beginTransaction();

        const [results] = await connection.execute(
            'SELECT * FROM students WHERE studentId = ? FOR UPDATE',
            [studentId]
        );

        if (results.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        const student = results[0];
        if (student.pin) {
            const isPinValid = await bcrypt.compare(String(pin), student.pin);
            if (!isPinValid) {
                await connection.rollback();
                connection.release();
                return res.status(401).json({ success: false, message: 'Invalid PIN.' });
            }
        }

        if (student.credits < FARE_PER_TRIP) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Not enough credits.' });
        }

        const newCredits = student.credits - FARE_PER_TRIP;
        await connection.execute(
            'UPDATE students SET credits = ? WHERE studentId = ?',
            [newCredits, studentId]
        );

        await connection.execute(
            'INSERT INTO payment_history (studentId, amount, type) VALUES (?, ?, ?)',
            [studentId, FARE_PER_TRIP, 'Trip Payment']
        );

        await connection.commit();
        connection.release();

        try {
            await sendEmail(
                student.email,
                'Payment Successful',
                `Payment successful! ${FARE_PER_TRIP} credits have been deducted for ${student.name}. Your current balance is ${newCredits} credits.`
            );

            return res.json({
                success: true,
                message: `Payment successful. ${FARE_PER_TRIP} credits deducted for ${student.name}. Email sent to ${student.email}.`,
                email: student.email,
                newCredits
            });
        } catch (emailError) {
            return res.status(500).json({ success: false, message: 'Payment processed but failed to send email.' });
        }
    } catch (err) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                console.error('Rollback error:', rollbackErr);
            }
            connection.release();
        }
        console.error('Payment error:', err);
        return res.status(500).json({ success: false, message: 'Database error.' });
    }
});

// API route to add credits (requires session and PIN)
app.post('/api/add-credits', requireAuth, checkCardStatus, async (req, res) => {
    const studentId = req.session.studentId;
    const { credits, pin } = req.body;
    if (credits === undefined || credits === null || credits === '') {
        return res.status(400).json({ success: false, message: 'Credits amount is required.' });
    }
    if (!pin) {
        return res.status(400).json({ success: false, message: 'PIN is required to add credits.' });
    }

    const numCredits = Number(credits);
    if (typeof credits === 'boolean' || isNaN(numCredits) || !Number.isFinite(numCredits) || numCredits <= 0 || !Number.isInteger(numCredits)) {
        return res.status(400).json({ success: false, message: 'Invalid credits amount. Must be a positive integer.' });
    }

    try {
        const [students] = await db.promise().execute('SELECT * FROM students WHERE studentId = ?', [studentId]);
        if (students.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        const student = students[0];
        if (student.pin) {
            const isPinValid = await bcrypt.compare(String(pin), student.pin);
            if (!isPinValid) {
                return res.status(401).json({ success: false, message: 'Invalid PIN.' });
            }
        }

        await db.promise().execute('UPDATE students SET credits = credits + ? WHERE studentId = ?', [numCredits, studentId]);

        // Insert into payment history
        await db.promise().execute('INSERT INTO payment_history (studentId, amount, type) VALUES (?, ?, ?)', [studentId, numCredits, 'Credit Addition']);

        // Get updated balance
        const [updatedRows] = await db.promise().execute('SELECT credits FROM students WHERE studentId = ?', [studentId]);
        const updatedCredits = updatedRows[0].credits;

        try {
            await sendEmail(
                student.email,
                'Credits Added',
                `${numCredits} credits have been added to your account. Your new balance is ${updatedCredits} credits.`
            );

            return res.json({
                success: true,
                message: `${numCredits} credits added successfully. New balance: ${updatedCredits}`,
                newCredits: updatedCredits
            });
        } catch (emailError) {
            return res.status(500).json({ success: true, message: 'Credits added but failed to send email.' });
        }
    } catch (err) {
        console.error('Database update error in add-credits:', err);
        return res.status(500).json({ success: false, message: 'Database error.' });
    }
});

// API route to get payment history (requires session, supports pagination)
app.get('/api/payment-history', requireAuth, async (req, res) => {
    const studentId = req.session.studentId;
    let page = parseInt(req.query.page, 10);
    let limit = parseInt(req.query.limit, 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;

    const offset = (page - 1) * limit;

    try {
        const [countResult] = await db.promise().query(
            'SELECT COUNT(*) AS total FROM payment_history WHERE studentId = ?',
            [studentId]
        );
        const total = countResult[0].total;

        const [results] = await db.promise().query(
            'SELECT * FROM payment_history WHERE studentId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
            [studentId, limit, offset]
        );

        return res.json({
            success: true,
            history: results,
            page,
            limit,
            total
        });
    } catch (err) {
        console.error('Database query error in payment-history:', err);
        return res.status(500).json({ success: false, message: 'Database error.' });
    }
});

// Function to generate a random 6-digit OTP
const generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;
let otpStorage = {}; // Temporary storage for OTPs: { [studentId]: { otp, expiresAt, attempts } }

const verifyAndConsumeOtp = (studentId, inputOtp) => {
    const record = otpStorage[studentId];
    if (!record) {
        return { valid: false, message: 'Invalid or expired OTP. Please try again.' };
    }

    if (Date.now() > record.expiresAt) {
        delete otpStorage[studentId];
        return { valid: false, message: 'Invalid or expired OTP. Please try again.' };
    }

    record.attempts = (record.attempts || 0) + 1;

    if (record.attempts > MAX_OTP_ATTEMPTS) {
        delete otpStorage[studentId];
        return { valid: false, message: 'Too many failed attempts. OTP has been invalidated.' };
    }

    if (record.otp !== inputOtp) {
        if (record.attempts >= MAX_OTP_ATTEMPTS) {
            delete otpStorage[studentId];
            return { valid: false, message: 'Too many failed attempts. OTP has been invalidated.' };
        }
        return { valid: false, message: 'Invalid or expired OTP. Please try again.' };
    }

    delete otpStorage[studentId];
    return { valid: true };
};

// API route to block card (requires session and PIN)
app.post('/api/block-card', requireAuth, async (req, res) => {
    const studentId = req.session.studentId;
    const { pin } = req.body;
    if (!pin) {
        return res.status(400).json({ success: false, message: 'PIN is required to block card.' });
    }

    try {
        const [results] = await db.promise().execute('SELECT email, pin FROM students WHERE studentId = ?', [studentId]);
        if (results.length === 0) {
            return res.status(500).json({ success: false, message: 'Student not found.' });
        }

        const student = results[0];
        if (student.pin) {
            const isPinValid = await bcrypt.compare(String(pin), student.pin);
            if (!isPinValid) {
                return res.status(401).json({ success: false, message: 'Invalid PIN.' });
            }
        }

        const studentEmail = student.email;
        const otp = generateOtp();
        otpStorage[studentId] = {
            otp,
            expiresAt: Date.now() + OTP_EXPIRY_MS,
            attempts: 0
        };

        try {
            // Send the OTP to the student's email
            await sendEmail(
                studentEmail,
                'OTP for Card Blocking',
                `Your OTP for blocking your card is: ${otp}`
            );

            return res.json({ success: true, message: 'OTP sent to your registered email. Please verify to block your card.' });
        } catch (emailError) {
            return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
        }
    } catch (err) {
        console.error('Database query error in block-card:', err);
        return res.status(500).json({ success: false, message: 'Database error.' });
    }
});

// API to verify OTP and block the card (requires session)
app.post('/api/verify-otp-and-block', requireAuth, (req, res) => {
    const studentId = req.session.studentId;
    const { otp } = req.body;

    if (!otp) {
        return res.status(400).json({ success: false, message: 'OTP is required.' });
    }

    const verification = verifyAndConsumeOtp(studentId, otp);
    if (!verification.valid) {
        return res.status(400).json({ success: false, message: verification.message });
    }

    // OTP is valid, proceed with blocking the card
    const updateStatusQuery = 'UPDATE students SET card_status = "blocked" WHERE studentId = ?';

    db.query(updateStatusQuery, [studentId], (err, result) => {
        if (err) {
            console.error('Error updating card status:', err);
            return res.status(500).json({ success: false, message: 'Failed to block the card. Database error occurred.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Student ID not found. Please check and try again.' });
        }

        return res.json({ success: true, message: 'Your card has been blocked successfully.' });
    });
});


// Function to handle card renewal/reactivation after OTP verification
const handleCardReactivation = (studentId, res) => {
    const query = 'SELECT * FROM students WHERE studentId = ?';
    db.query(query, [studentId], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ success: false, message: 'Database error or student not found.' });
        }

        const student = results[0];
        const updateStatusQuery = 'UPDATE students SET card_status = "active" WHERE studentId = ?';
        db.query(updateStatusQuery, [studentId], async (updateErr) => {
            if (updateErr) {
                return res.status(500).json({ success: false, message: 'Error renewing the card.' });
            }

            try {
                await sendEmail(
                    student.email,
                    'New Card Request',
                    'A new card has been requested for your account. Please visit the administration office to collect your new card.'
                );

                res.json({ success: true, message: 'New card request processed. Your card is now active.' });
            } catch (emailError) {
                res.status(500).json({ success: false, message: 'Card reactivated but failed to send confirmation email.' });
            }
        });
    });
};

// API route to request a new card (requires session, sends OTP for verification)
app.post('/api/request-new-card', requireAuth, (req, res) => {
    const studentId = req.session.studentId;
    const { otp } = req.body;

    // If OTP is provided directly, verify it
    if (otp) {
        const verification = verifyAndConsumeOtp(studentId, otp);
        if (verification.valid) {
            return handleCardReactivation(studentId, res);
        } else {
            return res.status(400).json({ success: false, message: verification.message });
        }
    }

    const query = 'SELECT email FROM students WHERE studentId = ?';
    db.query(query, [studentId], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ success: false, message: 'Database error or student not found.' });
        }

        const studentEmail = results[0].email;
        const generatedOtp = generateOtp();
        otpStorage[studentId] = {
            otp: generatedOtp,
            expiresAt: Date.now() + OTP_EXPIRY_MS,
            attempts: 0
        };

        try {
            await sendEmail(
                studentEmail,
                'OTP for New Card Request',
                `Your OTP for requesting a new card is: ${generatedOtp}`
            );

            res.json({ success: true, message: 'OTP sent to your registered email. Please verify to request a new card.' });
        } catch (emailError) {
            res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
        }
    });
});

// API route to verify OTP and reactivate card for new card request (requires session)
app.post('/api/verify-otp-and-request-new-card', requireAuth, (req, res) => {
    const studentId = req.session.studentId;
    const { otp } = req.body;

    if (!otp) {
        return res.status(400).json({ success: false, message: 'OTP is required.' });
    }

    const verification = verifyAndConsumeOtp(studentId, otp);
    if (verification.valid) {
        return handleCardReactivation(studentId, res);
    } else {
        return res.status(400).json({ success: false, message: verification.message });
    }
});

// Blocked status check for all other actions
app.post('/api/perform-action', requireAuth, checkCardStatus, (req, res) => {
    res.json({ success: true, message: 'Action performed successfully.' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
