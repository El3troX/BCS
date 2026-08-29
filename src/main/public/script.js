let currentStudentId = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const payBtn = document.getElementById('pay-btn');
    const addCreditsBtn = document.getElementById('add-credits-btn');
    const viewHistoryBtn = document.getElementById('view-history-btn');
    const blockCardBtn = document.getElementById('block-card-btn');
    const requestNewCardBtn = document.getElementById('request-new-card-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const confirmAddCreditsBtn = document.getElementById('confirm-add-credits');
    const cancelAddCreditsBtn = document.getElementById('cancel-add-credits');
    const closeHistoryBtn = document.getElementById('close-history');

    loginBtn.addEventListener('click', login);
    if (registerBtn) registerBtn.addEventListener('click', registerStudent);
    payBtn.addEventListener('click', payForTrip); // Allow independent payment
    addCreditsBtn.addEventListener('click', showAddCreditsModal);
    viewHistoryBtn.addEventListener('click', viewPaymentHistory);
    blockCardBtn.addEventListener('click', blockCard);
    requestNewCardBtn.addEventListener('click', requestNewCard);
    logoutBtn.addEventListener('click', logout);
    confirmAddCreditsBtn.addEventListener('click', addCredits);
    cancelAddCreditsBtn.addEventListener('click', hideAddCreditsModal);
    closeHistoryBtn.addEventListener('click', hideHistoryModal);
});

function registerStudent() {
    const studentId = document.getElementById('student-id').value.trim();
    const pin = document.getElementById('student-pin').value.trim();

    if (!studentId) {
        showStatus('Please enter a student ID.', 'error');
        return;
    }
    if (!pin || pin.length < 4) {
        showStatus('Please enter at least a 4-digit PIN.', 'error');
        return;
    }

    const name = prompt('Enter your name (optional):') || studentId;
    const email = prompt('Enter your email (optional):') || `${studentId}@vitstudent.ac.in`;

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, pin, name, email })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(data.message || 'Registration successful! You can now log in.', 'success');
        } else {
            showStatus(data.message || 'Registration failed.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred during registration.', 'error');
    });
}

function login() {
    const studentId = document.getElementById('student-id').value.trim();
    const pin = document.getElementById('student-pin').value.trim();

    if (!studentId) {
        showStatus('Please enter a student ID.', 'error');
        return;
    }

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId, pin: pin }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentStudentId = studentId;
            document.getElementById('student-name').textContent = data.name || studentId;
            document.getElementById('credit-balance').textContent = data.newCredits;
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('main-section').style.display = 'block';
            showStatus('Login successful!', 'success');
        } else {
            showStatus(data.message || 'Login failed. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function payForTrip() {
    // Payment can be initiated regardless of login status
    const studentId = document.getElementById('student-id').value.trim() || currentStudentId;
    let pin = document.getElementById('student-pin') ? document.getElementById('student-pin').value.trim() : '';

    if (!studentId) {
        showStatus('Please enter a student ID to pay for the trip.', 'error');
        return;
    }
    if (!pin) {
        pin = prompt('Please enter your PIN to authorize payment:');
        if (!pin) {
            showStatus('Payment cancelled. PIN is required.', 'error');
            return;
        }
    }

    fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId, pin: pin }), 
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errData => { throw new Error(errData.message || `HTTP error ${response.status}`); });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showStatus(data.message, 'success');
            document.getElementById('credit-balance').textContent = data.newCredits;
        } else {
            showStatus(data.message || 'Payment failed. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus(`Payment failed: ${error.message}`, 'error');
    });
}

