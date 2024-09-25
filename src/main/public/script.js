let currentStudentId = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
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
    payBtn.addEventListener('click', payForTrip);
    addCreditsBtn.addEventListener('click', showAddCreditsModal);
    viewHistoryBtn.addEventListener('click', viewPaymentHistory);
    blockCardBtn.addEventListener('click', blockCard);
    requestNewCardBtn.addEventListener('click', requestNewCard);
    logoutBtn.addEventListener('click', logout);
    confirmAddCreditsBtn.addEventListener('click', addCredits);
    cancelAddCreditsBtn.addEventListener('click', hideAddCreditsModal);
    closeHistoryBtn.addEventListener('click', hideHistoryModal);
});

function login() {
    const studentId = document.getElementById('student-id').value.trim();
    const statusMessage = document.getElementById('statusMessage');
    if (!studentId) {
        showStatus('Please enter a student ID.', 'error');
        return;
    }

    fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId }),
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
    if (!currentStudentId) {
        showStatus('Please log in first.', 'error');
        return;
    }

    fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('credit-balance').textContent = data.newCredits;
            showStatus(data.message, 'success');
        } else {
            showStatus(data.message || 'Payment failed. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function showAddCreditsModal() {
    document.getElementById('add-credits-modal').style.display = 'block';
}

function hideAddCreditsModal() {
    document.getElementById('add-credits-modal').style.display = 'none';
}

function addCredits() {
    const credits = document.getElementById('credits-amount').value;
    if (!credits || credits < 1) {
        showStatus('Please enter a valid amount of credits.', 'error');
        return;
    }

    fetch('/api/add-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId, credits: parseInt(credits) }),
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

function viewPaymentHistory() {
    fetch(`/api/payment-history/${currentStudentId}`)
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const historyList = document.getElementById('history-list');
            historyList.innerHTML = '';
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
    document.getElementById('history-modal').style.display = 'none';
}

function blockCard() {
    if (!confirm('Are you sure you want to block your card? This action cannot be undone.')) {
        return;
    }

    fetch('/api/block-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(data.message, 'success');
            logout();
        } else {
            showStatus(data.message || 'Failed to block card. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function requestNewCard() {
    fetch('/api/request-new-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: currentStudentId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(data.message, 'success');
        } else {
            showStatus(data.message || 'Failed to request new card. Please try again.', 'error');
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
    showStatus('Logged out successfully.', 'success');
}

function showStatus(message, type) {
    const statusMessage = document.getElementById('statusMessage');
    statusMessage.textContent = message;
    statusMessage.className = type === 'error' ? 'status-error' : 'status-success';
}
