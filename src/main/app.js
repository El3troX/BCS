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

const db = mysql.createConnection({
    host: process.env.MS_HOST,
    user: process.env.MS_USER,
    password: process.env.MS_PASS,
    database: process.env.MS_DB
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to MySQL database.');
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

// API route to process shuttle payment
app.post('/api/pay', (req, res) => {
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    const query = 'SELECT * FROM students WHERE studentId = ?';
    db.query(query, [studentId], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }
        const student = results[0];
        if (student.credits < 20) {
            return res.status(400).json({ success: false, message: 'Not enough credits.' });
        }

        const newCredits = student.credits - 20;
        const updateQuery = 'UPDATE students SET credits = ? WHERE studentId = ?';
        db.query(updateQuery, [newCredits, studentId], async (err, updateResult) => {
            if (err) {
                console.error('Error updating credits:', err);
                return res.status(500).json({ success: false, message: 'Database update error.' });
            }

            // Insert into payment history
            const historyQuery = 'INSERT INTO payment_history (studentId, amount, type) VALUES (?, ?, ?)';
            db.query(historyQuery, [studentId, 20, 'Trip Payment'], (err, historyResult) => {
                if (err) {
                    console.error('Error inserting payment history:', err);
                }
            });

            try {
                await sendEmail(
                    student.email,
                    'Payment Successful',
                    `Payment successful! 20 credits have been deducted for ${student.name}. Your current balance is ${newCredits} credits.`
                );

                res.json({
                    success: true,
                    message: `Payment successful. 20 credits deducted for ${student.name}. Email sent to ${student.email}.`,
                    email: student.email,
                    newCredits
                });
            } catch (emailError) {
                res.status(500).json({ success: false, message: 'Payment processed but failed to send email.' });
            }
        });
    });
});

const checkCardStatus = (req, res, next) => {
    const { studentId } = req.body;
    
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
// API route to add credits
app.post('/api/add-credits', (req, res) => {
    const { studentId, credits } = req.body;
    if (!studentId || !credits) {
        return res.status(400).json({ success: false, message: 'Student ID and credits are required.' });
    }

    const query = 'UPDATE students SET credits = credits + ? WHERE studentId = ?';
    db.query(query, [credits, studentId], async (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        // Insert into payment history
        const historyQuery = 'INSERT INTO payment_history (studentId, amount, type) VALUES (?, ?, ?)';
        db.query(historyQuery, [studentId, credits, 'Credit Addition'], (err, historyResult) => {
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
                    `${credits} credits have been added to your account. Your new balance is ${student.credits} credits.`
                );

                res.json({
                    success: true,
                    message: `${credits} credits added successfully. New balance: ${student.credits}`,
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

let otpStorage = {}; // Temporary storage for OTPs

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
        otpStorage[studentId] = otp; // Store OTP temporarily

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

    // Check if OTP exists and matches the one stored
    if (otpStorage[studentId] && otpStorage[studentId] === otp) {
        // OTP matches, proceed with blocking the card
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

            // Clear OTP after successful verification
            delete otpStorage[studentId];

            return res.json({ success: true, message: 'Your card has been blocked successfully.' });
        });
    } else {
        // OTP does not match or doesn't exist
        return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please try again.' });
    }
});


// API route to request a new card
app.post('/api/request-new-card', (req, res) => {
    const { studentId } = req.body;

    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    const query = 'SELECT * FROM students WHERE studentId = ?';
    db.query(query, [studentId], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ success: false, message: 'Database error or student not found.' });
        }

        const student = results[0];
        try {
            await sendEmail(
                student.email,
                'New Card Request',
                'A new card has been requested for your account. Please visit the administration office to collect your new card.'
            );

            // Restore all features
            const updateStatusQuery = 'UPDATE students SET card_status = "active" WHERE studentId = ?';
            db.query(updateStatusQuery, [studentId], (updateErr) => {
                if (updateErr) {
                    return res.status(500).json({ success: false, message: 'Error renewing the card.' });
                }

                res.json({ success: true, message: 'New card request processed. Your card is now active.' });
            });
        } catch (emailError) {
            res.status(500).json({ success: false, message: 'Failed to process new card request.' });
        }
    });
});

// Blocked status check for all other actions
app.post('/api/perform-action', checkCardStatus, (req, res) => {
    res.json({ success: true, message: 'Action performed successfully.' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
