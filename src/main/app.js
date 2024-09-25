const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const mysql = require('mysql2');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'Root',
    database: 'studentDB'
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
        user: 's4shaddy123@gmail.com',
        pass: 'sdiy hbap rztc wlva'
    }
});

// Helper function to send email
const sendEmail = (to, subject, text) => {
    const mailOptions = {
        from: 's4shaddy123@gmail.com',
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

// API route to block card
app.post('/api/block-card', (req, res) => {
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    const query = 'UPDATE students SET cardBlocked = TRUE WHERE studentId = ?';
    db.query(query, [studentId], async (err, result) => {
        if (err) {
            console.error('Database update error:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        // Get student email
        db.query('SELECT email FROM students WHERE studentId = ?', [studentId], async (err, results) => {
            if (err || results.length === 0) {
                return res.status(500).json({ success: true, message: 'Card blocked but failed to send email.' });
            }
            const studentEmail = results[0].email;

            try {
                await sendEmail(
                    studentEmail,
                    'Card Blocked',
                    `Your card has been blocked as requested. Please contact the administration for a new card.`
                );

                res.json({ success: true, message: 'Card blocked successfully. Email sent.' });
            } catch (emailError) {
                res.status(500).json({ success: true, message: 'Card blocked but failed to send email.' });
            }
        });
    });
});

// API route to request new card
app.post('/api/request-new-card', (req, res) => {
    const { studentId } = req.body;
    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    const query = 'SELECT * FROM students WHERE studentId = ?';
    db.query(query, [studentId], async (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ success: false, message: 'Database error.' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: 'Student not found.' });
        }

        const student = results[0];

        try {
            await sendEmail(
                student.email,
                'New Card Request',
                `A new card has been requested for your account. Please visit the administration office to collect your new card.`
            );

            // You might want to add a database entry for the new card request here

            res.json({ success: true, message: 'New card request submitted. Email sent.' });
        } catch (emailError) {
            res.status(500).json({ success: false, message: 'Failed to process new card request.' });
        }
    });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
