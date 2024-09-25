const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;

const students = {
    "23BIT0042": { name: "Abhishek Kumar", credits: 100, email: "abhishek.kumar2023a@vitstudent.ac.in" },
    "23BCT0104": { name: "Srujan Rajput", credits: 150, email: "srujan.rajput2023@vitstudent.ac.in" },
    "23BDS0139": { name: "Divyam Pandey", credits: 120, email: "divyam.pandey2023@vitstudent.ac.in" },
    "23BCT0079": { name: "Aditya Raj Kar", credits: 80, email: "adityaraj.kar2023@vitstudent.ac.in" }
};

app.use(bodyParser.json());

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 's4shaddy123@gmail.com', 
        pass: 'sdiy hbap rztc wlva'
    }
});

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

    student.credits -= 20;

    const mailOptions = {
        from: 'your_email@gmail.com',
        to: student.email,
        subject: 'Payment Successful',
        text: Payment successful! 20 credits have been deducted for ${student.name}. Your current balance is ${student.credits} credits.
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('Error sending email:', error);
            return res.status(500).json({ success: false, message: 'Failed to send email.' });
        }
        res.json({
            success: true,
            message: Payment successful. 20 credits deducted for ${student.name}. Email sent to ${student.email}.,
            email: student.email
        });
    });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(Server is running on http://localhost:${PORT});
});
