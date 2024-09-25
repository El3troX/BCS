const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer'); // Import Nodemailer
const app = express();
const PORT = process.env.PORT || 3000;

// Sample student database
const students = {
    "2023001": { name: "John Doe", credits: 100, email: "s4srijanrajput1007@gmail.com" },
    "2023002": { name: "Jane Smith", credits: 75, email: "jane.smith@example.com" },
    "2023003": { name: "Alice Johnson", credits: 120, email: "alice.johnson@example.com" },
    "2023004": { name: "Bob Williams", credits: 50, email: "bob.williams@example.com" }
};

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Setup Nodemailer transport
const transporter = nodemailer.createTransport({
    service: 'gmail', // You can use any email service provider
    auth: {
        user: 's4shaddy123@gmail.com', // Replace with your email
        pass: 'sdiy hbap rztc wlva' // Replace with your email password or app password
    }
});

// API route to process shuttle payment and send email
app.post('/api/pay', (req, res) => {
    const { studentId } = req.body;

    if (!studentId) {
        return res.status(400).json({ success: false, message: 'Student ID is required.' });
    }

    const student = students[studentId];
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (student.credits < 20) {
        return res.status(400).json({ success: false, message: 'Not enough credits.' });
    }

    // Deduct 20 credits
    student.credits -= 20;

    // Send email via Nodemailer
    const mailOptions = {
        from: 'your_email@gmail.com', // Replace with your email
        to: student.email,
        subject: 'Payment Successful',
        text: `Payment successful! 20 credits have been deducted for ${student.name}. Your current balance is ${student.credits} credits.`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            return res.status(500).json({ success: false, message: 'Failed to send email.' });
        }
        res.json({
            success: true,
            message: `Payment successful. 20 credits deducted for ${student.name}. Email sent to ${student.email}.`,
            email: student.email
        });
    });
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