function addCredits() {
    const credits = parseInt(document.getElementById('credits-amount').value);
    let pin = document.getElementById('credits-pin') ? document.getElementById('credits-pin').value.trim() : '';

    if (isNaN(credits) || credits < 1) {
        showStatus('Please enter a valid amount of credits.', 'error');
        return;
    }

    if (!currentStudentId) {
        showStatus('Please log in to add credits.', 'error');
        return;
    }

    if (!pin) {
        pin = prompt('Please enter your PIN to confirm adding credits:');
        if (!pin) {
            showStatus('Add credits cancelled. PIN is required.', 'error');
            return;
        }
    }

    fetch('/api/add-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId, credits: credits, pin: pin }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('credit-balance').textContent = data.newCredits;
            showStatus(data.message, 'success');
            hideAddCreditsModal();
        } else {
            showStatus(data.message || 'Failed to add credits. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function showAddCreditsModal() {
    const modal = document.getElementById('add-credits-modal');
    if (!modal) {
        console.error('Add Credits Modal not found in the DOM.');
        return;
    }
    modal.style.display = 'block';
}

function hideAddCreditsModal() {
    const modal = document.getElementById('add-credits-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function viewPaymentHistory() {
    if (!currentStudentId) {
        showStatus('Please log in to view payment history.', 'error');
        return;
    }

    fetch(`/api/payment-history/${currentStudentId}`)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const historyList = document.getElementById('history-list');
            historyList.innerHTML = '';
            if (!data.history || data.history.length === 0) {
                showStatus('No payment history found.', 'info');
                return;
            }
            data.history.forEach(item => {
                const li = document.createElement('li');
                li.textContent = `${item.timestamp}: ${item.type} - ${item.amount} credits`;
                historyList.appendChild(li);
            });
            document.getElementById('history-modal').style.display = 'block';
        } else {
            showStatus('Failed to fetch payment history.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function hideHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function blockCard() {
    if (!currentStudentId) {
        showStatus('Please log in to block your card.', 'error');
        return;
    }

    if (!confirm('Are you sure you want to block your card? This action cannot be undone.')) {
        return;
    }

    const pin = prompt('Please enter your PIN to authorize blocking your card:');
    if (!pin) {
        showStatus('Card block cancelled. PIN is required.', 'error');
        return;
    }

    fetch('/api/block-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId, pin: pin }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('otp-section').style.display = 'block';
            showStatus(data.message, 'success');
        } else {
            showStatus(data.message || 'Failed to block card. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}
document.getElementById('verify-otp-button').addEventListener('click', verifyOtpAndBlock);
function verifyOtpAndBlock() {
    const otpInput = document.getElementById('otp-input').value.trim();
    if (!otpInput) {
        showStatus('Please enter an OTP.', 'error');
        return;
    }

    fetch('/api/verify-otp-and-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId, otp: otpInput }),
    })
    .then(response => response.json())
    .then(data => {
        const otpStatusDiv = document.getElementById('otp-status');
        if (data.success) {
            otpStatusDiv.textContent = 'OTP verified successfully! Your card has been blocked.';
            otpStatusDiv.className = 'success';

            // Disable all buttons except "Request New Card"
            document.querySelectorAll('.action-button').forEach(button => {
                button.disabled = true;
            });
            document.getElementById('request-new-card-button').disabled = false;
        } else {
            otpStatusDiv.textContent = data.message || 'Invalid OTP. Please try again.';
            otpStatusDiv.className = 'error';
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        document.getElementById('otp-status').textContent = 'An error occurred during OTP verification.';
    });
}

// Set up the event listener for OTP verification


function requestNewCard() {
    if (!currentStudentId) {
        showStatus('Please log in to request a new card.', 'error');
        return;
    }

    fetch('/api/request-new-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(data.message, 'success');
            const otp = prompt(data.message + '\nPlease enter the OTP:');
            if (!otp) {
                showStatus('Card reactivation cancelled.', 'error');
                return;
            }

            fetch('/api/verify-otp-and-request-new-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: currentStudentId, otp: otp.trim() }),
            })
            .then(res => res.json())
            .then(verifyData => {
                if (verifyData.success) {
                    showStatus(verifyData.message, 'success');
                    document.querySelectorAll('.action-button').forEach(button => {
                        button.disabled = false;
                    });
                } else {
                    showStatus('Error renewing card: ' + verifyData.message, 'error');
                }
            })
            .catch(err => {
                console.error('Error verifying OTP for new card:', err);
                showStatus('An error occurred during OTP verification.', 'error');
            });
        } else {
            showStatus('Error requesting new card: ' + data.message, 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function logout() {
    currentStudentId = null;
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('main-section').style.display = 'none';
    document.getElementById('student-id').value = '';
    document.getElementById('student-name').textContent = '';
    document.getElementById('credit-balance').textContent = '0';
    showStatus('Logged out successfully.', 'success');
}

function showStatus(message, type) {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = message;
    statusMessage.className = type === 'error' ? 'status-error' : 'status-success';
}
