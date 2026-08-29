require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const app = express();
const PORT = process.env.PORT || 3000;
const crypto = require('crypto'); // Require crypto for OTP generation

app.use(bodyParser.json());

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
app.post('/api/login', async (req, res) => {
    const { studentId } = req.body;

    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    try {
        const [rows] = await db.promise().execute('SELECT name, credits FROM students WHERE studentid = ?', [studentId]);

        if (rows.length > 0) {
            const student = rows[0];
            return res.json({
                success: true,
                name: student.name,
                newCredits: student.credits
            });
        } else {
            return res.json({
                success: false,
                message: 'Invalid student ID.'
            });
        }
    } catch (error) {
        console.error('Database error:', error);
        return res.status(500).json({ success: false, message: 'An error occurred. Please try again later.' });
    }
});

// Middleware to check if card is blocked
const checkCardStatus = (req, res, next) => {
    const { studentId } = req.body;
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

// API route to process shuttle payment
app.post('/api/pay', checkCardStatus, async (req, res) => {
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
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
        if (student.credits < 20) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({ success: false, message: 'Not enough credits.' });
        }

        const newCredits = student.credits - 20;
        await connection.execute(
            'UPDATE students SET credits = ? WHERE studentId = ?',
            [newCredits, studentId]
        );

        await connection.execute(
            'INSERT INTO payment_history (studentId, amount, type) VALUES (?, ?, ?)',
            [studentId, 20, 'Trip Payment']
        );

        await connection.commit();
        connection.release();

        try {
            await sendEmail(
                student.email,
                'Payment Successful',
                `Payment successful! 20 credits have been deducted for ${student.name}. Your current balance is ${newCredits} credits.`
            );

            return res.json({
                success: true,
                message: `Payment successful. 20 credits deducted for ${student.name}. Email sent to ${student.email}.`,
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

// API route to add credits
app.post('/api/add-credits', checkCardStatus, (req, res) => {
    const { studentId, credits } = req.body;
    if (!studentId || credits === undefined || credits === null || credits === '') {
        return res.status(400).json({ success: false, message: 'Student ID and credits are required.' });
    }

    const numCredits = Number(credits);
    if (typeof credits === 'boolean' || isNaN(numCredits) || !Number.isFinite(numCredits) || numCredits <= 0 || !Number.isInteger(numCredits)) {
        return res.status(400).json({ success: false, message: 'Invalid credits amount. Must be a positive integer.' });
    }

    const query = 'UPDATE students SET credits = credits + ? WHERE studentId = ?';
    db.query(query, [numCredits, studentId], async (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        // Insert into payment history
        const historyQuery = 'INSERT INTO payment_history (studentId, amount, type) VALUES (?, ?, ?)';
        db.query(historyQuery, [studentId, numCredits, 'Credit Addition'], (err, historyResult) => {
            if (err) {
                console.error('Error inserting payment history:', err);
            }
        });

        // Get updated student info
        db.query('SELECT * FROM students WHERE studentId = ?', [studentId], async (err, results) => {
            if (err || results.length === 0) {
                return res.status(500).json({ success: false, message: 'Error fetching updated student info.' });
            }
            const student = results[0];

            try {
                await sendEmail(
                    student.email,
                    'Credits Added',
                    `${numCredits} credits have been added to your account. Your new balance is ${student.credits} credits.`
                );

                res.json({
                    success: true,
                    message: `${numCredits} credits added successfully. New balance: ${student.credits}`,
                    newCredits: student.credits
                });
            } catch (emailError) {
                res.status(500).json({ success: true, message: 'Credits added but failed to send email.' });
            }
        });
    });
});

// API route to get payment history
app.get('/api/payment-history/:studentId', (req, res) => {
    const { studentId } = req.params;
    const query = 'SELECT * FROM payment_history WHERE studentId = ? ORDER BY timestamp DESC';
    db.query(query, [studentId], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        res.json({ success: true, history: results });
    });
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

// API route to block card
app.post('/api/block-card', (req, res) => {
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    // Fetch the email from the database
    const query = 'SELECT email FROM students WHERE studentId = ?';
    db.query(query, [studentId], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ success: false, message: 'Student not found.' });
        }

        const studentEmail = results[0].email;
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

            res.json({ success: true, message: 'OTP sent to your registered email. Please verify to block your card.' });
        } catch (emailError) {
            res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
        }
    });
});

// API to verify OTP and block the card
app.post('/api/verify-otp-and-block', (req, res) => {
    const { studentId, otp } = req.body;

    // Check if both studentId and otp are present
    if (!studentId || !otp) {
        return res.status(400).json({ success: false, message: 'Student ID and OTP are required.' });
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
            // If no rows were updated, the studentId might not exist
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

// API route to request a new card (sends OTP for verification)
app.post('/api/request-new-card', (req, res) => {
    const { studentId, otp } = req.body;

    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

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

// API route to verify OTP and reactivate card for new card request
app.post('/api/verify-otp-and-request-new-card', (req, res) => {
    const { studentId, otp } = req.body;

    if (!studentId || !otp) {
        return res.status(400).json({ success: false, message: 'Student ID and OTP are required.' });
    }

    const verification = verifyAndConsumeOtp(studentId, otp);
    if (verification.valid) {
        return handleCardReactivation(studentId, res);
    } else {
        return res.status(400).json({ success: false, message: verification.message });
    }
});

// Blocked status check for all other actions
app.post('/api/perform-action', checkCardStatus, (req, res) => {
    res.json({ success: true, message: 'Action performed successfully.' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
